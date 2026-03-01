/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Component Path Registry
   v0.2.0 — Maps component tag names to file paths

   Set basePath before any component loads via SendComponentPaths.init().
   IFD override versions can patch resolve() to redirect specific files.
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendComponentPaths {

    // Set at boot time based on page location
    // From en-gb/index.html: basePath = '../_common'
    // From en-gb/upload/index.html: basePath = '../../_common'
    static basePath = '../_common';

    static sharedCss = {
        components: () => `${SendComponentPaths.basePath}/css/shared-components.css`
    };

    static resolve(tagName) {
        const base = `${SendComponentPaths.basePath}/js/components/${tagName}/${tagName}`;
        return {
            js:   `${base}.js`,
            html: `${base}.html`,
            css:  `${base}.css`
        };
    }

    /**
     * Set base path from current page depth.
     * Call this before any component is defined.
     *
     * @param {string} path - Relative path to _common/ from current HTML page
     */
    static init(path) {
        SendComponentPaths.basePath = path;
    }
}
