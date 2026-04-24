import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

class SgSiteFooter extends SgComponent {
    static get observedAttributes() { return ['site'] }
}

customElements.define('sg-site-footer', SgSiteFooter)
