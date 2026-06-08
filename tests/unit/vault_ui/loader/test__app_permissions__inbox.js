/* Unit tests — AppPermissions inbox.* group + vault.notify (Phase C3/C4, v0.33.5)
   Run: node tests/unit/vault_ui/loader/test__app_permissions__inbox.js
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

console.log('\n[suite] AppPermissions — inbox.* default-deny');
{
    const pNone = AP.parsePermissions(null);
    for (const act of ['configure', 'append', 'list', 'read', 'markProcessed', 'purge']) {
        ok(`inbox.${act} default-deny`, AP.can(pNone, 'inbox.' + act, '') === false);
    }
    ok('vault.notify default-deny', AP.can(pNone, 'vault.notify', '') === false);
}

console.log('\n[suite] AppPermissions — inbox.* explicit grants (booleans only)');
{
    const p = AP.parsePermissions({ permissions: { inbox: { list: true, read: true, append: true } } });
    ok('inbox.list granted',          AP.can(p, 'inbox.list', '') === true);
    ok('inbox.read granted',          AP.can(p, 'inbox.read', '') === true);
    ok('inbox.append granted',        AP.can(p, 'inbox.append', '') === true);
    ok('inbox.configure still denied',AP.can(p, 'inbox.configure', '') === false);
    ok('inbox.purge still denied',    AP.can(p, 'inbox.purge', '') === false);
    ok('inbox.markProcessed denied',  AP.can(p, 'inbox.markProcessed', '') === false);

    // Non-true values do not grant (explicit opt-in only).
    const pArr = AP.parsePermissions({ permissions: { inbox: { list: ['h1/'], read: 1, append: 'yes' } } });
    ok('inbox.list with array → deny (not path-scoped)', AP.can(pArr, 'inbox.list', '') === false);
    ok('inbox.read with 1 → deny',                       AP.can(pArr, 'inbox.read', '') === false);
    ok('inbox.append with string → deny',                AP.can(pArr, 'inbox.append', '') === false);
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

console.log('\n[suite] AppPermissions — unknown inbox verb is denied');
{
    const p = AP.parsePermissions({ permissions: { inbox: { list: true } } });
    ok('unknown inbox verb → deny', AP.can(p, 'inbox.frobnicate', '') === false);
}

console.log(`\n  ${pass} pass, ${fail} fail`);
if (fail) process.exitCode = 1;
