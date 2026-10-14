"""Installed root-owned supervisor for an explicitly requested Lilith admin command."""
import json
import math
import os
from pathlib import Path
import selectors
import select
import signal
import subprocess
import sys
import time

def validate_request(value):
    if not isinstance(value,dict) or set(value)!={'command','cwd','timeout','max_output'}:
        raise ValueError('Invalid admin request')
    command=value['command'];cwd=value['cwd'];timeout=value['timeout'];output=value['max_output']
    if not isinstance(command,str) or not command.strip() or len(command)>16000 or '\0' in command:
        raise ValueError('Invalid admin command')
    if not isinstance(cwd,str) or not Path(cwd).is_absolute() or not Path(cwd).is_dir():
        raise ValueError('Invalid admin directory')
    if type(timeout) not in (int,float) or not math.isfinite(timeout) or not .1<=timeout<=120:
        raise ValueError('Invalid admin deadline')
    if type(output) is not int or not 1<=output<=64000:
        raise ValueError('Invalid admin output limit')
    return value

def execute(value,watch_stdin=True):
    value=validate_request(value)
    process=subprocess.Popen(['/bin/bash','--noprofile','--norc','-c',value['command']],cwd=value['cwd'],
        env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/root','LANG':'C.UTF-8'},
        stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    captured={'stdout':bytearray(),'stderr':bytearray()};counts={'stdout':0,'stderr':0}
    deadline=time.monotonic()+value['timeout'];timed_out=cancelled=False;drain_until=None
    def kill_owned():
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout,selectors.EVENT_READ,'stdout');selector.register(process.stderr,selectors.EVENT_READ,'stderr')
        if watch_stdin:selector.register(sys.stdin.buffer,selectors.EVENT_READ,'controller')
        while selector.get_map():
            now=time.monotonic()
            if drain_until is None and now>=deadline:
                timed_out=True;kill_owned();drain_until=now+.5
            if drain_until is not None and now>=drain_until:break
            for key,_ in selector.select(.05):
                if key.data=='controller':
                    os.read(key.fd,1);cancelled=True;kill_owned();drain_until=time.monotonic()+.5;selector.unregister(key.fileobj)
                else:
                    chunk=os.read(key.fd,4096)
                    if not chunk:selector.unregister(key.fileobj);continue
                    counts[key.data]+=len(chunk);captured[key.data].extend(chunk[:max(0,value['max_output']-len(captured[key.data]))])
            if process.poll() is not None and drain_until is None:
                kill_owned();drain_until=time.monotonic()+.5
            if process.poll() is not None and not any(key.data!='controller' for key in selector.get_map().values()):break
    process.stdout.close();process.stderr.close()
    process.wait(timeout=1)
    return {'exitCode':process.returncode,'timedOut':timed_out,'cancelled':cancelled,
        'effectiveUid':os.geteuid(),**{name:bytes(data).decode('utf-8','replace') for name,data in captured.items()},
        **{name+'Truncated':counts[name]>value['max_output'] for name in captured}}

def main():
    try:
        data=sys.stdin.buffer.readline(131073)
        if len(data)>131072 or not data.endswith(b'\n'):raise ValueError('Invalid admin payload')
        value=validate_request(json.loads(data))
    except (OSError,ValueError):
        print(json.dumps({'error':'Invalid admin request','executed':False}),flush=True);return
    try:
        # A cancelled controller cannot start its buffered request much later.
        if select.select([sys.stdin.buffer],[],[],0)[0]:
            result={'cancelled':True,'executed':False}
        else:result=execute(value)
    except (OSError,ValueError,subprocess.SubprocessError):result={'error':'Admin result could not be confirmed','outcomeUnknown':True}
    print(json.dumps(result),flush=True)

if __name__=='__main__':
    if sys.platform!='linux' or os.geteuid()!=0:
        print(json.dumps({'error':'Root authorization is required','executed':False}),flush=True);raise SystemExit(1)
    main()
