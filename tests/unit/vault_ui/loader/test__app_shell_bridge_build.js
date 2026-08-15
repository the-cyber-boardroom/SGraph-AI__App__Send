/* Regression guard — _buildVfsBridgeScript must build the bridge without throwing.
   Run: node tests/unit/vault_ui/loader/test__app_shell_bridge_build.js

   Why this exists: a `this.`-less call to the _embedHelperSrc() METHOD inside the bridge
   builder ('_embedHelperSrc()' instead of 'this._embedHelperSrc()') is valid SYNTAX but
   throws a runtime ReferenceError, which broke EVERY app mount (the bridge is built on each
   mount) — caught only by the heavy Playwright suite. This builds the bridge directly with
   minimal stubs so the class of "method called as a bare function in the injected-string
   builder" bug is caught in the fast unit run. */

import { readFileSync }  from 'node:fs';
import { JSDOM }         from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document; global.HTMLElement = window.HTMLElement;
global.customElements = window.customElements; global.CustomEvent = window.CustomEvent; global.URL = window.URL;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
load('sg-embed-helpers.js');  global.SgEmbed        = window.SgEmbed        = globalThis.SgEmbed;
load('app-permissions.js');   global.AppPermissions = window.AppPermissions = globalThis.AppPermissions;
load('app-shell.js');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// Minimal state _buildVfsBridgeScript reads. Not appended → connectedCallback never runs.
function makeShell(perm) {
    const el = document.createElement('app-shell');
    el._writable   = true;
    el._perm       = perm;
    el._vault      = { name: 'V', _vaultId: 'vid' };
    el._dataSource = { getFileList: () => [], writable: true };
    el._htmlDir    = '';
    el._appId      = '';
    return el;
}

console.log('\n[suite] app-shell — _buildVfsBridgeScript builds without throwing');
{
    const el = makeShell(AppPermissions.parsePermissions(null));
    let src, err;
    try { src = el._buildVfsBridgeScript('index.html'); } catch (e) { err = e; }
    ok('no throw (would catch the bare _embedHelperSrc() ReferenceError)', !err, err && err.message);
    ok('returns a non-trivial string', typeof src === 'string' && src.length > 1000);
    ok('exposes window.sg', /window\.sg\s*=\s*\{/.test(src || ''));
    ok('injects the embed helper (this._embedHelperSrc ran)', /function _embedVault/.test(src || ''));
    ok('wires sg.vault.embed', /embed:_embedVault/.test(src || ''));

    // Option D default (no externalLinks grant): external clicks post to host, not in-frame open.
    ok('default external-link path posts __sgOpenExternal (no escape-sandbox)',
        /__sgOpenExternal/.test(src || '') && !/window\.open\(h,/.test(src || ''));
}

console.log('\n[suite] app-shell — an app error is attributed to the APP, not the vault');
{
    /* An unlabelled "Uncaught SyntaxError: …" on vault chrome reads as a fault in the
       vault. It cost a real debugging session pointed at the wrong codebase: the throw
       came from a boot loader inside a vault app, and nothing on screen said so. */
    const el  = makeShell(AppPermissions.parsePermissions(null));
    const src = el._buildVfsBridgeScript('tools/dash.html');

    // The injected bridge is a <script> STRING — a typo in it fails only in a browser.
    // Since 2026-08-13 the builder also prefixes the frame CSP meta (see F1 in the
    // 08/13 architect review), so take the script body from the first <script> onward
    // rather than assuming the string starts with it.
    ok('the bridge carries the egress CSP meta ahead of the script',
        /^<meta http-equiv="Content-Security-Policy"[^>]*>\s*<script>/.test(src));
    const body = src.slice(src.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
    let perr = null;
    try { new Function(body); } catch (e) { perr = e; }
    ok('the injected bridge still parses', perr === null, perr && perr.message);

    ok('the frame logs errors under a greppable [vault-app] prefix', /\[vault-app\]/.test(src));
    ok('…naming the file that is running',   /tools\/dash\.html/.test(src));
    ok('…and saying it is not the platform', /not the vault platform/.test(src));
    ok('the error frame carries appPath so the host need not guess', /appPath:/.test(src));
    ok('unhandled rejections go through the same labelling',
        /unhandledrejection/.test(src) && /_sgAppErr\("Unhandled rejection/.test(src));

    // Host side: drive the real message handler with the frame's error.
    const frame = { contentWindow: {} };
    el._setupVfsBridgeHandlers(frame, {
        getFileList: () => [], writable: false,
        readFile: async () => new Uint8Array(0)
    });
    const errs = [];
    const realErr = console.error;
    console.error = (m) => errs.push(String(m));
    try {
        el._vfsBridgeHandler({
            source: frame.contentWindow,
            data: { type: 'sg-app-error', message: 'Uncaught SyntaxError: missing ) after argument list', appPath: 'tools/dash.html' }
        });
    } finally { console.error = realErr; }

    ok('the recorded error names the app file',
        /tools\/dash\.html/.test(el._lastIframeError), el._lastIframeError);
    ok('…and still carries the original message',
        /missing \) after argument list/.test(el._lastIframeError));
    ok('the host also logs it, attributed', errs.some((m) => /\[vault-app\]/.test(m)));
    ok('…saying whose code threw',          errs.some((m) => /not the vault platform/.test(m)));

    // A frame that reports no path must still be attributed — fall back to what is running.
    el._buildVfsBridgeScript('other/page.html');
    console.error = () => {};
    try {
        el._vfsBridgeHandler({ source: frame.contentWindow, data: { type: 'sg-app-error', message: 'boom' } });
    } finally { console.error = realErr; }
    ok('a path-less report falls back to the running file',
        /other\/page\.html/.test(el._lastIframeError), el._lastIframeError);
}

console.log('\n[suite] app-shell — externalLinks grant flips the external-link path');
{
    const el  = makeShell(AppPermissions.parsePermissions({ permissions: { externalLinks: true } }));
    const src = el._buildVfsBridgeScript('index.html');
    ok('grant → in-frame window.open path', /window\.open\(h,/.test(src));
    ok('grant → app sandbox includes escape-sandbox', /allow-popups-to-escape-sandbox/.test(el._appSandbox()));
    ok('no grant → app sandbox is allow-scripts allow-forms (no escape)',
        makeShell(AppPermissions.parsePermissions(null))._appSandbox() === 'allow-scripts allow-forms');
}

console.log('\n[suite] app-shell — click-interceptor contract (architect review 07/30)');
{
    const src = makeShell(AppPermissions.parsePermissions(null))._buildVfsBridgeScript('index.html');

    // Proposal 1: sanctioned opt-out — the guard must run before any branch claims the click.
    ok('interceptor honours e.defaultPrevented + data-sg-native',
        /e\.defaultPrevented\|\|a\.hasAttribute\("data-sg-native"\)/.test(src));

    // Proposal 2: bare-# clicks are claimed with an in-frame scroll (browser default is a
    // cross-document navigation in a null-origin srcdoc frame — the vault-key-screen bug).
    ok('bare-# clicks: preventDefault + getElementById + scrollIntoView',
        /startsWith\("#"\)\)\{'?\s*\+?\s*'e\.preventDefault\(\)/.test(src.replace(/\n/g, ''))
        || /if\(h\.startsWith\("#"\)\)\{e\.preventDefault\(\);/.test(src));

    // Proposal 3: the scroll-to-hash miss-fallback (location.hash re-navigation) is GONE.
    ok('scroll-to-hash listener has NO location.hash fallback', !/location\.hash="#"/.test(src));
}

console.log('\n[suite] app-shell — sg.vfs.download (host-fulfilled downloads)');
{
    const src = makeShell(AppPermissions.parsePermissions(null))._buildVfsBridgeScript('index.html');
    ok('bridge exposes sg.vfs.download', /download:_download/.test(src));
    ok('download routes through _sgCmd("download")', /_sgCmd\("download"/.test(src));

    const withGrant = AppPermissions.parsePermissions({ permissions: { downloads: true } });
    ok('permissions: downloads grant parses true', withGrant.downloads === true);
    ok('permissions: downloads defaults to deny', AppPermissions.parsePermissions(null).downloads === false);
    ok('permissions: downloads:"yes" (non-boolean) stays deny',
        AppPermissions.parsePermissions({ permissions: { downloads: 'yes' } }).downloads === false);
}

console.log('\n[suite] app-shell — sg.ui.preview (host quick-look overlay)');
{
    const src = makeShell(AppPermissions.parsePermissions(null))._buildVfsBridgeScript('index.html');
    ok('bridge exposes sg.ui.preview', /preview:function\(path\)/.test(src) && /_sgCmd\("ui",\{action:"preview"/.test(src));

    // Behavioural: the overlay mounts in HOST DOM, renders text inline, closes cleanly.
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:fake';
    if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
    const el   = makeShell(AppPermissions.parsePermissions(null));
    const kind = el._openHostPreview('notes.md', new TextEncoder().encode('# hello preview').buffer);
    const ov   = document.getElementById('sg-host-preview');
    ok('text file → kind "text"', kind === 'text');
    ok('overlay mounted in host document', !!ov);
    ok('text content rendered in <pre>', !!ov && /hello preview/.test(ov.querySelector('pre')?.textContent || ''));

    const kind2 = el._openHostPreview('doc.pdf', new Uint8Array([37, 80, 68, 70]).buffer);   // replaces first
    ok('pdf file → kind "pdf" with iframe', kind2 === 'pdf'
        && !!document.getElementById('sg-host-preview')?.querySelector('iframe'));
    ok('one-at-a-time: only one overlay in DOM', document.querySelectorAll('#sg-host-preview').length === 1);

    el._closeHostPreview();
    ok('close removes the overlay', !document.getElementById('sg-host-preview'));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
