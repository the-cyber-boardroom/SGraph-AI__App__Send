/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Access Gate Web Component
   v0.1.0 — Base major version

   Gates the send page behind an access token. If the token is not in
   localStorage, shows a form asking for it. Once entered, stores it
   and reveals the upload component.

   If a 401 is received during upload (token expired or wrong), the
   upload component catches 'ACCESS_TOKEN_INVALID' and dispatches
   'access-token-invalid' on the document, which this gate listens for.

   Usage:
     <send-access-gate>
         <send-upload></send-upload>
     </send-access-gate>
   ═══════════════════════════════════════════════════════════════════════════ */

class SendAccessGate extends HTMLElement {

    connectedCallback() {
        this._onTokenInvalid = () => this.showGate();
        document.addEventListener('access-token-invalid', this._onTokenInvalid);

        if (ApiClient.hasAccessToken()) {
            this.showContent();
        } else {
            this.showGate();
        }
    }

    disconnectedCallback() {
        if (this._onTokenInvalid) {
            document.removeEventListener('access-token-invalid', this._onTokenInvalid);
        }
    }

    showGate() {
        this._originalContent = this._originalContent || this.innerHTML;
        this.innerHTML = `
            <div class="card">
                <div style="text-align: center; padding: 1rem 0;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">&#128274;</div>
                    <h2 style="font-size: var(--font-size-lg); margin-bottom: 0.25rem;">Beta Access</h2>
                    <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 1.5rem;">
                        Enter your access token to start sending files.
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text"
                           id="access-token-input"
                           class="input"
                           placeholder="Paste your access token"
                           autocomplete="off"
                           spellcheck="false">
                    <button class="btn btn-primary" id="access-token-submit">Go</button>
                </div>
                <div id="access-token-error" class="status status--error hidden" style="margin-top: 0.75rem;">
                    Invalid or missing token. Please check and try again.
                </div>
            </div>

            <div class="card" style="margin-top: 1.5rem; text-align: center;">
                <h3 style="font-size: var(--font-size-base); margin-bottom: 0.25rem;">Join the Early Access Program</h3>
                <p style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 1rem;">
                    Sign up to get notified when SGraph Send is available.
                </p>
                <form class="launchlist-form" action="https://getlaunchlist.com/s/zSa8gI" method="POST">
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
                        <input name="name" type="text" class="input" placeholder="Name" style="flex: 1; min-width: 120px;">
                        <input name="email" type="email" class="input" placeholder="Email" required style="flex: 1; min-width: 180px;">
                        <button type="submit" class="btn btn-primary">Sign Up</button>
                    </div>
                </form>
            </div>
        `;

        const input  = this.querySelector('#access-token-input');
        const submit = this.querySelector('#access-token-submit');

        submit.addEventListener('click', () => this.submitToken());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitToken();
        });

        input.focus();
    }

    async submitToken() {
        const input  = this.querySelector('#access-token-input');
        const error  = this.querySelector('#access-token-error');
        const submit = this.querySelector('#access-token-submit');
        const token  = (input.value || '').trim();

        if (!token) {
            error.classList.remove('hidden');
            return;
        }

        // Validate token against admin service before accepting
        if (submit) submit.disabled = true;
        try {
            const result = await ApiClient.checkToken(token);
            if (!result.valid) {
                const reason = result.reason || result.status || '';
                if (reason === 'not_found') {
                    error.textContent = 'Token not found. Please check and try again.';
                } else if (reason === 'exhausted' || result.status === 'exhausted') {
                    error.textContent = 'This token has been fully used. Please request a new one.';
                } else if (reason === 'revoked' || result.status === 'revoked') {
                    error.textContent = 'This token has been revoked.';
                } else {
                    error.textContent = 'Invalid or missing token. Please check and try again.';
                }
                error.classList.remove('hidden');
                if (submit) submit.disabled = false;
                return;
            }
        } catch (e) {
            // Token check endpoint unavailable — fall through (backwards compat with env-var mode)
        }
        if (submit) submit.disabled = false;

        ApiClient.setAccessToken(token);
        this.showContent();
    }

    showContent() {
        if (this._originalContent) {
            this.innerHTML = this._originalContent;
        }
        // Re-trigger custom element upgrades for slotted content
        this.querySelectorAll('send-upload').forEach(el => {
            if (!el._initialized) {
                el._initialized = true;
            }
        });
    }
}

customElements.define('send-access-gate', SendAccessGate);
