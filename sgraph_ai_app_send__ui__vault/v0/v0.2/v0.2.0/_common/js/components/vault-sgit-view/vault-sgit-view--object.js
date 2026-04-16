/* =============================================================================
   SGraph Vault — SGit View: Object Viewer
   v0.2.0 — Load, decrypt, and render any vault object (commit/tree/blob)

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        async _loadObject(objectId) {
            if (!objectId || !this._vault) return;

            this._objectViewData = { id: objectId, loading: true };
            this._switchTab('object');

            const container = this.querySelector('.sgit-body');
            container.innerHTML = `<div class="sgit-loading">Loading ${this._esc(objectId)}...</div>`;

            try {
                const vault      = this._vault;
                const ciphertext = await vault._objectStore.load(objectId);
                const plaintext  = await SGSendCrypto.decrypt(ciphertext, vault._readKey);
                const text       = new TextDecoder().decode(plaintext);
                let parsed;
                try { parsed = JSON.parse(text); } catch (_) { parsed = null; }

                this._objectViewData = { id: objectId, raw: text, parsed, size: ciphertext.byteLength || ciphertext.length };

                if (parsed?.schema === 'commit_v1' || parsed?.schema === 'commit_v2') {
                    if (parsed.message_enc) {
                        try {
                            const msgCipher = SGVaultCommit._base64ToArrayBuffer(parsed.message_enc);
                            const msgPlain  = await SGSendCrypto.decrypt(msgCipher, vault._readKey);
                            parsed.message  = new TextDecoder().decode(msgPlain);
                        } catch (_) {}
                    }
                    this._objectViewData.type = 'commit';
                } else if (parsed?.schema === 'tree_v1') {
                    const dec = async (b64) => {
                        if (!b64) return null;
                        const cipher = SGVaultCommit._base64ToArrayBuffer(b64);
                        const plain  = await SGSendCrypto.decrypt(cipher, vault._readKey);
                        return new TextDecoder().decode(plain);
                    };
                    for (const entry of parsed.entries || []) {
                        if (entry.name_enc)         entry.name         = await dec(entry.name_enc);
                        if (entry.size_enc)         entry.size         = await dec(entry.size_enc);
                        if (entry.content_hash_enc) entry.content_hash = await dec(entry.content_hash_enc);
                    }
                    this._objectViewData.type = 'tree';
                } else {
                    this._objectViewData.type = 'blob';
                }

                this._renderObject(container);
            } catch (err) {
                container.innerHTML = `<div class="sgit-error">Failed to load object: ${this._esc(err.message)}</div>`;
            }
        },

        _renderObject(container) {
            const obj = this._objectViewData;
            if (!obj || obj.loading) return;

            const sizeStr = typeof VaultHelpers !== 'undefined'
                ? VaultHelpers.formatBytes(obj.size || 0)
                : (obj.size || 0) + ' B';

            container.innerHTML = `
                <div class="sgit-object-viewer">
                    <div class="sgit-obj-header">
                        <button class="sgit-back-btn">\u2190 Back</button>
                        <span class="sgit-obj-path">bare/data/${this._esc(obj.id)}</span>
                        <span class="sgit-obj-size">${sizeStr}</span>
                    </div>
                    <div class="sgit-obj-tabs">
                        <button class="sgit-obj-tab sgit-obj-tab--active" data-otab="schema">Schema</button>
                        <button class="sgit-obj-tab" data-otab="raw">Raw</button>
                    </div>
                    <div class="sgit-obj-content">
                        <div class="sgit-obj-panel" data-opanel="schema">${this._renderSchema(obj)}</div>
                        <div class="sgit-obj-panel" data-opanel="raw" style="display:none"><pre class="sgit-json">${this._esc(JSON.stringify(obj.parsed || obj.raw, null, 2))}</pre></div>
                    </div>
                </div>
            `;

            container.querySelectorAll('.sgit-obj-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    container.querySelectorAll('.sgit-obj-tab').forEach(t => t.classList.toggle('sgit-obj-tab--active', t === tab));
                    container.querySelectorAll('.sgit-obj-panel').forEach(p => p.style.display = p.dataset.opanel === tab.dataset.otab ? '' : 'none');
                });
            });
        },

        _renderSchema(obj) {
            if (!obj.parsed) return `<div class="sgit-empty">Binary or non-JSON object</div>`;

            const data = obj.parsed;

            if (obj.type === 'commit') {
                return `
                    <div class="sgit-schema">
                        <span class="sgit-badge sgit-badge--schema">${this._esc(data.schema || 'commit')}</span>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">MESSAGE</div>
                            <div class="sgit-schema-value">${this._esc(data.message || '(encrypted)')}</div>
                        </div>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">TREE</div>
                            <div class="sgit-schema-value"><a class="sgit-obj-link" href="#" data-id="${this._esc(data.tree_id)}">${this._esc(data.tree_id)}</a></div>
                        </div>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">TIMESTAMP</div>
                            <div class="sgit-schema-value">${data.timestamp_ms ? new Date(data.timestamp_ms).toISOString() : '--'}</div>
                        </div>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">BRANCH</div>
                            <div class="sgit-schema-value">${this._esc(data.branch_id || '--')}</div>
                        </div>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">PARENTS (${(data.parents || []).length})</div>
                            <div class="sgit-schema-value">${(data.parents || []).map(p => `<a class="sgit-obj-link" href="#" data-id="${this._esc(p)}">${this._esc(p)}</a>`).join('<br>') || 'none'}</div>
                        </div>
                        ${data.signature ? `<div class="sgit-schema-field"><div class="sgit-schema-label">SIGNATURE</div><div class="sgit-schema-value sgit-mono" style="word-break:break-all;">${this._esc(data.signature)}</div></div>` : ''}
                    </div>
                `;
            }

            if (obj.type === 'tree') {
                const entries = data.entries || [];
                return `
                    <div class="sgit-schema">
                        <span class="sgit-badge sgit-badge--schema">${this._esc(data.schema || 'tree')}</span>
                        <div class="sgit-schema-field">
                            <div class="sgit-schema-label">TREE ENTRIES (${entries.length})</div>
                            <div class="sgit-schema-entries">
                                ${entries.map(e => {
                                    const isDir   = !!e.tree_id;
                                    const sizeStr = e.size ? `${e.size} B` : '';
                                    const link    = isDir
                                        ? `<a class="sgit-obj-link sgit-entry-link" href="#" data-id="${this._esc(e.tree_id)}">tree</a>`
                                        : (e.blob_id ? `<a class="sgit-obj-link sgit-entry-link" href="#" data-id="${this._esc(e.blob_id)}">blob</a>` : '');
                                    return `<div class="sgit-schema-entry">
                                        <span class="sgit-entry-icon">${isDir ? '/' : ''}</span>
                                        <span class="sgit-entry-name">${this._esc(e.name || '?')}</span>
                                        <span class="sgit-entry-size">${sizeStr}</span>
                                        ${link}
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }

            return `<pre class="sgit-json">${this._esc(JSON.stringify(data, null, 2))}</pre>`;
        }

    });
})();
