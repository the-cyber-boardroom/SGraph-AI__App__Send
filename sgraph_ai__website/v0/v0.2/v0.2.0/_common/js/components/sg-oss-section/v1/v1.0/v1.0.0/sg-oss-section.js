import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

class SgOssSection extends SgComponent {
    static jsUrl = import.meta.url
}

customElements.define('sg-oss-section', SgOssSection)
