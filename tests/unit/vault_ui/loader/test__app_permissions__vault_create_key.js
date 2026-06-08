/* Unit tests — AppPermissions vault.* grants (createKey / standalone / seedFrom / openApp)
   Run: node tests/unit/vault_ui/loader/test__app_permissions__vault_create_key.js
   No deps. Sources the browser global-scope module via runInThisContext (same pattern as
   test__app_permissions.js). Pure logic — no DOM, no bridge. */

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

console.log('\n[suite] vault grants — parse');
const pNone   = AP.parsePermissions(null);
const pCreate = AP.parsePermissions({ permissions: { vault: { create: ['patients/'] } } });
const pKey    = AP.parsePermissions({ permissions: { vault: { createKey: ['patients/'], standalone: true, openApp: true, seedFrom: ['templates/patient/'], embedAccessToken: true } } });

ok('createKey path-grant parsed',       Array.isArray(pKey.vault.createKey) && pKey.vault.createKey[0] === 'patients/');
ok('standalone bool parsed',            pKey.vault.standalone === true);
ok('openApp bool parsed',               pKey.vault.openApp === true);
ok('embedAccessToken bool parsed',      pKey.vault.embedAccessToken === true);
ok('seedFrom path-grant parsed',        Array.isArray(pKey.vault.seedFrom) && pKey.vault.seedFrom[0] === 'templates/patient/');
ok('absent standalone defaults false',  pCreate.vault.standalone === false);
ok('absent openApp defaults false',     pCreate.vault.openApp === false);
ok('absent createKey defaults deny',    pCreate.vault.createKey === false);

console.log('\n[suite] vault grants — can() matrix');
ok('create on granted path',            AP.can(pCreate, 'vault.create', 'patients/jane'));
ok('create off ungranted path',        !AP.can(pCreate, 'vault.create', 'staff/bob'));
ok('createKey on granted path',         AP.can(pKey, 'vault.createKey', 'patients/jane'));
ok('createKey off ungranted path',     !AP.can(pKey, 'vault.createKey', 'staff/bob'));
ok('standalone bool true',              AP.can(pKey, 'vault.standalone', ''));
ok('openApp bool true',                 AP.can(pKey, 'vault.openApp', ''));
ok('embedAccessToken bool true',        AP.can(pKey, 'vault.embedAccessToken', ''));
ok('embedAccessToken default-deny',    !AP.can(pCreate, 'vault.embedAccessToken', ''));
ok('seedFrom on granted path',          AP.can(pKey, 'vault.seedFrom', 'templates/patient/x'));
ok('seedFrom off ungranted path',      !AP.can(pKey, 'vault.seedFrom', 'secrets/'));

console.log('\n[suite] vault grants — create never implies createKey');
ok('create grant does NOT yield createKey', !AP.can(pCreate, 'vault.createKey', 'patients/jane'));
ok('create grant does NOT yield standalone', !AP.can(pCreate, 'vault.standalone', ''));

console.log('\n[suite] vault grants — default-deny (no perms)');
ok('createKey default-deny',  !AP.can(pNone, 'vault.createKey', 'x'));
ok('standalone default-deny', !AP.can(pNone, 'vault.standalone', ''));
ok('openApp default-deny',    !AP.can(pNone, 'vault.openApp', ''));
ok('seedFrom default-deny',   !AP.can(pNone, 'vault.seedFrom', 'x'));
ok('delete default-deny',     !AP.can(pNone, 'vault.delete', 'x'));

console.log('\n[suite] consent policy (permissions.consent)');
const pConsent = AP.parsePermissions({ permissions: { vault: { createKey: ['patients/'] }, consent: { 'vault.createKey': 'auto', 'vault.delete': 'once', 'vault.unlink': 'bogus' } } });
ok('parses auto',                  pConsent.consent['vault.createKey'] === 'auto');
ok('parses once',                  pConsent.consent['vault.delete'] === 'once');
ok('drops invalid value',          pConsent.consent['vault.unlink'] === undefined);
ok('absent consent → empty map',   Object.keys(pCreate.consent || {}).length === 0);
ok('no consent key → undefined',   (pConsent.consent['vault.create'] === undefined));

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '✓ ') + pass + ' passed');
process.exit(fail ? 1 : 0);
