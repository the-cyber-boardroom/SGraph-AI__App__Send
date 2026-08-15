/* Guards VaultLoader.openReadOnly (formats 4 + 6) — the read-key open path that
   replaced the "requires further investigation for ref discovery" stub.

   Loads the REAL vault-loader modules and the REAL SGVaultCrypto; stubs SGVault
   (openReadOnly capture) and SGSend so no network is touched. Verifies:
     - open('<64hex>:<id>') routes to SGVault.openReadOnly with the derived triple
     - open('sgit_rk1_<64hex>:<id>') behaves identically (prefix stripped)
     - open('<id> <64hex>') (format 4) reaches the same path
     - VAULT_OPENED fires with readOnly:true and the canonical format-6 key
     - the credential is persisted by default and NOT persisted with noPersist
     - a storage layer that THROWS (null-origin sandbox) cannot break the open

   Run: node tests/unit/vault_ui/loader/test__vault_loader_open_readonly.js */

import { suite, assert } from './helpers.js';
import './load-loader.js';

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

// Real crypto (the derivation under test rides through the loader).
const CRYPTO_SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/sg-vault-crypto.js', import.meta.url));
runInThisContext(readFileSync(CRYPTO_SRC, 'utf8'), { filename: 'sg-vault-crypto.js', displayErrors: true });
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');

// Stub transport + vault.
global.SGSend = function SGSend(opts) { this.endpoint = opts.endpoint; this.token = opts.token; };

let openReadOnlyCalls = [];
global.SGVault = {
    openReadOnly: async (sgSend, vaultId, readKeyB64, refFileId) => {
        openReadOnlyCalls.push({ vaultId, readKeyB64, refFileId });
        return { name: 'Stub Vault', vaultId, writable: false, _passphrase: null };
    }
};

const RK      = 'abcdef0123456789'.repeat(4);      // 64-hex read key
const VID     = 'abcd1234';
const KEY6    = RK + ':' + VID;

// Expected derivation (independent copy — drift guard).
async function expectedRefFileId() {
    const enc      = new TextEncoder();
    const readBits = Uint8Array.from(RK.match(/../g).map(h => parseInt(h, 16)));
    const hmacKey  = await crypto.subtle.importKey('raw', readBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig      = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode('sg-vault-v1:file-id:ref:' + VID)));
    return 'ref-pid-muw-' + Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

const events = global.sgraphVault.events;

(async () => {
    const REF = await expectedRefFileId();

    console.log('\n[suite] VaultLoader.openReadOnly — format 6 routing');
    {
        openReadOnlyCalls = []; events.clearLog(); localStorage.clear(); sessionStorage.clear();

        const result = await VaultLoader.open(KEY6, {});
        const call   = openReadOnlyCalls[0];

        let pass = 0, fail = 0;
        const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); process.exitCode = 1; } };

        ok('SGVault.openReadOnly called once',        openReadOnlyCalls.length === 1);
        ok('vaultId threaded through',                call.vaultId === VID);
        ok('refFileId derived from the read key',     call.refFileId === REF);
        ok('readKeyB64 is the hex key, base64',       atob(call.readKeyB64).length === 32);
        ok('result.format is 6',                      result.format === 6);
        ok('result.vaultKey is the canonical string', result.vaultKey === KEY6);

        const opened = events._log.find(e => e.name === 'vault-opened');
        ok('VAULT_OPENED emitted',                    !!opened);
        ok('VAULT_OPENED carries readOnly:true',      opened && opened.detail.readOnly === true);

        ok('credential persisted by default',         localStorage.getItem('sg-vault-key') === KEY6);
        console.log('  ' + pass + ' pass, ' + fail + ' fail');
    }

    console.log('\n[suite] VaultLoader.openReadOnly — sgit_rk1_ prefixed input');
    {
        openReadOnlyCalls = []; events.clearLog(); localStorage.clear(); sessionStorage.clear();

        const result = await VaultLoader.open('sgit_rk1_' + KEY6, {});
        let pass = 0, fail = 0;
        const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); process.exitCode = 1; } };

        ok('prefixed key routes identically',      openReadOnlyCalls.length === 1 && openReadOnlyCalls[0].refFileId === REF);
        ok('vaultKey normalised to bare form',     result.vaultKey === KEY6);
        console.log('  ' + pass + ' pass, ' + fail + ' fail');
    }

    console.log('\n[suite] VaultLoader.openReadOnly — format 4 (space-separated) reaches same path');
    {
        openReadOnlyCalls = []; events.clearLog(); localStorage.clear(); sessionStorage.clear();

        const result = await VaultLoader.open(VID + ' ' + RK, {});
        let pass = 0, fail = 0;
        const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); process.exitCode = 1; } };

        ok('format 4 no longer throws (stub removed)', openReadOnlyCalls.length === 1);
        ok('same derived refFileId',                   openReadOnlyCalls[0].refFileId === REF);
        ok('normalises to the canonical format-6 key', result.vaultKey === KEY6);
        console.log('  ' + pass + ' pass, ' + fail + ' fail');
    }

    console.log('\n[suite] VaultLoader.openReadOnly — noPersist (embed mode)');
    {
        openReadOnlyCalls = []; events.clearLog(); localStorage.clear(); sessionStorage.clear();

        await VaultLoader.open(KEY6, { noPersist: true });
        let pass = 0, fail = 0;
        const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); process.exitCode = 1; } };

        ok('key NOT written to localStorage',   localStorage.getItem('sg-vault-key') === null);
        ok('key NOT written to sessionStorage', sessionStorage.getItem('sg-vault-key') === null);
        ok('recent list untouched',             localStorage.getItem('sg-vault-recent') === null);
        console.log('  ' + pass + ' pass, ' + fail + ' fail');
    }

    console.log('\n[suite] VaultLoader.openReadOnly — storage that THROWS cannot break the open');
    {
        openReadOnlyCalls = []; events.clearLog();

        // Simulate the null-origin sandbox: every storage access throws synchronously.
        const realLocal = global.localStorage, realSession = global.sessionStorage;
        const thrower = new Proxy({}, { get() { throw new Error('The document is sandboxed and lacks the allow-same-origin flag.'); } });
        global.localStorage = thrower; global.sessionStorage = thrower;

        let result = null, error = null;
        try { result = await VaultLoader.open(KEY6, {}); } catch (e) { error = e; }

        global.localStorage = realLocal; global.sessionStorage = realSession;

        let pass = 0, fail = 0;
        const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); process.exitCode = 1; } };

        ok('open succeeds despite throwing storage', !error && !!result);
        ok('vault opened read-only',                 openReadOnlyCalls.length === 1);
        console.log('  ' + pass + ' pass, ' + fail + ' fail');
    }

    console.log('');
})();
