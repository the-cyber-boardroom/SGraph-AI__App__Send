/* =============================================================================
   SGraph Send Admin Console — Shell Web Component
   v0.1.4 — SG Brand: typographic logo, teal accents

   Inherits all v0.1.3 shell behavior. Only changes the header to display
   the SG/Send brand mark instead of plain text.
   ============================================================================= */

(function() {
    'use strict';

    // Get the v0.1.3 shell class before we override it
    const BaseShell = customElements.get('admin-shell');

    if (!BaseShell) {
        console.error('[admin-shell v0.1.4] Base shell (v0.1.3) not loaded');
        return;
    }

    // Patch the render method to use brand logo
    const originalRender = BaseShell.prototype.render;

    BaseShell.prototype.render = function() {
        // Call original render
        originalRender.call(this);

        // Replace header title with brand logo
        const headerTitle = this.querySelector('.as-header-title');
        if (headerTitle) {
            headerTitle.innerHTML = `
                <span class="sg-brand-logo">
                    <span class="sg-brand-logo__sg">SG</span><span class="sg-brand-logo__slash">/</span><span class="sg-brand-logo__product">Send</span>
                </span>
            `;
        }

        // Update version badge
        const versionEl = this.querySelector('.as-header-version');
        if (versionEl) {
            versionEl.textContent = 'v0.1.4';
        }

        // Remove old badge, add branded one
        const badge = this.querySelector('.as-header-badge');
        if (badge) {
            badge.textContent = 'Admin';
        }
    };

})();
