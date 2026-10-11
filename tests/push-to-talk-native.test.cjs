'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');

test('native hotkey ignores modifier-changing repeats until a physical release and fresh press', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-ptt-edges-'));
  const fixture = path.join(directory, 'edges.ps1');
  // Compile the shipped C# and call its real state transition without installing
  // a hook, reading the keyboard, or recording audio.
  fs.writeFileSync(fixture, `param([string]$SourcePath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$source = [IO.File]::ReadAllText($SourcePath, [Text.Encoding]::UTF8)
$match = [regex]::Match($source, "(?s)-TypeDefinition @'\\r?\\n(.*?)\\r?\\n'@")
if (-not $match.Success) { throw 'Native hotkey C# source missing.' }
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition $match.Groups[1].Value
$flags = [Reflection.BindingFlags]'NonPublic,Static'
$type = [LilithPushToTalk]
$edge = $type.GetMethod('Edge', $flags)
if (-not $edge) { throw 'Native hotkey edge transition missing.' }
function Reset-Edges([bool]$AlreadyDown) {
    $type.GetField('held', $flags).SetValue($null, $false)
    $type.GetField('keyDown', $flags).SetValue($null, $AlreadyDown)
    $type.GetField('sequence', $flags).SetValue($null, [long]0)
}
function Edge([bool]$Press, [bool]$Release, [bool]$ModifiersAllowed) {
    return $edge.Invoke($null, [object[]]@($Press, $Release, $ModifiersAllowed))
}
$output = [Console]::Out
$events = New-Object IO.StringWriter
[Console]::SetOut($events)
try {
    Reset-Edges $false
    $modified = @(Edge $true $false $false; Edge $true $false $true; Edge $false $true $true)
    $beforeFresh = $events.ToString()
    $fresh = @(Edge $true $false $true; Edge $true $false $true; Edge $false $true $false)
    $modifiedEvents = $events.ToString()
    [void]$events.GetStringBuilder().Clear()
    Reset-Edges $true
    $preheld = @(Edge $true $false $true; Edge $true $false $true; Edge $false $true $true)
    $beforeNewPress = $events.ToString()
    $afterRebind = @(Edge $true $false $true; Edge $false $true $true)
    $preheldEvents = $events.ToString()
} finally { [Console]::SetOut($output); $events.Dispose() }
ConvertTo-Json -Depth 4 -Compress -InputObject @{
    modified = $modified; beforeFresh = $beforeFresh; fresh = $fresh; modifiedEvents = $modifiedEvents;
    preheld = $preheld; beforeNewPress = $beforeNewPress; afterRebind = $afterRebind; preheldEvents = $preheldEvents
}
`, 'utf8');
  try {
    const stdout = execFileSync(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fixture, '-SourcePath', path.join(__dirname, '../scripts/push_to_talk.ps1')],
      { windowsHide: true, shell: false, encoding: 'utf8', timeout: 15000 });
    const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    assert.deepEqual(result.modified, [false, false, false]);
    assert.equal(result.beforeFresh, '');
    assert.deepEqual(result.fresh, [true, true, true]);
    assert.deepEqual(result.preheld, [false, false, false]);
    assert.equal(result.beforeNewPress, '');
    assert.deepEqual(result.afterRebind, [true, true]);
    for (const text of [result.modifiedEvents, result.preheldEvents]) {
      const events = text.trim().split(/\r?\n/).map(line => JSON.parse(line));
      assert.deepEqual(events.map(event => ({ type: event.type, pressed: event.pressed, sequence: event.sequence })), [
        { type: 'key', pressed: true, sequence: 1 },
        { type: 'key', pressed: false, sequence: 1 },
      ]);
    }
  } finally {
    fs.unlinkSync(fixture);
    fs.rmdirSync(directory);
  }
});
