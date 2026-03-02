/* =================================================================================
   SGraph Vault — App Shell
   v0.1.0 — Root component that orchestrates entry, browser, upload, and share
   ================================================================================= */

class VaultApp extends VaultComponent {

    constructor() {
        super()
        this._vault    = null
        this._vaultKey = ''
        this._passphrase = ''
    }

    bindElements() {
        this._viewEntry   = this.$('#view-entry')
        this._viewBrowser = this.$('#view-browser')
        this._vaultNameEl = this.$('#vault-name')
        this._shareToggle = this.$('#share-toggle')
        this._lockBtn     = this.$('#lock-btn')
        this._uploadPanel = this.$('#upload-panel')

        this._entry    = this.$('#entry')
        this._browser  = this.$('#browser')
        this._uploader = this.$('#uploader')
        this._share    = this.$('#share')
    }

    setupEventListeners() {
        // Entry events
        this.addTrackedListener(this._entry, 'vault-opened',  this._onVaultOpened)
        this.addTrackedListener(this._entry, 'vault-created', this._onVaultCreated)

        // Browser events
        this.addTrackedListener(this._browser, 'vault-upload-request', this._onUploadRequest)
        this.addTrackedListener(this._browser, 'vault-upload-file',    this._onUploadFile)
        this.addTrackedListener(this._browser, 'vault-key-changed',    this._onKeyChanged)
        this.addTrackedListener(this._browser, 'vault-error',          this._onError)

        // Upload events
        this.addTrackedListener(this._uploader, 'vault-file-added', this._onFileAdded)

        // Header buttons
        this.addTrackedListener(this._shareToggle, 'click', this._onShareToggle)
        this.addTrackedListener(this._lockBtn,     'click', this._onLock)
    }

    onReady() {
        // Pass endpoint/token config to entry component
        const endpoint = this.getAttribute('data-endpoint')
        const token    = this.getAttribute('data-token')
        if (endpoint) this._entry.setAttribute('data-endpoint', endpoint)
        if (token)    this._entry.setAttribute('data-token', token)
    }

    // --- Vault Events ----------------------------------------------------------

    _onVaultOpened(e) {
        this._vault    = e.detail.vault
        this._vaultKey = e.detail.vaultKey
        this._showBrowser()
    }

    _onVaultCreated(e) {
        this._vault    = e.detail.vault
        this._vaultKey = e.detail.vaultKey
        this._showBrowser()
    }

    _showBrowser() {
        this._viewEntry.hidden   = true
        this._viewBrowser.hidden = false

        // Update header
        this._vaultNameEl.textContent = this._vault.name || ''
        this._shareToggle.hidden = false
        this._lockBtn.hidden     = false

        // Wire vault to browser, uploader, share
        this._browser.vault  = this._vault
        this._uploader.vault = this._vault
        this._share.vaultKey = this._vaultKey

        this._browser.refresh()
    }

    // --- Upload ----------------------------------------------------------------

    _onUploadRequest(e) {
        this._uploader.targetPath = e.detail.path
        this._uploadPanel.hidden  = false
        this._uploader.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    _onUploadFile(e) {
        this._uploader.targetPath = e.detail.path
        this._uploadPanel.hidden  = false
        this._uploader.uploadFile(e.detail.file, e.detail.path)
    }

    _onFileAdded() {
        // Refresh browser + update vault key (tree changed)
        this._browser.refresh()
        this._updateVaultKey()
    }

    // --- Key Management --------------------------------------------------------

    _onKeyChanged() {
        this._updateVaultKey()
    }

    _updateVaultKey() {
        // Reconstruct vault key with new settings transfer ID
        // Parse existing key to get passphrase
        const parts = this._vaultKey.split(':')
        const settingsId = this._vault._settingsTransferId
        const vaultId    = this._vault._vaultId
        // Replace last two parts (vaultId:settingsId)
        parts.splice(-2, 2, vaultId, settingsId)
        this._vaultKey = parts.join(':')
        this._share.updateKey(this._vaultKey)
    }

    // --- Share & Lock ----------------------------------------------------------

    _onShareToggle() {
        const shareEl = this._share
        // The share component is always visible in the browser card.
        // Toggle it if you want hide/show behavior (for now it's always shown).
    }

    _onLock() {
        this._vault    = null
        this._vaultKey = ''

        this._viewBrowser.hidden = true
        this._viewEntry.hidden   = false
        this._uploadPanel.hidden = true
        this._shareToggle.hidden = true
        this._lockBtn.hidden     = true
        this._vaultNameEl.textContent = ''

        window.history.replaceState(null, '', window.location.pathname)
    }

    // --- Error Handling --------------------------------------------------------

    _onError(e) {
        console.error('[vault-app]', e.detail.message)
    }
}

customElements.define('vault-app', VaultApp)
