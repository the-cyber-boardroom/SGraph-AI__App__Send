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
    OWNER_FOLDER:         '.vault/owner',          // single owner-metadata root
    RO_LINKS_FILE:        'ro-links.json',         // read_key tier (readable by parent readers)
    // NB: rw-links.json (owner-only, double-encrypted full keys) is deferred until writable
    // sub-vaults land — v1 opens children read-only, so only ro-links is needed.

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
    },

    // --- Owner records: .vault/owner/ro-links.json (read_key tier) --------------
    //     A map { <ref_id>: { type, label, pin, description, url, vault_id,
    //                         read_key (b64), ref_file_id } }. read_key tier means it's a
    //     normal vault file (vault.addFile encrypts with read_key) → readable by any holder
    //     of parent read access. Mirrors vault-token-manager's readonly-tokens.json.

    async loadRoLinks(vault) {
        if (!vault) return {};
        try {
            if (vault.needsLoading && vault.needsLoading('/' + this.OWNER_FOLDER)) {
                await vault.loadSubTreeOnDemand('/' + this.OWNER_FOLDER);
            }
        } catch (_) { /* folder absent — fine */ }
        try {
            const buf = await vault.getFile(this.OWNER_FOLDER, this.RO_LINKS_FILE);
            const obj = JSON.parse(new TextDecoder().decode(buf));
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
        } catch (_) { return {}; }
    },

    // resolve a ref_id → its ro record (or null)
    async resolveRef(vault, refId) {
        if (!vault || !refId) return null;
        const ro = await this.loadRoLinks(vault);
        return ro[refId] || null;
    },

    // effective field value = link-file override ?? owner-record value
    effectiveLink(linkObj, record) {
        const l = linkObj || {}, r = record || {};
        return {
            type:        l.type        || r.type        || (l.vault_id || r.vault_id ? 'vault' : null),
            label:       l.label       || r.label       || null,
            pin:         l.pin         || r.pin          || Object.assign({}, this.DEFAULT_PIN),
            description: l.description  || r.description || null,
            url:         l.url         || r.url          || null,
            public_id:   l.public_id   || r.public_id    || null,
            vault_id:    l.vault_id    || r.vault_id      || null,
            // key material comes ONLY from the owner record, never the link file
            read_key:    r.read_key    || null,
            ref_file_id: r.ref_file_id || null
        };
    },

    async _ensureOwnerFolder(vault) {
        const parts = this.OWNER_FOLDER.split('/');   // ['.vault','owner']
        let cur = '';
        for (const part of parts) {
            const next = cur ? cur + '/' + part : part;
            if (!vault.listFolder('/' + next)) {
                try { await vault.createFolder('/' + next); } catch (_) { /* race / exists */ }
            }
            cur = next;
        }
    },

    // write/replace one record; requires a writable (owner) vault. Pushes to the server.
    async saveRoRecord(vault, refId, record) {
        if (!vault || !vault.writable) throw new Error('Read-only: cannot save a link record');
        if (!refId) throw new Error('saveRoRecord: refId required');
        await this._ensureOwnerFolder(vault);
        const ro = await this.loadRoLinks(vault);
        ro[refId] = record;
        const bytes  = new TextEncoder().encode(JSON.stringify(ro, null, 2));
        const exists = (vault.listFolder('/' + this.OWNER_FOLDER) || []).some(e => e.name === this.RO_LINKS_FILE);
        if (exists) await vault.updateFile('/' + this.OWNER_FOLDER, this.RO_LINKS_FILE, bytes);
        else        await vault.addFile('/' + this.OWNER_FOLDER, this.RO_LINKS_FILE, bytes);
        if (typeof vault.push === 'function') { try { await vault.push(); } catch (_) {} }
        return ro;
    }
};

if (typeof window !== 'undefined') window.VaultLinks = VaultLinks;
if (typeof module !== 'undefined' && module.exports) module.exports = { VaultLinks };
