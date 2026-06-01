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
   prompt. The `.vault/owner/ro-links.json` owner record (read_key tier) and the
   `.vault/owner/rw-links.json` owner record (child FULL key, sealed by the caller with
   the parent owner's write secret) are both handled here. This module is KEY-BLIND for
   the rw tier: it persists/returns the opaque sealed blob and never seals/unseals.

   Pure logic, no DOM. Exposed as window.VaultLinks (browser) and module.exports (node).
   ================================================================================= */

const VaultLinks = {

    LINK_SUFFIX:          '.link.json',
    CHILD_KEY_LS_PREFIX:  'sg-child-vault-key:',   // localStorage: per-child-vault-id saved key
    DEFAULT_PIN:          { mode: 'latest' },
    OWNER_FOLDER:         '.vault/owner',          // single owner-metadata root
    RO_LINKS_FILE:        'ro-links.json',         // read_key tier (readable by parent readers)
    RW_LINKS_FILE:        'rw-links.json',         // owner tier: child FULL key, sealed with the
                                                   // parent's WRITE secret. The file is a normal
                                                   // vault file (so the parent's read_key already
                                                   // encrypts it at rest), but the per-record
                                                   // `sealed_key` is ADDITIONALLY sealed by the
                                                   // caller with the parent owner's write secret —
                                                   // so a parent READER can open the file yet still
                                                   // cannot recover a child full key. This module
                                                   // never sees a plaintext child key: seal/unseal
                                                   // happen in the caller (see app-shell). Accepted
                                                   // risk per the 05/31 rw-sub-vaults scoping (D1):
                                                   // managing a child fully from its parent REQUIRES
                                                   // the parent to hold the child's writable key.

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

    // is this link an external resource (not a vault)?
    isResourceLink(link) {
        return !!link && !this.isVaultLink(link) && (!!link.url || ['link', 'video', 'image', 'app'].indexOf(link.type) !== -1);
    },

    // --- URL → resource type/provider (for Add UI + resource links w/o explicit type) ---
    detectResourceType(url) {
        const u = String(url || '').toLowerCase().trim();
        if (!u) return { type: 'link', provider: null };
        if (/(?:youtube\.com|youtu\.be)\//.test(u))                    return { type: 'video', provider: 'youtube' };
        if (/vimeo\.com\//.test(u))                                    return { type: 'video', provider: 'vimeo' };
        if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#]|$)/.test(u))    return { type: 'image', provider: null };
        if (/\.(mp4|webm|ogv|mov|m4v)(?:[?#]|$)/.test(u))              return { type: 'video', provider: null };
        return { type: 'link', provider: null };
    },

    // --- Add-link honesty: how a linked vault will actually mount -----------------
    //     The add-link flow opens the pasted key, derives the READ key, and mounts the
    //     sub-vault READ-ONLY (the composite/tree splice is read-only today; rw-in-tree
    //     is gated on M2/M3). If the pasted key was write-capable, the write capability
    //     is intentionally NOT stored. Surface that plainly instead of downgrading
    //     silently. `opts.writable` is the opened child's `.writable` (truthy = a write
    //     key was derived). `opts.portable` true = saved as an ro-record that opens on
    //     any device; false = this-device fallback. Returns { mode, writeKeyStored,
    //     hint, result } — `hint` is the static form caption, `result` the success line.
    addLinkDisclosure(opts) {
        const o          = opts || {};
        const writable   = !!o.writable;
        const portable   = !!o.portable;
        const label      = o.label ? String(o.label) : 'vault';
        const where      = portable ? 'opens on any device' : 'saved on this device';
        const hint = writable
            ? 'Opens read-only. You pasted a write-capable key — only read access is kept; the write key is not stored.'
            : 'Opens read-only. Validated + saved; the write key is not stored.';
        const result = writable
            ? 'Linked "' + label + '" read-only (' + where + ') — write key not stored'
            : 'Linked "' + label + '" (' + where + ')';
        return { mode: 'read-only', writeKeyStored: false, hint: hint, result: result };
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
    },

    // --- Owner records: .vault/owner/rw-links.json (owner-secret tier) -----------
    //     A map { <ref_id>: { vault_id, label?, sealed_key, ref_file_id? } } where
    //     `sealed_key` is the child's FULL key already sealed by the CALLER with the
    //     parent owner's write secret (this module is key-blind — it persists and
    //     returns the opaque blob, never plaintext). Same on-disk shape and merge
    //     semantics as ro-links; different filename + payload field. Writing requires a
    //     writable (owner) parent vault and pushes to the server.

    async loadRwLinks(vault) {
        if (!vault) return {};
        try {
            if (vault.needsLoading && vault.needsLoading('/' + this.OWNER_FOLDER)) {
                await vault.loadSubTreeOnDemand('/' + this.OWNER_FOLDER);
            }
        } catch (_) { /* folder absent — fine */ }
        try {
            const buf = await vault.getFile(this.OWNER_FOLDER, this.RW_LINKS_FILE);
            const obj = JSON.parse(new TextDecoder().decode(buf));
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
        } catch (_) { return {}; }
    },

    // resolve a ref_id → its rw record (or null). Caller must unseal `sealed_key`.
    async resolveRwRef(vault, refId) {
        if (!vault || !refId) return null;
        const rw = await this.loadRwLinks(vault);
        return rw[refId] || null;
    },

    // write/replace one rw record. `record.sealed_key` MUST already be sealed by the
    // caller; this method rejects a record that carries an obvious plaintext key field
    // so a key never lands here unsealed by mistake.
    async saveRwRecord(vault, refId, record) {
        if (!vault || !vault.writable) throw new Error('Read-only: cannot save a link record');
        if (!refId)                    throw new Error('saveRwRecord: refId required');
        if (!record || !record.sealed_key) throw new Error('saveRwRecord: record.sealed_key required (caller must seal the child key)');
        if (record.key || record.full_key || record.vault_key) {
            throw new Error('saveRwRecord: refusing a plaintext key field — only sealed_key may be stored');
        }
        await this._ensureOwnerFolder(vault);
        const rw = await this.loadRwLinks(vault);
        rw[refId] = record;
        const bytes  = new TextEncoder().encode(JSON.stringify(rw, null, 2));
        const exists = (vault.listFolder('/' + this.OWNER_FOLDER) || []).some(e => e.name === this.RW_LINKS_FILE);
        if (exists) await vault.updateFile('/' + this.OWNER_FOLDER, this.RW_LINKS_FILE, bytes);
        else        await vault.addFile('/' + this.OWNER_FOLDER, this.RW_LINKS_FILE, bytes);
        if (typeof vault.push === 'function') { try { await vault.push(); } catch (_) {} }
        return rw;
    },

    // remove one rw record (revoke parent's writable custody of a child). Idempotent.
    async deleteRwRecord(vault, refId) {
        if (!vault || !vault.writable) throw new Error('Read-only: cannot delete a link record');
        if (!refId) throw new Error('deleteRwRecord: refId required');
        const rw = await this.loadRwLinks(vault);
        if (!(refId in rw)) return rw;
        delete rw[refId];
        await this._ensureOwnerFolder(vault);
        const bytes = new TextEncoder().encode(JSON.stringify(rw, null, 2));
        await vault.updateFile('/' + this.OWNER_FOLDER, this.RW_LINKS_FILE, bytes);
        if (typeof vault.push === 'function') { try { await vault.push(); } catch (_) {} }
        return rw;
    }
};

if (typeof window !== 'undefined') window.VaultLinks = VaultLinks;
if (typeof module !== 'undefined' && module.exports) module.exports = { VaultLinks };
