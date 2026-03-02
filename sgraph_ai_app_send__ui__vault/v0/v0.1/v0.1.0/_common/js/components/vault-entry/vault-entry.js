/* =================================================================================
   SGraph Vault — Entry Component
   v0.1.0 — Open existing vault or create a new one
   ================================================================================= */

class VaultEntry extends VaultComponent {

    bindElements() {
        this._keyInput        = this.$('#vault-key-input')
        this._openBtn         = this.$('#vault-open-btn')
        this._createToggle    = this.$('#vault-create-toggle')
        this._createForm      = this.$('#create-form')
        this._nameInput       = this.$('#vault-name-input')
        this._passphraseInput = this.$('#vault-passphrase-input')
        this._createBtn       = this.$('#vault-create-btn')
        this._status          = this.$('#vault-status')
        this._error           = this.$('#vault-error')
    }

    setupEventListeners() {
        this.addTrackedListener(this._openBtn,      'click',    this._onOpen)
        this.addTrackedListener(this._createToggle,  'click',    this._onToggleCreate)
        this.addTrackedListener(this._createBtn,     'click',    this._onCreate)
        this.addTrackedListener(this._keyInput,      'keydown',  this._onKeyDown)
    }

    onReady() {
        // Check URL hash for vault key
        const hash = window.location.hash.slice(1)
        if (hash) {
            this._keyInput.value = decodeURIComponent(hash)
            this._onOpen()
        }
    }

    _onKeyDown(e) {
        if (e.key === 'Enter') this._onOpen()
    }

    async _onOpen() {
        const vaultKey = this._keyInput.value.trim()
        if (!vaultKey) {
            this._showError(this.t('vault.entry.error.wrong_key'))
            return
        }

        this._hideError()
        this._showStatus(this.t('vault.entry.open') + '...')
        this._openBtn.disabled = true

        try {
            const sgSend = this._getSGSend()
            const vault  = await SGVault.open(sgSend, vaultKey)

            // Update URL hash (vault key may have changed due to save)
            window.history.replaceState(null, '', '#' + encodeURIComponent(vaultKey))

            this.emit('vault-opened', { vault, vaultKey })
        } catch (err) {
            if (err.message.includes('Decryption failed')) {
                this._showError(this.t('vault.entry.error.wrong_key'))
            } else if (err.message.includes('not found') || err.message.includes('404')) {
                this._showError(this.t('vault.entry.error.not_found'))
            } else {
                this._showError(err.message)
            }
        } finally {
            this._openBtn.disabled = false
            this._hideStatus()
        }
    }

    _onToggleCreate() {
        const form = this._createForm
        form.hidden = !form.hidden
        this._createToggle.hidden = !form.hidden
        if (!form.hidden) {
            this._nameInput.focus()
        }
    }

    async _onCreate() {
        const name       = this._nameInput.value.trim() || 'Untitled Vault'
        const passphrase = this._passphraseInput.value.trim()

        if (!passphrase) {
            this._showError('Please enter a passphrase.')
            return
        }

        this._hideError()
        this._showStatus(this.t('vault.create.creating'))
        this._createBtn.disabled = true

        try {
            const sgSend = this._getSGSend()
            const vault  = await SGVault.create(sgSend, passphrase, { name })
            const vaultKey = vault.getVaultKey(passphrase)

            // Update URL hash
            window.history.replaceState(null, '', '#' + encodeURIComponent(vaultKey))

            this.emit('vault-created', { vault, vaultKey })
        } catch (err) {
            this._showError(err.message)
        } finally {
            this._createBtn.disabled = false
            this._hideStatus()
        }
    }

    _getSGSend() {
        // Endpoint defaults to send.sgraph.ai, override via data attribute
        const endpoint = this.getAttribute('data-endpoint') || 'https://send.sgraph.ai'
        const token    = this.getAttribute('data-token')    || ''
        return new SGSend({ endpoint, token })
    }

    _showStatus(msg) {
        this._status.textContent = msg
        this._status.hidden = false
    }

    _hideStatus() {
        this._status.hidden = true
    }

    _showError(msg) {
        this._error.textContent = msg
        this._error.hidden = false
    }

    _hideError() {
        this._error.hidden = true
    }
}

customElements.define('vault-entry', VaultEntry)
