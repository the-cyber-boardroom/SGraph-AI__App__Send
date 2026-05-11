/* =================================================================================
   VaultLoader integration-test harness — async-capable.
   Mirrors the unit-test helpers.js API but awaits async test bodies.

   Usage:
     import { suite, assert, clearIntegrationStorage } from './helpers.js';
     import './load-integration.js';

     await suite('My module', ({ test, before }) => {
         before(clearIntegrationStorage);
         test('does X', async () => { assert.equal(1, 1); });
     });

   Run: node tests/integration/vault_ui/loader/test__xyz.js
   ================================================================================= */

import { strict as assert } from 'node:assert';

export { assert };

export async function suite(name, fn) {
    console.log(`\n[suite] ${name}`);
    let pass = 0, fail = 0;
    let _before = null, _after = null;
    const tests = [];
    const ctx = {
        test:   (label, body) => tests.push({ label, body }),
        before: (fn)          => { _before = fn; },
        after:  (fn)          => { _after  = fn; }
    };
    fn(ctx);
    for (const { label, body } of tests) {
        try {
            _before && await _before();
            await body();
            _after && await _after();
            console.log(`  ✓ ${label}`);
            pass++;
        } catch (err) {
            try { _after && await _after(); } catch (_) {}
            console.log(`  ✗ ${label}`);
            console.log(`      ${err.message}`);
            fail++;
        }
    }
    console.log(`  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}

// Clears all vault storage AND resets the in-memory SGVault store.
export function clearIntegrationStorage() {
    const LS_KEYS = [
        'sg-vault-key', 'sg-vault-recent', 'sg-vault-recent:migrated-at',
        'sg-vault-history', 'sg-vault-picker:credentials'
    ];
    LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    ['sg-vault-access-key', 'sg-vault-endpoint', 'sg-vault-creating', 'sg-vault-session'].forEach(k => {
        try { sessionStorage.removeItem(k); } catch (_) {}
    });
    if (globalThis.SGVault && globalThis.SGVault._reset) globalThis.SGVault._reset();
    if (globalThis.sgraphVault && globalThis.sgraphVault.events) globalThis.sgraphVault.events.clearLog();
}
