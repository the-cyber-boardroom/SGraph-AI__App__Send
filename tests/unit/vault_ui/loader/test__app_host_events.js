/* Unit tests — AppHostEvents (Phase C3, v0.33.5)
   Run: node tests/unit/vault_ui/loader/test__app_host_events.js
   No deps. Sources the browser global-scope module via runInThisContext. Pure logic. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-host-events.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'app-host-events.js', displayErrors: true });
const AHE = globalThis.AppHostEvents;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('\n[suite] AppHostEvents — parse (default-deny, explicit opt-in)');
{
    ok('null appJson → empty set',           AHE.parse(null).size === 0);
    ok('missing host_events → empty set',    AHE.parse({ permissions: {} }).size === 0);
    ok('host_events not an object → empty',  AHE.parse({ host_events: 'nope' }).size === 0);

    const s = AHE.parse({ host_events: { 'inbox.new-messages': true, 'inbox.config-changed': false } });
    ok('true entry is allowed',              s.has('inbox.new-messages'));
    ok('false entry is NOT allowed',        !s.has('inbox.config-changed'));
    ok('only the true entry is present',     s.size === 1);

    const truthy = AHE.parse({ host_events: { 'a.b': 1, 'c.d': 'yes', 'e.f': true } });
    ok('truthy-but-not-true is ignored (1)',     !truthy.has('a.b'));
    ok('truthy-but-not-true is ignored (str)',   !truthy.has('c.d'));
    ok('strictly true is the only allowed',       truthy.has('e.f') && truthy.size === 1);
}

console.log('\n[suite] AppHostEvents — name validation (no wildcards, no junk)');
{
    const s = AHE.parse({ host_events: {
        'inbox.new-messages': true,   // ok
        'vault.commits-behind': true, // ok (hyphen)
        'a_b.c': true,                // ok (underscore)
        '*': true,                    // rejected — no wildcard in the allowlist
        'inbox.*': true,              // rejected — wildcard
        'Inbox.New': true,            // rejected — uppercase
        '1bad': true,                 // rejected — leading digit
        '.bad': true,                 // rejected — leading dot
        '': true                      // rejected — empty
    }});
    ok('dotted lowercase allowed',     s.has('inbox.new-messages'));
    ok('hyphen allowed',               s.has('vault.commits-behind'));
    ok('underscore allowed',           s.has('a_b.c'));
    ok('bare "*" rejected',           !s.has('*'));
    ok('"inbox.*" wildcard rejected', !s.has('inbox.*'));
    ok('uppercase rejected',          !s.has('Inbox.New'));
    ok('leading digit rejected',      !s.has('1bad'));
    ok('leading dot rejected',        !s.has('.bad'));
    ok('only the 3 valid names',       s.size === 3);
}

console.log('\n[suite] AppHostEvents — allows()');
{
    const s = AHE.parse({ host_events: { 'inbox.new-messages': true } });
    ok('allows allowed name',         AHE.allows(s, 'inbox.new-messages') === true);
    ok('denies unknown name',         AHE.allows(s, 'inbox.config-changed') === false);
    ok('denies wildcard probe',       AHE.allows(s, '*') === false);
    ok('null set → false',            AHE.allows(null, 'x') === false);
}

console.log(`\n  ${pass} pass, ${fail} fail`);
if (fail) process.exitCode = 1;
