/* =================================================================================
   DeclaredMounts — pure helpers for owner-DECLARED sub-vault mounts  (07 Sep analysis §5)

   The vault owner already declares "this path is another vault" with `<name>.link.json`
   (a dumb pointer, no secret) plus an owner record. This module gives that declaration a
   second consumer: the TOP kernel, at boot, turns each link into an ordinary
   KernelParent.mount() before the app iframe exists — so the app writes `/data/x` and
   never learns that `data/` is another vault. No new manifest field; same table, gates,
   relay and child kernel as `sg.vault.mount` (one more CALLER, not a new path).

   Pure logic, no DOM: `scan` walks a file list with an injected byte reader, and
   `resolveCredentials` takes the credential SOURCES as functions so the ordering — the
   production replacement for the clinic.json trial stub — is unit-tested in isolation:

     1. owner-secret store   .vault/owner/secrets/<ref_id>   parent WRITE-key tier → full key → rw
     2. ro-links record      .vault/owner/ro-links.json     parent READ-key tier  → read cred → ro
     3. device-saved key     localStorage (VaultLinks)                            → full key → rw
     4. legacy               clinic.json trial stub (kept for the synthetic trial)

   Depends on globalThis.VaultLinks (vault-links.js). Exposed as globalThis.DeclaredMounts.
   ================================================================================= */

;(function () {
    'use strict';

    async function _try(fn) {
        try { return fn ? await fn() : null; } catch (_) { return null; }
    }

    const DeclaredMounts = {

        // scan(fileList, readBytes) → Promise<[{ prefix, ref, label, linkPath, vaultId }]>
        //   fileList  — the data source's flat list ({path, dir})
        //   readBytes — async (path) → bytes, used only for *.link.json entries
        // Malformed links, links without a ref_id and non-vault link types are skipped.
        // ONE mount per child per parent. Two links in the same parent pointing at the same
        // child (same vault_id, or same ref_id) would be two kernels sharing one clone
        // branch (viv:<parent>) — a self-inflicted divergence — and two folders that are
        // secretly the same vault. Deterministic: link paths are sorted and the FIRST wins;
        // later ones are returned with `duplicateOf` so the caller can report, not mount.
        async scan(fileList, readBytes) {
            const VL = globalThis.VaultLinks;
            if (!VL || !Array.isArray(fileList)) return [];
            const links = fileList.filter(e => e && !e.dir && VL.isLinkFile(e.path))
                                  .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
            const out = [], seenVault = new Map(), seenRef = new Map();
            for (const e of links) {
                const link = await _try(async () => VL.parseLinkFile(await readBytes(e.path)));
                if (!link || !link.ref_id) continue;
                const type = link.type || (link.vault_id ? 'vault' : null);
                if (type && type !== 'vault') continue;                    // external resources are not mounts
                const spec = {
                    prefix:   VL.mountPathFor(e.path),
                    ref:      String(link.ref_id),
                    label:    VL.mountLabel(e.path, link),
                    linkPath: e.path,
                    vaultId:  link.vault_id || null
                };
                const dup = (spec.vaultId && seenVault.get(spec.vaultId)) || seenRef.get(spec.ref) || null;
                if (dup) { spec.duplicateOf = dup; out.push(spec); continue; }
                if (spec.vaultId) seenVault.set(spec.vaultId, e.path);
                seenRef.set(spec.ref, e.path);
                out.push(spec);
            }
            return out;
        },

        // resolveCredentials(ref, vaultId, sources) → Promise<creds|null>
        //   creds = { vaultKey, accessToken, custody, access, source }
        //   sources = { ownerSecret(ref), roRecord(ref), storedKey(vaultId), legacy(ref) } — any may be absent/throw.
        async resolveCredentials(ref, vaultId, sources) {
            sources = sources || {};
            const sec = await _try(() => sources.ownerSecret && sources.ownerSecret(ref));
            if (sec && sec.key) {
                return { vaultKey: String(sec.key), accessToken: null, custody: 'parent-held', access: 'rw', source: 'owner-secret' };
            }
            const rec = await _try(() => sources.roRecord && sources.roRecord(ref));
            if (rec && rec.read_key) {
                const hex = DeclaredMounts.b64ToHex(rec.read_key);
                const vid = rec.vault_id || vaultId;
                if (hex && vid) {
                    // A READ credential in the shape the child kernel (and sgit) open read-only.
                    return { vaultKey: hex + ':' + vid, accessToken: null, custody: 'parent-held', access: 'ro', source: 'ro-links' };
                }
            }
            const stored = await _try(() => sources.storedKey && vaultId && sources.storedKey(vaultId));
            if (stored) {
                return { vaultKey: String(stored), accessToken: null, custody: 'user-entered', access: 'rw', source: 'device-key' };
            }
            const legacy = await _try(() => sources.legacy && sources.legacy(ref));
            if (legacy && legacy.vaultKey) {
                return Object.assign({ accessToken: null, custody: 'parent-held', access: 'rw', source: 'legacy-stub' }, legacy);
            }
            return null;
        },

        // base64 (32 bytes) → 64-hex, or null if it is not a 32-byte key
        b64ToHex(b64) {
            try {
                const bin = atob(String(b64));
                let hex = '';
                for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
                return hex.length === 64 ? hex : null;
            } catch (_) { return null; }
        }
    };

    globalThis.DeclaredMounts = DeclaredMounts;
})();
