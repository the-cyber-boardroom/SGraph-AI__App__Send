/* =================================================================================
   VaultLoader unit-test harness — zero third-party dependencies beyond jsdom.
   Import this file in any test file; call suite() to group tests.

   Usage:
     import { suite, assert } from './helpers.js';
     import './load-loader.js';   // populates globalThis.VaultLoader et al.

     suite('My module', ({ test, before, after }) => {
         before(() => { ... });     // runs before EACH test
         after(()  => { ... });     // runs after  EACH test
         test('does X', () => { assert.equal(1, 1); });
     });

   Run: node tests/unit/vault_ui/loader/test__xyz.js
   ================================================================================= */

import { strict as assert } from 'node:assert';

export { assert };

export function suite(name, fn) {
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
            _before && _before();
            body();
            _after && _after();
            console.log(`  ✓ ${label}`);
            pass++;
        } catch (err) {
            try { _after && _after(); } catch (_) {}
            console.log(`  ✗ ${label}`);
            console.log(`      ${err.message}`);
            fail++;
        }
    }
    console.log(`  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}

// Clears all vault-loader storage keys so tests start with a clean slate.
export function clearVaultStorage() {
    const KEYS = [
        'sg-vault-key', 'sg-vault-recent', 'sg-vault-recent:migrated-at',
        'sg-vault-history', 'sg-vault-picker:credentials'
    ];
    KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    ['sg-vault-access-key', 'sg-vault-endpoint', 'sg-vault-creating'].forEach(k => {
        try { sessionStorage.removeItem(k); } catch (_) {}
    });
}
