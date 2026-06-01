/* Unit tests — AppRwCreds (pure rw sub-vault credential glue extracted from app-shell.js)
   Run: node tests/unit/vault_ui/loader/test__app_shell_rw_creds.js

   Pins the contracts app-shell relies on for rw sub-vault credentials:
     1. buildChildFullKey MUST produce `<passphrase>:<vaultId>` (what SGVault.open parses).
     2. writeSecretOf is the read-only-parent GUARD: a vault with no _writeKey → null,
        so a read-only parent can neither seal nor unseal a child write key.
     3. credsFromChildKey carries custody:'parent-held' + access:'rw' (relay-consumed).
     4. rwRecordBody requires sealed_key and never carries a plaintext key field. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'app-shell-rw-creds.js', import.meta.url)), 'utf8'),
    { filename: 'app-shell-rw-creds.js', displayErrors: true }
);
const R = globalThis.AppRwCreds;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b)); }
function threw(fn) { try { fn(); return false; } catch (_) { return true; } }

console.log('\n[suite] AppRwCreds — rw credential glue');

// 1. buildChildFullKey — the SGVault.open() key format contract
(function () {
    ok('buildChildFullKey: passphrase:vaultId',            R.buildChildFullKey('apple-river-1234', 'v0abcd') === 'apple-river-1234:v0abcd');
    ok('buildChildFullKey: single colon join',             (R.buildChildFullKey('p', 'id').match(/:/g) || []).length === 1);
    ok('buildChildFullKey: throws on missing passphrase',  threw(() => R.buildChildFullKey('', 'v0abcd')));
    ok('buildChildFullKey: throws on missing vaultId',     threw(() => R.buildChildFullKey('p', '')));
})();

// 2. writeSecretOf — the read-only-parent guard
(function () {
    ok('writeSecretOf: returns hex when writable',         R.writeSecretOf({ _writeKey: 'deadbeef' }) === 'deadbeef');
    ok('writeSecretOf: null when read-only (no _writeKey)', R.writeSecretOf({ _writeKey: null }) === null);
    ok('writeSecretOf: null on undefined vault',           R.writeSecretOf(undefined) === null);
    ok('writeSecretOf: null on empty-string secret',       R.writeSecretOf({ _writeKey: '' }) === null);
})();

// 3. credsFromChildKey — the relay-consumed shape
(function () {
    const c = R.credsFromChildKey('apple-river-1234:v0abcd');
    eq('credsFromChildKey: full shape', c, { vaultKey: 'apple-river-1234:v0abcd', accessToken: null, custody: 'parent-held', access: 'rw' });
    ok('credsFromChildKey: custody is parent-held',        c.custody === 'parent-held');
    ok('credsFromChildKey: access is rw',                  c.access === 'rw');
    ok('credsFromChildKey: null on empty key',             R.credsFromChildKey('') === null);
    ok('credsFromChildKey: null on undefined key',         R.credsFromChildKey(undefined) === null);
})();

// 4. rwRecordBody — owner record shape, sealed_key required, no plaintext key
(function () {
    const body = R.rwRecordBody({ vault_id: 'v0abcd', label: 'Alice' }, 'SEALEDBLOB==');
    eq('rwRecordBody: shape', body, { vault_id: 'v0abcd', label: 'Alice', sealed_key: 'SEALEDBLOB==' });
    ok('rwRecordBody: carries no plaintext key field',     !('read_key' in body) && !('vaultKey' in body) && !('key' in body));
    eq('rwRecordBody: defaults missing meta to null',      R.rwRecordBody(null, 'X'), { vault_id: null, label: null, sealed_key: 'X' });
    ok('rwRecordBody: throws without sealed_key',          threw(() => R.rwRecordBody({ vault_id: 'v' }, '')));
})();

console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
