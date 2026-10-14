"""Root supervisor contracts; process tests run in an isolated Linux temp directory."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/linux_admin.py'

class AdminTests(unittest.TestCase):
    def module(self):
        self.assertTrue(SOURCE.exists(), 'root supervisor is missing')
        spec = importlib.util.spec_from_file_location('linux_admin', SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_payload_rejects_password_fields_nulls_and_unbounded_limits(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as cwd:
            valid = {'command':'id -u','cwd':cwd,'timeout':2,'max_output':100}
            self.assertEqual(module.validate_request(valid)['command'], 'id -u')
            for extra in [{'password':'secret'}, {'command':'id\x00'}, {'timeout':121}, {'max_output':0}, {'cwd':'relative'}, {'timeout':True}]:
                with self.assertRaises(ValueError):module.validate_request({**valid, **extra})

    @unittest.skipUnless(sys.platform == 'linux', 'Linux process groups')
    def test_output_caps_and_timeout_are_enforced_inside_supervisor(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as cwd:
            result = module.execute({'command':"printf '%01000d' 1",'cwd':cwd,'timeout':2,'max_output':40}, watch_stdin=False)
            self.assertEqual(len(result['stdout']),40)
            self.assertTrue(result['stdoutTruncated'])
            start=time.monotonic()
            result=module.execute({'command':'sleep 20','cwd':cwd,'timeout':.15,'max_output':40},watch_stdin=False)
            self.assertTrue(result['timedOut'])
            self.assertLess(time.monotonic()-start,1.5)

    @unittest.skipUnless(sys.platform == 'linux', 'Linux pipe cancellation')
    def test_controller_eof_stops_owned_process_without_waiting_for_deadline(self):
        module=self.module()
        with tempfile.TemporaryDirectory() as cwd:
            program="import importlib.util; s=importlib.util.spec_from_file_location('admin',%r); m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.main()" % str(SOURCE)
            process=subprocess.Popen([sys.executable,'-c',program],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                process.stdin.write((json.dumps({'command':'sleep 20','cwd':cwd,'timeout':20,'max_output':40})+'\n').encode());process.stdin.flush();time.sleep(.15);process.stdin.close();start=time.monotonic()
                result=json.loads(process.stdout.read());process.wait(timeout=2)
                self.assertTrue(result['cancelled']);self.assertLess(time.monotonic()-start,1.5)
            finally:
                if process.poll() is None:process.kill()
                process.wait();process.stdout.close();process.stderr.close()

    @unittest.skipUnless(sys.platform == 'linux', 'Linux remaining process group')
    def test_background_child_in_owned_group_is_stopped_when_shell_leader_exits(self):
        module=self.module()
        with tempfile.TemporaryDirectory() as cwd:
            marker=Path(cwd)/'child.pid'
            result=module.execute({'command':'sleep 20 & echo $! > child.pid','cwd':cwd,'timeout':2,'max_output':40},watch_stdin=False)
            self.assertEqual(result['exitCode'],0)
            child=int(marker.read_text());info=Path('/proc')/str(child)/'stat'
            try:
                alive=info.exists() and info.read_text().split(') ',1)[1][0]!='Z'
                self.assertFalse(alive,'root child escaped supervisor after its shell exited')
            finally:
                if info.exists():
                    try:os.kill(child,9)
                    except ProcessLookupError:pass

if __name__ == '__main__':unittest.main()
