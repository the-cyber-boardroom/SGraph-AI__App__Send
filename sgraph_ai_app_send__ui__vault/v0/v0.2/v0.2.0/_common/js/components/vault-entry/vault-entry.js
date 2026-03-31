/* =================================================================================
   SGraph Vault -- Entry Component
   v0.2.0 -- Open vault via full key or simple token, or create a new one

   Simple tokens (e.g. "jack-loft-6946") derive both the vault ID and
   passphrase deterministically using FriendlyCrypto (SHA-256 + PBKDF2).
   The token IS the passphrase; the vault ID is SHA-256(token)[:12].
   ================================================================================= */

class VaultEntry extends VaultComponent {

    bindElements() {
        this._endpointInput    = this.$('#server-endpoint-input')
        this._accessKeyInput   = this.$('#access-key-input')
        this._keyInput         = this.$('#vault-key-input')
        this._openBtn          = this.$('#vault-open-btn')
        this._simpleTokenInput = this.$('#simple-token-input')
        this._simpleTokenBtn   = this.$('#simple-token-btn')
        this._createToggle     = this.$('#vault-create-toggle')
        this._createForm       = this.$('#create-form')
        this._nameInput        = this.$('#vault-name-input')
        this._passphraseInput  = this.$('#vault-passphrase-input')
        this._createBtn        = this.$('#vault-create-btn')
        this._status           = this.$('#vault-status')
        this._error            = this.$('#vault-error')
    }

    setupEventListeners() {
        this.addTrackedListener(this._openBtn,          'click',   this._onOpen)
        this.addTrackedListener(this._simpleTokenBtn,   'click',   this._onSimpleTokenOpen)
        this.addTrackedListener(this._createToggle,     'click',   this._onToggleCreate)
        this.addTrackedListener(this._createBtn,        'click',   this._onCreate)
        this.addTrackedListener(this._keyInput,         'keydown', this._onKeyDown)
        this.addTrackedListener(this._simpleTokenInput, 'keydown', this._onSimpleKeyDown)
        this.addTrackedListener(this._accessKeyInput,   'input',   this._onAccessKeyChange)
        this.addTrackedListener(this._endpointInput,    'input',   this._onEndpointChange)
    }

    onReady() {
        // Restore server endpoint from sessionStorage
        const savedEndpoint = sessionStorage.getItem('sg-vault-endpoint')
        if (savedEndpoint) this._endpointInput.value = savedEndpoint

        // Restore access key from sessionStorage
        const saved = sessionStorage.getItem('sg-vault-access-key')
        if (saved) this._accessKeyInput.value = saved

        // Show version info
        this._renderVersion()

        // Check URL hash for vault key or simple token
        const hash = window.location.hash.slice(1)
        if (hash) {
            const decoded = decodeURIComponent(hash)
            if (this._isSimpleToken(decoded)) {
                this._simpleTokenInput.value = decoded
                this._onSimpleTokenOpen()
            } else {
                this._keyInput.value = decoded
                this._onOpen()
            }
        } else {
            const savedKey = localStorage.getItem('sg-vault-key')
            if (savedKey) {
                if (this._isSimpleToken(savedKey)) {
                    this._simpleTokenInput.value = savedKey
                    this._onSimpleTokenOpen()
                } else {
                    this._keyInput.value = savedKey
                    this._onOpen()
                }
            }
        }
    }

    _renderVersion() {
        const el = this.$('#vault-entry-version')
        if (!el) return
        const uiVersion = 'v0.2.0 (IFD)'
        const build     = window.SGRAPH_BUILD
        el.textContent  = build
            ? `${build.appVersion}  .  UI ${build.uiVersion} (IFD)`
            : `UI ${uiVersion}`
    }

    // --- Simple token detection ---

    _isSimpleToken(str) {
        if (!str) return false
        // word-word-NNNN format (same regex as FriendlyCrypto)
        return /^[a-z]+-[a-z]+-\d{4}$/.test(str.trim())
    }

    // --- Simple token open ---

    _onSimpleKeyDown(e) {
        if (e.key === 'Enter') this._onSimpleTokenOpen()
    }

    async _onSimpleTokenOpen() {
        const token = this._simpleTokenInput.value.trim().toLowerCase()
        if (!token) {
            this._showError('Please enter a simple token (e.g. jack-loft-6946)')
            return
        }
        if (!this._isSimpleToken(token)) {
            this._showError('Invalid token format. Expected: word-word-1234')
            return
        }

        this._hideError()
        this._showStatus('Opening vault...')
        this._simpleTokenBtn.disabled = true

        try {
            // For simple tokens, the token IS the vault key
            // parseVaultKey detects the word-word-NNNN pattern and uses it as both passphrase and vault_id
            await this._openVault(token, token)
        } catch (err) {
            if (err.message.includes('not found') || err.message.includes('404')) {
                this._showError(`No vault found for token "${token}". The vault may not have been created yet, or the token may be incorrect.`)
            } else {
                this._showError(err.message)
            }
        } finally {
            this._simpleTokenBtn.disabled = false
            this._hideStatus()
        }
    }

    // --- Full vault key open ---

    _onKeyDown(e) {
        if (e.key === 'Enter') this._onOpen()
    }

    async _onOpen() {
        const vaultKey = this._keyInput.value.trim()
        if (!vaultKey) {
            this._showError(this.t('vault.entry.error.wrong_key'))
            return
        }

        // If user pasted a simple token into the full key field, redirect
        if (this._isSimpleToken(vaultKey)) {
            this._simpleTokenInput.value = vaultKey
            this._keyInput.value = ''
            this._onSimpleTokenOpen()
            return
        }

        this._hideError()
        this._showStatus(this.t('vault.entry.open') + '...')
        this._openBtn.disabled = true

        try {
            await this._openVault(vaultKey)
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

    // --- Shared open logic ---

    async _openVault(vaultKey, hashValue) {
        this._showStatus('Opening vault...')

        const sgSend = this._getSGSend()
        const vault  = await SGVault.open(sgSend, vaultKey)

        // Update URL hash (use simple token if available, else vault key)
        const hashStr = hashValue || vaultKey
        window.history.replaceState(null, '', '#' + encodeURIComponent(hashStr))

        // Persist for auto-open on next visit
        try { localStorage.setItem('sg-vault-key', hashStr) } catch (_) {}

        const accessKey = this._accessKeyInput.value.trim()
        this.emit('vault-opened', { vault, vaultKey, accessKey })
    }

    // --- Endpoint / Access Key ---

    _onEndpointChange() {
        const endpoint = this._endpointInput.value.trim()
        if (endpoint) {
            sessionStorage.setItem('sg-vault-endpoint', endpoint)
        } else {
            sessionStorage.removeItem('sg-vault-endpoint')
        }
    }

    _onAccessKeyChange() {
        const key = this._accessKeyInput.value.trim()
        if (key) {
            sessionStorage.setItem('sg-vault-access-key', key)
        } else {
            sessionStorage.removeItem('sg-vault-access-key')
        }
    }

    // --- Create vault ---

    _onToggleCreate() {
        const form = this._createForm
        form.hidden = !form.hidden
        this._createToggle.hidden = !form.hidden
        if (!form.hidden) {
            this._nameInput.focus()
        }
    }

    async _onCreate() {
        if (!this._requireAccessKey()) return

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
        const endpoint = this._endpointInput.value.trim()
                      || this.getAttribute('data-endpoint')
                      || 'https://dev.send.sgraph.ai'
        const token    = this._accessKeyInput.value.trim()
                      || this.getAttribute('data-token')
                      || ''
        return new SGSend({ endpoint, token })
    }

    _requireAccessKey() {
        const key = this._accessKeyInput.value.trim()
        if (!key) {
            this._showError(this.t('vault.entry.error.no_access_key'))
            this._accessKeyInput.focus()
            return false
        }
        return true
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
