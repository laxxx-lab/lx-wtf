"""Mount on the existing gated Hermes dashboard; no separate credential or server."""
from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from .session_handoff import Coordinator, HandoffError, MAX_BODY_BYTES, validate_payload
except ImportError:
    from session_handoff import Coordinator, HandoffError, MAX_BODY_BYTES, validate_payload


def _identity(request):
    # This seam is populated only by gated_auth_middleware after provider verification.
    # Legacy loopback/session-token auth and token-only principals cannot establish ownership.
    session = getattr(request.state, 'session', None)
    if not getattr(request.app.state, 'auth_required', False) or session is None:
        raise HandoffError('authentication_required', 401)
    user_id, provider = getattr(session, 'user_id', None), getattr(session, 'provider', None)
    if (not isinstance(user_id, str) or not user_id or len(user_id) > 512
            or not isinstance(provider, str) or not provider or len(provider) > 128):
        raise HandoffError('authentication_required', 401)
    # Provider ids cannot collide, and identity strings are never emitted to clients/logs.
    return hashlib.sha256(json.dumps([provider, user_id], separators=(',', ':')).encode()).hexdigest()


def _origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError()
    port = parsed.port if parsed.port is not None else (443 if parsed.scheme == 'https' else 80)
    return parsed.scheme, parsed.hostname.lower(), port


def _check_origin(request):
    if len(request.headers.getlist('origin')) > 1:
        raise HandoffError('origin_rejected', 403)
    origin = request.headers.get('origin')
    try:
        expected = _origin(f'{request.url.scheme}://{request.url.netloc}')
        if origin is not None and _origin(origin) != expected:
            raise ValueError()
    except ValueError:
        raise HandoffError('origin_rejected', 403) from None
    site = request.headers.get('sec-fetch-site')
    # Electron main-process authSession.fetch sends no Origin and site=none.
    # Browser opaque/null origins and cross-site requests still fail above/below.
    native = site == 'none' and origin is None
    if site is not None and site != 'same-origin' and not native:
        raise HandoffError('origin_rejected', 403)


def _dashboard_profile(request, profile):
    # Installed dashboard identities have administrative access to its named profiles.
    # Use the same validated existing-profile resolver, never a caller-created namespace.
    from hermes_cli.web_server_profiles import _resolve_profile_dir
    try:
        _resolve_profile_dir(profile)
    except HTTPException:
        return False
    return True


def _dashboard_session(request, session):
    from hermes_cli.web_server_sessions import _open_session_db_for_profile
    try:
        db = _open_session_db_for_profile(session['profile'], read_only=True)
        try:
            return db.get_session(session['id']) is not None
        finally:
            db.close()
    except HTTPException:
        return False


def _closed_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise HandoffError('invalid_payload', 400)
        result[key] = value
    return result


def create_router(coordinator: Coordinator, *, authorize_profile=_dashboard_profile,
                  authorize_session=_dashboard_session):
    """Authorization callbacks must reuse the deployment's existing dashboard permissions.

    The installed dashboard uses globally administrative cookie sessions. Deployments
    adding per-user profile/session ACLs must provide those existing checks here.
    """
    router = APIRouter()

    @router.post('/api/lilith/handoff')
    async def handoff(request: Request):
        try:
            principal = _identity(request)
            _check_origin(request)
            if request.headers.get('content-type', '').split(';', 1)[0].lower() != 'application/json':
                raise HandoffError('json_required', 415)
            length = request.headers.get('content-length')
            if length is not None:
                try:
                    size = int(length)
                except ValueError:
                    raise HandoffError('invalid_payload', 400) from None
                if size < 0:
                    raise HandoffError('invalid_payload', 400)
                if size > MAX_BODY_BYTES:
                    raise HandoffError('body_too_large', 413)
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_BODY_BYTES:
                    raise HandoffError('body_too_large', 413)
                body.extend(chunk)
            try:
                payload = json.loads(body, object_pairs_hook=_closed_object)
            except (ValueError, UnicodeDecodeError, RecursionError):
                raise HandoffError('invalid_payload', 400) from None
            validate_payload(payload)
            if not await asyncio.to_thread(authorize_profile, request, payload['profile']):
                raise HandoffError('profile_forbidden', 403)
            if payload.get('session') is not None and not await asyncio.to_thread(
                    authorize_session, request, payload['session']):
                raise HandoffError('session_forbidden', 403)
            result = await asyncio.to_thread(coordinator.handle, principal, payload)
            return JSONResponse(result, headers={'Cache-Control': 'no-store'})
        except HandoffError as error:
            return JSONResponse(dict(supported=True, error=error.code), status_code=error.status,
                                headers={'Cache-Control': 'no-store'})
        except (sqlite3.Error, OSError):
            return JSONResponse(dict(supported=True, error='storage_unavailable'), status_code=503,
                                headers={'Cache-Control': 'no-store'})

    return router
