/* =================================================================================
   SGraph App — rw Sub-Vault Credential Helpers (app-shell-rw-creds)

   Pure, DOM-free, crypto-free helpers extracted from app-shell.js so the rw
   credential GLUE can be unit-tested in Node against the SAME code app-shell runs
   (rather than a reimplementation). Loaded BEFORE app-shell.js in
   /en-gb/app/index.html; app-shell delegates to these from `_createChildVault`,
   `_saveRwLink`, and `_resolveRwCredentials`.

   These helpers carry real contracts, so they are pinned by tests:
     • buildChildFullKey  — the child key format MUST be `<passphrase>:<vaultId>`,
       i.e. exactly what SGVault.open() parses back. A change here silently breaks
       every rw mount.
     • writeSecretOf      — the read-only-parent GUARD. A parent opened read-only has
       no `_writeKey`; it must NOT be able to seal or unseal a child write key
       (security property — owner-secret tier, D1). Returns null in that case.
     • credsFromChildKey  — the shape the relay consumes for a writable mount:
       { vaultKey, accessToken, custody:'parent-held', access:'rw' }. `custody` and
       `access` are load-bearing downstream.
     • rwRecordBody       — the rw owner-record body. `sealed_key` is REQUIRED and a
       plaintext key field must never appear (VaultLinks.saveRwRecord also enforces
       this; we keep the shape here so callers can't drift).

   ── Rule history (so we don't regress) ──
   • 2026-06-01: extracted from app-shell inline glue. Found + fixed alongside: the
     parent app context (/en-gb/app/index.html) did not load vault-rw-seal.js, so
     `VaultRwSeal` was undefined and the whole rw path was dead in its own context.
   ================================================================================= */

(function () {
    'use strict';

    var AppRwCreds = {

        // Assemble a child vault's FULL key from its create-time passphrase + vault id.
        // MUST match SGVault.open()'s `<passphrase>:<vaultId>` parse. Pure.
        buildChildFullKey: function (passphrase, vaultId) {
            if (!passphrase || !vaultId) {
                throw new Error('buildChildFullKey: passphrase and vaultId required');
            }
            return passphrase + ':' + vaultId;
        },

        // The parent owner's write secret (hex), or null if the parent is read-only.
        // This is the seal/unseal GUARD: no write secret → cannot seal or unseal. Pure.
        writeSecretOf: function (vault) {
            return (vault && vault._writeKey) ? vault._writeKey : null;
        },

        // Shape the relay consumes for a writable child mount. Returns null when there
        // is no child key (e.g. unseal produced nothing). Pure.
        credsFromChildKey: function (childFullKey) {
            if (!childFullKey) return null;
            return {
                vaultKey:    childFullKey,
                accessToken: null,
                custody:     'parent-held',
                access:      'rw'
            };
        },

        // The rw owner-record body persisted in .vault/owner/rw-links.json. `sealedKey`
        // is REQUIRED (the caller seals the child key first); no plaintext key field is
        // ever included. Pure.
        rwRecordBody: function (meta, sealedKey) {
            if (!sealedKey) throw new Error('rwRecordBody: sealedKey required (seal the child key first)');
            meta = meta || {};
            return {
                vault_id:   meta.vault_id || null,
                label:      meta.label    || null,
                sealed_key: sealedKey
            };
        }
    };

    if (typeof globalThis !== 'undefined') globalThis.AppRwCreds = AppRwCreds;
    if (typeof window     !== 'undefined') window.AppRwCreds     = AppRwCreds;
})();
