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

console.log('\n[suite] app-shell — externalLinks grant flips the external-link path');
{
    const el  = makeShell(AppPermissions.parsePermissions({ permissions: { externalLinks: true } }));
    const src = el._buildVfsBridgeScript('index.html');
    ok('grant → in-frame window.open path', /window\.open\(h,/.test(src));
    ok('grant → app sandbox includes escape-sandbox', /allow-popups-to-escape-sandbox/.test(el._appSandbox()));
    ok('no grant → app sandbox is allow-scripts allow-forms (no escape)',
        makeShell(AppPermissions.parsePermissions(null))._appSandbox() === 'allow-scripts allow-forms');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
