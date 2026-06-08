/* Unit tests — AppPermissions vault.mount extension (Phase 2)
   Run: node tests/unit/vault_ui/loader/test__app_permissions_vault_mount.js  */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-permissions.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'app-permissions.js' });
const AP = globalThis.AppPermissions;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name+(info?' — '+info:'')); } }

console.log('\n[suite] AppPermissions — vault.mount extension (Phase 2)');
{
    // VM1
    const pTrue = AP.parsePermissions({ permissions: { vault: { mount: true } } });
    ok('VM1 vault.mount: true parses', pTrue.vault.mount === true);

    // VM2
    const pArr = AP.parsePermissions({ permissions: { vault: { mount: ['mounts/'] } } });
    ok('VM2 vault.mount: ["mounts/"] parses as array', Array.isArray(pArr.vault.mount) && pArr.vault.mount.length === 1);

    // VM3 — can() with scope match
    ok('VM3 can(vault.mount, "mounts/patient-acme") with grant ["mounts/"] → true',
        AP.can(pArr, 'vault.mount', 'mounts/patient-acme') === true);

    // VM4 — can() outside scope
    ok('VM4 can(vault.mount, "elsewhere") with grant ["mounts/"] → false',
        AP.can(pArr, 'vault.mount', 'elsewhere') === false);

    // VM5 — default-deny (mutate-class) when absent
    const pNone = AP.parsePermissions(null);
    ok('VM5 can(vault.mount, …) with no permissions → false',
        AP.can(pNone, 'vault.mount', 'mounts/p') === false);

    // VM6 — true grant allows any path under the floor
    ok('VM6 can(vault.mount, …) with mount:true → true',
        AP.can(pTrue, 'vault.mount', 'mounts/anywhere') === true);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
