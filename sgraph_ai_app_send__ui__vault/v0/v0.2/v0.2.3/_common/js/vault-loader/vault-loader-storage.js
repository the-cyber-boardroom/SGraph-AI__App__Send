/* =================================================================================
   VaultLoader — Storage Abstraction
   Single source of truth for all localStorage / sessionStorage keys used by the
   vault loader. Emits events on mutation via the existing EventBus.

   localStorage keys:
     sg-vault-key            — currently loaded vault credential
     sg-vault-recent         — unified recent-vaults list (JSON)
     sg-vault-recent:migrated-at — migration timestamp guard

   sessionStorage keys:
     sg-vault-access-key     — server access token (write gate)
     sg-vault-endpoint       — API endpoint override
     sg-vault-creating       — flag: this vault is being created (not opened)

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

        // --- Current vault key (localStorage) --------------------------------------

        getCurrentKey: function () {
            try { return localStorage.getItem('sg-vault-key'); } catch (_) { return null; }
        },

        setCurrentKey: function (key) {
            try { localStorage.setItem('sg-vault-key', key); } catch (_) {}
            _emit(VaultLoaderEvents.VAULT_KEY_SET, { key: key });
        },

        clearCurrentKey: function () {
            try { localStorage.removeItem('sg-vault-key'); } catch (_) {}
            _emit(VaultLoaderEvents.VAULT_KEY_CLEARED, {});
        },

        // --- Server access token (sessionStorage) ----------------------------------

        getAccessKey: function () {
            try { return sessionStorage.getItem('sg-vault-access-key'); } catch (_) { return null; }
        },

        setAccessKey: function (key) {
            try {
                if (key) { sessionStorage.setItem('sg-vault-access-key', key); }
                else      { sessionStorage.removeItem('sg-vault-access-key'); }
            } catch (_) {}
        },

        clearAccessKey: function () {
            try { sessionStorage.removeItem('sg-vault-access-key'); } catch (_) {}
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
