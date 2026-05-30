/* Unit tests — AppNavHelpers (pure nav-logic helpers extracted from app-shell.js)
   Run: node tests/unit/vault_ui/loader/test__app_shell_nav_helpers.js

   Pins the two 2026-05-30 regression-prone rules:
     1. shouldInterceptVaultHtmlHref MUST strip ?query / #fragment before the
        .html/.htm endsWith check. Otherwise "page.html#section" falls through
        to a real GET and 403s on the static host (the original user-reported bug).
     2. resolveNavigation MUST honour alreadyResolved=true by skipping the htmlDir
        prefix. Otherwise back/forward from a deep directory double-prefixes the
        (already vault-absolute) history entry (the screenshot bug). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'app-shell-nav-helpers.js', import.meta.url)), 'utf8'),
    { filename: 'app-shell-nav-helpers.js', displayErrors: true }
);
const H = globalThis.AppNavHelpers;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('\n[suite] AppNavHelpers — resolvePath (pure path math)');
{
    ok('NH1 absolute href (leading /) → slash stripped',
        H.resolvePath('home/', '/shared/x.html') === 'shared/x.html');
    ok('NH2 empty base → href passthrough',
        H.resolvePath('', 'home/index.html') === 'home/index.html');
    ok('NH3 relative within current dir',
        H.resolvePath('home/', 'page.html') === 'home/page.html');
    ok('NH4 ../ steps up one level',
        H.resolvePath('home/sub/', '../page.html') === 'home/page.html');
    ok('NH5 ./ no-op',
        H.resolvePath('home/', './page.html') === 'home/page.html');
    ok('NH6 deep relative collapses ..',
        H.resolvePath('a/b/c/', '../../d/e.html') === 'a/d/e.html');
    ok('NH7 non-string href → empty',
        H.resolvePath('home/', null) === '');
}

console.log('\n[suite] AppNavHelpers — splitHrefFragment');
{
    ok('SF1 no fragment',
        eq(H.splitHrefFragment('page.html'),
           { pathPart: 'page.html', fragment: '' }));
    ok('SF2 fragment present',
        eq(H.splitHrefFragment('page.html#section'),
           { pathPart: 'page.html', fragment: 'section' }));
    ok('SF3 fragment with sub-hash (only first # splits)',
        eq(H.splitHrefFragment('page.html#a#b'),
           { pathPart: 'page.html', fragment: 'a#b' }));
    ok('SF4 pure fragment',
        eq(H.splitHrefFragment('#top'),
           { pathPart: '', fragment: 'top' }));
    ok('SF5 empty input → empty parts',
        eq(H.splitHrefFragment(''),
           { pathPart: '', fragment: '' }));
}

console.log('\n[suite] AppNavHelpers — shouldInterceptVaultHtmlHref (HASH-LINK FIX ANCHOR)');
{
    // The headline regression pin: hash-fragment hrefs ARE intercepted.
    ok('HI1 page.html#section → intercept (was BROKEN pre 2026-05-30)',
        H.shouldInterceptVaultHtmlHref('page.html#section') === true);
    ok('HI2 page.html?q=1 → intercept (query also stripped)',
        H.shouldInterceptVaultHtmlHref('page.html?q=1') === true);
    ok('HI3 page.html?q=1#section → intercept',
        H.shouldInterceptVaultHtmlHref('page.html?q=1#section') === true);
    ok('HI4 plain page.html → intercept',
        H.shouldInterceptVaultHtmlHref('page.html') === true);
    ok('HI5 deep/path/page.htm → intercept',
        H.shouldInterceptVaultHtmlHref('deep/path/page.htm') === true);

    // Negative cases — must NOT intercept.
    ok('HI6 http:// → false',
        H.shouldInterceptVaultHtmlHref('http://example.com/x.html') === false);
    ok('HI7 https:// → false',
        H.shouldInterceptVaultHtmlHref('https://example.com/x.html') === false);
    ok('HI8 protocol-relative // → false',
        H.shouldInterceptVaultHtmlHref('//example.com/x.html') === false);
    ok('HI9 mailto: → false',
        H.shouldInterceptVaultHtmlHref('mailto:foo@bar.com') === false);
    ok('HI10 javascript: → false',
        H.shouldInterceptVaultHtmlHref('javascript:void(0)') === false);
    ok('HI11 pure fragment #x → false',
        H.shouldInterceptVaultHtmlHref('#section') === false);
    ok('HI12 non-html ext → false',
        H.shouldInterceptVaultHtmlHref('data.json') === false);
    ok('HI13 empty / null / non-string → false',
        H.shouldInterceptVaultHtmlHref('') === false
        && H.shouldInterceptVaultHtmlHref(null) === false
        && H.shouldInterceptVaultHtmlHref(42) === false);
    ok('HI14 substring "html" inside path is NOT enough (e.g. /html/notes.md)',
        H.shouldInterceptVaultHtmlHref('html/notes.md') === false);
}

console.log('\n[suite] AppNavHelpers — resolveNavigation (PATH-DOUBLING FIX ANCHOR)');
{
    // The screenshot bug: from "shared/test-lab/", Back to "home/index.html".
    // PRE-FIX: resolved to "shared/test-lab/home/index.html" → broken-link overlay.
    // POST-FIX: with alreadyResolved=true, returns "home/index.html" verbatim.
    ok('RN1 alreadyResolved=true skips htmlDir (THE ORIGINAL BUG)',
        eq(H.resolveNavigation({
            htmlDir: 'shared/test-lab/',
            href: 'home/index.html',
            alreadyResolved: true
        }), { resolved: 'home/index.html', fragment: '' }));

    // The doubled-self bug: from "shared/test-lab/", Forward back into
    // "shared/test-lab/index.html". PRE-FIX: doubled to
    // "shared/test-lab/shared/test-lab/index.html". POST-FIX: returns the path verbatim.
    ok('RN2 alreadyResolved=true does NOT double-prefix a self-match',
        eq(H.resolveNavigation({
            htmlDir: 'shared/test-lab/',
            href: 'shared/test-lab/index.html',
            alreadyResolved: true
        }), { resolved: 'shared/test-lab/index.html', fragment: '' }));

    // Default branch (bridge-intercepted clicks): MUST run through resolvePath.
    ok('RN3 alreadyResolved=false uses htmlDir prefix (bridge click default)',
        eq(H.resolveNavigation({
            htmlDir: 'shared/test-lab/',
            href: 'page.html',
            alreadyResolved: false
        }), { resolved: 'shared/test-lab/page.html', fragment: '' }));

    ok('RN4 alreadyResolved omitted → defaults to false (relative resolution)',
        eq(H.resolveNavigation({
            htmlDir: 'a/b/',
            href: '../c.html'
        }), { resolved: 'a/c.html', fragment: '' }));

    ok('RN5 fragment preserved through alreadyResolved=true',
        eq(H.resolveNavigation({
            htmlDir: 'shared/test-lab/',
            href: 'home/index.html#chart-3',
            alreadyResolved: true
        }), { resolved: 'home/index.html', fragment: 'chart-3' }));

    ok('RN6 fragment preserved through alreadyResolved=false',
        eq(H.resolveNavigation({
            htmlDir: 'home/',
            href: 'page.html#sect-a',
            alreadyResolved: false
        }), { resolved: 'home/page.html', fragment: 'sect-a' }));

    ok('RN7 leading-/ absolute href ignores htmlDir even when not alreadyResolved',
        eq(H.resolveNavigation({
            htmlDir: 'deep/sub/',
            href: '/home/index.html'
        }), { resolved: 'home/index.html', fragment: '' }));

    ok('RN8 empty opts → empty resolved + empty fragment (no throw)',
        eq(H.resolveNavigation({}), { resolved: '', fragment: '' }));

    ok('RN9 alreadyResolved must be strictly true (=== check, not truthy)',
        eq(H.resolveNavigation({
            htmlDir: 'a/',
            href: 'b/c.html',
            alreadyResolved: 'truthy-but-not-true'
        }), { resolved: 'a/b/c.html', fragment: '' }));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
