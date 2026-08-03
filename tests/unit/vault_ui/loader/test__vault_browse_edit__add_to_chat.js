/* vault-browse-edit — "Add to chat" carries the RIGHT file (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_browse_edit__add_to_chat.js

   REGRESSION GUARD for the reported bug: "once I have one file selected, I can't
   choose another — Ask AI stops working."

   Root cause: the chat's context came from a global `vault-file-viewing` announcement
   fired inside _renderFileContent, and send-browse's _openFileTab RETURNS EARLY when a
   file's tab is already open (it just clicks the existing tab). So re-opening a file,
   or switching tabs, never re-announced anything and the chat kept the first file it
   ever saw — silently, which is the worst part.

   The fix is structural rather than a patch to the announcement: the button now closes
   over the bytes decoded for ITS OWN render, so the event it emits cannot describe a
   different file no matter what else has been rendered since. That is what this test
   pins: render A, render B, then click A's button and assert A comes out. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent; global.Node = window.Node;
global.TextDecoder = TextDecoder; global.TextEncoder = TextEncoder;

// Minimal SendBrowse stand-in: vault-browse-edit patches this prototype on load.
class SendBrowse {
    _renderFileContent() { /* the original render — content is irrelevant here */ }
}
global.SendBrowse = window.SendBrowse = SendBrowse;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
new Function(readFileSync(base + 'components/vault-browse-edit/vault-browse-edit.js', 'utf8')).call(window);

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const enc = (s) => new TextEncoder().encode(s).buffer;

// Render a file the way send-browse does, and hand back its action bar.
function render(path, text, type) {
    const container = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'sb-file__actions';
    container.appendChild(bar);
    document.body.appendChild(container);
    const inst = new SendBrowse();
    inst.dataSource = null;                       // stops before the write-controls block
    inst._renderFileContent(container, enc(text), path, type);
    return bar;
}

const addBtn = (bar) => Array.from(bar.querySelectorAll('button'))
    .find((b) => /Add to chat/.test(b.textContent));

console.log('\n[suite] the button is an ADD, not an ASK');
{
    const bar = render('notes.md', '# hello', 'markdown');
    const b = addBtn(bar);
    ok('an "Add to chat" button is rendered', !!b);
    ok('the old single-shot "Ask AI" label is gone',
        !Array.from(bar.querySelectorAll('button')).some((x) => /Ask AI/.test(x.textContent)));
}

console.log('\n[suite] the emitted file is the button\'s own file, never the last-rendered one');
{
    const barA = render('a/first.md',  'AAA content', 'markdown');
    const barB = render('b/second.md', 'BBB content', 'markdown');

    const seen = [];
    const onAdd = (e) => seen.push(e.detail);
    document.addEventListener('vault-llm-add-file', onAdd);

    // Click the FIRST file's button after the second has been rendered — the exact
    // sequence that used to yield the wrong (or a stale) file.
    addBtn(barA).dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('clicking file A emits file A', seen.length === 1 && seen[0].path === 'a/first.md',
       JSON.stringify(seen[0] || null));
    ok('…with file A\'s own text', seen[0] && seen[0].text === 'AAA content');

    addBtn(barB).dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('clicking file B emits file B', seen.length === 2 && seen[1].path === 'b/second.md');
    ok('…with file B\'s own text', seen[1] && seen[1].text === 'BBB content');

    // Re-clicking A still yields A: the closure cannot drift.
    addBtn(barA).dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('re-clicking file A still emits file A', seen.length === 3 && seen[2].path === 'a/first.md');
    ok('each click emits exactly one event', seen.length === 3);

    document.removeEventListener('vault-llm-add-file', onAdd);
}

console.log('\n[suite] leading slash is normalised; binaries are attached without bytes');
{
    const seen = [];
    const onAdd = (e) => seen.push(e.detail);
    document.addEventListener('vault-llm-add-file', onAdd);

    addBtn(render('/lead.md', 'x', 'markdown')).dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('a leading slash is stripped from the path', seen[0].path === 'lead.md');

    // A PNG header: real bytes, not decodable text.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const container = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'sb-file__actions';
    container.appendChild(bar);
    const inst = new SendBrowse();
    inst.dataSource = null;
    inst._renderFileContent(container, png.buffer, 'pic.png', 'image');
    addBtn(bar).dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('a binary is attached by name', seen[1].path === 'pic.png');
    ok('a binary carries no text payload', seen[1].text === null);

    document.removeEventListener('vault-llm-add-file', onAdd);
}

console.log('\n[suite] the viewing announcement still fires (empty-state hint only)');
{
    const seen = [];
    const onView = (e) => seen.push(e.detail);
    document.addEventListener('vault-file-viewing', onView);
    render('watched.md', 'body', 'markdown');
    ok('rendering announces the file being viewed', seen.length === 1 && seen[0].path === 'watched.md');
    ok('the announcement carries the decoded text', seen[0].text === 'body');
    document.removeEventListener('vault-file-viewing', onView);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
