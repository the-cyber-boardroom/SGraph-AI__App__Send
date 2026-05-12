/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Step Done Secret (v0.3.2)

   New light-DOM custom element: <upload-step-done-secret>
   Rendered by the orchestrator (send-upload-options.js) when state=complete
   and _isSecretMode=true.

   Properties:
     result        — engine result: { transferId, combinedUrl, keyString,
                       deleteAuth, isSecretMode }
     secretConfig  — { max_downloads, auto_delete, expires_at }

   Events emitted:
     step-send-another  — user clicked "Create Another Secret"
   ═══════════════════════════════════════════════════════════════════════════════ */

class UploadStepDoneSecret extends HTMLElement {

    constructor() {
        super();
        this._result       = null;
        this._secretConfig = null;
    }

    set result(v)       { this._result = v;       this._render(); }
    set secretConfig(v) { this._secretConfig = v; }

    _render() {
        if (!this._result) return;

        var shareUrl    = this._buildShareUrl();
        var killUrl     = this._buildKillUrl();
        var noticeHtml  = this._buildNoticeHtml();

        this.innerHTML =
            '<div class="secret-done">' +
                '<div class="secret-done__header">🔒 Secret link created</div>' +

                '<div class="secret-done__section">' +
                    '<div class="secret-done__label">Share this link:</div>' +
                    '<div class="secret-done__link-box">' +
                        '<input type="text" readonly class="secret-done__link-input" id="share-link-input" value="' + this._escAttr(shareUrl) + '">' +
                        '<button class="secret-done__copy-btn" id="copy-share-link">📋 Copy Link</button>' +
                    '</div>' +
                    noticeHtml +
                '</div>' +

                '<div class="secret-done__section secret-done__section--kill">' +
                    '<div class="secret-done__label">Kill link — save this to delete the secret early:</div>' +
                    '<div class="secret-done__link-box secret-done__link-box--secondary">' +
                        '<input type="text" readonly class="secret-done__link-input" id="kill-link-input" value="' + this._escAttr(killUrl) + '">' +
                        '<button class="secret-done__copy-btn" id="copy-kill-link">📋 Copy Kill Link</button>' +
                    '</div>' +
                '</div>' +

                '<div class="secret-done__actions">' +
                    '<button class="btn btn-secondary" id="email-secret-link">📧 Email Link</button>' +
                    '<button class="btn btn-primary" id="create-another-secret">🔄 Create Another Secret</button>' +
                '</div>' +

                '<div class="secret-done__transparency">' +
                    '🔒 The server holds only encrypted ciphertext. The decryption key is embedded in the link — it never left your browser.' +
                '</div>' +
            '</div>';

        this._wireActions(shareUrl, killUrl);
    }

    _buildShareUrl() {
        // The engine patch sets combinedUrl to the /en-gb/s/ URL when isSecretMode
        return this._result.combinedUrl || '';
    }

    _buildKillUrl() {
        var r      = this._result;
        var locale = this._detectLocale();
        return window.location.origin + '/' + locale + '/s/kill/' + r.transferId + '#' + (r.deleteAuth || '');
    }

    _detectLocale() {
        var match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
        return match ? match[1] : 'en-gb';
    }

    _buildNoticeHtml() {
        var cfg    = this._secretConfig || {};
        var parts  = [];
        if (cfg.max_downloads === 1) {
            parts.push('1 view');
        } else if (cfg.max_downloads > 1) {
            parts.push(cfg.max_downloads + ' views');
        }
        if (cfg.expires_at) {
            var exp = new Date(cfg.expires_at);
            parts.push('expires ' + exp.toLocaleString());
        }
        parts.push('then permanently deleted');
        return '<div class="secret-done__notice">⚠ ' + this._escHtml(parts.join(' · ')) + '</div>';
    }

    _wireActions(shareUrl, killUrl) {
        var self = this;

        var copyShare = this.querySelector('#copy-share-link');
        if (copyShare) {
            copyShare.addEventListener('click', function() {
                self._copyToClipboard(shareUrl, copyShare, 'Copied!');
            });
        }

        var copyKill = this.querySelector('#copy-kill-link');
        if (copyKill) {
            copyKill.addEventListener('click', function() {
                self._copyToClipboard(killUrl, copyKill, 'Copied!');
            });
        }

        var emailBtn = this.querySelector('#email-secret-link');
        if (emailBtn) {
            emailBtn.addEventListener('click', function() {
                var subject = 'Secure secret via SG/Send';
                var body    = 'I\'ve shared a secret with you via SG/Send (zero-knowledge encrypted).\n\n' +
                              'Open this link to view it:\n' + shareUrl + '\n\n' +
                              'This link can only be viewed once. Do not forward it.';
                window.open('mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
            });
        }

        var anotherBtn = this.querySelector('#create-another-secret');
        if (anotherBtn) {
            anotherBtn.addEventListener('click', function() {
                self.dispatchEvent(new CustomEvent('step-send-another', { bubbles: true, composed: true }));
            });
        }
    }

    _copyToClipboard(text, btn, label) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function() {
                var orig = btn.textContent;
                btn.textContent = label;
                setTimeout(function() { btn.textContent = orig; }, 2000);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity  = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { /* ignore */ }
            document.body.removeChild(ta);
            var orig = btn.textContent;
            btn.textContent = label;
            setTimeout(function() { btn.textContent = orig; }, 2000);
        }
    }

    _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    _escAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }
}

customElements.define('upload-step-done-secret', UploadStepDoneSecret);
