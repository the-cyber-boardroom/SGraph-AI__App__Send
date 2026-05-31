/* Integration-style test — the rw credential LOOP (seal on create → store → resolve → unseal)
   Run: node tests/unit/vault_ui/loader/test__rw_credential_loop.js

   Proves the M5 wiring end-to-end using the REAL VaultLinks + VaultRwSeal modules over a fake
   owner vault, replicating exactly what app-shell does:
     _createChildVault/_saveRwLink: seal(childFullKey, parentWriteKey) → VaultLinks.saveRwRecord
     _resolveRwCredentials:         VaultLinks.resolveRwRef → unseal(sealed_key, parentWriteKey)
   No browser; uses Node WebCrypto for the seal and a fake vault for the owner records. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';
import { webcrypto }        from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel, exposeAs) {
    const p = fileURLToPath(new URL(ROOT + rel, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: rel, displayErrors: true });
    if (exposeAs) runInThisContext('globalThis.' + exposeAs + ' = ' + exposeAs + ';');
}
load('lib/links/vault-links.js', 'VaultLinks');
load('lib/links/vault-rw-seal.js', 'VaultRwSeal');
const { VaultLinks, VaultRwSeal } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

// fake owner vault (same shape as the vault-links unit test), with a write secret
function makeFakeVault(writable, writeKeyHex) {
    const files = {}, folders = new Set();
    const norm = p => String(p).replace(/^\//, '').replace(/\/$/, '');
    return {
        writable, _writeKey: writable ? (writeKeyHex || 'ab12'.repeat(16)) : null, pushed: 0,
        needsLoading() { return false; },
        async loadSubTreeOnDemand() {},
        listFolder(p) { const k = norm(p); return folders.has(k) ? Object.keys(files[k] || {}).map(n => ({ name: n })) : null; },
        async createFolder(p) { folders.add(norm(p)); },
        async getFile(folder, name) { const k = norm(folder); if (!files[k] || !(name in files[k])) throw new Error('ENOENT'); return files[k][name]; },
        async addFile(folder, name, bytes) { const k = norm(folder); if (!folders.has(k)) throw new Error('Folder not found: ' + folder); (files[k] = files[k] || {})[name] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); },
        async updateFile(folder, name, bytes) { const k = norm(folder); (files[k] = files[k] || {})[name] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); },
        async push() { this.pushed++; }
    };
}

// the two app-shell operations, faithfully replicated (the code under test lives in app-shell.js
// _saveRwLink / _resolveRwCredentials — this mirrors them exactly so the loop is provable in node)
async function saveRwLink(parentVault, refId, meta, childFullKey) {
    const writeSecret = parentVault && parentVault._writeKey;
    if (!writeSecret) throw new Error('Parent vault is read-only: cannot seal a child write key');
    const sealed = await VaultRwSeal.seal(childFullKey, writeSecret);
    return VaultLinks.saveRwRecord(parentVault, refId, { vault_id: meta.vault_id, label: meta.label, sealed_key: sealed });
}
async function resolveRwCredentials(parentVault, ref) {
    const rec = await VaultLinks.resolveRwRef(parentVault, ref);
    if (!rec || !rec.sealed_key) return null;
    const writeSecret = parentVault._writeKey;
    if (!writeSecret) return null;
    const childFullKey = await VaultRwSeal.unseal(rec.sealed_key, writeSecret);
    return { vaultKey: childFullKey, accessToken: null, custody: 'parent-held', access: 'rw' };
}

console.log('\n[suite] rw credential loop — seal→store→resolve→unseal (real modules)');

(async () => {
    const PARENT_WK = 'cafe' + 'b0ba'.repeat(15);                 // parent write secret (hex)
    const CHILD_KEY = 'apple-river-1234:childvaultid01';          // child FULL key (passphrase:vaultId)
    const REF       = 'lk-child-1';

    // 1. create: seal + store
    const parent = makeFakeVault(true, PARENT_WK);
    await saveRwLink(parent, REF, { vault_id: 'childvaultid01', label: 'Patient Acme' }, CHILD_KEY);
    ok('rw record persisted + pushed', parent.pushed === 1);

    // the stored file must NOT contain the plaintext child key
    const raw = await parent.getFile('.vault/owner', 'rw-links.json');
    const json = new TextDecoder().decode(raw);
    ok('rw-links.json does not contain plaintext child key', json.indexOf(CHILD_KEY) === -1);
    ok('rw-links.json does not contain the child passphrase', json.indexOf('apple-river-1234') === -1);
    ok('rw-links.json stores a sealed_key field', /"sealed_key"\s*:/.test(json));

    // 2. mount: resolve → unseal recovers the exact child key
    const creds = await resolveRwCredentials(parent, REF);
    ok('resolve returns creds', !!creds);
    ok('unsealed vaultKey === original child full key', creds && creds.vaultKey === CHILD_KEY);
    ok('creds tagged custody=parent-held', creds && creds.custody === 'parent-held');
    ok('creds tagged access=rw', creds && creds.access === 'rw');

    // 3. a parent opened READ-ONLY (no write secret) cannot unseal — even reading the same file
    const roParent = makeFakeVault(false);
    // copy the sealed file into the ro parent's store so it "has" the record but no write secret
    roParent.folders = null;
    const roFake = makeFakeVault(true, PARENT_WK);      // reuse writable to seed, then strip secret
    await saveRwLink(roFake, REF, { vault_id: 'childvaultid01' }, CHILD_KEY);
    roFake._writeKey = null; roFake.writable = false;   // now simulate "reader reopened"
    const noCreds = await resolveRwCredentials(roFake, REF);
    ok('reader (no write secret) cannot resolve rw creds → null', noCreds === null);

    // 4. wrong parent (different write secret) cannot unseal the blob → throws (fail-closed)
    const otherParent = makeFakeVault(true, 'dead' + 'beef'.repeat(15));
    // seed otherParent with the SAME sealed blob produced under PARENT_WK
    await otherParent.createFolder('.vault'); await otherParent.createFolder('.vault/owner');
    await otherParent.addFile('.vault/owner', 'rw-links.json', raw);
    let threw = false;
    try { await resolveRwCredentials(otherParent, REF); } catch (_) { threw = true; }
    ok('wrong-parent unseal throws (cross-parent fail-closed)', threw);

    // 5. unknown ref → null (not an error)
    ok('unknown ref resolves to null', (await resolveRwCredentials(parent, 'nope')) === null);

    // 6. read-only parent at SEAL time refuses (cannot seal without a write secret)
    const roSeal = makeFakeVault(false);
    let sealThrew = false;
    try { await saveRwLink(roSeal, REF, { vault_id: 'x' }, CHILD_KEY); } catch (_) { sealThrew = true; }
    ok('sealing on a read-only parent throws', sealThrew);

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
