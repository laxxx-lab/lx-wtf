'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const electron = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'hermes-agent', 'apps', 'desktop', 'node_modules', 'electron', 'dist', 'electron.exe');

test('isolated native dictionary editor validates drafts, previews literal changes and adds/removes accessible rows', { skip: !fs.existsSync(electron), timeout: 30000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilith-dictionary-editor-'));
  const output = path.join(dir, 'result.json'), entry = path.join(dir, 'main.cjs'), html = path.join(dir, 'view.html');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '..');
  const url = relative => pathToFileURL(path.join(root, relative)).href;
  fs.writeFileSync(html, '<!doctype html><html lang="de"><meta charset="utf-8"><link rel="stylesheet" href="' + url('ui/style.css') + '"><link rel="stylesheet" href="' + url('ui/speech-dictionary.css') + '"><style>body{margin:0;padding:20px;overflow:auto;background:#071117}.wrapper{max-width:380px}</style><div class="wrapper" id="editor"></div><script src="' + url('speech-dictionary.cjs') + '"></script><script src="' + url('ui/speech-dictionary.js') + '"></script></html>');
  const browserCheck = function () {
    const check = (value, message) => { if (!value) throw new Error(message); };
    check(typeof window.SpeechDictionaryEditor?.mount === 'function', 'dictionary editor feature missing');
    const container = document.getElementById('editor');
    let changed = 0;
    const editor = SpeechDictionaryEditor.mount(container, { onChange: () => { changed++; } });
    check(editor.value().length === 0, 'editor fabricated default rules');
    editor.set([{ word: 'LightCraft', heardAs: ['light craft'] }]);
    const type = (element, text) => { element.value = text; element.dispatchEvent(new Event('input', { bubbles: true })); };
    const word = container.querySelector('[data-sd="word"]'), variants = container.querySelector('[data-sd="variants"]'), preview = container.querySelector('[data-sd="preview"]');
    check(word.labels.length === 1 && variants.labels.length === 1 && preview.labels.length === 1, 'fields lack accessible names');
    type(variants, 'light craft\nlight kraft, leicht craft');
    check(JSON.stringify(editor.value()[0].heardAs) === JSON.stringify(['light craft', 'light kraft', 'leicht craft']), 'line/comma-separated forms were not saved');
    type(preview, 'Öffne LIGHT KRAFT, bitte!');
    check(container.querySelector('[data-sd="result"]').textContent === 'Öffne LightCraft, bitte!', 'preview does not show the corrected draft');
    check(container.querySelector('[data-sd="changes"]').textContent.includes('LIGHT KRAFT → LightCraft'), 'preview hides correction evidence');
    container.querySelector('[data-sd="add"]').click();
    const rows = container.querySelectorAll('tbody tr');
    check(rows.length === 2 && document.activeElement === rows[1].querySelector('input'), 'add failed to create/focus a row');
    type(rows[1].querySelector('[data-sd="word"]'), 'Other');
    type(rows[1].querySelector('[data-sd="variants"]'), 'LIGHT CRAFT');
    let rejected = false;
    try { editor.value(); } catch { rejected = true; }
    check(rejected && !container.querySelector('[data-sd="error"]').hidden, 'ambiguous forms were silently saved');
    check(container.querySelector('[data-sd="error"]').getAttribute('role') === 'alert', 'validation error lacks an alert role');
    rows[1].querySelector('[data-sd="remove"]').click();
    check(editor.value().length === 1 && container.querySelector('[data-sd="error"]').hidden, 'removing the collision did not restore validity');
    editor.set([{ word: '<img src=x onerror=alert(1)>', heardAs: ['unsafe'] }]);
    type(preview, 'unsafe');
    check(container.querySelector('[data-sd="result"]').textContent === '<img src=x onerror=alert(1)>', 'literal markup was not preserved');
    check(!container.querySelector('img, script'), 'user text became active markup');
    editor.set([{ word: 'Begriff', heardAs: ['light, craft', 'say "hello"'] }]);
    check(JSON.stringify(editor.value()[0].heardAs) === JSON.stringify(['light, craft', 'say "hello"']), 'commas or quotes in existing variants were silently changed');
    type(container.querySelector('[data-sd="variants"]'), '"unfinished');
    let quoteRejected = false;
    try { editor.value(); } catch { quoteRejected = true; }
    check(quoteRejected, 'unfinished quoted form was saved');
    type(container.querySelector('[data-sd="variants"]'), '\tlight craft');
    let controlRejected = false;
    try { editor.value(); } catch { controlRejected = true; }
    check(controlRejected, 'leading control characters were silently trimmed before validation');
    editor.set([]);
    container.querySelector('[data-sd="add"]').click();
    let blankRejected = false;
    try { editor.value(); } catch { blankRejected = true; }
    check(blankRejected, 'unfinished rows were discarded during save');
    container.querySelector('[data-sd="remove"]').click();
    check(editor.value().length === 0 && changed >= 7, 'row edits did not signal unsaved changes');
    check(container.scrollWidth <= container.clientWidth, 'editor overflows the settings column');
    editor.set([{ word: 'LightCraft', heardAs: ['light craft', 'light kraft', 'leicht craft'] }]);
    type(preview, 'Öffne LIGHT KRAFT, bitte!');
    return { accessible: true, collisionRejected: true, literalPreview: true };
  };
  fs.writeFileSync(entry, `
    const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path');
    app.setPath('userData',path.join(${JSON.stringify(dir)},'profile'));
    app.whenReady().then(async()=>{
      session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('devtools:')}));
      const win=new BrowserWindow({show:false,width:430,height:980,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,offscreen:true}});
      try {
        await win.loadFile(${JSON.stringify(html)});
        const result=await win.webContents.executeJavaScript('(()=>{try{return ('+${JSON.stringify(browserCheck.toString())}+')();}catch(error){return {failure:error.message};}})()');
        if(result.failure)throw new Error(result.failure);
        if(process.env.SPEECH_DICTIONARY_EDITOR_SCREENSHOT){await new Promise(resolve=>setTimeout(resolve,100));fs.writeFileSync(process.env.SPEECH_DICTIONARY_EDITOR_SCREENSHOT,(await win.webContents.capturePage()).toPNG());}
        fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({result}));win.destroy();app.exit(0);
      } catch(error) { fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({error:error.stack}));app.exit(1); }
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  const result = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
  assert.equal(code, 0, result.error || stderr);
  assert.deepEqual(result.result, { accessible: true, collisionRejected: true, literalPreview: true });
});
