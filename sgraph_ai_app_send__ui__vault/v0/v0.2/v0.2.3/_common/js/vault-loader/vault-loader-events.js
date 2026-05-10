/* =================================================================================
   VaultLoader — Event Name Constants
   Shared across all vault-loader sub-modules and external listeners.
   Load order: first (no dependencies).
   ================================================================================= */

;(function () {
    'use strict';

    globalThis.VaultLoaderEvents = {
        VAULT_OPENED:         'vault-opened',
        VAULT_CREATED:        'vault-created',
        VAULT_OPEN_FAILED:    'vault-open-failed',
        VAULT_CREATE_FAILED:  'vault-create-failed',
        VAULT_LOCKED:         'vault-locked',
        VAULT_KEY_SET:        'vault-key-set',
        VAULT_KEY_CLEARED:    'vault-key-cleared',
        VAULT_RECENT_CHANGED: 'vault-recent-changed'
    };
}());
