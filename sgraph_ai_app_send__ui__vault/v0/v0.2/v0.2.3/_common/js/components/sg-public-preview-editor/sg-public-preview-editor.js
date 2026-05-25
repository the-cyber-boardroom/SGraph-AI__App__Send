/* =================================================================================
   SGraph Vault — Public Preview Editor
   v0.1.0 — author / publish / update / unpublish a vault's public preview.

   Self-contained Web Component. Default OFF (nothing public). Call
   setContext({ sgSend, vault }) with the owner's SGSend (access token set) and an
   opened SGVault (for bookkeeping). Uses PublicPreviewWrite + PublicPreviewSchema +
   PublicPreviewCrypto. Thumbnails are encoded fully natively (createImageBitmap →
   canvas → toBlob('image/webp')) — no libraries, no wasm; EXIF dropped by re-encode.

   ⚠ Browser-verification pending (logic + flows implemented; not yet exercised in a
   real browser/Playwright run).
   ================================================================================= */

(function () {
    'use strict';

    const INLINE_CAP = 64 * 1024;   // ~64 KB encoded data-URL ceiling (Q-thumbnail)

    class SgPublicPreviewEditor extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._ctx   = { sgSend: null, vault: null };
            this._on    = false;
            this._thumb = null;     // { mode:'inline', media_type, data }
            this._published = null; // last publish result { transferId, publicId, deleteAuth }
        }
        connectedCallback() { this.render(); }

        setContext({ sgSend, vault }) { this._ctx = { sgSend, vault }; this.render(); }

        $(s) { return this.shadowRoot.querySelector(s); }
        _val(s) { const el = this.$(s); return el ? el.value.trim() : ''; }
        _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

        // --- native thumbnail encode (no libs / no wasm) -----------------------
        async _encodeThumb(fileOrBlob) {
            const bitmap = await createImageBitmap(fileOrBlob);
            const max    = 512;
            const scale  = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
            const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
            // quality search to fit the inline cap
            let q = 0.85, dataUrl = canvas.toDataURL('image/webp', q);
            while (dataUrl.length > INLINE_CAP && q > 0.3) { q -= 0.15; dataUrl = canvas.toDataURL('image/webp', q); }
            return { mode: 'inline', media_type: 'image/webp', data: dataUrl, oversize: dataUrl.length > INLINE_CAP };
        }

        async _onThumbFile(file) {
            try {
                const t = await this._encodeThumb(file);
                this._thumb = { mode: 'inline', media_type: t.media_type, data: t.data };
                this.$('.ed-thumb-preview').innerHTML = `<img src="${this._esc(t.data)}" alt="">`;
                this.$('.ed-thumb-note').textContent = t.oversize
                    ? 'Still larger than 64 KB after re-encode — consider a simpler image.'
                    : `Encoded to WebP (${Math.round(t.data.length / 1024)} KB, EXIF stripped).`;
                this._emitChanged();   // live preview shows the new thumbnail
            } catch (e) { this.$('.ed-thumb-note').textContent = 'Could not read that image.'; }
        }

        _collectPreview() {
            const p = PublicPreviewSchema.emptyPreview();
            p.title       = this._val('.ed-title');
            p.description = this._val('.ed-desc');
            p.disclaimer  = this._val('.ed-disclaimer');
            const sl = this._val('.ed-support-label'), sh = this._val('.ed-support-href');
            if (sh) p.support = { label: sl || 'Contact', href: sh };
            if (this._thumb) p.thumbnail = this._thumb;
            return p;
        }
        _collectExpiry() {
            const days  = parseInt(this._val('.ed-exp-days'),  10);
            const opens = parseInt(this._val('.ed-exp-opens'), 10);
            return {
                expiresAtMs:    (this.$('.ed-exp-time-on').checked  && days  > 0) ? Date.now() + days * 86400000 : null,
                maxAccessCount: (this.$('.ed-exp-opens-on').checked && opens > 0) ? opens : null,
                autoDelete:     this.$('.ed-exp-opens-on').checked
            };
        }
        _publicId() {
            return this.$('.ed-id-random').checked ? this.$('.ed-id-rnd').value : this._val('.ed-id-custom');
        }

        async _doPublish(isUpdate) {
            const { sgSend, vault } = this._ctx;
            if (!sgSend || !vault) { this._status('No vault context — open a vault first.', true); return; }
            const publicId = this._publicId();
            const idCheck  = PublicPreviewSchema.validatePublicId(publicId);
            if (!idCheck.ok) { this._status(idCheck.reason, true); return; }
            const preview  = this._collectPreview();
            if (!preview.title) { this._status('A title is required.', true); return; }
            const guard = PublicPreviewSchema.validatePreview(preview);
            if (!guard.ok) { this._status('Cannot publish: ' + guard.reason, true); return; }

            this._status(isUpdate ? 'Updating preview…' : 'Publishing…');
            try {
                const fn = isUpdate ? PublicPreviewWrite.updatePreview : PublicPreviewWrite.publishPreview;
                const res = await fn.call(PublicPreviewWrite, { sgSend, vault, publicId: idCheck.id, preview, expiry: this._collectExpiry() });
                this._published = res;
                this._status(isUpdate ? 'Updated. Your share link is unchanged.' : 'Published.');
                this._renderShare(res);
            } catch (e) {
                this._status((e.code === 'id-taken') ? 'That public id is already taken. Choose another.' : ('Publish failed: ' + e.message), true);
            }
        }

        async _doUnpublish() {
            const { sgSend, vault } = this._ctx;
            const publicId = this._publicId();
            this._status('Unpublishing…');
            try {
                await PublicPreviewWrite.unpublishPreview({ sgSend, vault, publicId });
                this._published = null;
                this._status('Unpublished. The preview link will stop working.');
                this.$('.ed-share').innerHTML = '';
            } catch (e) { this._status('Unpublish failed: ' + e.message, true); }
        }

        _status(msg, isErr) { const el = this.$('.ed-status'); if (el) { el.textContent = msg; el.className = 'ed-status' + (isErr ? ' ed-status--err' : ''); } }

        async _renderShare(res) {
            const base = (this._ctx.sgSend && this._ctx.sgSend.endpoint) || 'https://send.sgraph.ai';
            const appBase = location.origin + '/en-gb/app/';
            const previewLink = appBase + res.publicId;
            this.$('.ed-share').innerHTML =
                `<div class="ed-sharebox">
                   <label>Preview link (safe)</label>
                   <div class="ed-copyrow"><input readonly value="${this._esc(previewLink)}"><button class="ed-copy" data-v="${this._esc(previewLink)}">Copy</button></div>
                   <p class="ed-hint">Anyone with this link sees the preview and is asked for the key.</p>
                   <details><summary>Show full-access link (includes the vault key)</summary>
                     <p class="ed-warn">⚠ Includes the vault key — anyone with this link can open the FULL vault. Share only with trusted people. (Add <code>#&lt;vault-key&gt;</code> to the preview link.)</p>
                   </details>
                 </div>`;
            this.shadowRoot.querySelectorAll('.ed-copy').forEach(b => b.addEventListener('click', () => navigator.clipboard?.writeText(b.dataset.v)));
        }

        render() {
            this.shadowRoot.innerHTML = `<style>${SgPublicPreviewEditor.styles}</style>
              <div class="ed">
                <div class="ed-toprow">
                  <label class="ed-switch"><input type="checkbox" class="ed-on" ${this._on ? 'checked' : ''}> Public preview: <strong>${this._on ? 'ON' : 'OFF'}</strong></label>
                </div>
                <p class="ed-intro">A public preview lets anyone with the link see the title, description, and thumbnail you choose — even without the vault key. It is deliberately public.</p>
                <div class="ed-form" style="display:${this._on ? 'block' : 'none'}">
                  <fieldset><legend>Public id</legend>
                    <label><input type="radio" name="idmode" class="ed-id-custom-r" checked> Custom</label>
                    <input class="ed-id-custom" placeholder="vault-demo-health-data">
                    <label><input type="radio" name="idmode" class="ed-id-random"> Random</label>
                    <input class="ed-id-rnd" readonly value="${PublicPreviewSchema.randomPublicId()}">
                    <button class="ed-regen" type="button">↻</button>
                    <p class="ed-hint">Lowercase letters, numbers, hyphens (4–63). The id appears in URLs and logs.</p>
                  </fieldset>
                  <label class="ed-l">Title *<input class="ed-title" placeholder="Health Data Demo Vault"></label>
                  <label class="ed-l">Description<textarea class="ed-desc" rows="2"></textarea></label>
                  <label class="ed-l">Thumbnail</label>
                  <input type="file" accept="image/*" class="ed-thumb-file">
                  <div class="ed-thumb-preview"></div><p class="ed-thumb-note ed-hint"></p>
                  <label class="ed-l">Disclaimer<textarea class="ed-disclaimer" rows="2" placeholder="Confidential. Do not use unless authorised."></textarea></label>
                  <div class="ed-support">
                    <label class="ed-l">Support label<input class="ed-support-label" placeholder="No key? Contact…"></label>
                    <label class="ed-l">Support href<input class="ed-support-href" placeholder="mailto:…"></label>
                  </div>
                  <fieldset><legend>Expiry (off by default)</legend>
                    <label><input type="checkbox" class="ed-exp-time-on"> Expire after <input class="ed-exp-days" type="number" min="1" value="30" style="width:64px"> days</label>
                    <label><input type="checkbox" class="ed-exp-opens-on"> Stop after <input class="ed-exp-opens" type="number" min="1" value="50" style="width:64px"> opens</label>
                    <p class="ed-hint">Server-enforced. Both off = no expiry.</p>
                  </fieldset>
                  <div class="ed-actions">
                    <button class="ed-publish" type="button">Review &amp; publish →</button>
                    <button class="ed-update"  type="button">Update (same link)</button>
                    <button class="ed-unpub"   type="button">Unpublish</button>
                  </div>
                  <div class="ed-status"></div>
                  <div class="ed-share"></div>
                </div>
              </div>`;

            this.$('.ed-on').addEventListener('change', (e) => { this._on = e.target.checked; this.render(); this._emitChanged(); });
            if (this._on) {
                this.$('.ed-regen').addEventListener('click', () => { this.$('.ed-id-rnd').value = PublicPreviewSchema.randomPublicId(); });
                this.$('.ed-thumb-file').addEventListener('change', (e) => { if (e.target.files[0]) this._onThumbFile(e.target.files[0]); });
                this.$('.ed-publish').addEventListener('click', () => this._confirmThenPublish(false));
                this.$('.ed-update').addEventListener('click',  () => this._confirmThenPublish(true));
                this.$('.ed-unpub').addEventListener('click',   () => this._doUnpublish());
                this.$('.ed-form').addEventListener('input', () => this._emitChanged());   // live preview
                this._emitChanged();                                                       // initial paint
            }
        }

        // Broadcast the current preview so a side-by-side <sg-public-preview-card> updates live.
        _emitChanged() {
            if (!this._on) return;
            this.dispatchEvent(new CustomEvent('pvp-preview-changed', {
                detail: { preview: this._collectPreview() }, bubbles: true, composed: true
            }));
        }

        // In-page confirmation (NOT window.confirm). Cancel is default-focused; Publish is not.
        _confirmThenPublish(isUpdate) {
            const preview = this._collectPreview();
            if (!preview.title) { this._status('A title is required.', true); return; }
            this._showConfirmModal(
                `Publish “${preview.title}”?`,
                [`This will be publicly readable by anyone with the link …/app/${this._publicId()}`,
                 `The id appears in URLs and server logs. The vault's contents stay encrypted.`],
                isUpdate ? 'Update — republish' : 'Publish — make this public',
                () => this._doPublish(isUpdate)
            );
        }

        _showConfirmModal(title, lines, okLabel, onOk) {
            const prev = this.shadowRoot.querySelector('.ed-modal-overlay');
            if (prev) prev.remove();
            const wrap = document.createElement('div');
            wrap.className = 'ed-modal-overlay';
            wrap.innerHTML =
                `<div class="ed-modal" role="dialog" aria-modal="true" aria-label="${this._esc(title)}">
                    <h3>${this._esc(title)}</h3>
                    ${lines.map(l => `<p>${this._esc(l)}</p>`).join('')}
                    <div class="ed-modal-actions">
                        <button type="button" class="ed-modal-cancel">Cancel</button>
                        <button type="button" class="ed-modal-ok">${this._esc(okLabel)}</button>
                    </div>
                </div>`;
            this.shadowRoot.appendChild(wrap);
            const close = () => wrap.remove();
            wrap.querySelector('.ed-modal-cancel').addEventListener('click', close);
            wrap.querySelector('.ed-modal-ok').addEventListener('click', () => { close(); onOk(); });
            wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });            // click backdrop to dismiss
            wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
            wrap.querySelector('.ed-modal-cancel').focus();                                        // Cancel default-focused
        }
    }

    SgPublicPreviewEditor.styles = `
        :host { display:block; font-family: var(--font-body, system-ui, sans-serif); color: var(--color-text, #e2e8f0); }
        .ed { max-width: 560px; }
        .ed-intro, .ed-hint { color: var(--color-text-secondary, #9aa4bf); font-size: 0.82rem; }
        .ed-switch { font-size: 0.95rem; }
        .ed-l { display:block; margin: 10px 0 4px; font-size: 0.85rem; }
        .ed input[type=text], .ed input:not([type]), .ed textarea, .ed-id-custom, .ed-id-rnd, .ed-title, .ed-desc, .ed-disclaimer, .ed-support-label, .ed-support-href {
            width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border, #2a2a44);
            background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); font: inherit; }
        fieldset { border: 1px solid var(--color-border, #2a2a44); border-radius: 8px; margin: 14px 0; padding: 10px 12px; }
        legend { font-size: 0.8rem; color: var(--color-text-secondary, #9aa4bf); }
        .ed-actions { display:flex; gap:8px; margin-top: 14px; flex-wrap: wrap; }
        .ed-actions button { padding: 9px 14px; border:0; border-radius:6px; cursor:pointer; font-weight:600; }
        .ed-publish { background: var(--color-primary, #4f8ff7); color:#fff; }
        .ed-update, .ed-unpub { background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); border:1px solid var(--color-border,#2a2a44); }
        .ed-status { margin-top: 10px; font-size: 0.85rem; }
        .ed-status--err { color: var(--danger, #E94560); }
        .ed-thumb-preview img { max-width: 128px; border-radius: 6px; margin-top: 6px; }
        .ed-sharebox { margin-top: 12px; border-top:1px solid var(--color-border,#2a2a44); padding-top:10px; }
        .ed-copyrow { display:flex; gap:8px; } .ed-copyrow input { flex:1; }
        .ed-warn { color: var(--danger, #E94560); font-size: 0.8rem; }
        .ed-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display:flex;
            align-items:center; justify-content:center; z-index: 1000; padding: 24px; }
        .ed-modal { background: var(--surface, #14142a); border: 1px solid var(--border, #2a2a44);
            border-radius: 12px; padding: 22px; max-width: 460px; width: 100%; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
        .ed-modal h3 { margin: 0 0 10px; font-size: 1.05rem; }
        .ed-modal p { margin: 6px 0; font-size: 0.86rem; color: var(--color-text-secondary, #9aa4bf); }
        .ed-modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top: 18px; }
        .ed-modal-actions button { padding: 9px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
        .ed-modal-cancel { background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); border: 1px solid var(--border, #2a2a44); }
        .ed-modal-ok { background: var(--color-primary, #4f8ff7); color: #fff; border: 0; }
    `;

    customElements.define('sg-public-preview-editor', SgPublicPreviewEditor);
})();
