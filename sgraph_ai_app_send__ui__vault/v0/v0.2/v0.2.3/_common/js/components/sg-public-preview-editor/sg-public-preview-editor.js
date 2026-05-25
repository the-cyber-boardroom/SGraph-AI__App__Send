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
        connectedCallback() {
            this.render();
            // Standalone hosts self-open + auto-load an existing preview. Embedded hosts
            // (vault settings) carry `embedded` and call setContext() with the live vault.
            if (!this.hasAttribute('embedded')) this._ensureContext();
        }

        // External wiring (used when embedded in the vault settings). Hands the editor the
        // already-open vault (+ its key/token) so it neither re-opens nor races localStorage.
        setContext({ sgSend, vault, vaultKey }) {
            this._ctx = { sgSend: sgSend, vault: vault };
            this._ownerStatus = 'ready';
            if (vault && vault._vaultId) this._vaultId = vault._vaultId;
            try { this._vaultKey = vaultKey || localStorage.getItem('sg-vault-key') || this._vaultKey || ''; } catch (_) { this._vaultKey = vaultKey || ''; }
            this.render();
            this._afterContext();
        }

        // Runs once after the vault context is available (self-opened or set): load any
        // already-published preview so the editor opens in "edit existing" mode.
        _afterContext() {
            if (this._afterDone) return;
            this._afterDone = true;
            this._loadExisting();
        }

        // Self-contained vault open: read the vault key (+ per-vault access token) from
        // localStorage and open the vault. Returns { sgSend, vault } or null (no owner).
        async _ensureContext() {
            if (this._ctx && this._ctx.vault) return this._ctx;
            if (typeof SGVault === 'undefined' || typeof SGSend === 'undefined') return null;
            let key = '';
            try { key = localStorage.getItem('sg-vault-key') || ''; } catch (_) {}
            this._vaultKey = key;   // captured for the full-access share link
            if (!key)                 { this._setOwnerStatus('no-vault');  return null; }
            if (key.startsWith('ro-')){ this._setOwnerStatus('read-only'); return null; }
            const endpoint = (window.SG_ENDPOINT
                || (function(){ try { return sessionStorage.getItem('sg-vault-endpoint'); } catch (_) { return null; } })()
                || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
            try {
                const sgSend = new SGSend({ endpoint });
                const vault  = await SGVault.open(sgSend, key);
                let token = '';
                try { token = localStorage.getItem('accessKey:' + vault._vaultId) || localStorage.getItem('sg-vault-access-key-saved') || ''; } catch (_) {}
                if (token) sgSend.token = token;
                this._ctx = { sgSend, vault };
                this._vaultId = vault._vaultId;
                this.dispatchEvent(new CustomEvent('pvp-vault-ready', {
                    detail: { name: vault.name || vault._vaultId }, bubbles: true, composed: true
                }));
                this._setOwnerStatus(token ? 'ready' : 'no-token', vault.name || vault._vaultId);
                this._afterContext();                                   // load any existing published preview
                return this._ctx;
            } catch (e) { this._setOwnerStatus('error', e.message); return null; }
        }

        // Scan the owner vault for an already-published preview and load it for editing.
        async _loadExisting() {
            const vault = this._ctx && this._ctx.vault;
            if (!vault || typeof PublicPreviewRead === 'undefined') return;
            let entries = null;
            try { entries = vault.listFolder('.vault/owner/public-previews'); } catch (_) {}
            if (!entries || !entries.length) return;
            for (const entry of entries) {
                if (!entry.name || !entry.name.endsWith('.json')) continue;
                let bk = null;
                try { bk = JSON.parse(new TextDecoder().decode(await vault.getFile('.vault/owner/public-previews', entry.name))); }
                catch (_) { continue; }
                if (!bk || bk.active === false || !bk.public_id) continue;
                let res = null;
                const api = bk.api_base || (this._ctx.sgSend && this._ctx.sgSend.endpoint);
                try { res = await PublicPreviewRead.fetchPreview(api, bk.public_id); } catch (_) {}
                if (res && res.status === 'ok' && res.preview) {
                    this._on = true;
                    this._existing = true;
                    this.render();
                    this._populateForm(res.preview, bk.public_id);
                    this._setOwnerStatus((this._ctx.sgSend && this._ctx.sgSend.token) ? 'ready' : 'no-token');
                    this._status('Loaded your published preview — edit and "Update (same link)", or "Unpublish".');
                    return;
                }
            }
        }

        _populateForm(preview, publicId) {
            const set = (sel, v) => { const el = this.$(sel); if (el) el.value = (v == null ? '' : v); };
            const cr = this.$('.ed-id-custom-r'); if (cr) cr.checked = true;
            set('.ed-id-custom', publicId);
            set('.ed-title', preview.title);
            set('.ed-desc', preview.description);
            set('.ed-disclaimer', preview.disclaimer);
            set('.ed-disclaimer-label', preview.disclaimer_label != null ? preview.disclaimer_label : 'Confidential');
            const dv = this.$('.ed-disclaimer-variant'); if (dv && preview.disclaimer_variant) dv.value = preview.disclaimer_variant;
            if (preview.support) { set('.ed-support-label', preview.support.label); set('.ed-support-href', preview.support.href); }
            const sf = this.$('.ed-show-footer'); if (sf) sf.checked = preview.show_footer !== false;
            set('.ed-footer-text', preview.footer_text);
            if (preview.expiry && preview.expiry.expires_at_ms) {
                const t = this.$('.ed-exp-time-on'); if (t) t.checked = true;
                set('.ed-exp-days', Math.max(1, Math.round((preview.expiry.expires_at_ms - Date.now()) / 86400000)));
            }
            if (preview.expiry && preview.expiry.max_access_count) {
                const o = this.$('.ed-exp-opens-on'); if (o) o.checked = true;
                set('.ed-exp-opens', preview.expiry.max_access_count);
            }
            if (preview.thumbnail && preview.thumbnail.mode === 'inline' && preview.thumbnail.data) {
                this._thumb = preview.thumbnail;
                const tp = this.$('.ed-thumb-preview'); if (tp) tp.innerHTML = `<img src="${this._esc(preview.thumbnail.data)}" alt="">`;
            }
            this._emitChanged();
        }

        _setOwnerStatus(state, detail) {
            this._ownerStatus = state;
            const map = {
                'ready':     'Vault ready — you can publish.',
                'no-token':  'Vault open. Enter your access key below before publishing.',
                'no-vault':  'No vault is open in this browser. Open your vault first, then reopen this editor.',
                'read-only': 'This vault is open read-only — only the owner (full key) can publish.',
                'error':     'Could not open the vault: ' + (detail || '')
            };
            const acc = this.shadowRoot && this.shadowRoot.querySelector('.ed-access');
            if (acc) acc.style.display = (state === 'no-token' || state === 'ready') ? '' : 'none';
            const el = this.shadowRoot && this.shadowRoot.querySelector('.ed-owner-status');
            if (el) { el.textContent = map[state] || ''; el.className = 'ed-owner-status' + ((state === 'error' || state === 'no-vault' || state === 'read-only') ? ' ed-status--err' : ''); }
            if (this._ctx && this._ctx.sgSend && this._ctx.sgSend.token) {
                const ai = this.shadowRoot && this.shadowRoot.querySelector('.ed-access-input');
                if (ai && !ai.value) ai.value = this._ctx.sgSend.token;
            }
        }

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
            p.disclaimer       = this._val('.ed-disclaimer');
            p.disclaimer_label = this._val('.ed-disclaimer-label');
            const sel = this.$('.ed-disclaimer-variant');
            p.disclaimer_variant = sel ? sel.value : 'danger';
            const sf = this.$('.ed-show-footer');
            p.show_footer = sf ? sf.checked : true;
            p.footer_text = this._val('.ed-footer-text');
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
            const ctx = await this._ensureContext();
            if (!ctx) return;                                   // _ensureContext set the status (no-vault / read-only / error)
            const { sgSend, vault } = ctx;
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
                // Remember this vault's key for this public-id, so revisiting /app/<id>
                // on this device offers a one-click "key saved on this device" open.
                try { if (this._vaultKey) localStorage.setItem('sg-pvp-key:' + idCheck.id, this._vaultKey); } catch (_) {}
                this._status(isUpdate ? 'Updated. Your share link is unchanged.' : 'Published.');
                this._renderShare(res);
            } catch (e) {
                this._status((e.code === 'id-taken') ? 'That public id is already taken. Choose another.' : ('Publish failed: ' + e.message), true);
            }
        }

        async _doUnpublish() {
            const ctx = await this._ensureContext();
            if (!ctx) return;
            const { sgSend, vault } = ctx;
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
            const previewLink = location.origin + '/en-gb/app/' + res.publicId;
            const fullLink    = this._vaultKey ? (previewLink + '#' + this._vaultKey) : '';
            this.$('.ed-share').innerHTML =
                `<div class="ed-sharebox">
                   <label class="ed-l">Preview link (safe)</label>
                   <div class="ed-copyrow">
                     <input class="ed-share-input" readonly value="${this._esc(previewLink)}">
                     <button class="ed-copy" type="button" data-copy="${this._esc(previewLink)}">Copy</button>
                   </div>
                   <p class="ed-hint">Anyone with this link sees the preview and is asked for the key.</p>
                   ${fullLink ? `
                   <details class="ed-full">
                     <summary>Show full-access link (includes the vault key)</summary>
                     <p class="ed-warn">⚠ Includes the vault key — anyone with this link can open the FULL vault. Share only with trusted people.</p>
                     <div class="ed-copyrow">
                       <input class="ed-full-input" type="password" readonly value="${this._esc(fullLink)}">
                       <button class="ed-reveal" type="button">View</button>
                       <button class="ed-copy" type="button" data-copy="${this._esc(fullLink)}">Copy</button>
                     </div>
                   </details>` : ''}
                 </div>`;
            this.shadowRoot.querySelectorAll('.ed-copy').forEach(b =>
                b.addEventListener('click', () => this._copyFlash(b, b.dataset.copy)));
            const reveal = this.$('.ed-reveal');
            if (reveal) reveal.addEventListener('click', () => {
                const inp = this.$('.ed-full-input');
                const hidden = inp.type === 'password';
                inp.type = hidden ? 'text' : 'password';
                reveal.textContent = hidden ? 'Hide' : 'View';
            });
        }

        // Copy + briefly swap the button label to "Copied" (nice feedback).
        _copyFlash(btn, text) {
            try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (_) {}
            if (btn._flashTimer) { clearTimeout(btn._flashTimer); }
            else { btn._origText = btn.textContent; }
            btn.textContent = 'Copied';
            btn.classList.add('ed-copied');
            btn._flashTimer = setTimeout(() => {
                btn.textContent = btn._origText;
                btn.classList.remove('ed-copied');
                btn._flashTimer = null;
            }, 1500);
        }

        render() {
            this.shadowRoot.innerHTML = `<style>${SgPublicPreviewEditor.styles}</style>
              <div class="ed">
                <div class="ed-toprow">
                  <label class="ed-switch"><input type="checkbox" class="ed-on" ${this._on ? 'checked' : ''}> Public preview: <strong>${this._on ? 'ON' : 'OFF'}</strong></label>
                </div>
                <p class="ed-intro">A public preview lets anyone with the link see the title, description, and thumbnail you choose — even without the vault key. It is deliberately public.</p>
                <div class="ed-form" style="display:${this._on ? 'block' : 'none'}">
                  <div class="ed-owner-status"></div>
                  <div class="ed-access" style="display:none">
                    <label class="ed-l">Access key (needed to publish)</label>
                    <div class="ed-copyrow">
                      <input class="ed-access-input" type="password" placeholder="word-word-1234">
                      <button class="ed-access-use" type="button">Use</button>
                    </div>
                  </div>
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
                  <label class="ed-l">Disclaimer / badge</label>
                  <div class="ed-disclaimer-row">
                    <input class="ed-disclaimer-label" placeholder="Confidential" value="Confidential">
                    <select class="ed-disclaimer-variant">
                      <option value="danger">Danger (red)</option>
                      <option value="warning">Warning (amber)</option>
                      <option value="info">Info (blue)</option>
                      <option value="neutral">Neutral (grey)</option>
                    </select>
                  </div>
                  <textarea class="ed-disclaimer" rows="2" placeholder="Badge text. Leave empty for no badge."></textarea>
                  <div class="ed-support">
                    <label class="ed-l">Support label<input class="ed-support-label" placeholder="No key? Contact…"></label>
                    <label class="ed-l">Support href<input class="ed-support-href" placeholder="mailto:…"></label>
                  </div>
                  <fieldset><legend>Expiry (off by default)</legend>
                    <label><input type="checkbox" class="ed-exp-time-on"> Expire after <input class="ed-exp-days" type="number" min="1" value="30" style="width:64px"> days</label>
                    <label><input type="checkbox" class="ed-exp-opens-on"> Stop after <input class="ed-exp-opens" type="number" min="1" value="50" style="width:64px"> opens</label>
                    <p class="ed-hint">Server-enforced. Both off = no expiry.</p>
                  </fieldset>
                  <label class="ed-l"><input type="checkbox" class="ed-show-footer" checked> Show the "public preview" footer note</label>
                  <input class="ed-footer-text" placeholder="This is a public preview. The vault's contents stay encrypted.">
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
                this.$('.ed-form').addEventListener('input', () => this._emitChanged());    // text / textarea
                this.$('.ed-form').addEventListener('change', () => this._emitChanged());   // select / checkbox
                this._emitChanged();                                                        // initial paint
                const accUse = this.$('.ed-access-use');
                if (accUse) accUse.addEventListener('click', () => this._useAccessKey());
                // Reflect context (or self-open). Seed vault-name defaults only when NOT
                // editing an existing preview (which _loadExisting populated authoritatively).
                if (this._ctx && this._ctx.vault) {
                    this._setOwnerStatus(this._ctx.sgSend && this._ctx.sgSend.token ? 'ready' : 'no-token');
                    if (!this._existing) this._prefillFromVault(this._ctx.vault);
                } else { this._ensureContext(); }
            }
        }

        // Seed empty fields from the vault: the preview Title defaults to the vault
        // name, and the Custom public-id to a slug of it. Both only fill when empty
        // (never overwrite the owner's input); the publish modal is the confirmation.
        _prefillFromVault(vault) {
            const name = (vault && vault.name) || '';
            if (!name) return;
            const titleEl = this.$('.ed-title');
            if (titleEl && !titleEl.value.trim()) titleEl.value = name;
            const idEl = this.$('.ed-id-custom');
            if (idEl && !idEl.value.trim()) {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/, '');
                if (slug.length >= 4) idEl.value = slug;
            }
            this._emitChanged();
        }

        _useAccessKey() {
            const v = (this.$('.ed-access-input') && this.$('.ed-access-input').value || '').trim();
            if (this._ctx && this._ctx.sgSend) this._ctx.sgSend.token = v;
            try { if (v && this._vaultId) localStorage.setItem('accessKey:' + this._vaultId, v); } catch (_) {}
            this._status(v ? 'Access key set — you can publish.' : 'Access key cleared.');
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
        :host { display:block; box-sizing:border-box; padding: 16px 20px; font-family: var(--font-body, system-ui, sans-serif); color: var(--color-text, #e2e8f0); }
        .ed { max-width: 560px; }
        .ed-intro, .ed-hint { color: var(--color-text-secondary, #9aa4bf); font-size: 0.82rem; }
        .ed-switch { font-size: 0.95rem; }
        .ed-l { display:block; margin: 10px 0 4px; font-size: 0.85rem; }
        .ed input[type=text], .ed input[type=password], .ed input:not([type]), .ed textarea, .ed-id-custom, .ed-id-rnd, .ed-title, .ed-desc, .ed-disclaimer, .ed-disclaimer-label, .ed-footer-text, .ed-support-label, .ed-support-href {
            width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border, #2a2a44);
            background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); font: inherit; }
        .ed input[type=number], .ed select {
            padding: 8px 10px; border-radius: 6px; border: 1px solid var(--color-border, #2a2a44);
            background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); font: inherit; }
        .ed input[type=file] { color: var(--color-text-secondary, #9aa4bf); font: inherit; max-width: 100%; }
        .ed input[type=file]::file-selector-button {
            padding: 7px 12px; border-radius: 6px; border: 1px solid var(--color-border, #2a2a44);
            background: var(--bg-secondary, #1c1c33); color: var(--color-text, #e2e8f0); font: inherit; cursor: pointer; margin-right: 10px; }
        .ed input[type=checkbox], .ed input[type=radio] { accent-color: var(--color-primary, #4f8ff7); }
        .ed-disclaimer-row { display: flex; gap: 8px; margin: 4px 0 6px; }
        .ed-disclaimer-row .ed-disclaimer-label { flex: 1; }
        .ed-disclaimer-row .ed-disclaimer-variant { flex: 0 0 auto; }
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
        .ed-copyrow { display:flex; gap:8px; align-items:center; } .ed-copyrow input { flex:1; min-width:0; }
        .ed-copyrow button { padding:8px 12px; border-radius:6px; border:1px solid var(--color-border,#2a2a44);
            background:var(--bg-secondary,#1c1c33); color:var(--color-text,#e2e8f0); cursor:pointer; font:inherit; white-space:nowrap; flex:0 0 auto; }
        .ed-copyrow button:hover { background:#23234a; }
        .ed-copy.ed-copied { background:#22a06b; color:#fff; border-color:transparent; }
        .ed-full summary { cursor:pointer; font-size:0.85rem; margin:8px 0; }
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
