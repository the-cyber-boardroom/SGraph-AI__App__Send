import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

class SgPricingTeaser extends SgComponent {
    static jsUrl = import.meta.url
}

customElements.define('sg-pricing-teaser', SgPricingTeaser)
