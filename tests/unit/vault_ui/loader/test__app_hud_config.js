/* Unit tests — AppHudConfig (pure resolver for the app.json hud.* schema)
   Run: node tests/unit/vault_ui/loader/test__app_hud_config.js

   Pins the contract documented at library/guides/vault-html/AUTHORING.md →
   "Configuring the host chrome — app.json hud.*". */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'app-hud-config.js', import.meta.url)), 'utf8'),
    { filename: 'app-hud-config.js', displayErrors: true }
);
const C = globalThis.AppHudConfig;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

console.log('\n[suite] AppHudConfig — mode resolution');
{
    ok('M1 undefined input → mode=full',     C.resolve().mode === 'full');
    ok('M2 null input → mode=full',          C.resolve(null).mode === 'full');
    ok('M3 empty object → mode=full',        C.resolve({}).mode === 'full');
    ok('M4 mode=full → full',                C.resolve({ mode: 'full' }).mode === 'full');
    ok('M5 mode=minimal → minimal',          C.resolve({ mode: 'minimal' }).mode === 'minimal');
    ok('M6 mode=hidden → hidden',            C.resolve({ mode: 'hidden' }).mode === 'hidden');
    ok('M7 unknown mode (typo) → full (forgiving fallback, app isn\'t bricked)',
        C.resolve({ mode: 'mineimal' }).mode === 'full');
    ok('M8 non-string mode → full',          C.resolve({ mode: 42 }).mode === 'full');
}

console.log('\n[suite] AppHudConfig — full-mode defaults (everything visible)');
{
    var r = C.resolve({ mode: 'full' });
    var FULL_KEYS = ['vaultName','appTitle','openVault','copyLink','print','debug',
                     'navBar','navArrows','navPath','navRefresh','navHome'];
    var allOn = FULL_KEYS.every(function (k) { return r.show[k] === true; });
    ok('F1 full mode: all show.* flags default to true',
        allOn, JSON.stringify(r.show));
    ok('F2 full mode: show.print specifically true (Commit B2 flipped this from false)',
        r.show.print === true);
    ok('F3 full mode: show.navBar specifically true',
        r.show.navBar === true);
    ok('F4 full mode: show.navHome specifically true',
        r.show.navHome === true);
}

console.log('\n[suite] AppHudConfig — minimal-mode defaults (nav row off, chrome stripped)');
{
    var r = C.resolve({ mode: 'minimal' });
    ok('MN1 minimal: vaultName still on',     r.show.vaultName === true);
    ok('MN2 minimal: appTitle still on',      r.show.appTitle === true);
    ok('MN3 minimal: openVault off',          r.show.openVault === false);
    ok('MN4 minimal: copyLink off',           r.show.copyLink === false);
    ok('MN5 minimal: print off',              r.show.print === false);
    ok('MN6 minimal: debug off',              r.show.debug === false);
    ok('MN7 minimal: navBar off',             r.show.navBar === false);
    ok('MN8 minimal: navArrows off',          r.show.navArrows === false);
    ok('MN9 minimal: navHome off',            r.show.navHome === false);
}

console.log('\n[suite] AppHudConfig — show.* overrides on top of defaults');
{
    // Override on top of full: opt OUT of debug
    var r1 = C.resolve({ mode: 'full', show: { debug: false } });
    ok('O1 full + show.debug=false → debug false, others stay default',
        r1.show.debug === false && r1.show.vaultName === true && r1.show.navBar === true);

    // Override on top of minimal: opt IN to print
    var r2 = C.resolve({ mode: 'minimal', show: { print: true } });
    ok('O2 minimal + show.print=true → print true, others stay minimal-default',
        r2.show.print === true && r2.show.navBar === false && r2.show.openVault === false);

    // Multiple overrides
    var r3 = C.resolve({ mode: 'minimal', show: { navBar: true, navArrows: true, navPath: true } });
    ok('O3 minimal can opt-in to nav row piecewise',
        r3.show.navBar === true && r3.show.navArrows === true && r3.show.navPath === true
        && r3.show.openVault === false);

    // Bogus / extra keys are preserved verbatim (forward-compat — adding a new flag in
    // app.json shouldn't break apps that already declared it before the host shipped it).
    var r4 = C.resolve({ mode: 'full', show: { futureFlag: true } });
    ok('O4 unknown show.* key passes through (forward-compat)',
        r4.show.futureFlag === true);
}

console.log('\n[suite] AppHudConfig — hidden mode keeps full-style show defaults');
{
    // Rationale: if the user override force-shows the HUD (localStorage
    // sg-app-force-show-hud=1), hidden-mode apps shouldn't ALSO end up with a
    // stripped/minimal chrome. The full defaults are the "if shown" baseline.
    // Hiding is enforced by the consumer (AppHud.applyHudConfig) keying off mode.
    var r = C.resolve({ mode: 'hidden' });
    ok('H1 hidden mode preserves mode=hidden',  r.mode === 'hidden');
    ok('H2 hidden mode show.* uses FULL defaults (so force-show is sensible)',
        r.show.vaultName === true && r.show.navBar === true && r.show.print === true);
}

console.log('\n[suite] AppHudConfig — output shape');
{
    var r = C.resolve();
    ok('S1 result has exactly { mode, show } keys',
        Object.keys(r).sort().join(',') === 'mode,show');
    ok('S2 show is a plain object',
        r.show && typeof r.show === 'object' && !Array.isArray(r.show));
    ok('S3 resolve does not mutate input',
        (function () {
            var input = { mode: 'minimal', show: { debug: true } };
            var snap  = JSON.stringify(input);
            C.resolve(input);
            return JSON.stringify(input) === snap;
        })());
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
