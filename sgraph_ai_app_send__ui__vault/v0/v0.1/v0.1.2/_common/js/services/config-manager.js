/* =============================================================================
   SGraph Vault — ConfigManager
   v0.1.2 — Adapted from Admin Console v0.1.3

   Provides global configuration for the vault.
   ============================================================================= */

(function() {
    'use strict';

    class ConfigManager {
        constructor() {
            this.version  = 'v0.1.2';
            this.appName  = 'SG/Vault';
            this.appTitle = 'Zero-knowledge encrypted vault';
        }
    }

    window.sgraphVault = window.sgraphVault || {};
    window.sgraphVault.config = new ConfigManager();
})();
