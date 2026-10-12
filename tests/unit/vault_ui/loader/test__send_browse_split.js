/* send-browse split — load-order + completeness guard.
   Run: node tests/unit/vault_ui/loader/test__send_browse_split.js

   send-browse--v0.3.3.js was 1841 lines mixing a UI component with CSV/EML parsers, path
   maths and DOM helpers. It is now four files. In a no-build, `<script src>` codebase the
   split is only safe if two things stay true, and neither is enforced by the language:

     1. every page that loads the component ALSO loads its helper files, BEFORE it —
        otherwise the first call is a ReferenceError at runtime, in the browser, in front
        of a user;
     2. no symbol goes missing in the move — the union of top-level definitions across the
        four files must still cover everything the component calls.

   Both are cheap to assert from source and impossible to notice by reading. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join }                                from 'node:path';

const DIR   = 'sgraph_ai_app_send__ui__open/v0/v0.4/v0.4.0/en-gb/_common/js/components/send-download';
const MAIN  = 'send-browse--v0.3.3.js';
const PARTS = ['send-browse--parsers.js', 'send-browse--paths.js', 'send-browse--dom.js'];

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const read = (f) => readFileSync(join(DIR, f), 'utf8');

console.log('\n[suite] the split files exist and are sane sizes');
{
    PARTS.forEach((p) => ok(p + ' exists', (() => { try { return read(p).length > 200; } catch (_) { return false; } })()));
    const main = read(MAIN);
    ok('the component shrank below 1600 lines', main.split('\n').length < 1600, main.split('\n').length + ' lines');
    ok('the component still defines the class', /class SendBrowse extends SendComponent/.test(main));
}

console.log('\n[suite] no symbol was lost in the move');
{
    // Every helper the component calls must be defined by exactly one of the four files.
    const defRe = /^(?:async\s+)?function\s+(_[A-Za-z0-9_]+)/gm;
    const defined = new Set();
    [MAIN, ...PARTS].forEach((f) => {
        let m; const src = read(f); defRe.lastIndex = 0;
        while ((m = defRe.exec(src)) !== null) defined.add(m[1]);
    });
    const expected = ['_resolvePath', '_findEntry', '_validateVfsPath', '_ensureVaultFolder',
                      '_csvToTable', '_parseCsv', '_escHtml', '_parseEml', '_emlDecode', '_emlSplitMultipart',
                      '_navigateToFolder', '_revealInTree', '_loadHtmlIntoIframe',
                      '_iframeFullscreenFallback', '_injectTabBarScrollCSS'];
    expected.forEach((fn) => ok(fn + ' is still defined somewhere', defined.has(fn)));

    // The module-level state that _injectTabBarScrollCSS guards on must travel WITH it,
    // or the CSS is injected on every call instead of once.
    ok('_tabBarCSSInjected travels with its function',
        /var _tabBarCSSInjected/.test(read('send-browse--dom.js')));
}

console.log('\n[suite] responsibilities actually landed in the right file');
{
    const parsers = read('send-browse--parsers.js');
    const paths   = read('send-browse--paths.js');
    const dom     = read('send-browse--dom.js');
    ok('parsers holds the CSV + EML code',  /function _parseCsv/.test(parsers) && /function _parseEml/.test(parsers));
    ok('parsers touches no DOM',            !/document\.|querySelector/.test(parsers));
    ok('paths holds path maths',            /function _resolvePath/.test(paths) && /function _validateVfsPath/.test(paths));
    ok('dom holds the DOM helpers',         /function _revealInTree/.test(dom) && /function _loadHtmlIntoIframe/.test(dom));
    ok('the component no longer carries them',
        !/^function _parseEml/m.test(read(MAIN)) && !/^function _resolvePath/m.test(read(MAIN)));
}

console.log('\n[suite] every page loading the component loads its helpers FIRST');
{
    function walk(dir, out = []) {
        let entries; try { entries = readdirSync(dir); } catch (_) { return out; }
        for (const e of entries) {
            const p = join(dir, e);
            let st; try { st = statSync(p); } catch (_) { continue; }
            if (st.isDirectory()) walk(p, out);
            else if (e.endsWith('.html')) out.push(p);
        }
        return out;
    }
    const pages = walk('sgraph_ai_app_send__ui__open').filter((p) => readFileSync(p, 'utf8').includes(MAIN));
    ok('found the page(s) that load the component', pages.length > 0, pages.length + ' page(s)');

    pages.forEach((p) => {
        const html = readFileSync(p, 'utf8');
        const mainAt = html.indexOf(MAIN);
        PARTS.forEach((part) => {
            const at = html.indexOf(part);
            ok(`${p.split('/').pop()} loads ${part}`, at !== -1);
            ok(`…before ${MAIN}`, at !== -1 && at < mainAt);
        });
    });
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
