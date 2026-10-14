"""Real SQLite handoff regression tests; no device or credential fixtures."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from uuid import uuid4

SOURCE = Path(__file__).resolve().parents[1] / 'scripts' / 'session_handoff.py'
if SOURCE.exists():
    spec = importlib.util.spec_from_file_location('session_handoff', SOURCE)
    handoff = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(handoff)
else:
    handoff = None


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(handoff, 'SQLite handoff coordinator is missing')
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'handoff.sqlite3'
        self.now = 1000.0
        self.coordinator = handoff.Coordinator(self.path, clock=lambda: self.now)
        self.source, self.target = str(uuid4()), str(uuid4())
        self.instances = {self.source: str(uuid4()), self.target: str(uuid4())}
        self.session = {'id': 'stored-session', 'profile': 'default', 'title': 'Conversation'}
        self.register(self.source, 'windows', self.session)
        self.register(self.target, 'notebook', None)

    def call(self, client, operation, principal='actor-a', profile='default', **fields):
        return self.coordinator.handle(principal, {
            'operation': operation, 'clientId': client,
            'instanceId': self.instances[client], 'profile': profile, **fields})

    def register(self, client, kind, session, **fields):
        return self.call(client, 'register', name=kind, kind=kind, session=session,
                         busy=False, privacyLocked=False, connected=True, **fields)

    def propose(self, request_id=None):
        return self.call(self.source, 'request', requestId=request_id or str(uuid4()),
                         targetKind='notebook', session=self.session)['receipt']

    def recall(self, request_id=None, client=None):
        return self.call(client or self.target, 'recall', requestId=request_id or str(uuid4()),
                         session=self.session)['receipt']

    def assert_error(self, code, callback):
        with self.assertRaises(handoff.HandoffError) as caught:
            callback()
        self.assertEqual(caught.exception.code, code)

    def test_atomic_accept_persists_and_retries_after_lease_expiry(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        committed = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual(committed['state'], 'committed')
        self.assertEqual(committed['revision'], receipt['revision'] + 1)
        self.now += 100
        self.coordinator = handoff.Coordinator(self.path, clock=lambda: self.now)
        self.register(self.source, 'windows', self.session)
        self.register(self.target, 'notebook', self.session)
        replay = self.call(self.source, 'request', requestId=receipt['requestId'],
                           targetKind='notebook', session=self.session)['receipt']
        self.assertEqual(replay, committed)
        self.assertEqual(self.call(self.source, 'poll')['ownership'][0]['ownerId'], self.target)
        self.assert_error('source_not_owner', self.propose)

    def test_duplicate_payload_and_competing_requests_are_fenced(self):
        receipt = self.propose()
        self.assertEqual(self.propose(receipt['requestId']), receipt)
        self.assert_error('request_conflict', lambda: self.call(
            self.source, 'request', requestId=receipt['requestId'], targetKind='windows', session=self.session))
        self.assertEqual(self.propose()['error'], 'transfer_pending')
        self.assertEqual(len(self.call(self.target, 'poll')['incoming']), 1)

    def test_expiry_is_failure_and_cannot_late_commit(self):
        receipt = self.propose()
        self.now += 30
        self.register(self.source, 'windows', self.session)
        self.register(self.target, 'notebook', self.session)
        result = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((result['state'], result['error']), ('failed', 'expired'))
        self.assertEqual(self.call(self.source, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_preparing_restart_is_preserved_and_old_instance_cannot_accept(self):
        receipt = self.propose()
        self.coordinator = handoff.Coordinator(self.path, clock=lambda: self.now)
        self.assertEqual(self.call(self.target, 'poll')['incoming'][0], receipt)
        self.instances[self.target] = str(uuid4())
        self.assert_error('instance_conflict', lambda: self.register(self.target, 'notebook', None))
        self.now += 8
        self.register(self.source, 'windows', self.session)
        self.register(self.target, 'notebook', self.session)
        self.assert_error('target_instance_mismatch', lambda: self.call(
            self.target, 'accept', requestId=receipt['requestId']))

    def test_source_session_change_and_target_session_mismatch_prevent_commit(self):
        receipt = self.propose()
        self.assert_error('session_mismatch', lambda: self.call(self.target, 'accept', requestId=receipt['requestId']))
        self.register(self.target, 'notebook', self.session)
        other = {**self.session, 'id': 'other-session'}
        self.register(self.source, 'windows', other)
        result = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((result['state'], result['error']), ('failed', 'source_session_changed'))

    def test_principal_and_profile_are_isolated(self):
        receipt = self.propose()
        self.assert_error('client_not_registered', lambda: self.call(self.target, 'poll', principal='actor-b'))
        self.assert_error('client_not_registered', lambda: self.call(self.target, 'poll', profile='other'))
        self.call(self.target, 'register', principal='actor-b', name='Notebook', kind='notebook',
                  session=None, busy=False, privacyLocked=False, connected=True)
        self.assertEqual(self.call(self.target, 'poll', principal='actor-b')['incoming'], [])
        self.assert_error('request_not_found', lambda: self.call(
            self.target, 'accept', principal='actor-b', requestId=receipt['requestId']))

    def test_busy_offline_privacy_and_ambiguous_targets(self):
        for field, code in [('busy', 'target_busy'), ('privacyLocked', 'target_locked'), ('connected', 'target_offline')]:
            fields = dict(name='Notebook', kind='notebook', session=None, busy=False, privacyLocked=False, connected=True)
            fields[field] = field != 'connected'
            self.call(self.target, 'register', **fields)
            self.assertEqual(self.propose()['error'], code)
        self.register(self.target, 'notebook', None)
        extra = str(uuid4())
        self.instances[extra] = str(uuid4())
        self.register(extra, 'notebook', None)
        self.assertEqual(self.propose()['error'], 'target_ambiguous')

    def test_lease_freshness_and_accept_rechecks_readiness(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        self.now += 8
        self.register(self.target, 'notebook', self.session)
        result = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((result['state'], result['error']), ('failed', 'source_offline'))

    def test_closed_schema_and_boolean_types(self):
        self.assert_error('invalid_payload', lambda: self.call(self.source, 'poll', principalId='forged'))
        self.assert_error('invalid_payload', lambda: self.call(self.source, 'register', name='PC', kind='windows',
                         session=self.session, busy=0, privacyLocked=False, connected=True))
        self.assert_error('invalid_payload', lambda: self.call(self.source, 'request', requestId='not-uuid',
                         targetKind='notebook', session=self.session))
        self.assert_error('invalid_payload', lambda: self.call(self.source, 'request', requestId=str(uuid4()),
                         targetKind='notebook', session={**self.session, 'profile': 'foreign'}))

    def test_rejection_requires_exact_target_and_preserves_source(self):
        receipt = self.propose()
        self.assert_error('wrong_target', lambda: self.call(self.source, 'reject', requestId=receipt['requestId']))
        rejected = self.call(self.target, 'reject', requestId=receipt['requestId'], error='target_locked')['receipt']
        self.assertEqual((rejected['state'], rejected['error']), ('failed', 'target_locked'))
        self.assertEqual(self.call(self.target, 'reject', requestId=receipt['requestId'])['receipt'], rejected)
        self.assertEqual(self.call(self.source, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_concurrent_proposals_have_one_preparing_receipt(self):
        def propose(_):
            try:
                receipt = self.propose()
                return receipt['error'] or receipt['state']
            except handoff.HandoffError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(propose, range(2)))
        self.assertCountEqual(results, ['preparing', 'transfer_pending'])

    def test_registration_does_not_steal_existing_owner(self):
        self.register(self.target, 'notebook', self.session)
        self.now += 9
        self.register(self.target, 'notebook', self.session)
        self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_failed_request_is_fenced_even_after_target_becomes_ready(self):
        self.call(self.target, 'register', name='Notebook', kind='notebook', session=None,
                  busy=True, privacyLocked=False, connected=True)
        failed = self.propose()
        self.assertEqual((failed['state'], failed['error']), ('failed', 'target_busy'))
        self.register(self.target, 'notebook', None)
        self.coordinator = handoff.Coordinator(self.path, clock=lambda: self.now)
        self.assertEqual(self.propose(failed['requestId']), failed)
        self.assert_error('request_conflict', lambda: self.call(self.source, 'request',
                          requestId=failed['requestId'], targetKind='windows', session=self.session))

    def test_accept_rechecks_target_busy_privacy_and_connection(self):
        for key, code in [('busy', 'target_busy'), ('privacyLocked', 'target_locked'), ('connected', 'target_offline')]:
            self.register(self.target, 'notebook', None)
            receipt = self.propose()
            fields = dict(name='Notebook', kind='notebook', session=self.session,
                          busy=False, privacyLocked=False, connected=True)
            fields[key] = key != 'connected'
            self.call(self.target, 'register', **fields)
            answer = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
            self.assertEqual((answer['state'], answer['error']), ('failed', code))

    def test_stale_source_generation_cannot_commit(self):
        receipt = self.propose()
        self.now += 8
        self.instances[self.source] = str(uuid4())
        self.register(self.source, 'windows', self.session)
        self.register(self.target, 'notebook', self.session)
        answer = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((answer['state'], answer['error']), ('failed', 'source_instance_changed'))

    def test_concurrent_accepts_increment_revision_exactly_once(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        with ThreadPoolExecutor(max_workers=2) as executor:
            answers = list(executor.map(lambda _: self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt'], range(2)))
        self.assertEqual(answers[0], answers[1])
        self.assertEqual(answers[0]['revision'], 2)
        self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['revision'], 2)

    def test_reverse_handoff_advances_same_session_revision(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        self.call(self.target, 'accept', requestId=receipt['requestId'])
        reverse = self.call(self.target, 'request', requestId=str(uuid4()), targetKind='windows', session=self.session)['receipt']
        accepted = self.call(self.source, 'accept', requestId=reverse['requestId'])['receipt']
        self.assertEqual(accepted['revision'], 3)
        self.assertEqual(self.call(self.source, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_clock_is_checked_after_database_connection_wait(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        connect = self.coordinator._connect
        @contextmanager
        def delayed_connection():
            with connect() as db:
                self.now += 8  # elapsed connection/transaction contention
                yield db
        self.coordinator._connect = delayed_connection
        self.assert_error('client_offline', lambda: self.call(self.target, 'accept', requestId=receipt['requestId']))

    def test_first_connected_busy_or_locked_selection_claims_owner_before_peer(self):
        for key in ('busy', 'privacyLocked'):
            coordinator = handoff.Coordinator(self.path.with_name(key + '.sqlite3'), clock=lambda: self.now)
            source = dict(operation='register', clientId=self.source, instanceId=self.instances[self.source],
                          profile='default', name='PC', kind='windows', session=self.session,
                          busy=False, privacyLocked=False, connected=True)
            source[key] = True
            registered = coordinator.handle('actor-a', source)
            self.assertEqual(registered['ownership'][0]['ownerId'], self.source)
            request = {k: source[k] for k in ('clientId', 'instanceId', 'profile')}
            with self.assertRaises(handoff.HandoffError) as blocked:
                coordinator.handle('actor-a', {**request, 'operation': 'request',
                    'requestId': str(uuid4()), 'targetKind': 'notebook', 'session': self.session})
            self.assertEqual(blocked.exception.code, 'source_busy' if key == 'busy' else 'source_locked')
            peer = {**source, 'clientId': self.target, 'instanceId': self.instances[self.target],
                    'name': 'Notebook', 'kind': 'notebook', 'busy': False, 'privacyLocked': False}
            self.assertEqual(coordinator.handle('actor-a', peer)['ownership'][0]['ownerId'], self.source)
            source[key] = False
            self.assertEqual(coordinator.handle('actor-a', source)['ownership'][0]['ownerId'], self.source)
            receipt = coordinator.handle('actor-a', {**request, 'operation': 'request',
                'requestId': str(uuid4()), 'targetKind': 'notebook', 'session': self.session})['receipt']
            self.assertEqual(receipt['state'], 'preparing')

    def test_concurrent_first_same_session_registration_claims_exactly_one_owner(self):
        coordinator = handoff.Coordinator(self.path.with_name('concurrent.sqlite3'), clock=lambda: self.now)
        def register(client):
            return coordinator.handle('actor-a', dict(operation='register', clientId=client,
                instanceId=self.instances[client], profile='default', name='Client',
                kind='windows' if client == self.source else 'notebook', session=self.session,
                busy=client == self.source, privacyLocked=client == self.target, connected=True))
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(register, [self.source, self.target]))
        self.assertEqual(len(results[0]['ownership']), 1)
        self.assertEqual(results[0]['ownership'], results[1]['ownership'])
        self.assertEqual(results[0]['ownership'][0]['revision'], 1)

    def test_disconnected_selected_client_cannot_claim_first_ownership(self):
        coordinator = handoff.Coordinator(self.path.with_name('disconnected.sqlite3'), clock=lambda: self.now)
        source = dict(operation='register', clientId=self.source, instanceId=self.instances[self.source],
                      profile='default', name='PC', kind='windows', session=self.session,
                      busy=False, privacyLocked=False, connected=False)
        self.assertEqual(coordinator.handle('actor-a', source)['ownership'], [])
        self.assertEqual(coordinator.handle('actor-a', {**source, 'connected': True})['ownership'][0]['ownerId'], self.source)

    def test_online_recall_pins_target_and_source_prepares_same_receipt(self):
        self.register(self.target, 'notebook', self.session)
        extra = str(uuid4())
        self.instances[extra] = str(uuid4())
        self.register(extra, 'notebook', self.session)
        receipt = self.recall()
        self.assertEqual((receipt['state'], receipt['sourceId'], receipt['targetId']),
                         ('requested', self.source, self.target))
        self.assertEqual((receipt['sourceInstanceId'], receipt['targetInstanceId'], receipt['revision']),
                         (self.instances[self.source], self.instances[self.target], 1))
        self.assertTrue(receipt['recall'])
        self.assertFalse(receipt['offlineRecovery'])
        self.assertEqual(self.recall(receipt['requestId']), receipt)
        self.assertEqual(self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt'], receipt)
        self.assertEqual(self.propose(receipt['requestId'])['state'], 'preparing')
        committed = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((committed['state'], committed['revision']), ('committed', 2))
        self.coordinator = handoff.Coordinator(self.path, clock=lambda: self.now)
        self.assertEqual(self.recall(receipt['requestId']), committed)
        self.assertEqual(self.propose(receipt['requestId']), committed)

    def test_busy_source_recall_waits_beyond_preparing_timeout(self):
        self.register(self.target, 'notebook', self.session)
        fields = dict(name='PC', kind='windows', session=self.session, busy=True,
                      privacyLocked=False, connected=True)
        self.call(self.source, 'register', **fields)
        receipt = self.recall()
        self.assert_error('source_busy', lambda: self.propose(receipt['requestId']))
        for _ in range(6):
            self.now += 7
            self.call(self.source, 'register', **fields)
            self.register(self.target, 'notebook', self.session)
        self.assertEqual(self.recall(receipt['requestId'])['state'], 'requested')
        self.register(self.source, 'windows', self.session)
        self.assertEqual(self.propose(receipt['requestId'])['state'], 'preparing')

    def test_abandoned_requested_target_expires_without_changing_owner(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.now += 8
        self.register(self.source, 'windows', self.session)
        result = self.call(self.source, 'poll')['outgoing'][0]
        self.assertEqual((result['state'], result['error']), ('failed', 'expired'))
        self.register(self.target, 'notebook', self.session)
        self.assertEqual(self.recall(receipt['requestId']), result)
        self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_offline_recall_commits_and_returning_source_stays_passive(self):
        self.now += 8
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.assertEqual(receipt['state'], 'preparing')
        self.assertTrue(receipt['offlineRecovery'])
        answer = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((answer['state'], answer['revision']), ('committed', 2))
        self.register(self.source, 'windows', self.session)
        self.assertEqual(self.call(self.source, 'poll')['ownership'][0]['ownerId'], self.target)

    def test_requested_recall_retries_into_offline_recovery_after_owner_lease(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.now += 7
        self.register(self.target, 'notebook', self.session)
        self.assertEqual(self.recall(receipt['requestId'])['state'], 'requested')
        self.now += 1
        recovered = self.recall(receipt['requestId'])
        self.assertEqual(recovered['state'], 'preparing')
        self.assertTrue(recovered['offlineRecovery'])
        self.assertEqual(self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']['state'], 'committed')

    def test_offline_recall_rejects_returned_owner_even_with_new_instance(self):
        for restart in (False, True):
            self.now += 8
            self.register(self.target, 'notebook', self.session)
            receipt = self.recall()
            if restart:
                self.instances[self.source] = str(uuid4())
            self.register(self.source, 'windows', self.session)
            answer = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
            self.assertEqual((answer['state'], answer['error']), ('failed', 'source_online'))
            self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_online_recall_preserves_source_rechecks_at_accept(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.propose(receipt['requestId'])
        self.now += 8
        self.register(self.target, 'notebook', self.session)
        answer = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((answer['state'], answer['error']), ('failed', 'source_offline'))

    def test_recall_rechecks_target_readiness_and_selection(self):
        for key, value, code in [('busy', True, 'target_busy'), ('privacyLocked', True, 'target_locked'),
                                  ('connected', False, 'target_offline')]:
            self.now += 8
            self.register(self.target, 'notebook', self.session)
            receipt = self.recall()
            fields = dict(name='Notebook', kind='notebook', session=self.session,
                          busy=False, privacyLocked=False, connected=True)
            fields[key] = value
            self.call(self.target, 'register', **fields)
            result = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
            self.assertEqual((result['state'], result['error']), ('failed', code))
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.register(self.target, 'notebook', None)
        self.assert_error('session_mismatch', lambda: self.call(self.target, 'accept', requestId=receipt['requestId']))

    def test_recall_requires_selected_passive_session_and_closed_payload(self):
        self.assert_error('session_mismatch', self.recall)
        self.assert_error('target_is_owner', lambda: self.recall(client=self.source))
        self.register(self.target, 'notebook', self.session)
        self.assert_error('invalid_payload', lambda: self.call(self.target, 'recall', requestId=str(uuid4()),
                          session=self.session, targetKind='windows'))
        self.assert_error('invalid_payload', lambda: self.call(self.target, 'recall', requestId=str(uuid4()),
                          session={**self.session, 'profile': 'foreign'}))

    def test_requested_target_can_reject_but_wrong_clients_cannot_advance(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.assert_error('request_conflict', lambda: self.call(self.target, 'request',
                          requestId=receipt['requestId'], targetKind='notebook', session=self.session))
        self.assert_error('request_conflict', lambda: self.call(self.source, 'request',
                          requestId=receipt['requestId'], targetKind='windows', session=self.session))
        self.assert_error('request_conflict', lambda: self.recall(receipt['requestId'], self.source))
        self.assert_error('wrong_target', lambda: self.call(self.source, 'reject', requestId=receipt['requestId']))
        rejected = self.call(self.target, 'reject', requestId=receipt['requestId'])['receipt']
        self.assertEqual((rejected['state'], rejected['error']), ('failed', 'rejected'))
        self.assertEqual(self.propose(receipt['requestId']), rejected)

    def test_recall_cannot_reuse_legacy_request_uuid_or_foreign_scope(self):
        receipt = self.propose()
        self.register(self.target, 'notebook', self.session)
        self.assert_error('request_conflict', lambda: self.recall(receipt['requestId']))
        self.assert_error('client_not_registered', lambda: self.call(self.target, 'recall',
                          principal='actor-b', requestId=str(uuid4()), session=self.session))
        self.assert_error('client_not_registered', lambda: self.call(self.target, 'recall',
                          profile='foreign', requestId=str(uuid4()), session={**self.session, 'profile': 'foreign'}))

    def test_competing_recall_claims_and_accepts_commit_exactly_once(self):
        self.now += 8
        self.register(self.target, 'notebook', self.session)
        extra = str(uuid4())
        self.instances[extra] = str(uuid4())
        self.register(extra, 'notebook', self.session)
        with ThreadPoolExecutor(max_workers=2) as executor:
            receipts = list(executor.map(lambda client: self.recall(client=client), [self.target, extra]))
        self.assertCountEqual([row['state'] for row in receipts], ['preparing', 'failed'])
        prepared = next(row for row in receipts if row['state'] == 'preparing')
        failed = next(row for row in receipts if row['state'] == 'failed')
        self.assertEqual(failed['error'], 'transfer_pending')
        with ThreadPoolExecutor(max_workers=2) as executor:
            accepted = list(executor.map(lambda _: self.call(prepared['targetId'], 'accept',
                            requestId=prepared['requestId'])['receipt'], range(2)))
        self.assertEqual(accepted[0], accepted[1])
        self.assertEqual(accepted[0]['revision'], 2)

    def test_requested_recall_blocks_competing_ordinary_request(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.assertEqual(self.propose()['error'], 'transfer_pending')
        self.assertEqual(self.recall()['error'], 'transfer_pending')
        self.assertEqual(self.propose(receipt['requestId'])['state'], 'preparing')

    def test_fresh_disconnected_owner_requires_full_lease_before_recovery(self):
        self.register(self.target, 'notebook', self.session)
        self.call(self.source, 'register', name='PC', kind='windows', session=self.session,
                  busy=False, privacyLocked=False, connected=False)
        receipt = self.recall()
        self.assertEqual((receipt['state'], receipt['offlineRecovery']), ('requested', False))
        self.assert_error('source_offline', lambda: self.propose(receipt['requestId']))
        self.now += 7
        self.register(self.target, 'notebook', self.session)
        self.assertEqual(self.recall(receipt['requestId'])['state'], 'requested')
        self.now += 1
        self.assertTrue(self.recall(receipt['requestId'])['offlineRecovery'])

    def test_live_owner_different_selected_session_fails_recall_honestly(self):
        self.register(self.target, 'notebook', self.session)
        self.register(self.source, 'windows', {**self.session, 'id': 'other-session'})
        receipt = self.recall()
        self.assertEqual((receipt['state'], receipt['error']), ('failed', 'source_session_changed'))
        self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_requested_recall_rechecks_pinned_source_selection_and_instance(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        self.register(self.source, 'windows', {**self.session, 'id': 'other-session'})
        result = self.propose(receipt['requestId'])
        self.assertEqual((result['state'], result['error']), ('failed', 'source_session_changed'))
        self.register(self.source, 'windows', self.session)
        receipt = self.recall()
        self.now += 7
        self.register(self.target, 'notebook', self.session)
        self.now += 1
        self.instances[self.source] = str(uuid4())
        self.register(self.source, 'windows', self.session)
        result = self.propose(receipt['requestId'])
        self.assertEqual((result['state'], result['error']), ('failed', 'source_instance_changed'))

    def test_requested_recall_source_lock_waits_and_target_readiness_is_rechecked(self):
        self.register(self.target, 'notebook', self.session)
        self.call(self.source, 'register', name='PC', kind='windows', session=self.session,
                  busy=False, privacyLocked=True, connected=True)
        receipt = self.recall()
        self.assert_error('source_locked', lambda: self.propose(receipt['requestId']))
        self.register(self.source, 'windows', self.session)
        self.call(self.target, 'register', name='Notebook', kind='notebook', session=self.session,
                  busy=True, privacyLocked=False, connected=True)
        result = self.propose(receipt['requestId'])
        self.assertEqual((result['state'], result['error']), ('failed', 'target_busy'))

    def test_offline_recall_rechecks_owner_revision_atomically(self):
        self.now += 8
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        with self.coordinator._connect() as db:
            db.execute('UPDATE ownership SET revision=revision+1 WHERE session=?', (self.session['id'],))
        result = self.call(self.target, 'accept', requestId=receipt['requestId'])['receipt']
        self.assertEqual((result['state'], result['error']), ('failed', 'ownership_changed'))
        self.assertEqual(self.call(self.target, 'poll')['ownership'][0]['ownerId'], self.source)

    def test_requested_recall_rechecks_owner_revision_before_preparing(self):
        self.register(self.target, 'notebook', self.session)
        receipt = self.recall()
        with self.coordinator._connect() as db:
            db.execute('UPDATE ownership SET revision=revision+1 WHERE session=?', (self.session['id'],))
        result = self.propose(receipt['requestId'])
        self.assertEqual((result['state'], result['error']), ('failed', 'ownership_changed'))

    def test_recall_initial_target_must_be_connected_idle_and_unlocked(self):
        for key, value, code in [('busy', True, 'target_busy'), ('privacyLocked', True, 'target_locked'),
                                  ('connected', False, 'target_offline')]:
            fields = dict(name='Notebook', kind='notebook', session=self.session,
                          busy=False, privacyLocked=False, connected=True)
            fields[key] = value
            self.call(self.target, 'register', **fields)
            self.assert_error(code, self.recall)


try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
except ImportError:
    FastAPI = None


@unittest.skipIf(FastAPI is None, 'FastAPI adapter tests need existing server/test venv')
class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(handoff, 'SQLite handoff coordinator is missing')
        source = SOURCE.with_name('hermes_handoff_router.py')
        self.assertTrue(source.exists(), 'Authenticated dashboard adapter is missing')
        import sys
        sys.path.insert(0, str(SOURCE.parent))
        self.addCleanup(lambda: sys.path.remove(str(SOURCE.parent)))
        spec = importlib.util.spec_from_file_location('hermes_handoff_router', source)
        router_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(router_module)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        # Use the adapter's imported class so its HandoffError is the same type
        # caught at the HTTP boundary (importlib above loads a separate module).
        self.coordinator = router_module.Coordinator(Path(directory.name) / 'handoff.sqlite3')
        app = FastAPI()
        app.state.auth_required = True
        self.identity = SimpleNamespace(user_id='actor', provider='cookie-provider')
        @app.middleware('http')
        async def verified_identity(request, call_next):
            if self.identity is not None:
                request.state.session = self.identity
            return await call_next(request)
        app.include_router(router_module.create_router(self.coordinator,
                           authorize_profile=lambda request, profile: profile == 'default',
                           authorize_session=lambda request, session: session['id'] == 'stored-session'))
        self.client = TestClient(app, base_url='https://dashboard.test')
        self.addCleanup(self.client.close)
        self.payload = dict(operation='register', clientId=str(uuid4()), instanceId=str(uuid4()), profile='default',
                            name='PC', kind='windows', session=None, busy=False, privacyLocked=False, connected=True)

    def post(self, **kwargs):
        return self.client.post('/api/lilith/handoff', **kwargs)

    def test_verified_identity_origin_and_closed_payload(self):
        response = self.post(json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['supported'])
        self.assertEqual(self.post(json={**self.payload, 'principal': 'forged'}).status_code, 400)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'null'}).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'https://dashboard.test:0'}).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'https://@dashboard.test'}).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers=[('Origin', 'https://dashboard.test'),
                                                             ('Origin', 'https://evil.test')]).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'https://dashboard.test'}).status_code, 200)
        self.assertEqual(self.post(json=self.payload, headers={'Sec-Fetch-Site': 'cross-site'}).status_code, 403)
        self.assertEqual(self.post(json=self.payload, headers={'Sec-Fetch-Site': 'none'}).status_code, 200)
        self.assertEqual(self.post(json=self.payload, headers={'Origin': 'null', 'Sec-Fetch-Site': 'none'}).status_code, 403)
        self.identity = None
        self.assertEqual(self.post(json=self.payload).status_code, 401)
        self.identity = SimpleNamespace(principal='service-key', provider='token')
        self.assertEqual(self.post(json=self.payload).status_code, 401)

    def test_body_cap_json_duplicates_and_profile_permission(self):
        self.assertEqual(self.post(content='x' * 8193, headers={'Content-Type': 'application/json'}).status_code, 413)
        self.assertEqual(self.post(content='{}', headers={'Content-Type': 'text/plain'}).status_code, 415)
        self.assertEqual(self.post(content='{', headers={'Content-Type': 'application/json'}).status_code, 400)
        self.assertEqual(self.post(content='{"operation":"poll","operation":"register"}',
                                  headers={'Content-Type': 'application/json'}).status_code, 400)
        self.assertEqual(self.post(json={**self.payload, 'profile': 'foreign'}).status_code, 403)
        self.assertEqual(self.post(json={**self.payload, 'session': dict(id='unknown', profile='default', title=None)}).status_code, 403)
        # Streaming bodies without Content-Length are bounded before JSON parsing.
        self.assertEqual(self.post(content=iter([b'{' * 4096, b'x' * 4097]),
                                  headers={'Content-Type': 'application/json'}).status_code, 413)

    def test_two_authenticated_clients_share_atomic_receipt_without_prompt_resend(self):
        session = dict(id='stored-session', profile='default', title='Conversation')
        source = {**self.payload, 'session': session}
        target = {**self.payload, 'clientId': str(uuid4()), 'instanceId': str(uuid4()), 'name': 'Notebook', 'kind': 'notebook'}
        self.assertEqual(self.post(json=source).status_code, 200)
        self.assertEqual(self.post(json=target).status_code, 200)
        common = {k: source[k] for k in ('clientId', 'instanceId', 'profile')}
        transfer = {**common, 'operation': 'request', 'requestId': str(uuid4()), 'targetKind': 'notebook', 'session': session}
        receipt = self.post(json=transfer).json()['receipt']
        self.assertEqual(receipt['state'], 'preparing')
        self.assertEqual(self.post(json={**target, 'session': session}).status_code, 200)
        answer = {k: target[k] for k in ('clientId', 'instanceId', 'profile')}
        accepted = self.post(json={**answer, 'operation': 'accept', 'requestId': receipt['requestId']}).json()
        self.assertEqual(accepted['receipt']['state'], 'committed')
        self.assertEqual(accepted['ownership'][0]['ownerId'], target['clientId'])
        self.assertEqual(self.post(json=transfer).json()['receipt'], accepted['receipt'])

    def test_recall_uses_existing_cookie_profile_session_and_closed_schema_checks(self):
        session = dict(id='stored-session', profile='default', title='Conversation')
        source = {**self.payload, 'session': session}
        target = {**source, 'clientId': str(uuid4()), 'instanceId': str(uuid4()),
                  'name': 'Notebook', 'kind': 'notebook'}
        self.assertEqual(self.post(json=source).status_code, 200)
        self.assertEqual(self.post(json=target).status_code, 200)
        recall = {k: target[k] for k in ('clientId', 'instanceId', 'profile')}
        recall.update(operation='recall', requestId=str(uuid4()), session=session)
        self.assertEqual(self.post(json={**recall, 'targetKind': 'windows'}).status_code, 400)
        self.assertEqual(self.post(json={**recall, 'profile': 'foreign',
                        'session': {**session, 'profile': 'foreign'}}).status_code, 403)
        self.assertEqual(self.post(json={**recall, 'session': {**session, 'id': 'unknown'}}).status_code, 403)
        self.assertEqual(self.post(json=recall, headers={'Origin': 'https://evil.test'}).status_code, 403)
        receipt = self.post(json=recall).json()['receipt']
        self.assertEqual((receipt['state'], receipt['sourceId'], receipt['targetId']),
                         ('requested', source['clientId'], target['clientId']))
        self.identity = SimpleNamespace(user_id='other-actor', provider='cookie-provider')
        self.assertEqual(self.post(json=recall).status_code, 409)
        self.identity = None
        self.assertEqual(self.post(json=recall).status_code, 401)


if __name__ == '__main__':
    unittest.main()
