/* =============================================================================
   SGraph Send Admin Console — API Logger Patch
   v0.1.6 — Fix URL truncation on resize

   Bug:  URLs hard-truncated at 60 chars in JS (_truncateUrl) AND constrained
         to 200px in CSS (.al-entry-url max-width). On wider panels, URLs stay
         needlessly short; on narrower panels, the fixed max-width fights the
         layout.
   Fix:  Let CSS handle truncation entirely via text-overflow: ellipsis.
         The full URL is already in the title attribute (tooltip).
   ============================================================================= */

(function() {
    'use strict';

    const ApiLoggerClass = customElements.get('api-logger');
    if (!ApiLoggerClass) return;

    // --- 1. Override _truncateUrl to stop hard-truncating ----------------------
    ApiLoggerClass.prototype._truncateUrl = function(url) {
        return url;  // Let CSS handle truncation via text-overflow: ellipsis
    };

    // --- 2. Inject CSS fix for .al-entry-url -----------------------------------
    const style = document.createElement('style');
    style.textContent = `
        api-logger .al-entry-url {
            max-width: none;
            flex: 1;
            min-width: 0;
        }
    `;
    document.head.appendChild(style);
})();
