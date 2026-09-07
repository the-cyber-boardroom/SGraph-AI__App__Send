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

console.log('\n[suite] app-shell — bridge errors carry a stable code');
{
    /* cmdReply has always accepted a 4th `code` argument, but _sgCmd rebuilt the rejection
       as `new Error(e.data.err)` and dropped it — so every bridge error reached the app as a
       bare Error whose Object.keys() was [], and apps had to string-match `message`. An
       integrator reported exactly that. Guard both halves. */
    const el  = makeShell(AppPermissions.parsePermissions(null));
    const src = el._buildVfsBridgeScript('index.html');

    ok('_sgCmd copies `code` onto the rejected Error', /er\.code\s*=\s*e\.data\.code/.test(src));
    ok('_sgCmd copies `status` when present',          /er\.status\s*=\s*e\.data\.status/.test(src));

    // Drive the real _sgCmd out of the built bridge: a reply carrying a code must reject
    // with an Error that exposes it.
    const body    = src.slice(src.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
    // Brace-match rather than regex — _sgCmd nests braces, so a lazy match truncates it.
    function sliceFn(text, needle) {
        const start = text.indexOf(needle);
        if (start === -1) return null;
        let depth = 0;
        for (let i = text.indexOf('{', start); i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
        }
        return null;
    }
    const sgCmd = sliceFn(body, 'function _sgCmd(');
    ok('_sgCmd is extractable from the bridge', !!sgCmd);

    const listeners = [];
    const fakeWin = {
        addEventListener   : (_n, h) => listeners.push(h),
        removeEventListener: (_n, h) => { const i = listeners.indexOf(h); if (i > -1) listeners.splice(i, 1); },
        parent             : { postMessage: (payload) => {
            setTimeout(() => listeners.slice().forEach((h) => h({
                data: { __sgCmdReply: payload.__sgCmdId, ok: false, err: 'Permission denied', code: 'EPERM', status: 403 }
            })), 0);
        } }
    };
    const mk  = new Function('window', sgCmd + '; return _sgCmd;')(fakeWin);
    let caught = null;
    await mk('append', { action: 'write' }).catch((e) => { caught = e; });
    ok('rejection is an Error with .code', caught instanceof Error && caught.code === 'EPERM');
    ok('rejection carries .status',        caught && caught.status === 403);
    ok('rejection keeps the message',      caught && caught.message === 'Permission denied');
}

console.log('\n[suite] app-shell — sg.app tells an app it is running from a pinned release');
{
    /* `.vault/releases.json` is inside the permission floor, so an app cannot read it and had
       no way to learn it was mounted from a commit rather than HEAD — the fact that explains
       "I pushed a new app.json and nothing changed", and which also forces writable:false. */
    const live = makeShell(AppPermissions.parsePermissions(null));
    const srcL = live._buildVfsBridgeScript('index.html');
    ok('unpinned mount reports pinned:false', /pinned:false/.test(srcL));
    ok('unpinned mount reports release:null', /release:null/.test(srcL));

    const pinned = makeShell(AppPermissions.parsePermissions(null));
    pinned._release = { live: false, name: 'v1-2', label: 'Spring build', commit: 'abc123' };
    const srcP = pinned._buildVfsBridgeScript('index.html');
    ok('pinned mount reports pinned:true', /pinned:true/.test(srcP));
    ok('pinned mount names the release',   /"name":"v1-2"/.test(srcP) && /"commit":"abc123"/.test(srcP));

    const bodyP = srcP.slice(srcP.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
    let perr = null;
    try { new Function(bodyP); } catch (e) { perr = e; }
    ok('the bridge still parses with a release object', perr === null, perr && perr.message);
}

console.log('\n[suite] app-shell — owner-authored text cannot close the bridge <script>');
{
    /* Every runtime value spliced into the bridge lands inside a <script> in a srcdoc
       document. JSON.stringify is a valid JS literal but not HTML-safe: '</script>' in a
       vault name or a release label closed the bridge early and killed every sg.* call.
       Measured before the fix: a label of '</script>' produced THREE raw closers. */
    const EVIL = '</script><script>window.__pwned=1</script>';
    const closers = (src) => (src.match(/<\/script>/g) || []).length;

    const viaLabel = makeShell(AppPermissions.parsePermissions(null));
    viaLabel._release = { live: false, name: 'v1', label: EVIL, commit: 'c' };
    const srcL = viaLabel._buildVfsBridgeScript('index.html');
    ok('release.label with </script> → exactly one closer in the bridge', closers(srcL) === 1, 'got ' + closers(srcL));
    ok('…the escaped form is what reaches the frame', /<\\\/script>/.test(srcL));

    const viaName = makeShell(AppPermissions.parsePermissions(null));
    viaName._vault = { name: EVIL, _vaultId: 'vid12345' };
    const srcN = viaName._buildVfsBridgeScript('index.html');
    ok('vaultName with </script> → exactly one closer (pre-existing hole, same fix)', closers(srcN) === 1, 'got ' + closers(srcN));

    const viaPath = makeShell(AppPermissions.parsePermissions(null));
    const srcP = viaPath._buildVfsBridgeScript('x/</script>/index.html');
    ok('currentPath with </script> → exactly one closer', closers(srcP) === 1, 'got ' + closers(srcP));

    for (const [label, src] of [['label', srcL], ['name', srcN], ['path', srcP]]) {
        const body = src.slice(src.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
        let perr = null;
        try { new Function(body); } catch (e) { perr = e; }
        ok('bridge still parses with hostile ' + label, perr === null, perr && perr.message);
    }
    // The escape must not alter what the app actually reads.
    const lit = srcL.slice(srcL.indexOf('release:') + 'release:'.length).match(/^\{[^}]*\}/)[0];
    ok('the app still receives the original label verbatim', JSON.parse(lit).label === EVIL);

    /* Found during review: the ready-line console.log spliced the vault name RAW into a
       double-quoted literal, escaping only single quotes. A `"` or a newline in the name was
       a syntax error in the bridge — window.sg never installed and every app in that vault
       died on mount, with an unattributed error. Measured before the fix. */
    for (const name of ['Q3 "final"', 'multi\nline', 'tab\there', 'back\\slash', "it's"]) {
        const el = makeShell(AppPermissions.parsePermissions(null));
        el._vault = { name, _vaultId: 'vid12345' };
        const src = el._buildVfsBridgeScript('index.html');
        const body = src.slice(src.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
        let perr = null;
        try { new Function(body); } catch (e) { perr = e; }
        ok('bridge parses with vault name ' + JSON.stringify(name), perr === null, perr && perr.message);
    }
}

console.log('\n[suite] app-shell — the HOST reply carries code + HTTP status (not a faked reply)');
{
    /* The earlier test faked `status` in the reply; cmdReply never sent one, so it asserted
       behaviour the host never produced. Drive the real handler instead. */
    const replies = [];
    const src = { postMessage: (m) => replies.push(m) };          // the frame: registered AND the message source
    const ds  = { getFileList: () => [], writable: false, readFile: async () => new Uint8Array(0) };
    const tick = () => new Promise((r) => setTimeout(r, 15));
    const el = makeShell(AppPermissions.parsePermissions({ permissions: { append: { list: true } } }));
    el._setupVfsBridgeHandlers({ contentWindow: src }, ds);

    // Transport error that knew an HTTP status (the EEDGE case: masked 403 → 404 + HTML).
    el._getAppendClient = async () => ({ list: async () => { throw Object.assign(new Error('edge page'), { code: 'EEDGE', http: 404 }); } });
    el._vfsBridgeHandler({ source: src, data: { __sgCmdType: 'append', __sgCmdId: 'c1', action: 'list' } });
    await tick();
    const r1 = replies.find((m) => m.__sgCmdReply === 'c1');
    ok('reply carries the transport code',   r1 && r1.code === 'EEDGE');
    ok('reply carries the HTTP status',      r1 && r1.status === 404);
    ok('reply carries the message',          r1 && r1.err === 'edge page');

    // Denied before any transport: code, no status.
    const denied = makeShell(AppPermissions.parsePermissions(null));
    denied._setupVfsBridgeHandlers({ contentWindow: src }, ds);
    denied._vfsBridgeHandler({ source: src, data: { __sgCmdType: 'append', __sgCmdId: 'c2', action: 'write', vault_id: 'remote99', append_token: 't', payload: 'QUJD' } });
    await tick();
    const r2 = replies.find((m) => m.__sgCmdReply === 'c2');
    ok('denied → EPERM',                       r2 && r2.code === 'EPERM');
    ok('denied → status is null, not fabricated', r2 && r2.status === null);
    ok('denied message names the app.json key', r2 && /"append":\s*\{\s*"write"/.test(r2.err));

    // Transport error without an HTTP status (e.g. EINVAL raised client-side).
    const noHttp = makeShell(AppPermissions.parsePermissions({ permissions: { append: { list: true } } }));
    noHttp._setupVfsBridgeHandlers({ contentWindow: src }, ds);
    noHttp._getAppendClient = async () => ({ list: async () => { throw Object.assign(new Error('no id'), { code: 'EINVAL' }); } });
    noHttp._vfsBridgeHandler({ source: src, data: { __sgCmdType: 'append', __sgCmdId: 'c3', action: 'list' } });
    await tick();
    const r3 = replies.find((m) => m.__sgCmdReply === 'c3');
    ok('no http on the error → status null', r3 && r3.code === 'EINVAL' && r3.status === null);
}

console.log('\n[suite] app-shell — sg.vfs.* errors carry the host\'s code too');
{
    const src  = makeShell(AppPermissions.parsePermissions(null))._buildVfsBridgeScript('index.html');
    const body = src.slice(src.indexOf('<script>') + '<script>'.length).replace(/<\/script>\s*$/, '');
    function sliceFn(text, needle) {
        const start = text.indexOf(needle); if (start === -1) return null;
        let depth = 0;
        for (let i = text.indexOf('{', start); i < text.length; i++) {
            if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
        }
        return null;
    }
    const vfsMsg = sliceFn(body, 'function _vfsMsg(');
    ok('_vfsMsg is extractable', !!vfsMsg);

    const drive = async (reply) => {
        const listeners = [];
        const fakeWin = {
            addEventListener: (_n, h) => listeners.push(h),
            removeEventListener: (_n, h) => { const i = listeners.indexOf(h); if (i > -1) listeners.splice(i, 1); },
            parent: { postMessage: (payload) => setTimeout(() => listeners.slice().forEach((h) =>
                h({ data: Object.assign({ __sgVfsWriteReply: payload.__sgVfsWriteReq }, reply) })), 0) }
        };
        const fn = new Function('window', vfsMsg + '; return _vfsMsg;')(fakeWin);
        let caught = null;
        await fn('__sgVfsWriteReq', {}).catch((e) => { caught = e; });
        return caught;
    };
    const e1 = await drive({ ok: false, err: 'Permission denied', code: 'EPERM' });
    ok('host code EPERM survives to the frame',        e1 && e1.code === 'EPERM');
    const e2 = await drive({ ok: false, err: 'Read-only vault', code: 'EREADONLY' });
    ok('EREADONLY (now sent by the host) survives',    e2 && e2.code === 'EREADONLY');
    const e3 = await drive({ ok: false, err: 'ENOENT', path: 'x' });
    ok('a code-shaped err (ENOENT) becomes .code',     e3 && e3.code === 'ENOENT');
    const e4 = await drive({ ok: false, err: 'Write failed' });
    ok('a plain message yields no fabricated code',    e4 && e4.code === undefined && e4.message === 'Write failed');

    ok('host sends EREADONLY on a read-only write (was code-less)',
        /wReply\(false, \{ err: 'Read-only vault', code: 'EREADONLY' \}\)/.test(readFileSync(base + 'app-shell.js', 'utf8')));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
