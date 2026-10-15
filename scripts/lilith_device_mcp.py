"""Device-bound stdio MCP adapter. Private argv configuration; no shell templates."""
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import time
from typing import Literal

LIMIT = 128 * 1024
Device = Literal['windows', 'notebook']
ACTIONS = {'device_status', 'show_camera', 'windows_list', 'window_place', 'browser', 'conversation_handoff'}


def load_config(filename):
    """Require an owned, mode 0600 regular file on the gateway (no symlinks)."""
    source = Path(filename)
    descriptor = os.open(source, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(descriptor, 'r', encoding='utf-8') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > LIMIT or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid():
            raise ValueError('Private device configuration required')
        value = json.loads(stream.read(LIMIT + 1))
    if not isinstance(value, dict) or set(value) != {'windows', 'notebook'}:
        raise ValueError('Invalid device configuration')
    for entry in value.values():
        if (not isinstance(entry, dict) or set(entry) != {'host', 'command'}
                or not isinstance(entry['host'], str) or not entry['host'] or len(entry['host']) > 253
                or not isinstance(entry['command'], list) or not entry['command']
                or len(entry['command']) > 32
                or not all(isinstance(arg, str) and arg and '\x00' not in arg and len(arg) <= 4096 for arg in entry['command'])):
            raise ValueError('Invalid device configuration')
    return value


def run_bridge(command, payload):
    """Bound both pipes and total execution; discard SSH diagnostics completely."""
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    if len(data) > LIMIT:
        raise ValueError('Request too large')
    child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, shell=False, start_new_session=True)
    output = bytearray()
    deadline = time.monotonic() + 20
    try:
        with selectors.DefaultSelector() as selector:
            for pipe in (child.stdin, child.stdout):
                os.set_blocking(pipe.fileno(), False)
            selector.register(child.stdin, selectors.EVENT_WRITE)
            selector.register(child.stdout, selectors.EVENT_READ)
            pending = memoryview(data)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                for key, _ in selector.select(remaining):
                    if key.fileobj is child.stdin:
                        if pending:
                            pending = pending[os.write(child.stdin.fileno(), pending):]
                        if not pending:
                            selector.unregister(child.stdin)
                            child.stdin.close()
                    else:
                        chunk = os.read(child.stdout.fileno(), 16384)
                        if not chunk:
                            selector.unregister(child.stdout)
                        else:
                            output.extend(chunk)
                            if len(output) > LIMIT:
                                raise ValueError('Response too large')
            if child.wait(timeout=max(0.001, deadline - time.monotonic())) != 0:
                raise ValueError('Device unavailable')
        return json.loads(output)
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
        child.wait()
        for pipe in (child.stdin, child.stdout):
            if not pipe.closed:
                pipe.close()


def invoke(config, device, action, params, expected_session=None, runner=run_bridge):
    """Route to exactly one configured host; never retry a mutation."""
    failure = lambda code: {'ok': False, 'device': device if device in ('windows', 'notebook') else None, 'error': code}
    if device not in ('windows', 'notebook') or action not in ACTIONS or not isinstance(params, dict):
        return failure('invalid-request')
    if device == 'notebook' and action in ('windows_list', 'window_place'):
        return failure('unsupported-device')
    mutation = action in ('show_camera', 'window_place') or action in ('browser', 'conversation_handoff') and params.get('action') != 'state'
    if mutation and (not isinstance(expected_session, str) or not expected_session.strip() or len(expected_session) > 128):
        return failure('session-required')
    dispatched_mutation = False
    try:
        entry = config[device]
        envelope = {'device': device, 'expected_host': entry['host'], 'action': action, 'params': params}
        if expected_session is not None:
            envelope['expected_session'] = expected_session
        if len(json.dumps(envelope).encode()) > LIMIT:
            return failure('invalid-request')
        dispatched_mutation = mutation
        result = runner(entry['command'], envelope)
        platform = 'win32' if device == 'windows' else 'linux'
        if (not isinstance(result, dict) or result.get('device') != device
                or result.get('identity') != {'host': entry['host'], 'platform': platform}
                or type(result.get('ok')) is not bool):
            return failure('identity-unconfirmed')
        if len(json.dumps(result).encode()) > LIMIT:
            return failure('invalid-response')
        return result
    except Exception:
        if dispatched_mutation:
            return {**failure('outcome-unknown'), 'effectUnknown': True}
        return failure('device-unavailable')


def create_server(config=None):
    from mcp.server import MCPServer
    devices = load_config(os.environ['LILITH_DEVICES_FILE']) if config is None else config
    server = MCPServer('lilith-device')

    @server.tool()
    def device_status(device: Device) -> dict:
        """Read actual target identity and selected sessionContext.id before any mutation."""
        return invoke(devices, device, 'device_status', {})

    @server.tool()
    def show_camera(device: Device, query: str, expected_session: str) -> dict:
        """Show a live camera; only result.verified=true confirms playback. Never infer success."""
        return invoke(devices, device, 'show_camera', {'query': query}, expected_session)

    @server.tool()
    def windows_list(device: Device) -> dict:
        """Read fresh Windows-native window identities and physical monitor rectangles. Notebook unsupported."""
        return invoke(devices, device, 'windows_list', {})

    @server.tool()
    def window_place(device: Device, id: str, pid: int, processStartedAt: str,
                     monitorId: str, rect: dict[str, int], expected_session: str) -> dict:
        """Place a fresh Windows-native windows_list identity on its observed monitor/rectangle. Notebook unsupported."""
        return invoke(devices, device, 'window_place', {'id': id, 'pid': pid, 'processStartedAt': processStartedAt,
                      'monitorId': monitorId, 'rect': rect}, expected_session)

    @server.tool()
    def browser(device: Device, action: Literal['state', 'navigate', 'back', 'forward', 'reload'],
                expected_session: str | None = None, url: str | None = None) -> dict:
        """Control this device's Lilith browser; navigation requires the selected stable session."""
        return invoke(devices, device, 'browser', {'action': action, **({'url': url} if url is not None else {})}, expected_session)

    @server.tool()
    def conversation_handoff(device: Device, action: Literal['state', 'transfer', 'recall'],
                             expected_session: str | None = None, target: Device | None = None) -> dict:
        """Read or hand off conversation ownership. A queued result is not a completed transfer."""
        return invoke(devices, device, 'conversation_handoff', {'action': action, **({'target': target} if target is not None else {})}, expected_session)

    return server


if __name__ == '__main__':
    try:
        create_server().run()
    except Exception:
        # Protocol stdout and diagnostics must never contain SSH/configuration secrets.
        raise SystemExit('Lilith device adapter unavailable') from None
