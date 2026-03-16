/* =================================================================================
   SGraph Vault — Share Component
   v0.1.0 — Display and copy vault key
   ================================================================================= */

class VaultShare extends VaultComponent {

    constructor() {
        super()
        this._vaultKey = ''
    }

    set vaultKey(k) {
        this._vaultKey = k
        if (this._isReady) this._render()
    }

    bindElements() {
        this._keyDisplay = this.$('#vault-key-display')
        this._copyBtn    = this.$('#copy-key-btn')
    }

    setupEventListeners() {
        this.addTrackedListener(this._copyBtn, 'click', this._onCopy)
    }

    onReady() {
        this._render()
    }

    _render() {
        if (this._keyDisplay) {
            this._keyDisplay.textContent = this._vaultKey
        }
    }

    async _onCopy() {
        const ok = await this.copyToClipboard(this._vaultKey)
        if (ok) {
            const original = this._copyBtn.textContent
            this._copyBtn.textContent = this.t('vault.share.copied')
            setTimeout(() => { this._copyBtn.textContent = original }, 2000)
        }
    }

    updateKey(newKey) {
        this._vaultKey = newKey
        this._render()
        // Update URL hash
        window.history.replaceState(null, '', '#' + encodeURIComponent(newKey))
    }
}

customElements.define('vault-share', VaultShare)
