/* =================================================================================
   VaultLoader — Storage Abstraction
   Single source of truth for all localStorage / sessionStorage keys used by the
   vault loader. Emits events on mutation via the existing EventBus.

   localStorage keys:
     sg-vault-key            — LAST-opened vault credential (fallback for a fresh tab only)
     sg-vault-access-key-saved — durable server access token (shared across tabs — intended)
     sg-vault-recent         — unified recent-vaults list (JSON)
     sg-vault-recent:migrated-at — migration timestamp guard

   sessionStorage keys:
     sg-vault-key            — THIS TAB's vault credential (per-tab source of truth)
     sg-vault-access-key     — active-session server access token
     sg-vault-endpoint       — API endpoint override
     sg-vault-creating       — flag: this vault is being created (not opened)

   Per-tab vault identity: the vault KEY is per-tab (sessionStorage), so opening a second
   vault in a new tab does not change the first tab's vault on reload, and closing a tab is a
   no-op for the others. localStorage holds only the LAST-opened key as a convenience fallback
   for a brand-new tab. The ACCESS TOKEN, by contrast, is intentionally shared across tabs
   (localStorage `-saved` copy) — it is the server write gate, not the encryption key.

   Load order: after vault-loader-events.js.
   ================================================================================= */

;(function () {
    'use strict';

    var DEFAULT_ENDPOINT = 'https://dev.send.sgraph.ai';

    function _emit(name, detail) {
        if (globalThis.sgraphVault && globalThis.sgraphVault.events) {
            globalThis.sgraphVault.events.emit(name, detail);
        }
    }

    globalThis.VaultLoaderStorage = {

        // --- Current vault key (per-tab: sessionStorage first, localStorage fallback) ---
        // The vault KEY is per-tab. setCurrentKey writes BOTH sessionStorage (this tab's truth)
        // and localStorage (last-opened, so a brand-new tab can restore the most recent vault).
        // getCurrentKey prefers this tab's sessionStorage so tabs never clobber each other.

        getCurrentKey: function () {
            try {
                return sessionStorage.getItem('sg-vault-key')
                    || localStorage.getItem('sg-vault-key')
                    || null;
            } catch (_) { return null; }
        },

        setCurrentKey: function (key) {
            try {
                sessionStorage.setItem('sg-vault-key', key);   // this tab
                localStorage.setItem('sg-vault-key', key);      // last-opened fallback
            } catch (_) {}
            _emit(VaultLoaderEvents.VAULT_KEY_SET, { key: key });
        },

        clearCurrentKey: function () {
            try {
                sessionStorage.removeItem('sg-vault-key');
                localStorage.removeItem('sg-vault-key');
            } catch (_) {}
            _emit(VaultLoaderEvents.VAULT_KEY_CLEARED, {});
        },

        // --- Server access token (sessionStorage + localStorage fallback) ----------
        // sessionStorage holds the active-session token; localStorage holds a
        // durable copy so the key survives tab close / new-session restore.

        getAccessKey: function () {
            try {
                return sessionStorage.getItem('sg-vault-access-key')
                    || localStorage.getItem('sg-vault-access-key-saved')
                    || null;
            } catch (_) { return null; }
        },

        setAccessKey: function (key) {
            try {
                if (key) {
                    sessionStorage.setItem('sg-vault-access-key', key);
                    localStorage.setItem('sg-vault-access-key-saved', key);
                } else {
                    sessionStorage.removeItem('sg-vault-access-key');
                    localStorage.removeItem('sg-vault-access-key-saved');
                }
            } catch (_) {}
        },

        clearAccessKey: function () {
            try {
                sessionStorage.removeItem('sg-vault-access-key');
                localStorage.removeItem('sg-vault-access-key-saved');
            } catch (_) {}
        },

        // --- API endpoint (sessionStorage) -----------------------------------------

        getEndpoint: function () {
            try { return sessionStorage.getItem('sg-vault-endpoint') || DEFAULT_ENDPOINT; }
            catch (_) { return DEFAULT_ENDPOINT; }
        },

        setEndpoint: function (url) {
            try {
                if (url) { sessionStorage.setItem('sg-vault-endpoint', url); }
                else      { sessionStorage.removeItem('sg-vault-endpoint'); }
            } catch (_) {}
        },

        // --- Create-new-vault flag (sessionStorage) --------------------------------

        getCreatingFlag: function () {
            try { return sessionStorage.getItem('sg-vault-creating'); } catch (_) { return null; }
        },

        setCreatingFlag: function (key) {
            try { sessionStorage.setItem('sg-vault-creating', key); } catch (_) {}
        },

        clearCreatingFlag: function () {
            try { sessionStorage.removeItem('sg-vault-creating'); } catch (_) {}
        }
    };
}());
