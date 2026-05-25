/* =================================================================================
   SGraph Vault — Link-file convention reader (sub-vaults & external resources)
   v0.1.0 — Phase 0

   Recognises the `*.link.json` convention file in the regular vault tree and turns
   it into a "mount" the browser can render as an inline, expandable sub-vault folder
   (or, for external types, an embed launcher — later phase).

   A link file is DUMB and carries NO key — only:
     { vault_id?, ref_id, type?, label?, pin?, description?, url?, public_id? }
   The `.link.json` suffix is the sole signal; renaming off it makes the file a plain
   `.json` (a deliberate "disable" gesture, and why no secret may live here).

   Phase 0 key resolution is localStorage (the "save on this device" option) or a UI
   prompt. The `.vault/owner/{ro,rw}-links` owner records arrive in Phase 1.

   Pure logic, no DOM. Exposed as window.VaultLinks (browser) and module.exports (node).
   ================================================================================= */

const VaultLinks = {

    LINK_SUFFIX:          '.link.json',
    CHILD_KEY_LS_PREFIX:  'sg-child-vault-key:',   // localStorage: per-child-vault-id saved key
    DEFAULT_PIN:          { mode: 'latest' },

    // --- suffix recognition -----------------------------------------------------
    isLinkFile(path) {
        return typeof path === 'string' && /\.link\.json$/i.test(path);
    },

    // --- the virtual-folder mount path (link path without the suffix) -----------
    //     'subvaults/demos/acme-demo.link.json' → 'subvaults/demos/acme-demo'
    mountPathFor(linkPath) {
        return String(linkPath || '').replace(/\.link\.json$/i, '');
    },

    // --- display label: explicit link.label, else the filename prefix -----------
    mountLabel(linkPath, link) {
        if (link && link.label) return link.label;
        const base = String(linkPath || '').split('/').pop() || '';
        return base.replace(/\.link\.json$/i, '');
    },

    // --- parse bytes/string → normalised link object, or null if malformed ------
    //     Returns null (never throws) on bad JSON or a missing ref_id, so a
    //     malformed file is treated as an ordinary file.
    parseLinkFile(input) {
        let text;
        try {
            if (typeof input === 'string')              text = input;
            else if (input instanceof ArrayBuffer)      text = new TextDecoder().decode(new Uint8Array(input));
            else if (input && input.buffer !== undefined) text = new TextDecoder().decode(input);   // typed array
            else return null;
        } catch (_) { return null; }

        let obj;
        try { obj = JSON.parse(text); } catch (_) { return null; }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        if (!obj.ref_id || typeof obj.ref_id !== 'string')          return null;

        // type defaults to 'vault' when a vault_id is present (the common case)
        const type = obj.type || (obj.vault_id ? 'vault' : null);
        return {
            ref_id:      obj.ref_id,
            vault_id:    obj.vault_id    || null,
            type:        type,
            label:       obj.label       || null,
            pin:         obj.pin         || Object.assign({}, this.DEFAULT_PIN),
            description: obj.description  || null,
            url:         obj.url         || null,
            public_id:   obj.public_id   || null
        };
    },

    isVaultLink(link) {
        return !!link && (link.type === 'vault' || (!link.type && !!link.vault_id));
    },

    // --- Phase 0 key store: "save on this device" (localStorage) ----------------
    //     Real owner records (.vault/owner/ro-links|rw-links) arrive in Phase 1.
    getStoredChildKey(vaultId) {
        if (!vaultId) return null;
        try { return localStorage.getItem(this.CHILD_KEY_LS_PREFIX + vaultId) || null; }
        catch (_) { return null; }
    },
    setStoredChildKey(vaultId, key) {
        if (!vaultId) return;
        try {
            if (key) localStorage.setItem(this.CHILD_KEY_LS_PREFIX + vaultId, key);
            else     localStorage.removeItem(this.CHILD_KEY_LS_PREFIX + vaultId);
        } catch (_) {}
    }
};

if (typeof window !== 'undefined') window.VaultLinks = VaultLinks;
if (typeof module !== 'undefined' && module.exports) module.exports = { VaultLinks };
