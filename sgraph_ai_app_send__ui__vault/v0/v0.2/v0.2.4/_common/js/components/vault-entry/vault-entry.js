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
        // Restore server endpoint — only if a non-default value is stored
        const savedEndpoint = sessionStorage.getItem('sg-vault-endpoint')
        if (savedEndpoint) this._endpointInput.value = savedEndpoint

        // Restore access key
        const saved = VaultLoader.storage.getAccessKey()
        if (saved) this._accessKeyInput.value = saved

        // Show version info
        this._renderVersion()

        // Migrate legacy vault history into unified sg-vault-recent list (one-shot)
        VaultLoader.recent.migrate()

        // Show recent vaults
        this._renderRecentVaults()

        // The head routing script handles any /#token hash: it saves the token to
        // localStorage('sg-vault-key') and strips the hash before this runs.
        // All we need to do is check localStorage for the current key.
        const savedKey = VaultLoader.storage.getCurrentKey()
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
        try { return VaultLoader.detectFormat(str.trim()).format === 1 } catch (_) { return false }
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
            // Simple token: 4-step HKDF derivation (different from standard vault keys)
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

        const key    = (hashValue || vaultKey).trim()
        const result = await VaultLoader.open(key, {
            accessKey: this._accessKeyInput.value.trim() || undefined,
            endpoint:  this._endpointInput.value.trim()  || undefined
        })

        const accessKey = this._accessKeyInput.value.trim()
        this.emit('vault-opened', {
            vault:    result.vault,
            vaultKey: result.vaultKey,
            accessKey,
            deepLink: this._pendingDeepLink
        })
        this._pendingDeepLink = null
    }

    // --- Endpoint / Access Key ---

    _onEndpointChange() {
        VaultLoader.storage.setEndpoint(this._endpointInput.value.trim())
    }

    _onAccessKeyChange() {
        VaultLoader.storage.setAccessKey(this._accessKeyInput.value.trim())
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

            VaultLoader.storage.setCurrentKey(vaultKey)
            VaultLoader.recent.add(vaultKey, name)
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

    // --- Called by vault-shell when returning to the entry screen ----------------

    refresh() {
        this._renderRecentVaults()
    }

    // --- Recent Vaults (unified sg-vault-recent via VaultLoader.recent) ----------

    _renderRecentVaults() {
        const container = this.$('#recent-vaults')
        if (!container) return
        const list = VaultLoader.recent.list()
        if (list.length === 0) { container.hidden = true; return }

        container.hidden = false
        container.innerHTML = `
            <div class="vault-recent">
                <div class="vault-recent__title">Recent Vaults</div>
                <div class="vault-recent__list">
                    ${list.map(h => `
                        <div class="vault-recent__item${h.isCurrent ? ' vault-recent__item--current' : ''}">
                            <div class="vault-recent__info">
                                <span class="vault-recent__name">${this.escapeHtml(h.name)}</span>
                                <span class="vault-recent__key">${this.escapeHtml(this._truncateKey(h.key))}</span>
                            </div>
                            <span class="vault-recent__date">${this._formatRelativeDate(h.lastOpened)}</span>
                            <button class="vault-recent__open" data-vault-key="${this.escapeHtml(h.key)}">Open</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `

        container.querySelectorAll('.vault-recent__open').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.vaultKey
                if (this._isSimpleToken(key)) {
                    this._simpleTokenInput.value = key
                    this._onSimpleTokenOpen()
                } else {
                    this._keyInput.value = key
                    this._onOpen()
                }
            })
        })

        container.querySelectorAll('.vault-recent__item').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.vault-recent__open')) return
                const btn = row.querySelector('.vault-recent__open')
                if (btn) btn.click()
            })
        })
    }

    _truncateKey(key) {
        if (!key || key.length <= 32) return key
        return key.substring(0, 22) + '…' + key.slice(-8)
    }

    _formatRelativeDate(ts) {
        if (!ts) return ''
        const diff = Date.now() - ts
        const mins = Math.floor(diff / 60000)
        if (mins < 2)    return 'just now'
        if (mins < 60)   return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24)    return `${hrs}h ago`
        const days = Math.floor(hrs / 24)
        if (days < 7)    return `${days}d ago`
        return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    }
}

customElements.define('vault-entry', VaultEntry)
