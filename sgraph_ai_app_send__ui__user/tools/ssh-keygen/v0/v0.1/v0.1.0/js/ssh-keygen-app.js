/* =============================================================================
   SG/Send — SSH Key Generator Web Component
   v0.1.0 — <ssh-keygen-app>

   Single custom element owning the full UI lifecycle.
   State machine: idle → generating → complete
   No external dependencies. Uses SSHCrypto from ssh-crypto.js.
   ============================================================================= */

class SSHKeygenApp extends HTMLElement {

    constructor() {
        super()
        this.state             = 'idle'       // idle | generating | complete
        this.algorithm         = 'ed25519'    // ed25519 | rsa4096
        this.comment           = ''
        this.keys              = null         // { publicKey, privateKey }
        this.ed25519Supported  = null         // null = unknown, true/false after detection
        this.error             = null
    }

    connectedCallback() {
        this.render()
        this.detectFeatures()

        // Event delegation
        this.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]') || e.target.closest('[data-copy]') || e.target.closest('[data-download]')
            if (!target) return

            if (target.dataset.action === 'generate')     this.generate()
            if (target.dataset.action === 'reset')        this.reset()
            if (target.dataset.action === 'toggle-howto') this.toggleHowTo(target)
            if (target.dataset.action === 'toggle-faq')   this.toggleFaq(target)
            if (target.dataset.copy)                      this.copyToClipboard(target.dataset.copy, target)
            if (target.dataset.download)                  this.downloadAsFile(target.dataset.download, target.dataset.filename)
        })

        // Algorithm selector
        this.addEventListener('click', (e) => {
            const seg = e.target.closest('[data-algorithm]')
            if (!seg || seg.classList.contains('disabled')) return
            this.algorithm = seg.dataset.algorithm
            this.render()
        })

        // Comment input
        this.addEventListener('input', (e) => {
            if (e.target.id === 'ssh-comment') {
                this.comment = e.target.value
            }
        })
    }

    async detectFeatures() {
        this.ed25519Supported = await SSHCrypto.supportsEd25519()
        if (!this.ed25519Supported && this.algorithm === 'ed25519') {
            this.algorithm = 'rsa4096'
        }
        this.render()
    }

    async generate() {
        this.state = 'generating'
        this.error = null
        this.render()
        try {
            if (this.algorithm === 'ed25519') {
                this.keys = await SSHCrypto.generateEd25519(this.comment)
            } else {
                this.keys = await SSHCrypto.generateRSA4096(this.comment)
            }
            this.state = 'complete'
        } catch (e) {
            this.error = e.message
            this.state = 'idle'
        }
        this.render()
    }

    reset() {
        this.keys  = null
        this.error = null
        this.state = 'idle'
        this.render()
    }

    async copyToClipboard(field, buttonEl) {
        const text = field === 'public' ? this.keys.publicKey : this.keys.privateKey
        try {
            await navigator.clipboard.writeText(text)
            const orig = buttonEl.textContent
            buttonEl.textContent = 'Copied!'
            buttonEl.classList.add('copied')
            setTimeout(() => {
                buttonEl.textContent = orig
                buttonEl.classList.remove('copied')
            }, 2000)
        } catch {
            // Fallback: select the textarea
            const ta = this.querySelector(field === 'public' ? '#pub-key-display' : '#priv-key-display')
            if (ta) { ta.select(); document.execCommand('copy') }
        }
    }

    downloadAsFile(field, filename) {
        const text = field === 'public' ? this.keys.publicKey : this.keys.privateKey
        const blob = new Blob([text], { type: 'text/plain' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    toggleHowTo(el) {
        const card = el.closest('.howto-card')
        if (!card) return
        card.classList.toggle('expanded')
    }

    toggleFaq(el) {
        const item = el.closest('.faq-item')
        if (!item) return
        item.classList.toggle('expanded')
    }

    get _keyPrefix() {
        return this.algorithm === 'ed25519' ? 'id_ed25519' : 'id_rsa'
    }

    get _algorithmLabel() {
        return this.algorithm === 'ed25519' ? 'Ed25519' : 'RSA 4096'
    }

    // ── Render ───────────────────────────────────────────────────────────────

    render() {
        const ed25519Active  = this.algorithm === 'ed25519'
        const rsa4096Active  = this.algorithm === 'rsa4096'
        const ed25519Disabled = this.ed25519Supported === false

        this.innerHTML = `
            <div class="keygen-card card">
                <h2 class="keygen-title">Generate SSH Key Pair</h2>
                <p class="keygen-subtitle">Create a secure key pair in your browser. Nothing leaves this page.</p>

                ${this.error ? `<div class="keygen-error">${this._escapeHtml(this.error)}</div>` : ''}

                <!-- Algorithm selector -->
                <div class="form-group">
                    <label class="form-label">Algorithm</label>
                    <div class="segmented-control" role="radiogroup" aria-label="Select SSH key algorithm">
                        <button class="segment ${ed25519Active ? 'active' : ''} ${ed25519Disabled ? 'disabled' : ''}"
                                data-algorithm="ed25519"
                                role="radio"
                                aria-checked="${ed25519Active}"
                                ${ed25519Disabled ? 'title="Your browser doesn\'t support Ed25519. Use RSA 4096 or update your browser." aria-disabled="true"' : ''}>
                            Ed25519${!ed25519Disabled ? ' (recommended)' : ''}
                        </button>
                        <button class="segment ${rsa4096Active ? 'active' : ''}"
                                data-algorithm="rsa4096"
                                role="radio"
                                aria-checked="${rsa4096Active}">
                            RSA 4096
                        </button>
                    </div>
                </div>

                <!-- Comment -->
                <div class="form-group">
                    <label class="form-label" for="ssh-comment">Comment <span class="label-hint">(optional)</span></label>
                    <input type="text"
                           id="ssh-comment"
                           class="input keygen-input"
                           placeholder="user@example.com"
                           value="${this._escapeHtml(this.comment)}"
                           ${this.state === 'generating' ? 'disabled' : ''}>
                </div>

                <!-- Generate button -->
                ${this.state === 'complete' ? '' : `
                <button class="btn btn-primary keygen-btn"
                        data-action="generate"
                        ${this.state === 'generating' ? 'disabled' : ''}>
                    ${this.state === 'generating' ? 'Generating\u2026' : 'Generate Key Pair'}
                </button>
                `}

                ${this.state === 'generating' ? '<div class="keygen-progress"><div class="keygen-progress-bar"></div></div>' : ''}
            </div>

            ${this.state === 'complete' ? this._renderResult() : ''}
            ${this._renderHowTo()}
            ${this._renderTrust()}
            ${this._renderCTA()}
            ${this._renderFAQ()}
        `
    }

    _renderResult() {
        return `
            <div class="keygen-result card card-enter">
                <div class="success-banner">
                    <span class="success-icon">&#10003;</span>
                    Key pair generated &mdash; ${this._algorithmLabel}
                </div>

                <!-- Public Key -->
                <div class="key-section">
                    <label class="key-label">Public Key</label>
                    <textarea id="pub-key-display" class="key-display key-display--public" readonly rows="1">${this._escapeHtml(this.keys.publicKey)}</textarea>
                    <div class="key-actions">
                        <button class="btn btn-sm btn-copy" data-copy="public">Copy</button>
                        <button class="btn btn-sm btn-secondary" data-download="public" data-filename="${this._keyPrefix}.pub">Download ${this._keyPrefix}.pub</button>
                    </div>
                </div>

                <!-- Private Key -->
                <div class="key-section">
                    <label class="key-label">Private Key</label>
                    <textarea id="priv-key-display" class="key-display key-display--private" readonly rows="6">${this._escapeHtml(this.keys.privateKey)}</textarea>
                    <div class="key-actions">
                        <button class="btn btn-sm btn-copy" data-copy="private">Copy</button>
                        <button class="btn btn-sm btn-secondary" data-download="private" data-filename="${this._keyPrefix}">Download ${this._keyPrefix}</button>
                    </div>
                </div>

                <!-- Generate New -->
                <button class="btn btn-ghost keygen-new" data-action="reset">Generate New Key Pair</button>
            </div>
        `
    }

    _renderHowTo() {
        return `
            <div class="keygen-howto">
                <h3 class="section-title">How to use this key</h3>

                <div class="howto-card">
                    <button class="howto-header" data-action="toggle-howto">
                        <span class="howto-title">GitHub</span>
                        <span class="howto-chevron">&#9656;</span>
                    </button>
                    <div class="howto-body">
                        <ol>
                            <li>Go to <strong>github.com &rarr; Settings</strong></li>
                            <li>Click <strong>SSH and GPG keys</strong> &rarr; <strong>New SSH key</strong></li>
                            <li>Give it a title (e.g. &ldquo;My Laptop&rdquo;)</li>
                            <li>Paste your <strong>public key</strong> and click <strong>Add SSH key</strong></li>
                        </ol>
                    </div>
                </div>

                <div class="howto-card">
                    <button class="howto-header" data-action="toggle-howto">
                        <span class="howto-title">GitLab</span>
                        <span class="howto-chevron">&#9656;</span>
                    </button>
                    <div class="howto-body">
                        <ol>
                            <li>Go to <strong>gitlab.com &rarr; Preferences</strong></li>
                            <li>Click <strong>SSH Keys</strong> in the sidebar</li>
                            <li>Paste your <strong>public key</strong></li>
                            <li>Set an optional expiration date and click <strong>Add key</strong></li>
                        </ol>
                    </div>
                </div>

                <div class="howto-card">
                    <button class="howto-header" data-action="toggle-howto">
                        <span class="howto-title">Server (Linux / Mac)</span>
                        <span class="howto-chevron">&#9656;</span>
                    </button>
                    <div class="howto-body">
                        <ol>
                            <li>Save the private key to <code>~/.ssh/${this._keyPrefix}</code></li>
                            <li>Set permissions: <code>chmod 600 ~/.ssh/${this._keyPrefix}</code></li>
                            <li>Copy the public key to the server: <code>ssh-copy-id -i ~/.ssh/${this._keyPrefix}.pub user@host</code></li>
                            <li>Test: <code>ssh -i ~/.ssh/${this._keyPrefix} user@host</code></li>
                        </ol>
                    </div>
                </div>

                <div class="howto-card">
                    <button class="howto-header" data-action="toggle-howto">
                        <span class="howto-title">AWS EC2</span>
                        <span class="howto-chevron">&#9656;</span>
                    </button>
                    <div class="howto-body">
                        <ol>
                            <li>Go to <strong>EC2 &rarr; Key Pairs &rarr; Actions &rarr; Import key pair</strong></li>
                            <li>Paste your <strong>public key</strong></li>
                            <li>Name the key pair and click <strong>Import key pair</strong></li>
                            <li>Select this key pair when launching new instances</li>
                        </ol>
                    </div>
                </div>
            </div>
        `
    }

    _renderTrust() {
        return `
            <div class="keygen-trust">
                <h3 class="section-title">Why trust this tool?</h3>
                <ul class="trust-list">
                    <li><span class="trust-icon">&#9675;</span> <strong>Open source</strong> &mdash; <a href="https://github.com/the-cyber-boardroom/SGraph-AI__App__Send" target="_blank" rel="noopener">view the code on GitHub</a></li>
                    <li><span class="trust-icon">&#9675;</span> <strong>Zero network requests</strong> &mdash; keys never leave your browser</li>
                    <li><span class="trust-icon">&#9675;</span> <strong>Web Crypto API</strong> &mdash; hardware-backed random number generation</li>
                    <li><span class="trust-icon">&#9675;</span> <strong>Built by SG/Send</strong> &mdash; zero-knowledge encryption platform</li>
                </ul>
            </div>
        `
    }

    _renderCTA() {
        return `
            <div class="keygen-cta">
                <p class="cta-text">Need to send files securely?<br>SG/Send encrypts everything in your browser.</p>
                <a href="/send/" class="btn btn-secondary cta-btn">Try SG/Send &rarr;</a>
            </div>
        `
    }

    _renderFAQ() {
        return `
            <div class="keygen-faq">
                <h3 class="section-title">Frequently Asked Questions</h3>

                <div class="faq-item">
                    <button class="faq-header" data-action="toggle-faq">
                        <span>Ed25519 vs RSA &mdash; which should I use?</span>
                        <span class="faq-chevron">&#9656;</span>
                    </button>
                    <div class="faq-body">
                        <p><strong>Ed25519</strong> is recommended for most users. It generates smaller, faster keys with equivalent or better security than RSA 4096. Use <strong>RSA 4096</strong> only if you need compatibility with older systems that don't support Ed25519.</p>
                    </div>
                </div>

                <div class="faq-item">
                    <button class="faq-header" data-action="toggle-faq">
                        <span>Is it safe to generate SSH keys in a browser?</span>
                        <span class="faq-chevron">&#9656;</span>
                    </button>
                    <div class="faq-body">
                        <p>Yes, when done correctly. This page uses the <strong>Web Crypto API</strong>, the same cryptographic engine used by password managers and banking sites. Keys are generated using your device's hardware random number generator and never leave the page. You can verify this by checking DevTools &rarr; Network tab (zero requests after page load).</p>
                    </div>
                </div>

                <div class="faq-item">
                    <button class="faq-header" data-action="toggle-faq">
                        <span>Do I need a passphrase?</span>
                        <span class="faq-chevron">&#9656;</span>
                    </button>
                    <div class="faq-body">
                        <p>A passphrase adds an extra layer of protection if someone gains access to your private key file. This tool currently generates unprotected keys. You can add a passphrase after downloading using: <code>ssh-keygen -p -f ~/.ssh/${this._keyPrefix}</code></p>
                    </div>
                </div>
            </div>
        `
    }

    _escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
    }
}

customElements.define('ssh-keygen-app', SSHKeygenApp)
