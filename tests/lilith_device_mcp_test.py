import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/lilith_device_mcp.py'

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SOURCE.exists(), 'adapter must exist')
        spec = importlib.util.spec_from_file_location('device_adapter', SOURCE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def config(self):
        return {'windows': {'host': 'pc', 'command': ['ssh', 'existing-pc', 'node', 'bridge.cjs']}, 'notebook': {'host': 'book', 'command': ['ssh', 'existing-book', 'node', 'bridge.cjs']}}

    def test_explicit_device_and_scoped_mutations(self):
        for device, action, params in [('auto', 'device_status', {}), ('windows', 'shell', {}), ('windows', 'show_camera', {'query': 'yard'})]:
            self.assertFalse(self.module.invoke(self.config(), device, action, params)['ok'])

    def test_argv_unchanged_json_stdin_and_actual_device(self):
        captured = {}
        def run(command, payload):
            captured.update(command=command, payload=payload)
            return {'ok': True, 'device': 'windows', 'identity': {'host': 'pc', 'platform': 'win32'}, 'result': {'verified': False}}
        result = self.module.invoke(self.config(), 'windows', 'show_camera', {'query': 'yard; $(evil)'}, 'session-a', runner=run)
        self.assertEqual(captured['command'], ['ssh', 'existing-pc', 'node', 'bridge.cjs'])
        self.assertEqual(captured['payload']['expected_host'], 'pc')
        self.assertEqual(captured['payload']['params']['query'], 'yard; $(evil)')
        self.assertFalse(result['result']['verified'])

    def test_wrong_identity_and_transport_errors_are_safe(self):
        for response in [{'device':'notebook','identity':{'host':'wrong','platform':'linux'}}, RuntimeError('TOKEN ssh private')]:
            def run(*args):
                if isinstance(response, Exception): raise response
                return response
            result=self.module.invoke(self.config(),'windows','device_status',{},runner=run)
            self.assertFalse(result['ok'])
            self.assertNotIn('TOKEN',json.dumps(result))

    def test_mutation_transport_errors_are_unknown_but_read_failures_are_not(self):
        def failed(*args):
            raise TimeoutError('raw SECRET transport timeout')
        mutation=self.module.invoke(self.config(),'windows','show_camera',{'query':'yard'},'session-a',runner=failed)
        self.assertEqual(mutation['error'],'outcome-unknown')
        self.assertTrue(mutation['effectUnknown'])
        self.assertNotIn('SECRET',json.dumps(mutation))
        read=self.module.invoke(self.config(),'windows','device_status',{},runner=failed)
        self.assertEqual(read['error'],'device-unavailable')
        self.assertNotIn('effectUnknown',read)

    def test_notebook_window_operations_are_explicitly_unsupported(self):
        for action in ('windows_list','window_place'):
            result=self.module.invoke(self.config(),'notebook',action,{},'session-a',runner=lambda *args: self.fail('must not dispatch unsupported operations'))
            self.assertEqual(result['error'],'unsupported-device')
    @unittest.skipIf(os.name=='nt','POSIX deployment config permissions')
    def test_configuration_requires_owned_private_regular_file(self):
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'devices.json'
            source.write_text(json.dumps(self.config()))
            source.chmod(0o600)
            self.assertIn('windows',self.module.load_config(source))
            source.chmod(0o644)
            with self.assertRaises(ValueError): self.module.load_config(source)



class SDKTests(unittest.TestCase):
    setUp = AdapterTests.setUp
    config = AdapterTests.config
    def test_actual_sdk_schemas_require_explicit_device_and_mutation_session(self):
        import asyncio
        try:
            from mcp.server import MCPServer
        except ImportError:
            self.skipTest('SDK v2 not installed in this test environment')
        server = self.module.create_server(self.config())
        schemas = {tool.name: tool.input_schema for tool in asyncio.run(server.list_tools())}
        self.assertEqual(set(schemas), {'device_status','show_camera','windows_list','window_place','browser','conversation_handoff'})
        for schema in schemas.values():
            self.assertIn('device', schema['required'])
            self.assertEqual(schema['properties']['device']['enum'], ['windows','notebook'])
        for name in ('show_camera','window_place'):
            self.assertIn('expected_session', schemas[name]['required'])

    @unittest.skipIf(os.name == 'nt', 'gateway POSIX bounded pipe transport')
    def test_transport_bounded_stdout_and_fixed_command(self):
        import sys
        command=[sys.executable,'-c','import sys,json; value=json.load(sys.stdin); print(json.dumps(value))']
        self.assertEqual(self.module.run_bridge(command, {'query':'$(evil); quoted'}), {'query':'$(evil); quoted'})
        with self.assertRaises(ValueError):
            self.module.run_bridge([sys.executable,'-c','print("x"*140000)'], {})

if __name__=='__main__': unittest.main()
