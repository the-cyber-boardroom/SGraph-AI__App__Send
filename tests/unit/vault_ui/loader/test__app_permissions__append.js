/* Unit tests — AppPermissions append.* group + vault.notify (Phase C3/C4, v0.33.5; renamed inbox→append v0.32.7)
   Run: node tests/unit/vault_ui/loader/test__app_permissions__append.js
   No deps. Sources the browser global-scope module via runInThisContext. Pure logic. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-permissions.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'app-permissions.js', displayErrors: true });
const AP = globalThis.AppPermissions;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

console.log('\n[suite] AppPermissions — append.* default-deny');
{
    const pNone = AP.parsePermissions(null);
    for (const act of ['configure', 'write', 'list', 'read', 'markProcessed', 'purge']) {
        ok(`append.${act} default-deny`, AP.can(pNone, 'append.' + act, '') === false);
    }
    ok('vault.notify default-deny', AP.can(pNone, 'vault.notify', '') === false);
}

console.log('\n[suite] AppPermissions — append.* explicit grants (booleans only)');
{
    const p = AP.parsePermissions({ permissions: { append: { list: true, read: true, write: true } } });
    ok('append.list granted',          AP.can(p, 'append.list', '') === true);
    ok('append.read granted',          AP.can(p, 'append.read', '') === true);
    ok('append.write granted',         AP.can(p, 'append.write', '') === true);
    ok('append.configure still denied',AP.can(p, 'append.configure', '') === false);
    ok('append.purge still denied',    AP.can(p, 'append.purge', '') === false);
    ok('append.markProcessed denied',  AP.can(p, 'append.markProcessed', '') === false);

    // Non-true values do not grant (explicit opt-in only).
    const pArr = AP.parsePermissions({ permissions: { append: { list: ['h1/'], read: 1, write: 'yes' } } });
    ok('append.list with array → deny (not path-scoped)', AP.can(pArr, 'append.list', '') === false);
    ok('append.read with 1 → deny',                       AP.can(pArr, 'append.read', '') === false);
    ok('append.write with string → deny',                 AP.can(pArr, 'append.write', '') === false);
}

console.log('\n[suite] AppPermissions — vault.notify');
{
    const p = AP.parsePermissions({ permissions: { vault: { notify: true } } });
    ok('vault.notify granted when true',  AP.can(p, 'vault.notify', '') === true);
    const pf = AP.parsePermissions({ permissions: { vault: { notify: false } } });
    ok('vault.notify denied when false',  AP.can(pf, 'vault.notify', '') === false);
    // notify does not leak into other vault verbs
    ok('vault.delete unaffected',         AP.can(p, 'vault.delete', '') === false);
}

console.log('\n[suite] AppPermissions — unknown append verb is denied');
{
    const p = AP.parsePermissions({ permissions: { append: { list: true } } });
    ok('unknown append verb → deny', AP.can(p, 'append.frobnicate', '') === false);
}

console.log(`\n  ${pass} pass, ${fail} fail`);
if (fail) process.exitCode = 1;
