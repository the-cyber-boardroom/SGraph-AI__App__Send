/* Unit tests — AppFrameBootstrap (ViV Phase 4, pure app-frame HTML builder)
   Run: node tests/unit/vault_ui/loader/test__app_frame_bootstrap.js

   The four iframe-context mount paths in app-shell.js used to assemble their own
   bootstrap HTML inline (only exercisable via Playwright). Phase 4 extracts the
   assembly into AppFrameBootstrap.build(descriptor) — pure, DOM-free, no `this` —
   so the bootstrap output can be asserted from Node against in-memory inputs.
   No mocks — feeds the exact descriptor shapes app-shell.js passes. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
function load(file) {
    const p = new URL(ROOT + file, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: file, displayErrors: true });
}
// AppPermissions.hasVaultSegment is referenced by the page-layout fileList filter.
load('app-permissions.js');
load('app-frame-bootstrap.js');
const B = globalThis.AppFrameBootstrap;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

const BRIDGE = '<script>/*BRIDGE*/<\/script>';

console.log('\n[suite] AppFrameBootstrap — injectHead');
{
    ok('injects after <head>', B.injectHead('<html><head><title>t</title></head>', 'X') === '<html><head>X<title>t</title></head>');
    ok('prepends when no <head>', B.injectHead('<p>no head</p>', 'X') === 'X<p>no head</p>');
    ok('matches <head ...> with attributes', B.injectHead('<head lang="en">', 'X') === '<head lang="en">X');
}

console.log('\n[suite] AppFrameBootstrap — kind:app');
{
    const html = B.build({ kind: 'app', htmlText: '<html><head></head><body>hi</body></html>', bridgeScript: BRIDGE, resBlock: '<style>R</style>' });
    ok('bridge injected exactly once', html.split(BRIDGE).length - 1 === 1);
    ok('bridge precedes resource block', html.indexOf(BRIDGE) < html.indexOf('<style>R</style>'));
    ok('resource block present', html.indexOf('<style>R</style>') !== -1);
    ok('original body preserved', html.indexOf('<body>hi</body>') !== -1);
    const noRes = B.build({ kind: 'app', htmlText: '<head></head>', bridgeScript: BRIDGE });
    ok('resBlock optional (absent → empty)', noRes === '<head>' + BRIDGE + '</head>');
}

console.log('\n[suite] AppFrameBootstrap — kind:html');
{
    const html = B.build({ kind: 'html', htmlText: '<html><head></head><body>doc</body></html>', bridgeScript: BRIDGE, resBlock: '<style>SHOULD-NOT-APPEAR</style>' });
    ok('bridge injected once', html.split(BRIDGE).length - 1 === 1);
    ok('html kind ignores resBlock', html.indexOf('SHOULD-NOT-APPEAR') === -1);
    ok('body preserved', html.indexOf('<body>doc</body>') !== -1);
}

console.log('\n[suite] AppFrameBootstrap — kind:page-layout');
{
    const deps = { css1: 'C1', css2: 'C2', css3: 'C3', sendHelpersJs: 'SH', fileTypeJs: 'FT', mdParserJs: 'MP', mdRendererJs: 'MR', plrJs: 'PLR' };
    const fileList = [
        { dir: false, path: 'index.html' },
        { dir: false, path: 'pages/_page.json' },
        { dir: false, path: '.vault/secret.json' }   // must be filtered out
    ];
    const html = B.build({ kind: 'page-layout', bridgeScript: BRIDGE, deps, fileList, folderPath: 'pages/', entryPath: 'pages/_page.json' });
    ok('is a full document', html.indexOf('<!DOCTYPE html>') === 0);
    ok('bridge injected once', html.split(BRIDGE).length - 1 === 1);
    ok('all three CSS blobs inlined', html.indexOf('C1') !== -1 && html.indexOf('C2') !== -1 && html.indexOf('C3') !== -1);
    ok('PageLayoutRenderer deps inlined', html.indexOf('SH') !== -1 && html.indexOf('FT') !== -1 && html.indexOf('PLR') !== -1);
    ok('path helpers inlined', html.indexOf('function _resolvePath(') !== -1 && html.indexOf('function _findEntry(') !== -1);
    ok('plr-root mount point present', html.indexOf('id="plr-root"') !== -1);
    ok('.vault-segment file filtered from fileList', html.indexOf('.vault/secret.json') === -1);
    ok('non-vault files retained in fileList', html.indexOf('index.html') !== -1 && html.indexOf('pages/_page.json') !== -1);
    ok('entryPath embedded', html.indexOf('"pages/_page.json"') !== -1);
    ok('PageLayoutRenderer.render call present', html.indexOf('PageLayoutRenderer.render(container,json,folderPath,null,browseInstance)') !== -1);
}

console.log('\n[suite] AppFrameBootstrap — kind:markdown');
{
    const deps = { css1: 'MDC1', css2: 'MDC2', mdParserJs: 'MDP', mdRendererJs: 'MDR' };
    const md = '# Title\n\n![x](pic.png "q\\uote")';
    const html = B.build({ kind: 'markdown', bridgeScript: BRIDGE, deps, mdText: md });
    ok('is a full document', html.indexOf('<!DOCTYPE html>') === 0);
    ok('bridge injected once', html.split(BRIDGE).length - 1 === 1);
    ok('md css inlined', html.indexOf('MDC1') !== -1 && html.indexOf('MDC2') !== -1);
    ok('markdown parser/renderer inlined', html.indexOf('MDP') !== -1 && html.indexOf('MDR') !== -1);
    ok('md-root mount point present', html.indexOf('id="md-root"') !== -1);
    ok('markdown source safely JSON-embedded', html.indexOf(JSON.stringify(md)) !== -1);
    ok('image-resolve over bridge present (data-md-src)', html.indexOf('img[data-md-src]') !== -1 && html.indexOf('sg.vfs.read(src)') !== -1);
    ok('posts sg-app-ready when no images', html.indexOf('window.parent.postMessage({type:"sg-app-ready"},"*")') !== -1);
}

console.log('\n[suite] AppFrameBootstrap — guards');
{
    let threw = false;
    try { B.build({ kind: 'nope' }); } catch (_) { threw = true; }
    ok('unknown kind throws', threw);
    threw = false;
    try { B.build(); } catch (_) { threw = true; }
    ok('missing descriptor throws', threw);
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail');
if (fail) process.exitCode = 1;
