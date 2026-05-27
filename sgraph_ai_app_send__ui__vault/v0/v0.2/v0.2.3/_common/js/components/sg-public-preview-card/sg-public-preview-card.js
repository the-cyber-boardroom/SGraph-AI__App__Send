/* =================================================================================
   SGraph Vault — Public Preview Card
   v0.1.0 — renders the deliberately-public preview (title/description/thumbnail/
   disclaimer/support) + a vault-key prompt, for /en-gb/app/<public-id>.

   Self-contained Web Component (shadow DOM, inline styles via design-tokens vars).
   Driven by setState(); does NOT fetch — the host calls PublicPreviewRead.fetchPreview
   then card.setState({...}). Emits 'pvp-open-vault' { key } when the user submits a key.

   States: loading | ok | not-found | expired | exhausted | invalid | error
   ================================================================================= */

(function () {
    'use strict';

    class SgPublicPreviewCard extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._state = { status: 'loading' };
        }
        connectedCallback() {
            // Live-preview wiring: when a <sg-public-preview-editor> on the page broadcasts an
            // edit, render it here. Harmless on the public page (no editor → event never fires).
            this._onLive = (e) => this.setState({ status: 'ok', preview: e.detail.preview, showKeyPrompt: false });
            document.addEventListener('pvp-preview-changed', this._onLive);
            this.render();
        }
        disconnectedCallback() { if (this._onLive) document.removeEventListener('pvp-preview-changed', this._onLive); }

        // host calls: setState({ status, preview, publicId, transferId, readKey, apiBase, showKeyPrompt })
        setState(next) { this._state = Object.assign({}, this._state, next); this.render(); }

        _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

        render() {
            const s = this._state;
            this.shadowRoot.innerHTML = `<style>${SgPublicPreviewCard.styles}</style>${this._body(s)}`;
            const form = this.shadowRoot.querySelector('.pvp-keyform');
            if (form) form.addEventListener('submit', (e) => {
                e.preventDefault();
                const key = this.shadowRoot.querySelector('.pvp-keyinput').value.trim();
                if (key) this.dispatchEvent(new CustomEvent('pvp-open-vault', { detail: { key }, bubbles: true, composed: true }));
            });
            const local = this.shadowRoot.querySelector('.pvp-open-local');
            if (local) local.addEventListener('click', () =>
                this.dispatchEvent(new CustomEvent('pvp-open-local', { bubbles: true, composed: true })));
        }

        _body(s) {
            if (s.status === 'loading') return this._skeleton();
            if (s.status === 'not-found' || s.status === 'invalid')
                return this._card({ title: '', notFound: true }) ;
            if (s.status === 'expired')   return this._notice('⌛ This preview has expired.', s);
            if (s.status === 'exhausted') return this._notice('👁 This preview has reached its view limit.', s);
            if (s.status === 'error')     return this._notice('Could not load this preview. Please try again.', s);
            return this._card({ preview: s.preview || {} });   // 'ok'
        }

        _skeleton() {
            return `<div class="pvp-card pvp-skeleton">
                <div class="pvp-row"><div class="pvp-thumb sk"></div><div class="pvp-meta">
                <div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:90%"></div>
                <div class="sk sk-line" style="width:80%"></div></div></div></div>`;
        }

        _notice(message, s) {
            const support = this._support(s.preview);
            return `<div class="pvp-card"><div class="pvp-notice">${this._esc(message)}</div>${support}${this._keyPrompt(s)}</div>`;
        }

        _card({ preview = {}, notFound = false }) {
            const s = this._state;
            if (notFound) {
                return `<div class="pvp-card">
                    <div class="pvp-notice">No preview here yet.</div>
                    <p class="pvp-sub">If you have the vault key you can still open the vault below.</p>
                    ${this._keyPrompt(s)}</div>`;
            }
            const thumb = (preview.thumbnail && preview.thumbnail.mode === 'inline' && preview.thumbnail.data)
                ? `<img class="pvp-thumb" alt="" src="${this._esc(preview.thumbnail.data)}">`
                : `<div class="pvp-thumb pvp-thumb--empty">🔒</div>`;
            const dvar   = ['danger', 'warning', 'info', 'neutral'].indexOf(preview.disclaimer_variant) >= 0 ? preview.disclaimer_variant : 'danger';
            const dlabel = (preview.disclaimer_label != null) ? preview.disclaimer_label : 'Confidential';
            const disclaimer = preview.disclaimer
                ? `<div class="pvp-disclaimer pvp-disclaimer--${dvar}">${dlabel ? `<strong>${this._esc(dlabel)}</strong> ` : ''}${this._esc(preview.disclaimer)}</div>` : '';
            const expiry = (preview.expiry && preview.expiry.expires_at_ms)
                ? `<div class="pvp-expnote">Available until ${new Date(preview.expiry.expires_at_ms).toLocaleDateString()}</div>` : '';
            const footer = (preview.show_footer === false) ? ''
                : `<p class="pvp-foot">${this._esc(preview.footer_text || "This is a public preview. The vault's contents stay encrypted.")}</p>`;
            return `<div class="pvp-card">
                <div class="pvp-row">${thumb}<div class="pvp-meta">
                    <h1 class="pvp-title">${this._esc(preview.title)}</h1>
                    <p class="pvp-desc">${this._esc(preview.description)}</p>${expiry}
                </div></div>
                ${disclaimer}
                ${this._keyPrompt(s)}
                ${this._support(preview)}
                ${footer}</div>`;
        }

        _keyPrompt(s) {
            if (s.showKeyPrompt === false) return '';
            let err = '';
            if (s.wrongVaultKey) {
                const href = location.origin + '/#' + s.wrongVaultKey;   // root inbox opens whatever vault this key is for
                err = `<div class="pvp-err" role="alert">⚠ That key is valid, but it opens a <b>different</b> vault — not the one this preview is about.</div>
                       <a class="pvp-wrongvault" href="${this._esc(href)}">Open that vault instead →</a>`;
            } else if (s.keyError) {
                err = `<div class="pvp-err" role="alert">${this._esc(s.keyError)}</div>`;
            }
            // If this device already holds the key for this vault, offer a one-click open.
            const local = s.hasLocalKey ? `
                <button class="pvp-open-local" type="button">🔓 Open this vault — key saved on this device</button>
                <div class="pvp-or"><span>or enter the key</span></div>` : '';
            return `<section class="pvp-keybox">
                ${local}
                <h2 class="pvp-klabel">🔑 Enter the vault key to open the contents</h2>
                <form class="pvp-keyform">
                    <input id="pvpk" class="pvp-keyinput" type="text" autocomplete="off"
                           placeholder="vault key  ·  or  ro-token (ro-…)" aria-describedby="pvperr">
                    <button class="pvp-open" type="submit">Open vault ▶</button>
                </form>
                <p class="pvp-keyhint">Have a read-only token? Paste it (e.g. <code>ro-coral-stamp-5678</code>) to browse this vault without write access.</p>
                <div id="pvperr">${err}</div>
            </section>`;
        }

        _support(preview) {
            if (!preview || !preview.support || !preview.support.href) return '';
            return `<a class="pvp-support" href="${this._esc(preview.support.href)}">✉ ${this._esc(preview.support.label || 'Contact')}</a>`;
        }
    }

    SgPublicPreviewCard.styles = `
        :host { display: block; font-family: var(--font-body, system-ui, sans-serif); color: var(--color-text, #e2e8f0); }
        .pvp-card { max-width: 520px; margin: 0 auto; background: var(--bg-surface, #14142a);
            border: 1px solid var(--color-border, #2a2a44); border-radius: 12px; padding: 20px; }
        .pvp-row { display: flex; gap: 16px; align-items: flex-start; }
        .pvp-thumb { width: 96px; height: 96px; border-radius: 8px; object-fit: cover; flex: 0 0 auto;
            background: var(--bg-secondary, #1c1c33); display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .pvp-title { font-size: 1.2rem; margin: 0 0 6px; }
        .pvp-desc { margin: 0; color: var(--color-text-secondary, #9aa4bf); font-size: 0.92rem; }
        .pvp-expnote { margin-top: 6px; font-size: 0.78rem; color: var(--color-text-secondary, #9aa4bf); }
        .pvp-disclaimer { margin: 14px 0; padding: 10px 12px; border: 1px solid var(--color-border, #2a2a44);
            border-left: 3px solid #E94560; border-radius: 6px; font-size: 0.86rem; }
        .pvp-disclaimer--danger  { border-left-color: #E94560; } .pvp-disclaimer--danger strong  { color: #E94560; }
        .pvp-disclaimer--warning { border-left-color: #E9C445; } .pvp-disclaimer--warning strong { color: #E9C445; }
        .pvp-disclaimer--info    { border-left-color: #4f8ff7; } .pvp-disclaimer--info strong    { color: #4f8ff7; }
        .pvp-disclaimer--neutral { border-left-color: #9aa4bf; } .pvp-disclaimer--neutral strong { color: #cbd5e1; }
        /* Prominent, separated call-to-action for the vault key */
        .pvp-keybox { margin-top: 20px; padding: 18px; border-radius: 10px;
            background: rgba(79,143,247,0.06); border: 1px solid rgba(79,143,247,0.30); }
        .pvp-klabel { display: block; margin: 0 0 12px; font-size: 1.05rem; font-weight: 700; color: var(--color-text, #e2e8f0); }
        .pvp-keyform { display: flex; gap: 10px; }
        .pvp-keyinput { flex: 1; min-width: 0; padding: 13px 14px; font-size: 1rem; border-radius: 8px;
            border: 1px solid var(--color-border, #2a2a44); background: var(--bg-primary, #0a0a18); color: var(--color-text, #e2e8f0); font-family: inherit; }
        .pvp-keyinput:focus { outline: none; border-color: var(--color-primary, #4f8ff7); box-shadow: 0 0 0 3px rgba(79,143,247,0.18); }
        .pvp-open { padding: 13px 22px; border: 0; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 1rem;
            white-space: nowrap; background: var(--color-primary, #4f8ff7); color: #fff; }
        .pvp-open:hover { filter: brightness(1.08); }
        .pvp-open-local { display: block; width: 100%; padding: 13px 16px; margin-bottom: 4px; border: 0; border-radius: 8px;
            cursor: pointer; font-weight: 700; font-size: 1rem; background: var(--color-primary, #4f8ff7); color: #fff; }
        .pvp-open-local:hover { filter: brightness(1.08); }
        .pvp-or { display: flex; align-items: center; gap: 10px; margin: 12px 0; color: var(--color-text-secondary, #9aa4bf); font-size: 0.82rem; }
        .pvp-or::before, .pvp-or::after { content: ""; flex: 1; height: 1px; background: var(--color-border, #2a2a44); }
        .pvp-keyhint { margin: 10px 0 0; font-size: 0.8rem; color: var(--color-text-secondary, #9aa4bf); }
        .pvp-keyhint code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.92em;
            background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-border, #2a2a44); border-radius: 4px; padding: 1px 5px; }
        .pvp-err { color: var(--danger, #E94560); font-size: 0.86rem; margin-top: 8px; }
        .pvp-wrongvault { display: inline-block; margin-top: 10px; padding: 10px 16px; border-radius: 8px;
            background: var(--color-primary, #4f8ff7); color: #fff; font-weight: 700; text-decoration: none; }
        .pvp-support { display: inline-block; margin-top: 14px; color: var(--color-primary, #4f8ff7); text-decoration: none; }
        .pvp-foot, .pvp-sub { font-size: 0.76rem; color: var(--color-text-secondary, #9aa4bf); margin-top: 14px; }
        .pvp-notice { font-size: 1.05rem; padding: 8px 0; }
        .sk { background: linear-gradient(90deg, #1c1c33 25%, #25254010 50%, #1c1c33 75%); border-radius: 6px; }
        .sk-line { height: 12px; margin: 8px 0; }
        .pvp-skeleton .pvp-thumb.sk { background: #1c1c33; }
        .pvp-meta { flex: 1; }
    `;

    customElements.define('sg-public-preview-card', SgPublicPreviewCard);
})();
