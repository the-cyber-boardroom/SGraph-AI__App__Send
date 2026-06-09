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

console.log('\n[suite] AppNavHelpers — decideMountStrategy (DEEP-LINK BUG ANCHOR)');
{
    // The headline regression pin: /en-gb/app/#patient/index.html, a deep-linked HTML
    // file in an app vault. PRE-FIX: routed to _mountVaultFile (bare file, no
    // resources). POST-FIX: routes through _mountApp with the deep-link overriding
    // appJson.entry, so the app's CSS/JS still load.
    var d1 = H.decideMountStrategy({
        deepPath: 'patient/index.html',
        appJson:  { entry: 'home/index.html', title: 'Demo', resources: { css: ['styles.css'] } }
    });
    ok('DM1 deep-link HTML + app.json → strategy=app with overridden entry (THE FIX)',
        d1.strategy === 'app'
        && d1.appJson.entry === 'patient/index.html'
        && d1.appJson.title === 'Demo'                 // other appJson fields preserved
        && d1.appJson.resources.css[0] === 'styles.css');

    ok('DM2 decideMountStrategy does NOT mutate the input appJson (clone semantics)',
        (function () {
            var input = { entry: 'home/index.html', title: 'X' };
            H.decideMountStrategy({ deepPath: 'other/page.html', appJson: input });
            return input.entry === 'home/index.html' && input.title === 'X';
        })());

    // Deep-link matches the default entry — no override needed, but still routes to
    // app mount (which was the pre-fix exception case the original code handled
    // separately; my helper unifies both paths).
    var d3 = H.decideMountStrategy({
        deepPath: 'home/index.html',
        appJson:  { entry: 'home/index.html' }
    });
    ok('DM3 deep-link == default entry → strategy=app (no change in behaviour)',
        d3.strategy === 'app' && d3.appJson.entry === 'home/index.html');

    // .htm extension (less common but valid) — same treatment as .html.
    var d4 = H.decideMountStrategy({
        deepPath: 'pages/intro.htm',
        appJson:  { entry: 'index.htm' }
    });
    ok('DM4 .htm deep-link in app vault → strategy=app with override',
        d4.strategy === 'app' && d4.appJson.entry === 'pages/intro.htm');

    // Non-HTML deep-link in an app vault → bare file view. App mount path is
    // HTML-only; mounting a markdown / image / json as the entry would error or
    // render uselessly.
    var d5 = H.decideMountStrategy({
        deepPath: 'docs/notes.md',
        appJson:  { entry: 'home/index.html' }
    });
    ok('DM5 non-HTML deep-link (.md) → strategy=file, bypasses app mount',
        d5.strategy === 'file' && d5.filePath === 'docs/notes.md');

    var d6 = H.decideMountStrategy({
        deepPath: 'photos/hero.webp',
        appJson:  { entry: 'index.html' }
    });
    ok('DM6 non-HTML deep-link (image) → strategy=file',
        d6.strategy === 'file' && d6.filePath === 'photos/hero.webp');

    // Deep-link HTML but vault has no app.json → bare file view. Without an
    // app.json there are no resources to load anyway; the file is on its own.
    var d7 = H.decideMountStrategy({
        deepPath: 'standalone.html',
        appJson:  null
    });
    ok('DM7 HTML deep-link + no app.json → strategy=file',
        d7.strategy === 'file' && d7.filePath === 'standalone.html');

    // No deep-link + app.json → app mount with default entry. The plain case.
    var d8 = H.decideMountStrategy({
        deepPath: '',
        appJson:  { entry: 'index.html', title: 'X' }
    });
    ok('DM8 no deep-link + app.json → strategy=app, default entry preserved',
        d8.strategy === 'app' && d8.appJson.entry === 'index.html' && d8.appJson === d8.appJson);

    // No deep-link + no app.json → redirect to vault UI.
    var d9 = H.decideMountStrategy({ deepPath: '', appJson: null });
    ok('DM9 no deep-link + no app.json → strategy=redirect',
        d9.strategy === 'redirect');

    // Empty opts → redirect (safe default — no path, no app).
    var d10 = H.decideMountStrategy({});
    ok('DM10 empty opts → strategy=redirect',
        d10.strategy === 'redirect');

    // Trick case: substring "html" inside path, but path doesn't actually END in .html.
    // e.g. a directory named "html". Should be treated as non-HTML.
    var d11 = H.decideMountStrategy({
        deepPath: 'html-templates/readme.md',
        appJson:  { entry: 'index.html' }
    });
    ok('DM11 substring "html" mid-path does not trigger HTML branch',
        d11.strategy === 'file' && d11.filePath === 'html-templates/readme.md');
}

// --- resolveFolderManifest (per-folder app.json for "Open as App" in a sub-folder) ---
{
    var folder   = 'tools/release-tester';
    var deepPath = 'tools/release-tester/index.html';

    var r1 = H.resolveFolderManifest(
        { entry: 'index.html', resources: { css: ['app.css', 'theme/x.css'], js: ['app.js'] },
          permissions: { fs: { write: true } }, host_events: { 'inbox.new-messages': true }, title: 'Release Tester' },
        folder, deepPath);
    ok('RFM entry = the opened file (not folderJson.entry)', r1.entry === deepPath);
    ok('RFM relative css → folder-prefixed',     r1.resources.css[0] === 'tools/release-tester/app.css');
    ok('RFM nested relative css → folder-prefixed', r1.resources.css[1] === 'tools/release-tester/theme/x.css');
    ok('RFM relative js → folder-prefixed',      r1.resources.js[0] === 'tools/release-tester/app.js');
    ok('RFM permissions preserved verbatim',     r1.permissions && r1.permissions.fs.write === true);
    ok('RFM host_events preserved verbatim',     r1.host_events && r1.host_events['inbox.new-messages'] === true);
    ok('RFM title preserved',                    r1.title === 'Release Tester');

    var r2 = H.resolveFolderManifest(
        { resources: { css: ['/shared/global.css'], js: [] } }, folder, deepPath);
    ok('RFM leading-slash css = vault-absolute (slash stripped)', r2.resources.css[0] === 'shared/global.css');

    var r3 = H.resolveFolderManifest({}, folder, deepPath);
    ok('RFM empty manifest → entry still = opened file', r3.entry === deepPath);
    ok('RFM empty manifest → no resources synthesised',  r3.resources === undefined);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
