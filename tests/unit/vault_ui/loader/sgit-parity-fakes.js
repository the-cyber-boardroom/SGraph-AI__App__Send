/* Shared fakes for the sgit-parity suites: the REAL browser vault libraries on top of an
   in-memory SG/Send server that reproduces Service__Vault__Pointer's semantics —
   write / read / delete, batch read, write-if-match with {status:'conflict', current}
   INSIDE HTTP 200, the batch stopping at the first conflict, and prefix listing.

   Also installs a localStorage shim (accepted-head records) and an `indexedDB`-free
   environment (so SGVault asks for an explicit signer via options.signer). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
export function load(rel, expose) {
    runInThisContext(readFileSync(fileURLToPath(new URL(BASE + rel, import.meta.url)), 'utf8'), { filename: rel, displayErrors: true });
    if (expose) runInThisContext(`globalThis.${expose}=${expose};`);
}

export function loadVaultLibs() {
    if (globalThis.__sgVaultLibsLoaded) return globalThis;
    load('lib/sg-send/sg-send-crypto.js',         'SGSendCrypto');
    load('lib/sg-send/sg-send.js',                'SGSend');
    load('lib/sg-vault/sg-vault-crypto.js',       'SGVaultCrypto');
    load('lib/sg-vault/sg-vault-interop.js');
    load('lib/sg-vault/sg-vault-object-store.js', 'SGVaultObjectStore');
    load('lib/sg-vault/sg-vault-ref-manager.js',  'SGVaultRefManager');
    load('lib/sg-vault/sg-vault-commit.js',       'SGVaultCommit');
    load('lib/sg-vault/sg-vault.js',              'SGVault');
    load('lib/sg-vault/sg-vault--file-ops.js');
    load('lib/sg-vault/sg-vault--folder-ops.js');
    load('lib/sg-vault/sg-vault--sync.js');
    load('lib/sg-vault/sg-vault--history.js');
    load('lib/sg-vault/sg-vault--branches.js');
    globalThis.__sgVaultLibsLoaded = true;
    return globalThis;
}

// The object store's in-memory immutable-block cache is module-level (shared by every store
// in the process). Tests that count server reads must empty it between "devices".
export function clearMemCache() { runInThisContext('SG_MEM_CACHE.clear(); SG_MEM_BYTES = 0;'); }

// --- localStorage shim (per process; tests may reset it) -------------------------------
export function installLocalStorage() {
    const m = new Map();
    globalThis.localStorage = {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        clear: () => m.clear(),
        _map: m
    };
    return globalThis.localStorage;
}

const b64  = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const un64 = (s)  => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// --- In-memory server ------------------------------------------------------------------
export class FakeServer {
    constructor() { this.files = new Map(); this.log = []; }
    key(vaultId, fileId) { return vaultId + '/' + fileId; }
    get(vaultId, fileId) { return this.files.get(this.key(vaultId, fileId)) || null; }
    put(vaultId, fileId, bytes) { this.files.set(this.key(vaultId, fileId), new Uint8Array(bytes)); }
    del(vaultId, fileId) { this.files.delete(this.key(vaultId, fileId)); }
    list(vaultId, prefix) {
        const out = [];
        for (const k of this.files.keys()) if (k.startsWith(vaultId + '/' + (prefix || ''))) out.push(k.slice(vaultId.length + 1));
        return out;
    }
    // Service__Vault__Pointer.batch: ordered, best-effort, STOPS at the first CAS conflict
    batch(vaultId, ops) {
        const results = [];
        for (const op of ops) {
            this.log.push(op.op + ' ' + op.file_id);
            if (op.op === 'read') {
                const cur = this.get(vaultId, op.file_id);
                results.push(cur ? { op: 'read', file_id: op.file_id, status: 'ok', data: b64(cur) } : { op: 'read', file_id: op.file_id, status: 'not_found' });
            } else if (op.op === 'write') {
                this.put(vaultId, op.file_id, un64(op.data));
                results.push({ op: 'write', file_id: op.file_id, status: 'ok' });
            } else if (op.op === 'write-if-match') {
                const cur = this.get(vaultId, op.file_id), exp = op.match ? un64(op.match) : null;
                const ok  = (cur === null && exp === null) || (cur && exp && same(cur, exp));
                if (ok) { this.put(vaultId, op.file_id, un64(op.data)); results.push({ op: 'write-if-match', file_id: op.file_id, status: 'ok' }); }
                else { results.push({ op: 'write-if-match', file_id: op.file_id, status: 'conflict', current: cur ? b64(cur) : null }); break; }
            } else if (op.op === 'delete') {
                this.del(vaultId, op.file_id); results.push({ op: 'delete', file_id: op.file_id, status: 'ok' });
            }
        }
        return results;
    }
}

// --- SGSend over the fake server (the real class; only the network methods replaced) ----
export function makeFakeSgSend(server) {
    const SGSend = globalThis.SGSend;
    const sg = new SGSend({ endpoint: 'https://fake.test', token: 'tok' });
    sg._server = server;
    sg.vaultWrite = async (vaultId, fileId, writeKey, data) => { server.log.push('PUT ' + fileId); server.put(vaultId, fileId, data instanceof ArrayBuffer ? new Uint8Array(data) : data); return { ok: true }; };
    sg.vaultRead  = async (vaultId, fileId) => { const b = server.get(vaultId, fileId); return b ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : null; };
    sg.vaultReadLarge = sg.vaultRead;
    sg.vaultDelete = async (vaultId, fileId) => { server.del(vaultId, fileId); return { ok: true }; };
    sg.vaultBatch = async (vaultId, writeKey, ops) => server.batch(vaultId, ops);
    sg.vaultList  = async (vaultId, prefix) => server.list(vaultId, prefix);
    return sg;
}

// --- Signers from fresh key pairs (no IndexedDB in Node) ------------------------------
export async function makeSigner(label) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    return globalThis.SGVaultSigner.fromKeyPair(kp.privateKey, kp.publicKey, { branchId: 'branch-clone-' + label.padEnd(16, '0').slice(0, 16) });
}

// --- Decrypt a server file under a vault's read key (to inspect what was written) -----
export async function readJson(vault, fileId) {
    const raw = await vault._sgSend.vaultRead(vault._vaultId, fileId);
    if (!raw) return null;
    return JSON.parse(new TextDecoder().decode(await globalThis.SGSendCrypto.decrypt(raw, vault._readKey)));
}
