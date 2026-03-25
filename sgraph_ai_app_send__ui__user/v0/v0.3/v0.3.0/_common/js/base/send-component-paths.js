/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Component Path Registry
   v0.3.0 — Maps component tag names to file paths

   Set basePath before any component loads via SendComponentPaths.init().
   Components in non-standard directories register via aliases.
   IFD override versions can patch resolve() to redirect specific files.
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendComponentPaths {

    // Set at boot time based on page location
    // From en-gb/index.html: basePath = '../_common'
    // From en-gb/upload/index.html: basePath = '../../_common'
    static basePath = '../_common';

    // Tag-name → directory mapping for components that don't follow the
    // default convention of {tagName}/{tagName}.{ext}
    static _aliases = {};

    static sharedCss = {
        components: () => `${SendComponentPaths.basePath}/css/shared-components.css`
    };

    static resolve(tagName) {
        const dir = SendComponentPaths._aliases[tagName] || tagName;
        const base = `${SendComponentPaths.basePath}/js/components/${dir}/${tagName}`;
        return {
            js:   `${base}.js`,
            html: `${base}.html`,
            css:  `${base}.css`
        };
    }

    /**
     * Register a component that lives in a non-standard directory.
     * e.g. alias('send-viewer', 'send-download') → resolves to send-download/send-viewer.*
     *
     * @param {string} tagName - Custom element tag name
     * @param {string} directory - Directory name under js/components/
     */
    static alias(tagName, directory) {
        SendComponentPaths._aliases[tagName] = directory;
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
