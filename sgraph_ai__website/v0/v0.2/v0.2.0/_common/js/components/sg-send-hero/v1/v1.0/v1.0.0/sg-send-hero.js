import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'

const BROWSE_BASE = 'https://send.sgraph.ai/en-gb/browse/'

class SgSendHero extends SgComponent {
    bindElements() {
        this._field = this.shadowRoot.getElementById('hero-token-field')
        this._goBtn = this.shadowRoot.getElementById('hero-token-go')
    }

    setupEventListeners() {
        this._goBtn.addEventListener('click', () => this._onGo())
        this._field.addEventListener('keydown', e => { if (e.key === 'Enter') this._onGo() })
    }

    _onGo() {
        const token = this._field.value.trim()
        if (!token) return
        window.location.href = `${BROWSE_BASE}#${encodeURIComponent(token)}`
    }
}

customElements.define('sg-send-hero', SgSendHero)
