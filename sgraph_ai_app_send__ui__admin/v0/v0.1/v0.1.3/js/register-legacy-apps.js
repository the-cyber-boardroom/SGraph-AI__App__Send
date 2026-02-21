/* =============================================================================
   SGraph Send Admin Console — Legacy Component Registration
   v0.1.3 — Adds static appId/navLabel/navIcon to existing Shadow DOM components
             so the v0.1.3 Router can auto-register them.

   Must load AFTER the component scripts (which call customElements.define).
   ============================================================================= */

(function() {
    'use strict';

    // Token Manager (v0.1.2)
    if (window.customElements.get('token-manager')) {
        const Ctor = customElements.get('token-manager');
        Ctor.appId    = 'tokens';
        Ctor.navLabel = 'Tokens';
        Ctor.navIcon  = '\u{1F512}';
    }

    // Analytics Dashboard (v0.1.2)
    if (window.customElements.get('analytics-dashboard')) {
        const Ctor = customElements.get('analytics-dashboard');
        Ctor.appId    = 'analytics';
        Ctor.navLabel = 'Analytics';
        Ctor.navIcon  = '\u{1F4CA}';
    }

    // Metrics Dashboard (v0.1.1)
    if (window.customElements.get('metrics-dashboard')) {
        const Ctor = customElements.get('metrics-dashboard');
        Ctor.appId    = 'metrics';
        Ctor.navLabel = 'Metrics';
        Ctor.navIcon  = '\u{1F4C8}';
    }

    // Cache Browser (v0.1.1)
    if (window.customElements.get('cache-browser')) {
        const Ctor = customElements.get('cache-browser');
        Ctor.appId    = 'cache';
        Ctor.navLabel = 'Cache';
        Ctor.navIcon  = '\u{1F5C4}';
    }

    // System Info (v0.1.0)
    if (window.customElements.get('system-info')) {
        const Ctor = customElements.get('system-info');
        Ctor.appId    = 'system';
        Ctor.navLabel = 'System Info';
        Ctor.navIcon  = '\u2699';
    }
})();
