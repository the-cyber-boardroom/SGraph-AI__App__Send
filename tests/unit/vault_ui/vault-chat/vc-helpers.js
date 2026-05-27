/* =================================================================================
   vc-helpers.js — async-aware test harness for the Vault Chat modules.
   Same shape as ../loader/helpers.js, but awaits async test bodies.

   Usage:
     import { suite, assert } from './vc-helpers.js';
     import { VaultChat }     from './load-vault-chat.js';
     await suite('My module', ({ test }) => { test('does X', async () => { ... }); });
   ================================================================================= */
import { strict as assert } from 'node:assert';
export { assert };

export async function suite(name, fn) {
    console.log(`\n[suite] ${name}`);
    let pass = 0, fail = 0;
    const tests = [];
    fn({ test: (label, body) => tests.push({ label, body }) });
    for (const { label, body } of tests) {
        try {
            await body();
            console.log(`  ✓ ${label}`);
            pass++;
        } catch (err) {
            console.log(`  ✗ ${label}`);
            console.log(`      ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err}`);
            fail++;
        }
    }
    console.log(`  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}
