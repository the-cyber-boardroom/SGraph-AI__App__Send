/* =============================================================================
   SGraph Send Admin Console — ConfigManager
   v0.1.3 — IFD Issues-FS architecture: configuration service

   Provides global configuration for the admin console.
   ============================================================================= */

(function() {
    'use strict';

    class ConfigManager {
        constructor() {
            this.version   = 'v0.1.3';
            this.appName   = 'SGraph Send';
            this.appTitle  = 'Admin Console';
        }
    }

    window.sgraphAdmin = window.sgraphAdmin || {};
    window.sgraphAdmin.config = new ConfigManager();
})();
