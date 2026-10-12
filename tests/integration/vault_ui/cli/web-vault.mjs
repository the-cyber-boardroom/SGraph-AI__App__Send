/* web-vault.mjs — drive the REAL browser vault libraries from the command line, against a live
   SG/Send API, so a test can interleave them with the sgit-ai CLI on one vault.

   node tests/integration/vault_ui/cli/web-vault.mjs <cmd> --api URL --token T --signer FILE [--key K] …
     create  --name N [--file path=content]…          → {key, vaultId, head, keyId, branchId}
     put     --key K [--file path=content]… [--push]  → {head, published}
     inspect --key K                                  → {head, namedHead, format, minClient, features, tags, verify, files, branches, remoteHeadStatus}
     read    --key K --path P                         → file content (stdout)
     rebuild-tree --key K --path /folder              → {original, rebuilt}  (the web re-encrypts a CLI-written sub-tree: ids must match)

   The signer file persists a P-256 key pair (extractable here, non-extractable in the browser)
   so one "device" keeps its identity across invocations. No IndexedDB / localStorage in Node:
   the libraries fall back exactly as they do in a null-origin iframe. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadVaultLibs, sgSend, putFile, readFile, openAll } from '../../../e2e/vault_ui/fixtures/sg-vault-node.js';

const args = process.argv.slice(2);
const cmd  = args[0];
const opt  = (name, multi) => {
    const out = [];
    for (let i = 1; i < args.length; i++) if (args[i] === '--' + name) out.push(args[i + 1]);
    return multi ? out : out[0];
};
const api = { url: opt('api'), token: opt('token') };
loadVaultLibs();
const { SGVault, SGVaultSigner, SGVaultSigning, SGVaultCrypto } = globalThis;
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const un64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function signer() {
    const file = opt('signer');
    if (!file) return null;
    let rec;
    if (existsSync(file)) rec = JSON.parse(readFileSync(file, 'utf8'));
    else {
        const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        rec = { pkcs8: b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey)), spki: b64(await crypto.subtle.exportKey('spki', kp.publicKey)),
                branchId: 'branch-clone-' + SGVaultSigning.randomHex(8), keyId: 'key-rnd-imm-' + SGVaultSigning.randomHex(8), createdAt: Date.now() };
        writeFileSync(file, JSON.stringify(rec));
    }
    const priv = await crypto.subtle.importKey('pkcs8', un64(rec.pkcs8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const pub  = await crypto.subtle.importKey('spki',  un64(rec.spki),  { name: 'ECDSA', namedCurve: 'P-256' }, true,  ['verify']);
    return SGVaultSigner.fromKeyPair(priv, pub, { branchId: rec.branchId, keyId: rec.keyId, createdAt: rec.createdAt });
}
const files = () => opt('file', true).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; });
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };

(async () => {
    const sg = sgSend(api);
    if (cmd === 'create') {
        const s = await signer();
        const v = await SGVault.create(sg, opt('passphrase') || ('web-' + SGVaultSigning.randomHex(6)), { name: opt('name') || 'cli-parity', signer: s });
        for (const [p, c] of files()) await putFile(v, p, new TextEncoder().encode(c));
        await v.push();
        out({ key: v.getVaultKey(), vaultId: v._vaultId, head: v._headCommitId, keyId: s && s.keyId, branchId: s && s.branchId, cloneRef: v._cloneRefFileId });
    } else if (cmd === 'put') {
        const s = await signer();
        const { vault: v } = await openAll(api, opt('key'), { signer: s });
        for (const [p, c] of files()) await putFile(v, p, new TextEncoder().encode(c));
        let published = false, error = null;
        if (opt('push') !== undefined || args.includes('--push')) { try { await v.push(); published = true; } catch (e) { error = { code: e.code, message: e.message }; } }
        out({ head: v._headCommitId, namedHead: v._namedHeadId, published, error, registerError: v._lastRegisterError ? String(v._lastRegisterError.message) : null });
    } else if (cmd === 'inspect') {
        const s = await signer();
        const { vault: v, ds } = await openAll(api, opt('key'), { signer: s });
        const verify = await v.verifyChain(v._namedHeadId || v._headCommitId);
        const list = [];
        const walk = (path) => { for (const e of v.listFolder(path) || []) { const p = (path === '/' ? '' : path) + '/' + e.name; if (e.type === 'folder') walk(p); else list.push({ path: p, size: e.size, content_type: e.content_type, blob_id: e.blob_id }); } };
        walk('/');
        out({ head: v._headCommitId, namedHead: v._namedHeadId, format: v.format, idHexLen: v._objectStore.idHexLen, minClient: v.minClient, features: v.features, tags: v.getTags(),
              verify: { total: verify.total, counts: verify.counts, firstFailure: verify.firstFailure }, files: list, remoteHeadStatus: v.remoteHeadStatus,
              branches: (v._branchIndex && v._branchIndex.branches || []).map(b => ({ branch_id: b.branch_id, name: b.name, branch_type: b.branch_type, public_key_id: b.public_key_id || null })) });
    } else if (cmd === 'read') {
        const { vault: v } = await openAll(api, opt('key'), { signer: null });
        process.stdout.write(new TextDecoder().decode(await readFile(v, opt('path'))));
    } else if (cmd === 'rebuild-tree') {
        const s = await signer();
        const { vault: v } = await openAll(api, opt('key'), { signer: s });
        const path = opt('path');
        const node = v._findNode(path);
        // the id the CLI wrote for this folder (from the parent's entry)
        const parentPath = path.slice(0, path.lastIndexOf('/')) || '/';
        const parent = v._findNode(parentPath); const name = path.slice(path.lastIndexOf('/') + 1);
        const original = node._cleanTreeId || node._tree_id || null;
        if (v.needsLoading(path)) await v.loadSubTreeOnDemand(path);
        const entries = await v._buildTreeEntries(v._findNode(path));
        const rebuilt = await v._commitManager.createTree(entries);
        out({ path, original: v._findNode(path)._cleanTreeId || original, rebuilt, entries: entries.map(e => ({ name: e.name, content_type: e.content_type || null, large: !!e.large })) });
    } else {
        console.error('unknown command ' + cmd); process.exit(2);
    }
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
