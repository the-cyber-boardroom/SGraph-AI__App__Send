/* =================================================================================
   sg-vault-node.js — run the REAL browser vault libraries inside Node.

   loadVaultLibs()   sources sg-send / sg-vault / vault-links / owner-secrets / kernel
                     handlers into this V8 context (Node's WebCrypto backs crypto.subtle,
                     Node's fetch talks to the real API server). Idempotent.
   seedDeclaredMounts(api, opts)
                     creates a CHILD vault and a PARENT vault whose app writes through a
                     declared mount (`data.link.json` + owner secret + ro-links record),
                     exactly the files the App UI's "create sub-vault + link" flow writes.

   Nothing here is a stub: the bytes these helpers put on the server are what the browser
   and the sgit CLI read back.
   ================================================================================= */

import { readFileSync }     from 'node:fs';
import path                 from 'node:path';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_ROOT   = path.resolve(__dirname, '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js');

const LIB_FILES = [
    'lib/sg-send/sg-send-crypto.js',
    'lib/sg-send/sg-send.js',
    'lib/sg-vault/sg-vault-crypto.js',
    'lib/sg-vault/sg-vault-object-store.js',
    'lib/sg-vault/sg-vault-ref-manager.js',
    'lib/sg-vault/sg-vault-commit.js',
    'lib/sg-vault/sg-vault.js',
    'lib/sg-vault/sg-vault--file-ops.js',
    'lib/sg-vault/sg-vault--folder-ops.js',
    'lib/sg-vault/sg-vault--sync.js',
    'lib/sg-vault/sg-vault--history.js',
    'lib/sg-vault/sg-vault--branches.js',
    'lib/sg-vault/sg-vault-owner-secrets.js',
    'lib/links/vault-links.js',
    'adapters/vault-data-source.js',
    'components/app-shell/app-permissions.js',
    'components/app-shell/kernel-app-handlers.js'
];
const GLOBALS = ['SGSend', 'SGSendCrypto', 'SGVault', 'SGVaultCrypto', 'SGVaultObjectStore',
                 'SGVaultRefManager', 'SGVaultCommit', 'VaultLinks', 'VaultDataSource'];

let _loaded = false;
export function loadVaultLibs() {
    if (_loaded) return globalThis;
    globalThis.window = globalThis.window || globalThis;
    globalThis.self   = globalThis.self   || globalThis;
    // VaultDataSource pokes the HUD banner via document.querySelector on saves (no-op when absent).
    if (typeof globalThis.document === 'undefined') globalThis.document = { querySelector() { return null; } };
    for (const f of LIB_FILES) {
        runInThisContext(readFileSync(path.join(JS_ROOT, f), 'utf8'), { filename: f, displayErrors: true });
    }
    for (const n of GLOBALS) { try { runInThisContext('globalThis.' + n + ' = ' + n + ';'); } catch (_) {} }
    _loaded = true;
    return globalThis;
}

export const enc = (s) => new TextEncoder().encode(s);
export const dec = (b) => new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b));
export const json = (o) => enc(JSON.stringify(o, null, 2));

export function randomWord(prefix) {
    return prefix + '-' + Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sgSend(api) {
    loadVaultLibs();
    return new SGSend({ endpoint: api.url, token: api.token });
}

// Ensure a nested folder exists, creating each level (SGVault.createFolder is one level).
export async function ensureFolder(vault, folderPath) {
    const parts = folderPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    let cur = '';
    for (const p of parts) {
        const next = cur + '/' + p;
        if (vault.needsLoading && vault.needsLoading(cur || '/')) await vault.loadSubTreeOnDemand(cur || '/');
        if (!vault.listFolder(next)) await vault.createFolder(next);
        cur = next;
    }
}

export async function putFile(vault, filePath, bytes) {
    const slash  = filePath.lastIndexOf('/');
    const folder = slash > 0 ? filePath.slice(0, slash) : '/';
    const name   = filePath.slice(slash + 1);
    if (folder !== '/') await ensureFolder(vault, folder);
    if (vault.needsLoading && vault.needsLoading(folder)) await vault.loadSubTreeOnDemand(folder);   // lazy folder: never write into empty children
    const exists = (vault.listFolder(folder) || []).some((e) => e.name === name);
    if (exists) await vault.updateFile(folder, name, bytes); else await vault.addFile(folder, name, bytes);
}

export async function readFile(vault, filePath) {
    const slash  = filePath.lastIndexOf('/');
    const folder = slash > 0 ? filePath.slice(0, slash) : '/';
    const name   = filePath.slice(slash + 1);
    if (folder !== '/' && vault.needsLoading && vault.needsLoading(folder)) await vault.loadSubTreeOnDemand(folder);
    return vault.getFile(folder, name);
}

// Full (rw) key and the read-only credential (format 6: <read_key hex>:<vault_id>) of a vault.
export async function credentialsOf(vault) {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', vault._readKey));
    const hex = Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join('');
    const b64 = btoa(String.fromCharCode.apply(null, raw));
    return { key: vault.getVaultKey(), readKeyHex: hex, readKeyB64: b64, readCredential: hex + ':' + vault._vaultId, vaultId: vault._vaultId, refFileId: vault._refFileId };
}

// Open the whole tree (all lazy sub-folders) so listings are complete.
export async function openAll(api, key, opts) {
    const sg = sgSend(api);
    const v  = await SGVault.open(sg, SGVaultCrypto.stripKeyPrefix(key), opts || {});
    const ds = new VaultDataSource(v, api.token);
    await ds.loadAllSubTrees();
    return { vault: v, ds, sg };
}

export async function openReadOnlyAll(api, readCredential) {
    const sg    = sgSend(api);
    const creds = SGVaultCrypto.parseReadOnlyCredential(readCredential);
    const ro    = await SGVaultCrypto.deriveReadOnlyCreds(creds.vaultId, creds.readKeyHex);
    const v     = await SGVault.openReadOnly(sg, creds.vaultId, ro.readKeyB64, ro.refFileId);
    const ds    = new VaultDataSource(v, null);
    await ds.loadAllSubTrees();
    return { vault: v, ds, sg };
}

/* ---------------------------------------------------------------------------------
   seedDeclaredMounts(api, { appHtml, childFiles?, parentFiles?, childName?, parentName? })
   → { child: {key, vaultId, refFileId, readCredential, ...}, parent: {...}, ref, linkPath }

   CHILD  ("Clinic Data"):  .vault/app.json  grants fs read/write/delete/mkdir (the child's
                            OWN policy — the second gate), .vault/access-token.json so the
                            child kernel is writable, plus seed records.
   PARENT ("Clinic App"):   .vault/app.json  entry index.html, fs.write ['data/'];
                            index.html       the app under test (writes /data/…);
                            data.link.json   { vault_id, ref_id, label }  → mount prefix data/;
                            .vault/owner/secrets/<ref>.json  sealed child key (owner tier);
                            .vault/owner/ro-links.json       read-tier record (RO parents);
                            .vault/access-token.json         parent writable on open.
   --------------------------------------------------------------------------------- */
export async function seedDeclaredMounts(api, opts) {
    loadVaultLibs();
    opts = opts || {};
    const sg = sgSend(api);

    // ── child ────────────────────────────────────────────────────────────────────
    const child = await SGVault.create(sg, randomWord('child'), { name: opts.childName || 'Clinic Data' });
    await putFile(child, '/.vault/app.json', json({
        title: opts.childName || 'Clinic Data',
        permissions: { fs: { read: true, write: true, delete: true, mkdir: true } }
    }));
    await putFile(child, '/.vault/access-token.json', json({ token: api.token }));
    const childFiles = opts.childFiles || { '/records/seed.json': json([{ id: 1, patient: 'A. Example', note: 'seeded by test' }]) };
    for (const [p, b] of Object.entries(childFiles)) await putFile(child, p, b);
    await child.push();
    const childCreds = await credentialsOf(child);

    // ── parent ───────────────────────────────────────────────────────────────────
    const parent = await SGVault.create(sg, randomWord('parent'), { name: opts.parentName || 'Clinic App' });
    const ref    = 'lk-' + randomWord('e2e').slice(4);
    const label  = opts.childName || 'Clinic Data';
    await putFile(parent, '/.vault/app.json', json({
        title: opts.parentName || 'Clinic App',
        entry: 'index.html',
        permissions: { fs: { read: true, write: ['data/'], delete: ['data/'], mkdir: ['data/'] } }
    }));
    await putFile(parent, '/.vault/access-token.json', json({ token: api.token }));
    await putFile(parent, '/index.html', enc(opts.appHtml || '<!doctype html><title>app</title>'));
    const linkPath = 'data.link.json';
    await putFile(parent, '/' + linkPath, json({ vault_id: childCreds.vaultId, ref_id: ref, label }));
    // owner secret (write-key tier): what makes the mount READ-WRITE for the owner
    const ownerKey = await SGVaultOwnerSecrets.deriveKey(parent.writeKeyHex);
    const sealed   = await SGVaultOwnerSecrets.seal(ownerKey, { vault_id: childCreds.vaultId, key: childCreds.key, label, created: Date.now() });
    await putFile(parent, '/.vault/owner/secrets/' + ref + '.json', json(sealed));
    // ro-links record (read-key tier): what a read-only parent session falls back to
    await putFile(parent, '/.vault/owner/ro-links.json', json({
        [ref]: { type: 'vault', label, pin: { mode: 'latest' }, vault_id: childCreds.vaultId, read_key: childCreds.readKeyB64, ref_file_id: childCreds.refFileId }
    }));
    for (const [p, b] of Object.entries(opts.parentFiles || {})) await putFile(parent, p, b);
    await parent.push();
    const parentCreds = await credentialsOf(parent);

    return { child: childCreds, parent: parentCreds, ref, linkPath, label };
}
