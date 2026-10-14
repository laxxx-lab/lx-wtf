"""Persistent handoff ownership; identity is supplied only by authenticated middleware."""
from __future__ import annotations

import json
from contextlib import contextmanager
import os
from pathlib import Path
import re
import sqlite3
import time
from uuid import UUID

LEASE_SECONDS = 8
PREPARING_SECONDS = 30
MAX_BODY_BYTES = 8192


class HandoffError(Exception):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.code, self.status = code, status


def _text(value, maximum, *, identifier=False):
    if (not isinstance(value, str) or not value or len(value) > maximum
            or value != value.strip() or any(ord(c) < 32 for c in value)):
        raise HandoffError('invalid_payload', 400)
    if identifier and not re.fullmatch(r'[A-Za-z0-9_.:@/\-]+', value):
        raise HandoffError('invalid_payload', 400)
    return value


def _uuid(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value:
            raise ValueError()
    except (ValueError, AttributeError):
        raise HandoffError('invalid_payload', 400) from None


def validate_payload(body):
    if not isinstance(body, dict):
        raise HandoffError('invalid_payload', 400)
    common = {'operation', 'clientId', 'instanceId', 'profile'}
    additions = {
        'register': {'name', 'kind', 'session', 'busy', 'privacyLocked', 'connected'},
        'poll': set(), 'request': {'requestId', 'targetKind', 'session'},
        'recall': {'requestId', 'session'},
        'accept': {'requestId'}, 'reject': {'requestId', 'error'},
    }
    operation = body.get('operation')
    if not isinstance(operation, str) or operation not in additions:
        raise HandoffError('invalid_payload', 400)
    allowed = common | additions[operation]
    required = allowed - ({'error'} if operation == 'reject' else set())
    if set(body) - allowed or required - set(body):
        raise HandoffError('invalid_payload', 400)
    _uuid(body['clientId'])
    _uuid(body['instanceId'])
    _text(body['profile'], 64, identifier=True)
    if 'requestId' in body:
        _uuid(body['requestId'])
    if 'session' in body:
        session = body['session']
        if session is None:
            if operation != 'register':
                raise HandoffError('invalid_payload', 400)
        else:
            if not isinstance(session, dict) or set(session) != {'id', 'profile', 'title'}:
                raise HandoffError('invalid_payload', 400)
            _text(session['id'], 128, identifier=True)
            if session['profile'] != body['profile']:
                raise HandoffError('invalid_payload', 400)
            if session['title'] is not None:
                _text(session['title'], 256)
    if operation == 'register':
        _text(body['name'], 80)
        if body['kind'] not in ('windows', 'notebook'):
            raise HandoffError('invalid_payload', 400)
        if any(type(body[k]) is not bool for k in ('busy', 'privacyLocked', 'connected')):
            raise HandoffError('invalid_payload', 400)
    if operation == 'request' and body['targetKind'] not in ('windows', 'notebook'):
        raise HandoffError('invalid_payload', 400)
    if 'error' in body:
        _text(body['error'], 64, identifier=True)
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', body['error']):
            raise HandoffError('invalid_payload', 400)
    return body


class Coordinator:
    def __init__(self, path, *, clock=time.time):
        self.path = Path(path)
        self.clock = clock
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # SQLite creates journals alongside this file, using this private file's mode.
        descriptor = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(descriptor)
        os.chmod(self.path, 0o600)
        with self._connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS clients (
                    principal TEXT NOT NULL, profile TEXT NOT NULL, client TEXT NOT NULL,
                    instance TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
                    seen REAL NOT NULL, PRIMARY KEY(principal, profile, client));
                CREATE TABLE IF NOT EXISTS ownership (
                    principal TEXT NOT NULL, profile TEXT NOT NULL, session TEXT NOT NULL,
                    owner TEXT NOT NULL, revision INTEGER NOT NULL,
                    PRIMARY KEY(principal, profile, session));
                CREATE TABLE IF NOT EXISTS transfers (
                    principal TEXT NOT NULL, profile TEXT NOT NULL, request TEXT NOT NULL,
                    source TEXT NOT NULL, target TEXT NOT NULL, source_instance TEXT NOT NULL,
                    target_instance TEXT NOT NULL, session TEXT NOT NULL, fingerprint TEXT NOT NULL,
                    state TEXT NOT NULL, revision INTEGER NOT NULL, error TEXT,
                    expires REAL NOT NULL, PRIMARY KEY(principal, profile, request));
                CREATE UNIQUE INDEX IF NOT EXISTS one_preparing_session
                    ON transfers(principal, profile, session) WHERE state = 'preparing';
                CREATE UNIQUE INDEX IF NOT EXISTS one_preparing_target
                    ON transfers(principal, profile, target) WHERE state = 'preparing';
                CREATE UNIQUE INDEX IF NOT EXISTS one_preparing_source
                    ON transfers(principal, profile, source) WHERE state = 'preparing';
            ''')

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _session_matches(first, second):
        return (first is not None and second is not None
                and first['id'] == second['id'] and first['profile'] == second['profile'])

    @staticmethod
    def _receipt(row):
        receipt = dict(requestId=row['request'], sourceId=row['source'], targetId=row['target'] or None,
                    sourceInstanceId=row['source_instance'], targetInstanceId=row['target_instance'] or None,
                    session=json.loads(row['session']), state=row['state'],
                    revision=row['revision'], error=row['error'])
        fingerprint = json.loads(row['fingerprint'])
        if fingerprint.get('operation') == 'recall':
            receipt.update(recall=True, offlineRecovery=fingerprint['offlineRecovery'])
        return receipt

    def handle(self, principal, body):
        _text(principal, 512)
        body = validate_payload(body)
        scope = (principal, body['profile'])
        client_id = body['clientId']
        with self._connect() as db:
            # Serialize ownership checks and writes even across processes/restarts.
            db.execute('BEGIN IMMEDIATE')
            now = self.clock()
            db.execute("UPDATE transfers SET state='failed', error='expired' "
                       "WHERE principal=? AND profile=? AND state='preparing' AND expires<=?", (*scope, now))
            # Requested returns wait for source work, bounded by the initiating
            # target's lease rather than the preparation/accept deadline.
            db.execute("UPDATE transfers SET state='failed',error='expired' WHERE principal=? AND profile=? "
                       "AND state='requested' AND NOT EXISTS (SELECT 1 FROM clients c WHERE "
                       "c.principal=transfers.principal AND c.profile=transfers.profile "
                       "AND c.client=transfers.target AND c.instance=transfers.target_instance AND c.seen>?)",
                       (*scope, now - LEASE_SECONDS))
            client = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND client=?',
                                (*scope, client_id)).fetchone()
            operation = body['operation']
            if operation == 'register':
                if client and client['instance'] != body['instanceId'] and client['seen'] > now - LEASE_SECONDS:
                    raise HandoffError('instance_conflict')
                if client and client['kind'] != body['kind']:
                    raise HandoffError('client_kind_mismatch')
                data = {key: body[key] for key in ('name', 'kind', 'session', 'busy', 'privacyLocked', 'connected')}
                db.execute('INSERT INTO clients VALUES (?,?,?,?,?,?,?) ON CONFLICT(principal,profile,client) '
                           'DO UPDATE SET instance=excluded.instance,data=excluded.data,seen=excluded.seen',
                           (*scope, client_id, body['instanceId'], body['kind'], json.dumps(data), now))
                self._bootstrap(db, scope, client_id, data)
                receipt = None
            else:
                if not client:
                    raise HandoffError('client_not_registered')
                if client['instance'] != body['instanceId']:
                    raise HandoffError('instance_conflict')
                if client['seen'] <= now - LEASE_SECONDS:
                    raise HandoffError('client_offline')
                receipt = None
                if operation == 'request':
                    receipt = self._request(db, scope, client, body, now)
                elif operation == 'recall':
                    receipt = self._recall(db, scope, client, body, now)
                elif operation in ('accept', 'reject'):
                    receipt = self._answer(db, scope, client, body, now)
            result = self._snapshot(db, scope, client_id, now)
            if receipt is not None:
                result['receipt'] = receipt
            return result

    def _bootstrap(self, db, scope, client_id, data):
        session = data['session']
        if session is None or not data['connected']:
            return
        if db.execute('SELECT 1 FROM ownership WHERE principal=? AND profile=? AND session=?',
                      (*scope, session['id'])).fetchone():
            return
        # Ownership names the already selected conversation device; claiming it does
        # not change privacy or authorize a transfer. BEGIN IMMEDIATE serializes
        # concurrent first registrations, including busy/locked startup clients.
        db.execute('INSERT INTO ownership VALUES (?,?,?,?,1)', (*scope, session['id'], client_id))

    def _request(self, db, scope, source, body, now):
        fingerprint = json.dumps({'sourceId': body['clientId'], 'targetKind': body['targetKind'],
                                  'session': body['session']}, sort_keys=True, separators=(',', ':'))
        existing = db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                              (*scope, body['requestId'])).fetchone()
        if existing:
            stored = json.loads(existing['fingerprint'])
            if stored.get('operation') == 'recall':
                if (existing['source'] != source['client'] or stored['targetKind'] != body['targetKind']
                        or stored['session'] != body['session']):
                    raise HandoffError('request_conflict')
                if existing['state'] == 'requested':
                    return self._advance_recall(db, scope, existing, now, source_request=True)
                return self._receipt(existing)
            if existing['fingerprint'] != fingerprint:
                raise HandoffError('request_conflict')
            return self._receipt(existing)
        source_data = json.loads(source['data'])
        if not source_data['connected']:
            raise HandoffError('source_offline')
        if source_data['busy']:
            raise HandoffError('source_busy')
        if source_data['privacyLocked']:
            raise HandoffError('source_locked')
        if not self._session_matches(source_data['session'], body['session']):
            raise HandoffError('session_mismatch')
        owner = db.execute('SELECT * FROM ownership WHERE principal=? AND profile=? AND session=?',
                           (*scope, body['session']['id'])).fetchone()
        if not owner or owner['owner'] != source['client']:
            raise HandoffError('source_not_owner')
        if db.execute("SELECT 1 FROM transfers WHERE principal=? AND profile=? AND state IN ('requested','preparing') "
                      'AND (source=? OR target=? OR session=?)',
                      (*scope, source['client'], source['client'], json.dumps(body['session']))).fetchone():
            return self._save_request(db, scope, source, None, body, fingerprint, owner['revision'], now, 'transfer_pending')
        candidates = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND kind=? AND client<>?',
                                (*scope, body['targetKind'], source['client'])).fetchall()
        fresh = [row for row in candidates if row['seen'] > now - LEASE_SECONDS and json.loads(row['data'])['connected']]
        if not fresh:
            return self._save_request(db, scope, source, candidates[0] if len(candidates) == 1 else None,
                                      body, fingerprint, owner['revision'], now, 'target_offline')
        eligible = [row for row in fresh if not json.loads(row['data'])['busy'] and not json.loads(row['data'])['privacyLocked']]
        if not eligible:
            error = 'target_locked' if all(json.loads(row['data'])['privacyLocked'] for row in fresh) else 'target_busy'
            return self._save_request(db, scope, source, fresh[0] if len(fresh) == 1 else None,
                                      body, fingerprint, owner['revision'], now, error)
        if len(eligible) != 1:
            return self._save_request(db, scope, source, None, body, fingerprint, owner['revision'], now, 'target_ambiguous')
        target = eligible[0]
        if db.execute("SELECT 1 FROM transfers WHERE principal=? AND profile=? AND state IN ('requested','preparing') "
                      'AND (source=? OR target=?)', (*scope, target['client'], target['client'])).fetchone():
            return self._save_request(db, scope, source, target, body, fingerprint, owner['revision'], now, 'transfer_pending')
        return self._save_request(db, scope, source, target, body, fingerprint, owner['revision'], now)

    def _save_request(self, db, scope, source, target, body, fingerprint, revision, now, error=None, state='preparing'):
        db.execute('INSERT INTO transfers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                   (*scope, body['requestId'], source['client'], target['client'] if target else '', source['instance'],
                    target['instance'] if target else '', json.dumps(body['session']), fingerprint,
                    'failed' if error else state, revision, error, now + PREPARING_SECONDS))
        row = db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                         (*scope, body['requestId'])).fetchone()
        return self._receipt(row)

    def _recall(self, db, scope, target, body, now):
        existing = db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                              (*scope, body['requestId'])).fetchone()
        if existing:
            stored = json.loads(existing['fingerprint'])
            if (stored.get('operation') != 'recall' or existing['target'] != target['client']
                    or stored['session'] != body['session']):
                raise HandoffError('request_conflict')
            if existing['target_instance'] != target['instance']:
                raise HandoffError('target_instance_mismatch')
            if existing['state'] == 'requested':
                return self._advance_recall(db, scope, existing, now, source_request=False)
            return self._receipt(existing)
        target_data = json.loads(target['data'])
        if not self._session_matches(target_data['session'], body['session']):
            raise HandoffError('session_mismatch')
        for key, error in [('connected', 'target_offline'), ('privacyLocked', 'target_locked'), ('busy', 'target_busy')]:
            if target_data[key] == (key != 'connected'):
                raise HandoffError(error)
        owner = db.execute('SELECT * FROM ownership WHERE principal=? AND profile=? AND session=?',
                           (*scope, body['session']['id'])).fetchone()
        if not owner:
            raise HandoffError('source_not_owner')
        if owner['owner'] == target['client']:
            raise HandoffError('target_is_owner')
        source = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND client=?',
                            (*scope, owner['owner'])).fetchone()
        if not source:
            raise HandoffError('source_not_registered')
        offline = source['seen'] <= now - LEASE_SECONDS
        fingerprint = json.dumps(dict(operation='recall', sourceId=source['client'], targetId=target['client'],
                                      targetKind=target['kind'], session=body['session'], offlineRecovery=offline),
                                 sort_keys=True, separators=(',', ':'))
        error = None
        if db.execute("SELECT 1 FROM transfers WHERE principal=? AND profile=? AND state IN ('requested','preparing') "
                      "AND (source IN (?,?) OR target IN (?,?) OR json_extract(session,'$.id')=?)",
                      (*scope, source['client'], target['client'], source['client'], target['client'],
                       body['session']['id'])).fetchone():
            error = 'transfer_pending'
        elif not offline and not self._session_matches(json.loads(source['data'])['session'], body['session']):
            error = 'source_session_changed'
        return self._save_request(db, scope, source, target, body, fingerprint, owner['revision'], now,
                                  error, state='preparing' if offline else 'requested')

    def _advance_recall(self, db, scope, row, now, *, source_request):
        source = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND client=?',
                            (*scope, row['source'])).fetchone()
        target = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND client=?',
                            (*scope, row['target'])).fetchone()
        session = json.loads(row['session'])
        owner = db.execute('SELECT * FROM ownership WHERE principal=? AND profile=? AND session=?',
                           (*scope, session['id'])).fetchone()
        offline = not source or source['seen'] <= now - LEASE_SECONDS
        error = None
        if not owner or owner['owner'] != row['source'] or owner['revision'] != row['revision']:
            error = 'ownership_changed'
        elif not target or target['seen'] <= now - LEASE_SECONDS:
            error = 'target_offline'
        elif target['instance'] != row['target_instance']:
            error = 'target_instance_changed'
        else:
            target_data = json.loads(target['data'])
            if not self._session_matches(target_data['session'], session):
                error = 'target_session_changed'
            elif not target_data['connected']:
                error = 'target_offline'
            elif target_data['privacyLocked']:
                error = 'target_locked'
            elif target_data['busy']:
                error = 'target_busy'
            elif not offline and source['instance'] != row['source_instance']:
                error = 'source_instance_changed'
            elif not offline and not self._session_matches(json.loads(source['data'])['session'], session):
                error = 'source_session_changed'
        if error:
            db.execute("UPDATE transfers SET state='failed',error=? WHERE principal=? AND profile=? AND request=?",
                       (error, *scope, row['request']))
        elif source_request:
            data = json.loads(source['data'])
            for key, code in [('connected', 'source_offline'), ('busy', 'source_busy'), ('privacyLocked', 'source_locked')]:
                if data[key] == (key != 'connected'):
                    raise HandoffError(code)
            db.execute("UPDATE transfers SET state='preparing',expires=? WHERE principal=? AND profile=? AND request=?",
                       (now + PREPARING_SECONDS, *scope, row['request']))
        elif offline:
            fingerprint = json.loads(row['fingerprint'])
            fingerprint['offlineRecovery'] = True
            db.execute("UPDATE transfers SET state='preparing',expires=?,fingerprint=? "
                       'WHERE principal=? AND profile=? AND request=?',
                       (now + PREPARING_SECONDS, json.dumps(fingerprint, sort_keys=True, separators=(',', ':')),
                        *scope, row['request']))
        return self._receipt(db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                                       (*scope, row['request'])).fetchone())

    def _answer(self, db, scope, target, body, now):
        row = db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                         (*scope, body['requestId'])).fetchone()
        if row is None:
            raise HandoffError('request_not_found', 404)
        if row['target'] != target['client']:
            raise HandoffError('wrong_target', 403)
        if row['target_instance'] != target['instance']:
            raise HandoffError('target_instance_mismatch')
        if row['state'] not in ('requested', 'preparing'):
            return self._receipt(row)
        if body['operation'] == 'reject':
            error = body.get('error', 'rejected')
        elif row['state'] == 'requested':
            return self._receipt(row)
        else:
            session = json.loads(row['session'])
            target_data = json.loads(target['data'])
            if not self._session_matches(target_data['session'], session):
                raise HandoffError('session_mismatch')
            source = db.execute('SELECT * FROM clients WHERE principal=? AND profile=? AND client=?',
                                (*scope, row['source'])).fetchone()
            owner = db.execute('SELECT * FROM ownership WHERE principal=? AND profile=? AND session=?',
                               (*scope, session['id'])).fetchone()
            error = None
            offline_recovery = json.loads(row['fingerprint']).get('offlineRecovery', False)
            if offline_recovery and source and source['seen'] > now - LEASE_SECONDS:
                error = 'source_online'
            elif not offline_recovery and (not source or source['seen'] <= now - LEASE_SECONDS or not json.loads(source['data'])['connected']):
                error = 'source_offline'
            elif not offline_recovery and source['instance'] != row['source_instance']:
                error = 'source_instance_changed'
            elif not offline_recovery and not self._session_matches(json.loads(source['data'])['session'], session):
                error = 'source_session_changed'
            elif not offline_recovery and (json.loads(source['data'])['busy'] or json.loads(source['data'])['privacyLocked']):
                error = 'source_not_ready'
            elif not owner or owner['owner'] != row['source'] or owner['revision'] != row['revision']:
                error = 'ownership_changed'
            elif not target_data['connected']:
                error = 'target_offline'
            elif target_data['privacyLocked']:
                error = 'target_locked'
            elif target_data['busy']:
                error = 'target_busy'
            if error is None:
                db.execute('UPDATE ownership SET owner=?,revision=revision+1 '
                           'WHERE principal=? AND profile=? AND session=? AND owner=? AND revision=?',
                           (target['client'], *scope, session['id'], row['source'], row['revision']))
                db.execute("UPDATE transfers SET state='committed',revision=revision+1 "
                           'WHERE principal=? AND profile=? AND request=?', (*scope, body['requestId']))
        if error is not None:
            db.execute("UPDATE transfers SET state='failed',error=? WHERE principal=? AND profile=? AND request=?",
                       (error, *scope, body['requestId']))
        return self._receipt(db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND request=?',
                                       (*scope, body['requestId'])).fetchone())

    def _snapshot(self, db, scope, client_id, now):
        clients = []
        for row in db.execute('SELECT * FROM clients WHERE principal=? AND profile=? ORDER BY client', scope):
            data = json.loads(row['data'])
            clients.append(dict(data, clientId=row['client'], instanceId=row['instance'], profile=scope[1],
                                online=row['seen'] > now - LEASE_SECONDS and data['connected']))
        rows = db.execute('SELECT * FROM transfers WHERE principal=? AND profile=? AND (source=? OR target=?) '
                          'ORDER BY expires,request', (*scope, client_id, client_id)).fetchall()
        ownership = [dict(sessionId=row['session'], profile=scope[1], ownerId=row['owner'], revision=row['revision'])
                     for row in db.execute('SELECT * FROM ownership WHERE principal=? AND profile=? ORDER BY session', scope)]
        return dict(supported=True, clients=clients,
                    incoming=[self._receipt(row) for row in rows if row['target'] == client_id],
                    outgoing=[self._receipt(row) for row in rows if row['source'] == client_id], ownership=ownership)
