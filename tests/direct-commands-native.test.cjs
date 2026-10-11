const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { createDirectCommands } = require('../direct-commands.cjs');
const native = process.platform === 'win32' && process.env.DIRECT_COMMAND_NATIVE_TEST === '1';
function read(kind, action) {
  const startedAt = Date.now();
  const stdout = execFileSync(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../scripts/direct_commands.ps1'), '-Kind', kind, '-Action', action, '-ObserveOnly'],
    { windowsHide: true, shell: false, encoding: 'utf8', timeout: 18000 });
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  assert.ok(result.observedAt >= startedAt - 1000);
  assert.equal(result.observationOnly, true);
  return result;
}

test('native volume observation uses real fresh Core Audio readback without changing state', { skip: !native }, () => {
  const result = read('volume', 'up');
  assert.equal(result.accepted, true, result.error);
  assert.ok(result.after.level >= 0 && result.after.level <= 100);
  assert.deepEqual(result.before, result.after);
});

test('native Spotify observation reads SMTC sessions without playback requests', { skip: !native }, () => {
  const result = read('spotify', 'play');
  if (!result.accepted) assert.match(result.error, /keine eindeutige Spotify-Sitzung/i);
  else {
    assert.ok(['Spotify.exe', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'].includes(result.after.sourceAppId));
    assert.deepEqual(result.before, result.after);
  }
});

test('native app launch proves its own visible fixture and observation never replays the launch', { skip: !native }, async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  const fixtureDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'lilith-direct-window-'));
  const fixturePath = path.join(fixtureDirectory, 'DirectWindowFixture.exe');
  const compilerPath = path.join(fixtureDirectory, 'compile.ps1');
  fs.writeFileSync(compilerPath, `param([string]$Destination)
Add-Type -ReferencedAssemblies System.Windows.Forms -OutputAssembly $Destination -OutputType WindowsApplication -TypeDefinition @'
using System; using System.Windows.Forms;
class DirectWindowFixture {
  [STAThread] static void Main() {
    var window = new Form { Text = "Lilith native observation test", Width = 200, Height = 100 };
    var timer = new Timer { Interval = 20000 }; timer.Tick += (sender, args) => window.Close(); timer.Start();
    Application.Run(window);
  }
}
'@`, 'utf8');
  let child,launchedPid;
  try {
    execFileSync(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', compilerPath, '-Destination', fixturePath], { windowsHide: true, shell: false, timeout: 15000 });
    const app = { id: fixturePath, name: 'DirectWindowFixture' };
    const command = { type: 'app.open', app };
    const direct = createDirectCommands({ getApps: () => [app] });
    const absent = await direct.observe(command);
    assert.equal(absent.status, 'unverified');
    assert.equal(absent.evidence.window, null);
    const launched=await direct.execute(command);assert.equal(launched.status,'completed',JSON.stringify(launched.evidence));launchedPid=launched.evidence.window.processId;
    const observed = await direct.observe(command);
    assert.equal(observed.status, 'completed', JSON.stringify(observed.evidence));
    assert.equal(observed.evidence.window.processId, launchedPid);
    assert.equal(observed.evidence.window.matchedReference, fixturePath);
  } finally {
    if (child && child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await stopped;
    }
    if(launchedPid){const stop=path.join(fixtureDirectory,'stop.ps1');fs.writeFileSync(stop,"param([int]$ExpectedPid,[string]$ExpectedPath)\n$fixtureProcess=Get-Process -Id $ExpectedPid -ErrorAction SilentlyContinue\nif($fixtureProcess -and $fixtureProcess.Path -ieq $ExpectedPath){Stop-Process -Id $ExpectedPid -ErrorAction Stop}");execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',stop,'-ExpectedPid',String(launchedPid),'-ExpectedPath',fixturePath],{windowsHide:true,timeout:5000});}
    assert.ok(path.resolve(fixtureDirectory).startsWith(temporaryRoot + path.sep));
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
