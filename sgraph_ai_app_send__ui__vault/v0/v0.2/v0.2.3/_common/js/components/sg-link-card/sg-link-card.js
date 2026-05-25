/* =================================================================================
   SGraph Vault — <sg-link-card>  (sub-vault open surface)
   v0.1.0 — Phase 2

   A small modal shown when a locked sub-vault is opened: it surfaces the child's
   PUBLIC info before asking for a key (via the shipped PublicPreviewRead.fetchPreview
   when the link carries a public_id), then prompts for the key with a save choice.

   Self-contained (inline shadow styles), like sg-public-preview-card. The host
   (vault-shell) appends it to <body>, calls openCard(opts), and listens for:
     sg-link-open            detail { key, save: 'local'|'session' }   → open here (read-only)
     sg-link-open-new-window detail { key }                            → open in a new tab
     sg-link-cancel                                                     → dismiss

   Public info is best-effort: if PublicPreviewRead is unavailable or the fetch
   fails, the card simply shows the label. The card NEVER opens the vault itself —
   it only collects the key + intent and emits an event.
   ================================================================================= */

(function () {
    'use strict';

    class SgLinkCard extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._opts = {};
        }

        openCard(opts) {
            this._opts = opts || {};
            this._render();
            this._loadPublicInfo();   // best-effort, async
            const input = this.shadowRoot.getElementById('lk-key');
            if (input) input.focus();
        }

        // --- public info (PublicPreviewRead.fetchPreview) ------------------------
        async _loadPublicInfo() {
            const { publicId, apiBase } = this._opts;
            if (!publicId || typeof PublicPreviewRead === 'undefined') return;
            const box = this.shadowRoot.getElementById('lk-public');
            if (box) box.textContent = 'Loading public info…';
            try {
                const res = await PublicPreviewRead.fetchPreview(apiBase || 'https://dev.send.sgraph.ai', publicId);
                if (!box) return;
                if (res && res.status === 'ok' && res.preview) {
                    const p = res.preview;
                    box.innerHTML = '<div class="lk-pp-title"></div><div class="lk-pp-desc"></div>';
                    box.querySelector('.lk-pp-title').textContent = p.title || '';
                    box.querySelector('.lk-pp-desc').textContent  = p.description || '';
                } else {
                    box.textContent = 'No public info published for this vault.';
                    box.classList.add('lk-muted');
                }
            } catch (_) {
                if (box) { box.textContent = ''; }
            }
        }

        _emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail: detail || {}, bubbles: true, composed: true })); }
        _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        _render() {
            const label = this._esc(this._opts.label || 'Linked vault');
            this.shadowRoot.innerHTML = `
                <style>
                    :host { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
                            background: rgba(5,5,15,0.65); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                    .lk-card { background: #12122a; border: 1px solid #2a2a4a; border-radius: 10px; padding: 1.5rem;
                               width: 100%; max-width: 420px; box-sizing: border-box; margin: 1rem; color: #e2e8f0; }
                    .lk-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
                    .lk-glyph { font-size: 1.1rem; }
                    .lk-title { font-size: 1.05rem; font-weight: 700; }
                    .lk-ro { font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 9999px; font-weight: 600;
                             background: rgba(100,160,220,0.12); color: #64a0dc; border: 1px solid rgba(100,160,220,0.25); }
                    .lk-public { font-size: 0.82rem; color: #8892a4; margin: 0.5rem 0 1rem; min-height: 1rem; }
                    .lk-public.lk-muted { color: #4a5568; font-style: italic; }
                    .lk-pp-title { font-weight: 600; color: #cbd5e1; }
                    .lk-pp-desc { margin-top: 0.15rem; }
                    .lk-label { display: block; font-size: 0.78rem; font-weight: 600; color: #8892a4; margin: 0.6rem 0 0.35rem; }
                    .lk-input { width: 100%; padding: 0.55rem 0.7rem; background: #0a0a18; border: 1px solid #2a2a4a; border-radius: 5px;
                                color: #e2e8f0; font-size: 0.875rem; font-family: monospace; outline: none; box-sizing: border-box; }
                    .lk-input:focus { border-color: #4ECDC4; box-shadow: 0 0 0 2px rgba(78,205,196,0.15); }
                    .lk-save { font-size: 0.78rem; color: #8892a4; margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.25rem; }
                    .lk-save label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
                    .lk-err { color: #ff6b6b; font-size: 0.78rem; min-height: 1rem; margin-top: 0.4rem; }
                    .lk-actions { display: flex; gap: 0.5rem; margin-top: 1.1rem; flex-wrap: wrap; }
                    .lk-btn { flex: 1; min-width: 120px; padding: 0.6rem; border-radius: 5px; border: none; font-weight: 700;
                              font-size: 0.85rem; cursor: pointer; }
                    .lk-btn--primary { background: #4ECDC4; color: #0a0a18; }
                    .lk-btn--primary:hover { background: #3dbdb5; }
                    .lk-btn--ghost { background: transparent; color: #8892a4; border: 1px solid #2a2a4a; }
                    .lk-btn--ghost:hover { color: #e2e8f0; }
                    .lk-cancel { background: none; border: none; color: #4a5568; font-size: 0.78rem; cursor: pointer;
                                 margin-top: 0.6rem; text-decoration: underline; display: block; }
                </style>
                <div class="lk-card" role="dialog" aria-modal="true">
                    <div class="lk-head">
                        <span class="lk-glyph">🗄</span>
                        <span class="lk-title">${label}</span>
                        <span class="lk-ro">👁 Read-only</span>
                    </div>
                    <div class="lk-public" id="lk-public"></div>

                    <label class="lk-label" for="lk-key">Vault key or read-only token</label>
                    <input id="lk-key" class="lk-input" type="password" placeholder="apple-river-1234  or  ro-coral-stamp-5678"
                           autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
                    <div class="lk-save">
                        <label><input type="radio" name="lk-save" value="session" checked> Don't save — ask each time</label>
                        <label><input type="radio" name="lk-save" value="local"> Save on this device</label>
                    </div>
                    <div class="lk-err" id="lk-err"></div>

                    <div class="lk-actions">
                        <button class="lk-btn lk-btn--primary" id="lk-open">Open here (read-only)</button>
                        <button class="lk-btn lk-btn--ghost" id="lk-new">Open in new window ↗</button>
                    </div>
                    <button class="lk-cancel" id="lk-cancel">Cancel</button>
                </div>
            `;

            const root  = this.shadowRoot;
            const keyEl = root.getElementById('lk-key');
            const errEl = root.getElementById('lk-err');
            const save  = () => (root.querySelector('input[name="lk-save"]:checked') || {}).value || 'session';
            const getKey = () => { const v = (keyEl.value || '').trim(); if (!v) { errEl.textContent = 'Please enter a key or token.'; keyEl.focus(); } return v; };

            root.getElementById('lk-open').addEventListener('click', () => { const k = getKey(); if (k) this._emit('sg-link-open', { key: k, save: save() }); });
            root.getElementById('lk-new').addEventListener('click',  () => { const k = getKey(); if (k) this._emit('sg-link-open-new-window', { key: k }); });
            root.getElementById('lk-cancel').addEventListener('click', () => this._emit('sg-link-cancel', {}));
            keyEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const k = getKey(); if (k) this._emit('sg-link-open', { key: k, save: save() }); } });
            this.addEventListener('click', (e) => { if (e.target === this) this._emit('sg-link-cancel', {}); });  // backdrop
        }
    }

    if (!customElements.get('sg-link-card')) customElements.define('sg-link-card', SgLinkCard);
})();
