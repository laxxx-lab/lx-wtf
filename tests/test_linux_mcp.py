"""Run with the MCP user venv; Linux-only device checks run on the notebook."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import shlex
import signal
import time
import unittest
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import ExitStack
from unittest.mock import patch
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "linux_mcp.py"
if SOURCE.exists():
    spec = importlib.util.spec_from_file_location("linux_mcp", SOURCE)
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
else:
    server = None


class DesktopTypingTests(unittest.IsolatedAsyncioTestCase):
    def native_fixture(self, focuses=(99,), masks=(0,), pointer_ok=True):
        events, positions, states = [], iter(focuses), iter(masks)
        symbols = {(38, 0): ord('a'), (38, 1): ord('A'), (48, 0): ord('ä'),
                   (48, 1): ord('Ä'), (60, 1): ord(':'), (61, 1): ord('/')}
        class Function:
            def __init__(self, call): self.call = call
            def __call__(self, *args): return self.call(*args)
        def keycodes(display, low, high):
            low._obj.value, high._obj.value = 8, 255
            return 1
        last_mask = 0
        def pointer(display, window, root, child, root_x, root_y, window_x, window_y, mask):
            nonlocal last_mask
            self.assertEqual(window, 123)
            last_mask = next(states, last_mask)
            mask._obj.value = last_mask
            return int(pointer_ok)
        lib = SimpleNamespace(XDisplayKeycodes=keycodes,
            XDefaultRootWindow=lambda display: 123, XQueryPointer=pointer,
            XKeycodeToKeysym=lambda display, code, level: symbols.get((code, level), 0),
            XStringToKeysym=lambda name: {b'Shift_L': 0xffe1, b'a': 97}.get(name, 0),
            XKeysymToKeycode=lambda display, symbol: {0xffe1: 50, 97: 38}.get(symbol, 0),
            XSync=lambda *args: 1)
        xtest = SimpleNamespace(
            XTestFakeMotionEvent=Function(lambda *args: events.append(('motion', *args[1:])) or 1),
            XTestFakeButtonEvent=Function(lambda *args: events.append(('button', *args[1:])) or 1),
            XTestFakeKeyEvent=Function(lambda display, code, pressed, delay: events.append((code, pressed)) or 1))
        class Desktop(server.X11):
            display = 1
            def __init__(self): self.lib, self.last = lib, 99
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def focus(self): self.last = next(positions, self.last); return self.last
            def size(self): return (1920, 1080)
        return Desktop, xtest, events

    async def test_typing_schema_and_current_keyboard_letters_umlauts_and_url_punctuation(self):
        tools = {tool.name: tool for tool in await server.mcp.list_tools()}
        self.assertIn('text', tools['desktop_input'].inputSchema['properties'])
        desktop, xtest, events = self.native_fixture()
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            result = server.desktop_input('type', text='aAäÄ:/', expected_window=99, x=-99, y=-99)
        self.assertTrue(result['submitted'])
        self.assertEqual(result['charactersTyped'], 6)
        self.assertNotIn('aAäÄ:/', json.dumps(result))
        self.assertEqual(events, [(38, 1), (38, 0), (50, 1), (38, 1), (38, 0), (50, 0),
                                  (48, 1), (48, 0), (50, 1), (48, 1), (48, 0), (50, 0),
                                  (50, 1), (60, 1), (60, 0), (50, 0),
                                  (50, 1), (61, 1), (61, 0), (50, 0)])

    async def test_text_is_bounded_and_all_characters_validated_before_any_native_input(self):
        desktop, xtest, events = self.native_fixture()
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            for text in ('', 'a' * 2001, 'a\n', 'a\t', 'a\x00', 'a\x85', 'a€', 'a😀'):
                with self.assertRaises(ValueError):
                    server.desktop_input('type', text=text, expected_window=99)
            self.assertEqual(events, [])
            with self.assertRaisesRegex(ValueError, 'Focused window'):
                server.desktop_input('type', text='a', expected_window=12)
            self.assertEqual(events, [])

    async def test_focus_change_stops_after_completed_character_with_shift_released(self):
        desktop, xtest, events = self.native_fixture((99, 99, 12))
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            result = server.desktop_input('type', text='AA', expected_window=99)
        self.assertFalse(result['submitted'])
        self.assertEqual(result['charactersTyped'], 1)
        self.assertEqual(result['focusedWindow'], 12)
        self.assertEqual(events, [(50, 1), (38, 1), (38, 0), (50, 0)])
        self.assertNotIn('AA', json.dumps(result))

    async def test_failed_native_character_releases_its_pressed_shift(self):
        desktop, xtest, events = self.native_fixture()
        original = xtest.XTestFakeKeyEvent.call
        xtest.XTestFakeKeyEvent.call = lambda display, code, pressed, delay: original(display, code, pressed, delay) and not (code == 38 and pressed == 1)
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            with self.assertRaisesRegex(RuntimeError, 'refused'):
                server.desktop_input('type', text='A', expected_window=99)
        self.assertEqual(events, [(50, 1), (38, 1), (50, 0)])

    async def test_existing_move_click_and_key_keep_native_input_contract(self):
        desktop, xtest, events = self.native_fixture()
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            move = server.desktop_input('move', x=10, y=20)
            click = server.desktop_input('click', x=10, y=20, expected_window=99)
            key = server.desktop_input('key', key='a', expected_window=99)
        self.assertTrue(move['submitted'] and click['submitted'] and key['submitted'])
        self.assertNotIn('charactersTyped', key)
        self.assertEqual(events, [('motion', -1, 10, 20, 0), ('motion', -1, 10, 20, 0),
                                  ('button', 1, 1, 0), ('button', 1, 0, 0), (38, 1), (38, 0)])

    async def test_non_neutral_modifiers_caps_and_keyboard_group_refuse_before_input(self):
        for mask in (1, 2, 4, 8, 32, 64, 128, 0x2000, 0x4000, 0x6000):
            desktop, xtest, events = self.native_fixture(masks=(mask,))
            with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
                with self.assertRaisesRegex(ValueError, 'keyboard state'):
                    server.desktop_input('type', text='a', expected_window=99)
            self.assertEqual(events, [], 'modifier state must not turn text into shortcuts')

    async def test_num_lock_is_permitted_without_changing_user_keyboard_state(self):
        desktop, xtest, events = self.native_fixture(masks=(16,))
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            result = server.desktop_input('type', text='a', expected_window=99)
        self.assertTrue(result['submitted'])
        self.assertEqual(result['charactersTyped'], 1)
        self.assertEqual(events, [(38, 1), (38, 0)])

    async def test_modifier_change_between_characters_stops_and_reports_only_partial_count(self):
        desktop, xtest, events = self.native_fixture(masks=(0, 0, 4))
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            result = server.desktop_input('type', text='AA', expected_window=99)
        self.assertFalse(result['submitted'])
        self.assertEqual(result['charactersTyped'], 1)
        self.assertIn('keyboard state', result['note'])
        self.assertEqual(events, [(50, 1), (38, 1), (38, 0), (50, 0)])

    async def test_unavailable_keyboard_state_refuses_without_input(self):
        desktop, xtest, events = self.native_fixture(pointer_ok=False)
        with patch.object(server, 'X11', desktop), patch.object(server.C, 'CDLL', lambda name: xtest):
            with self.assertRaisesRegex(RuntimeError, 'keyboard state'):
                server.desktop_input('type', text='a', expected_window=99)
        self.assertEqual(events, [])


class LilithControlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import httpx
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.connection = self.root / '.local' / 'linux-control.json'
        self.connection.parent.mkdir()
        self.token = 'd' * 64
        self.connection.write_text(json.dumps({'url': 'http://127.0.0.1:8874', 'token': self.token, 'pid': 123}))
        self.connection.chmod(0o600)
        self.requests = []
        self.response_status, self.response_body = 200, {'privacyLocked': False, 'device': 'notebook-fixture'}
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def handle_request(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
                owner.requests.append((self.command, self.path, self.headers.get('Authorization'), json.loads(body) if body else None))
                self.send_response(owner.response_status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(owner.response_body).encode())
            do_GET = handle_request
            do_POST = handle_request
            def log_message(self, *args):
                pass
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.patches = ExitStack()
        original_client = httpx.AsyncClient
        original_port = self.http.server_port
        class LocalFixtureTransport(httpx.AsyncBaseTransport):
            def __init__(self):
                self.transport = httpx.AsyncHTTPTransport()
            async def handle_async_request(self, request):
                owner.assertEqual(str(request.url).split('/v1/')[0], 'http://127.0.0.1:8874')
                request.url = request.url.copy_with(port=original_port)
                return await self.transport.handle_async_request(request)
            async def aclose(self):
                await self.transport.aclose()
        self.patches.enter_context(patch.object(httpx, 'AsyncClient', lambda **kwargs: original_client(
            **kwargs, transport=LocalFixtureTransport())))
        self.patches.enter_context(patch.dict(os.environ, {'LILITH_APP_ROOT': str(self.root)}))
        if sys.platform != 'linux':
            # Windows cannot represent POSIX 0600. Keep actual files/HTTP and
            # adapt only that OS metadata boundary; Linux runs it unpatched.
            real_lstat, real_fstat = Path.lstat, os.fstat
            def private(info):
                values = list(info)
                values[0] = (values[0] & ~0o777) | 0o600
                return os.stat_result(values)
            self.patches.enter_context(patch.object(Path, 'lstat', lambda source: private(real_lstat(source))))
            self.patches.enter_context(patch.object(os, 'fstat', lambda descriptor: private(real_fstat(descriptor))))
            self.patches.enter_context(patch.object(os, 'geteuid', lambda: self.connection.stat().st_uid, create=True))

    async def asyncTearDown(self):
        self.patches.close()
        await asyncio.to_thread(self.http.shutdown)
        self.http.server_close()
        self.thread.join()
        self.directory.cleanup()

    async def test_tools_send_bounded_app_requests_with_private_bearer_and_target(self):
        tools = {tool.name: tool for tool in await server.mcp.list_tools()}
        self.assertTrue({'lilith_status', 'lilith_workbench', 'lilith_browser'} <= tools.keys())
        self.assertTrue(tools['lilith_status'].annotations.readOnlyHint)
        self.assertFalse(tools['lilith_browser'].annotations.readOnlyHint)
        result = await server.lilith_status()
        self.assertTrue(result['ok'])
        self.assertEqual(result['result']['device'], 'notebook-fixture')
        self.assertIn('host', result['target'])
        await server.lilith_workbench('browser', 'https://example.org/')
        self.response_body = {'ready': True, 'url': 'https://example.org/', 'title': 'Example', 'loading': False, 'visible': True, 'tab': 'browser'}
        browser = await server.lilith_browser('navigate', 'https://example.org/')
        self.assertEqual(browser['result']['title'], 'Example')
        await server.lilith_browser()
        self.assertEqual(self.requests, [
            ('GET', '/v1/status', 'Bearer ' + self.token, None),
            ('POST', '/v1/workbench', 'Bearer ' + self.token, {'enabled': True, 'agent': False, 'tab': 'browser', 'url': 'https://example.org/'}),
            ('POST', '/v1/browser', 'Bearer ' + self.token, {'action': 'navigate', 'url': 'https://example.org/'}),
            ('GET', '/v1/browser', 'Bearer ' + self.token, None)])
        self.assertNotIn(self.token, json.dumps(result) + json.dumps(browser))

    async def test_missing_connection_is_reported_without_shell_or_remote_fallback(self):
        self.connection.unlink()
        result = await server.lilith_status()
        self.assertFalse(result['ok'])
        self.assertEqual(result['error'], 'Lilith app connection is unavailable')
        self.assertEqual(self.requests, [])

    async def test_clipboard_tools_use_explicit_local_requests_and_do_not_echo_written_text(self):
        tools = {tool.name: tool for tool in await server.mcp.list_tools()}
        self.assertIn('lilith_clipboard_read', tools)
        self.assertIn('lilith_clipboard_write', tools)
        self.assertTrue(tools['lilith_clipboard_read'].annotations.readOnlyHint)
        self.assertFalse(tools['lilith_clipboard_write'].annotations.readOnlyHint)
        self.response_body = {'ok': True, 'text': 'fixture', 'untrusted': True, 'truncated': False, 'observedAt': '2026-10-14T00:00:00.000Z'}
        read = await server.lilith_clipboard_read(12)
        self.assertEqual(read['result']['text'], 'fixture')
        self.response_body = {'ok': True, 'verified': True, 'characters': 9}
        write = await server.lilith_clipboard_write('Grüße 😀\n')
        self.assertTrue(write['ok'])
        self.assertNotIn('Grüße', json.dumps(write))
        self.assertEqual(self.requests, [
            ('POST', '/v1/clipboard', 'Bearer ' + self.token, {'action': 'read', 'maxChars': 12}),
            ('POST', '/v1/clipboard', 'Bearer ' + self.token, {'action': 'write', 'text': 'Grüße 😀\n'})])

    async def test_clipboard_validation_rejects_invalid_payloads_before_http_and_bounds_unicode(self):
        self.assertTrue(hasattr(server, 'lilith_clipboard_read'))
        for maximum in (0, 20001, 1.5, True):
            with self.assertRaises(ValueError):
                await server.lilith_clipboard_read(maximum)
        for value in ('', 'x\x00y', 'x' * 20001, '😀' * 10001, '\ud800'):
            with self.assertRaises(ValueError):
                await server.lilith_clipboard_write(value)
        self.assertEqual(self.requests, [])
        self.response_body = {'ok': True, 'text': '\n' * 20000, 'untrusted': True, 'truncated': False}
        result = await server.lilith_clipboard_read()
        self.assertTrue(result['ok'], 'Bounded clipboard text may contain JSON-escaped control characters')
        self.assertEqual(len(result['result']['text']), 20000)

    async def test_private_file_url_and_payload_boundaries_refuse_before_http(self):
        for metadata in ({'url': 'http://example.org:8874', 'token': self.token, 'pid': 123},
                         {'url': 'http://127.0.0.1:8874', 'token': 'short', 'pid': 123}):
            self.connection.write_text(json.dumps(metadata))
            result = await server.lilith_status()
            self.assertFalse(result['ok'])
            self.assertNotIn(self.token, json.dumps(result))
        self.connection.write_text(json.dumps({'url': 'http://127.0.0.1:8874', 'token': self.token, 'pid': 123}))
        for action, url in [('javascript', None), ('navigate', 'file:///etc/passwd'), ('reload', 'https://example.org/'), ('navigate', None)]:
            with self.assertRaises(ValueError):
                await server.lilith_browser(action, url)
        with self.assertRaises(ValueError):
            await server.lilith_workbench('arbitrary')
        self.assertEqual(self.requests, [])

    async def test_insecure_or_oversized_connection_file_is_rejected(self):
        real_fstat = os.fstat
        def insecure(descriptor):
            values = list(real_fstat(descriptor)); values[0] |= 0o044
            return os.stat_result(values)
        with patch.object(os, 'fstat', insecure):
            result = await server.lilith_status()
            self.assertFalse(result['ok'])
        self.connection.write_text(' ' * 4097)
        self.assertFalse((await server.lilith_status())['ok'])
        self.assertEqual(self.requests, [])

    async def test_foreign_owner_and_non_absolute_app_root_are_not_used(self):
        owner = os.geteuid()
        with patch.object(os, 'geteuid', lambda: owner + 1):
            self.assertFalse((await server.lilith_status())['ok'])
        with patch.dict(os.environ, {'LILITH_APP_ROOT': 'relative/app'}):
            self.assertFalse((await server.lilith_status())['ok'])
        self.assertEqual(self.requests, [])

    @unittest.skipUnless(sys.platform == 'linux', 'requires POSIX symlink and private file metadata')
    async def test_connection_file_symlink_is_rejected(self):
        moved = self.connection.with_name('real-control.json')
        self.connection.rename(moved)
        self.connection.symlink_to(moved)
        self.assertFalse((await server.lilith_status())['ok'])
        self.assertEqual(self.requests, [])

    async def test_app_privacy_and_errors_preserve_refusal_without_exposing_token(self):
        self.response_status, self.response_body = 423, {'error': 'Local privacy lock is active'}
        result = await server.lilith_browser('reload')
        self.assertFalse(result['ok'])
        self.assertEqual(result['httpStatus'], 423)
        self.assertEqual(result['error'], 'Lilith app refused the request')
        self.assertEqual(result['result']['error'], 'Local privacy lock is active')
        self.response_status, self.response_body = 500, {'error': self.token}
        result = await server.lilith_status()
        self.assertFalse(result['ok'])
        self.assertNotIn(self.token, json.dumps(result))
        self.response_status, self.response_body = 200, {'data': 'x' * 65537}
        self.assertFalse((await server.lilith_status())['ok'])


class LinuxMCPTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(server, "Linux MCP implementation is missing")

    async def test_auth_protects_every_http_endpoint_and_rejects_duplicates(self):
        calls, sent = [], []
        async def app(scope, receive, send):
            calls.append(scope)
        async def receive():
            return {"type": "http.request", "body": b""}
        async def send(event):
            sent.append(event)
        protected = server.BearerGate(app, "a" * 64)
        for path in ("/mcp", "/", "/health"):
            for headers in ([], [(b"authorization", b"Bearer wrong")],
                            [(b"authorization", b"Bearer " + b"a" * 64)] * 2):
                await protected({"type": "http", "path": path, "headers": headers}, receive, send)
                self.assertEqual(sent[-2]["status"], 401)
        self.assertEqual(calls, [])
        await protected({"type": "http", "path": "/mcp", "headers": [
            (b"authorization", b"Bearer " + b"a" * 64)]}, receive, send)
        self.assertEqual(len(calls), 1)

    def test_file_write_requires_explicit_overwrite_and_read_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "document.txt"
            self.assertEqual(server.write_text(str(path), "hello")['bytesWritten'], 5)
            with self.assertRaises(FileExistsError):
                server.write_text(str(path), "lost")
            self.assertEqual(path.read_text(), "hello")
            server.write_text(str(path), "abcdefghij", overwrite=True)
            result = server.read_text(str(path), max_chars=4)
            self.assertEqual(result['text'], 'abcd')
            self.assertTrue(result['truncated'])
            self.assertIn('host', result['target'])
            with self.assertRaises(ValueError):
                server.read_text(str(path), max_chars=0)

    def test_binding_rejects_public_and_lan_addresses(self):
        for host in ("0.0.0.0", "192.168.1.10", "8.8.8.8", "localhost"):
            with self.assertRaises(ValueError):
                server.validate_host(host)
        self.assertEqual(server.validate_host("100.64.0.10"), "100.64.0.10")
        self.assertEqual(server.validate_host("127.0.0.1"), "127.0.0.1")

    def test_wayland_display_is_not_treated_as_native_x11(self):
        with patch.object(sys, 'platform', 'linux'), patch.dict(os.environ,
                {'DISPLAY': ':0', 'XDG_SESSION_TYPE': 'wayland'}):
            with self.assertRaisesRegex(RuntimeError, 'Wayland'):
                with server.X11():
                    self.fail('Wayland must not open an X11 connection')

    async def test_registered_tools_identify_linux_target_and_screenshot_has_image_content(self):
        tools = {tool.name: tool for tool in await server.mcp.list_tools()}
        self.assertTrue({'system_status', 'shell_run', 'read_text', 'write_text',
                         'desktop_screenshot', 'desktop_input', 'lilith_status', 'lilith_workbench', 'lilith_browser'} <= tools.keys())
        self.assertIn('Linux', tools['shell_run'].description)
        self.assertTrue(tools['system_status'].annotations.readOnlyHint)
        self.assertFalse(tools['desktop_input'].annotations.readOnlyHint)

    async def test_mcp_wire_lists_tools_only_with_bearer(self):
        import httpx
        app = server.BearerGate(server.mcp.streamable_http_app(), 'c' * 64)
        async with server.mcp.session_manager.run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                    base_url='http://127.0.0.1:8876') as client:
                request = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'}
                response = await client.post('/mcp', json=request)
                self.assertEqual(response.status_code, 401)
                response = await client.post('/mcp', json=request, headers={
                    'Authorization': 'Bearer ' + 'c' * 64,
                    'Accept': 'application/json, text/event-stream'})
                self.assertEqual(response.status_code, 200)
                tools = response.json()['result']['tools']
                self.assertTrue({'desktop_input', 'lilith_status', 'lilith_workbench', 'lilith_browser'} <= {tool['name'] for tool in tools})

    @unittest.skipUnless(sys.platform == 'linux', 'requires Linux process groups')
    async def test_shell_output_is_capped_and_timeout_stops_its_process_group(self):
        result = await server.shell_run("printf '%060000d' 1", max_output=80)
        self.assertEqual(len(result['stdout']), 80)
        self.assertTrue(result['stdoutTruncated'])
        result = await server.shell_run("sleep 10", timeout=0.15)
        self.assertTrue(result['timedOut'])
        self.assertNotEqual(result['exitCode'], 0)
        self.assertEqual(result['target']['platform'], 'linux')

    @unittest.skipUnless(sys.platform == 'linux', 'requires Linux detached process groups')
    async def test_timeout_returns_when_detached_child_keeps_output_pipe_open(self):
        with tempfile.TemporaryDirectory() as directory:
            pid_file = Path(directory) / 'owned-detached-child.pid'
            child = 'printf %s "$$" > "$1"; printf detached-ready; sleep 4; :'
            command = f'setsid /bin/bash -c {shlex.quote(child)} child {shlex.quote(str(pid_file))} & wait'
            start = time.monotonic()
            try:
                result = await server.shell_run(command, timeout=0.3)
                elapsed = time.monotonic() - start
                self.assertTrue(result['timedOut'])
                self.assertIn('detached-ready', result['stdout'])
                self.assertLess(elapsed, 1.8, 'Detached pipe owner must not extend shell timeout')
            finally:
                if pid_file.exists():
                    child_pid = int(pid_file.read_text())
                    try:
                        owned_command = Path(f'/proc/{child_pid}/cmdline').read_bytes()
                        if str(pid_file).encode() in owned_command and os.getpgid(child_pid) == child_pid:
                            os.killpg(child_pid, signal.SIGKILL)
                    except (FileNotFoundError, ProcessLookupError):
                        pass

    @unittest.skipUnless(sys.platform == 'linux', 'requires Linux file ownership')
    def test_token_file_must_be_private_owned_regular_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'token'
            path.write_text('b' * 64)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                server.load_token(path)
            path.chmod(0o600)
            self.assertEqual(server.load_token(path), 'b' * 64)
            link = Path(directory) / 'link'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                server.load_token(link)

    @unittest.skipUnless(sys.platform == 'linux' and os.environ.get('LILITH_MCP_DESKTOP_QA') == '1',
                         'opt-in native test touches only its own temporary X11 window')
    async def test_native_input_events_and_png_on_own_x11_window(self):
        import ctypes as C
        import select
        from PIL import Image
        import base64
        class WindowAttributes(C.Structure):
            _fields_ = [('background_pixmap', C.c_ulong), ('background_pixel', C.c_ulong),
                        ('border_pixmap', C.c_ulong), ('border_pixel', C.c_ulong),
                        ('bit_gravity', C.c_int), ('win_gravity', C.c_int), ('backing_store', C.c_int),
                        ('backing_planes', C.c_ulong), ('backing_pixel', C.c_ulong), ('save_under', C.c_int),
                        ('event_mask', C.c_long), ('do_not_propagate_mask', C.c_long),
                        ('override_redirect', C.c_int), ('colormap', C.c_ulong), ('cursor', C.c_ulong)]
        with server.X11() as desktop:
            lib, display = desktop.lib, desktop.display
            signatures = {
                'XCreateSimpleWindow': ([C.c_void_p, C.c_ulong, C.c_int, C.c_int, C.c_uint,
                    C.c_uint, C.c_uint, C.c_ulong, C.c_ulong], C.c_ulong),
                'XMapWindow': ([C.c_void_p, C.c_ulong], C.c_int),
                'XRaiseWindow': ([C.c_void_p, C.c_ulong], C.c_int),
                'XChangeWindowAttributes': ([C.c_void_p, C.c_ulong, C.c_ulong, C.POINTER(WindowAttributes)], C.c_int),
                'XGetGeometry': ([C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_int),
                    C.POINTER(C.c_int), C.POINTER(C.c_uint), C.POINTER(C.c_uint), C.POINTER(C.c_uint),
                    C.POINTER(C.c_uint)], C.c_int),
                'XSelectInput': ([C.c_void_p, C.c_ulong, C.c_long], C.c_int),
                'XSetInputFocus': ([C.c_void_p, C.c_ulong, C.c_int, C.c_ulong], C.c_int),
                'XDestroyWindow': ([C.c_void_p, C.c_ulong], C.c_int),
                'XPending': ([C.c_void_p], C.c_int),
                'XNextEvent': ([C.c_void_p, C.c_void_p], C.c_int),
                'XConnectionNumber': ([C.c_void_p], C.c_int),
                'XTranslateCoordinates': ([C.c_void_p, C.c_ulong, C.c_ulong, C.c_int,
                    C.c_int, C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_ulong)], C.c_int),
                'XQueryPointer': ([C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong),
                    C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int), C.POINTER(C.c_int),
                    C.POINTER(C.c_uint)], C.c_int)}
            for name, (args, result) in signatures.items():
                getattr(lib, name).argtypes, getattr(lib, name).restype = args, result
            root = lib.XDefaultRootWindow(display)
            old_focus = desktop.focus()
            rr, child, rx, ry, wx, wy, mask = C.c_ulong(), C.c_ulong(), C.c_int(), C.c_int(), C.c_int(), C.c_int(), C.c_uint()
            lib.XQueryPointer(display, root, C.byref(rr), C.byref(child), C.byref(rx), C.byref(ry),
                              C.byref(wx), C.byref(wy), C.byref(mask))
            window = lib.XCreateSimpleWindow(display, root, 60, 60, 320, 200, 0, 0, 0x102030)
            try:
                attributes = WindowAttributes(override_redirect=1)
                # Only this temporary QA window bypasses WM placement/animations.
                lib.XChangeWindowAttributes(display, window, 1 << 9, C.byref(attributes))
                lib.XSelectInput(display, window, 1 | 2 | 4 | 8)
                lib.XMapWindow(display, window)
                lib.XRaiseWindow(display, window)
                lib.XSync(display, 0)
                lib.XSetInputFocus(display, window, 1, 0)
                lib.XSync(display, 0)
                self.assertEqual(desktop.focus(), window)
                content = server.desktop_screenshot()
                self.assertEqual(json.loads(content[0].text)['focusedWindow'], window)
                self.assertEqual(content[1].mimeType, 'image/png')
                image = Image.open(__import__('io').BytesIO(base64.b64decode(content[1].data)))
                self.assertEqual(image.size, desktop.size())
                gx, gy, width, height, border, depth = C.c_int(), C.c_int(), C.c_uint(), C.c_uint(), C.c_uint(), C.c_uint()
                self.assertTrue(lib.XGetGeometry(display, window, C.byref(rr), C.byref(gx), C.byref(gy),
                    C.byref(width), C.byref(height), C.byref(border), C.byref(depth)))
                self.assertGreater(width.value, 0)
                self.assertGreater(height.value, 0)
                px, py = C.c_int(), C.c_int()
                self.assertTrue(lib.XTranslateCoordinates(display, window, root, width.value // 2, height.value // 2,
                    C.byref(px), C.byref(py), C.byref(child)))
                with self.assertRaises(ValueError):
                    server.desktop_input('click', px.value, py.value, expected_window=window + 1)
                server.desktop_input('move', px.value, py.value)
                pointer_x, pointer_y = C.c_int(), C.c_int()
                lib.XQueryPointer(display, root, C.byref(rr), C.byref(child), C.byref(pointer_x), C.byref(pointer_y),
                                  C.byref(wx), C.byref(wy), C.byref(mask))
                self.assertEqual(child.value, window, 'The exact own QA window must be under the pointer before clicking')
                self.assertEqual((pointer_x.value, pointer_y.value), (px.value, py.value))
                self.assertEqual(desktop.focus(), window)
                server.desktop_input('click', px.value, py.value, expected_window=window)
                self.assertEqual(desktop.focus(), window)
                server.desktop_input('key', key='a', expected_window=window)
                lib.XSync(display, 0)
                events, event = [], C.create_string_buffer(192)
                deadline = time.monotonic() + 1
                # Input and event listener use separate connections; wait for actual receipt.
                while time.monotonic() < deadline and not {2, 3, 4, 5} <= set(events):
                    while lib.XPending(display):
                        lib.XNextEvent(display, event)
                        events.append(C.cast(event, C.POINTER(C.c_int)).contents.value)
                    if not {2, 3, 4, 5} <= set(events):
                        select.select([lib.XConnectionNumber(display)], [], [], max(0, deadline - time.monotonic()))
                self.assertTrue({2, 3, 4, 5} <= set(events), f'Missing native events: {events}')
            finally:
                lib.XDestroyWindow(display, window)
                if old_focus > 1:
                    lib.XSetInputFocus(display, old_focus, 1, 0)
                lib.XSync(display, 0)
                server.desktop_input('move', rx.value, ry.value)


if __name__ == '__main__':
    unittest.main()
