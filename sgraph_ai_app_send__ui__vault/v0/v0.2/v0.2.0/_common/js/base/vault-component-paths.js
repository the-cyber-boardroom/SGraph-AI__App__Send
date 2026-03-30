/* =================================================================================
   SGraph Vault — Component Path Registry
   v0.1.0 — Maps component tag names to file paths
   ================================================================================= */

class VaultComponentPaths {

    static basePath = '../_common'

    static sharedCss = {
        components: () => `${VaultComponentPaths.basePath}/css/shared-components.css`
    }

    static resolve(tagName) {
        const base = `${VaultComponentPaths.basePath}/js/components/${tagName}/${tagName}`
        return {
            js:   `${base}.js`,
            html: `${base}.html`,
            css:  `${base}.css`
        }
    }

    static init(path) {
        VaultComponentPaths.basePath = path
    }
}
