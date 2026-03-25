/* =============================================================================
   SGraph Vault — SGit View Component
   v0.1.5 — Commit history, object browser, tree viewer

   SourceTree-inspired view of vault internals:
     - Commit history: walk parent chain, show messages + timestamps
     - Object browser: click any object ID to load/decrypt and view raw JSON
     - References: HEAD, branch index
     - Interactive tree: expand/collapse folders

   Light DOM component.
   ============================================================================= */

(function() {
    'use strict';

    class VaultSgitView extends HTMLElement {

        constructor() {
            super();
            this._vault = null;
            this._commitCache = new Map();  // commitId → parsed commit
            this._activeTab = 'history';    // 'history' | 'refs' | 'tree' | 'object'
            this._objectViewData = null;    // { id, type, data } for object viewer
        }

        set vault(v) { this._vault = v; }
        get vault()  { return this._vault; }

        connectedCallback() {
            this.innerHTML = `
                <style>${VaultSgitView.styles}</style>
                <div class="sgit">
                    <div class="sgit-header">
                        <h2 class="sgit-title">SGit</h2>
                        <div class="sgit-tabs">
                            <button class="sgit-tab sgit-tab--active" data-tab="history">History</button>
                            <button class="sgit-tab" data-tab="refs">Refs</button>
                            <button class="sgit-tab" data-tab="tree">Tree</button>
                        </div>
                    </div>
                    <div class="sgit-body">
                        <div class="sgit-empty">Open a vault to see SGit data</div>
                    </div>
                </div>
            `;

            this.addEventListener('click', (e) => {
                const tab = e.target.closest('.sgit-tab');
                if (tab) {
                    this._switchTab(tab.dataset.tab);
                    return;
                }
                const objLink = e.target.closest('.sgit-obj-link');
                if (objLink) {
                    e.preventDefault();
                    this._loadObject(objLink.dataset.id);
                    return;
                }
                const backBtn = e.target.closest('.sgit-back-btn');
                if (backBtn) {
                    this._switchTab(this._prevTab || 'history');
                    return;
                }
            });
        }

        refresh() {
            if (!this._vault) return;
            this._commitCache.clear();
            this._switchTab(this._activeTab);
        }

        // --- Tab Switching ----------------------------------------------------------

        _switchTab(tabId) {
            if (tabId !== 'object') this._prevTab = tabId;
            this._activeTab = tabId;

            this.querySelectorAll('.sgit-tab').forEach(t => {
                t.classList.toggle('sgit-tab--active', t.dataset.tab === tabId);
            });

            const body = this.querySelector('.sgit-body');
            if (!body || !this._vault) return;

            switch (tabId) {
                case 'history': this._renderHistory(body); break;
                case 'refs':    this._renderRefs(body);    break;
                case 'tree':    this._renderTree(body);    break;
                case 'object':  this._renderObject(body);  break;
            }
        }

        // --- History Tab (SourceTree-like commit log) --------------------------------

        async _renderHistory(container) {
            container.innerHTML = '<div class="sgit-loading">Loading commit history...</div>';

            const vault = this._vault;
            const commits = [];

            // Walk parent chain from HEAD
            let currentId = vault._headCommitId;
            const maxCommits = 50;

            while (currentId && commits.length < maxCommits) {
                try {
                    let commit = this._commitCache.get(currentId);
                    if (!commit) {
                        commit = await vault._commitManager.loadCommit(currentId);
                        this._commitCache.set(currentId, commit);
                    }
                    commits.push({ id: currentId, ...commit });
                    currentId = commit.parents?.[0] || null;
                } catch (err) {
                    commits.push({ id: currentId, _error: err.message });
                    break;
                }
            }

            if (commits.length === 0) {
                container.innerHTML = '<div class="sgit-empty">No commits found</div>';
                return;
            }

            container.innerHTML = `
                <div class="sgit-commit-list">
                    <div class="sgit-commit-header">
                        <span class="sgit-ch-graph">Graph</span>
                        <span class="sgit-ch-msg">Description</span>
                        <span class="sgit-ch-id">Commit</span>
                        <span class="sgit-ch-date">Date</span>
                    </div>
                    ${commits.map((c, i) => this._renderCommitRow(c, i, commits.length)).join('')}
                </div>
            `;
        }

        _renderCommitRow(commit, index, total) {
            if (commit._error) {
                return `<div class="sgit-commit-row sgit-commit-row--error">
                    <span class="sgit-ch-graph"><span class="sgit-graph-dot sgit-graph-dot--error"></span></span>
                    <span class="sgit-ch-msg">Error: ${this._esc(commit._error)}</span>
                    <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                    <span class="sgit-ch-date">--</span>
                </div>`;
            }

            const isHead = index === 0;
            const msg = commit.message || '(no message)';
            const date = commit.timestamp_ms
                ? new Date(commit.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '--';
            const branch = commit.branch_id || '';
            const hasLine = index < total - 1;

            return `<div class="sgit-commit-row${isHead ? ' sgit-commit-row--head' : ''}">
                <span class="sgit-ch-graph">
                    <span class="sgit-graph-line-top${index === 0 ? ' sgit-graph-line--hidden' : ''}"></span>
                    <span class="sgit-graph-dot${isHead ? ' sgit-graph-dot--head' : ''}"></span>
                    <span class="sgit-graph-line-bottom${!hasLine ? ' sgit-graph-line--hidden' : ''}"></span>
                </span>
                <span class="sgit-ch-msg">
                    ${isHead ? '<span class="sgit-badge sgit-badge--head">HEAD</span>' : ''}
                    ${branch ? `<span class="sgit-badge sgit-badge--branch">${this._esc(this._shortBranch(branch))}</span>` : ''}
                    <span class="sgit-commit-msg">${this._esc(msg)}</span>
                    <a class="sgit-obj-link sgit-commit-tree-link" href="#" data-id="${this._esc(commit.tree_id)}" title="View tree">tree</a>
                </span>
                <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                <span class="sgit-ch-date">${date}</span>
            </div>`;
        }

        _shortBranch(branchId) {
            if (!branchId) return '';
            // "branch-clone-1535692fe3dfe9dd" → "clone-1535..."
            return branchId.length > 20 ? branchId.substring(0, 18) + '...' : branchId;
        }

        // --- Refs Tab ----------------------------------------------------------------

        _renderRefs(container) {
            const vault = this._vault;
            const stats = vault.getStats();

            container.innerHTML = `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">References</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">HEAD ref</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._refFileId || '--')}</span>
                        <span class="sgit-kv-key">HEAD commit</span>
                        <span class="sgit-kv-value sgit-mono"><a class="sgit-obj-link" href="#" data-id="${this._esc(vault._headCommitId)}">${this._esc(vault._headCommitId || '--')}</a></span>
                        <span class="sgit-kv-key">Branch index</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._branchIndexFileId || '--')}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Vault Identity</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">Vault ID</span>
                        <span class="sgit-kv-value sgit-mono">${this._esc(vault._vaultId || '--')}</span>
                        <span class="sgit-kv-key">Version</span>
                        <span class="sgit-kv-value">${this._esc(vault._settings?.version || '--')}</span>
                        <span class="sgit-kv-key">Created</span>
                        <span class="sgit-kv-value">${this._esc(vault._settings?.created || '--')}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Object Store</h3>
                    <div class="sgit-kv-grid">
                        <span class="sgit-kv-key">Files</span>
                        <span class="sgit-kv-value">${stats.files}</span>
                        <span class="sgit-kv-key">Folders</span>
                        <span class="sgit-kv-value">${stats.folders}</span>
                        <span class="sgit-kv-key">Total size</span>
                        <span class="sgit-kv-value">${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(stats.totalSize) : stats.totalSize + ' B'}</span>
                    </div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Settings</h3>
                    <pre class="sgit-json">${this._esc(JSON.stringify(vault._settings, null, 2))}</pre>
                </div>
            `;
        }

        // --- Tree Tab ----------------------------------------------------------------

        _renderTree(container) {
            const vault = this._vault;
            container.innerHTML = `
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Vault Tree</h3>
                    <div class="sgit-interactive-tree"></div>
                </div>
                <div class="sgit-section">
                    <h3 class="sgit-section-title">Flat Entries</h3>
                    <div class="sgit-entries"></div>
                </div>
            `;

            // Interactive tree
            const treeEl = container.querySelector('.sgit-interactive-tree');
            if (treeEl && vault._tree) {
                this._buildTreeDOM(treeEl, vault._tree['/'], '/', 0);
            }

            // Flat entries table
            const entriesEl = container.querySelector('.sgit-entries');
            if (entriesEl && vault._flattenTree) {
                const entries = vault._flattenTree();
                if (entries.length === 0) {
                    entriesEl.innerHTML = '<div class="sgit-empty">No entries</div>';
                } else {
                    entriesEl.innerHTML = `
                        <table class="sgit-table">
                            <thead><tr><th>Name</th><th>Size</th><th>Blob ID</th></tr></thead>
                            <tbody>${entries.map(e => `
                                <tr>
                                    <td>${this._esc(e.name)}</td>
                                    <td>${typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(e.size || 0) : (e.size || 0) + ' B'}</td>
                                    <td class="sgit-mono sgit-truncate">${e.blob_id ? `<a class="sgit-obj-link" href="#" data-id="${this._esc(e.blob_id)}">${this._esc(e.blob_id)}</a>` : '--'}</td>
                                </tr>
                            `).join('')}</tbody>
                        </table>
                    `;
                }
            }
        }

        _buildTreeDOM(parentEl, node, path, depth) {
            if (!node || !node.children) return;

            const entries = Object.entries(node.children);
            const isFolder = (e) => e.type === 'folder' || (e.children !== undefined && e.children !== null);
            entries.sort(([a, ae], [b, be]) => {
                if (isFolder(ae) && !isFolder(be)) return -1;
                if (!isFolder(ae) && isFolder(be)) return 1;
                return a.localeCompare(b);
            });

            for (const [name, entry] of entries) {
                if (isFolder(entry)) {
                    const childCount = Object.keys(entry.children || {}).length;
                    const row = document.createElement('div');
                    row.className = 'sgit-tree-row';
                    row.style.paddingLeft = (depth * 20 + 8) + 'px';
                    row.style.cursor = 'pointer';
                    row.innerHTML = `<span class="sgit-tree-chevron">\u25B6</span> <span class="sgit-tree-icon" style="font-size:1rem;">\uD83D\uDCC1</span> <span class="sgit-tree-name">${this._esc(name)}/</span> <span class="sgit-tree-meta">(${childCount})</span>`;

                    const childContainer = document.createElement('div');
                    childContainer.style.display = 'none';

                    row.addEventListener('click', () => {
                        const open = childContainer.style.display !== 'none';
                        childContainer.style.display = open ? 'none' : '';
                        row.querySelector('.sgit-tree-chevron').textContent = open ? '\u25B6' : '\u25BC';
                        row.querySelector('.sgit-tree-icon').textContent = open ? '\uD83D\uDCC1' : '\uD83D\uDCC2';
                    });

                    parentEl.appendChild(row);
                    if (childCount > 0) {
                        this._buildTreeDOM(childContainer, entry, path === '/' ? '/' + name : path + '/' + name, depth + 1);
                    } else {
                        const empty = document.createElement('div');
                        empty.className = 'sgit-tree-row';
                        empty.style.paddingLeft = ((depth + 1) * 20 + 8) + 'px';
                        empty.innerHTML = '<span class="sgit-tree-meta">(empty)</span>';
                        childContainer.appendChild(empty);
                    }
                    parentEl.appendChild(childContainer);
                } else {
                    const row = document.createElement('div');
                    row.className = 'sgit-tree-row';
                    row.style.paddingLeft = (depth * 20 + 8) + 'px';
                    const size = typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(entry.size || 0) : (entry.size || 0) + ' B';
                    const blobLink = entry.blob_id
                        ? `<a class="sgit-obj-link" href="#" data-id="${this._esc(entry.blob_id)}">blob</a>`
                        : '';
                    row.innerHTML = `<span class="sgit-tree-chevron">\u00A0\u00A0</span> <span class="sgit-tree-icon">\uD83D\uDCC4</span> <span class="sgit-tree-name">${this._esc(name)}</span> <span class="sgit-tree-meta">${size}</span> ${blobLink}`;
                    parentEl.appendChild(row);
                }
            }
        }

        // --- Object Viewer (Schema + Raw tabs, like Vault Browser) ------------------

        async _loadObject(objectId) {
            if (!objectId || !this._vault) return;

            this._objectViewData = { id: objectId, loading: true };
            this._switchTab('object');

            const container = this.querySelector('.sgit-body');
            container.innerHTML = `<div class="sgit-loading">Loading ${this._esc(objectId)}...</div>`;

            try {
                const vault = this._vault;
                const ciphertext = await vault._objectStore.load(objectId);
                const plaintext  = await SGSendCrypto.decrypt(ciphertext, vault._readKey);
                const text       = new TextDecoder().decode(plaintext);
                let parsed;

                try { parsed = JSON.parse(text); } catch (_) { parsed = null; }

                this._objectViewData = { id: objectId, raw: text, parsed, size: ciphertext.byteLength || ciphertext.length };

                // Detect type and decrypt inner fields
                if (parsed?.schema === 'commit_v1' || parsed?.schema === 'commit_v2') {
                    // Decrypt commit message
                    if (parsed.message_enc) {
                        try {
                            const msgCipher = SGVaultCommit._base64ToArrayBuffer(parsed.message_enc);
                            const msgPlain  = await SGSendCrypto.decrypt(msgCipher, vault._readKey);
                            parsed.message  = new TextDecoder().decode(msgPlain);
                        } catch (_) {}
                    }
                    this._objectViewData.type = 'commit';
                } else if (parsed?.schema === 'tree_v1') {
                    // Decrypt tree entry names
                    const dec = async (b64) => {
                        if (!b64) return null;
                        const cipher = SGVaultCommit._base64ToArrayBuffer(b64);
                        const plain  = await SGSendCrypto.decrypt(cipher, vault._readKey);
                        return new TextDecoder().decode(plain);
                    };
                    for (const entry of parsed.entries || []) {
                        if (entry.name_enc) entry.name = await dec(entry.name_enc);
                        if (entry.size_enc) entry.size = await dec(entry.size_enc);
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
        }

        _renderObject(container) {
            const obj = this._objectViewData;
            if (!obj || obj.loading) return;

            const sizeStr = typeof VaultHelpers !== 'undefined' ? VaultHelpers.formatBytes(obj.size || 0) : (obj.size || 0) + ' B';

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

            // Tab switching within object viewer
            container.querySelectorAll('.sgit-obj-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    container.querySelectorAll('.sgit-obj-tab').forEach(t => t.classList.toggle('sgit-obj-tab--active', t === tab));
                    container.querySelectorAll('.sgit-obj-panel').forEach(p => p.style.display = p.dataset.opanel === tab.dataset.otab ? '' : 'none');
                });
            });
        }

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
                                    const isDir = !!e.tree_id;
                                    const icon = isDir ? '/' : '';
                                    const sizeStr = e.size ? `${e.size} B` : '';
                                    const link = isDir
                                        ? `<a class="sgit-obj-link sgit-entry-link" href="#" data-id="${this._esc(e.tree_id)}">tree</a>`
                                        : (e.blob_id ? `<a class="sgit-obj-link sgit-entry-link" href="#" data-id="${this._esc(e.blob_id)}">blob</a>` : '');
                                    return `<div class="sgit-schema-entry">
                                        <span class="sgit-entry-icon">${icon}</span>
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

            // Generic object
            return `<pre class="sgit-json">${this._esc(JSON.stringify(data, null, 2))}</pre>`;
        }

        // --- Helpers -----------------------------------------------------------------

        _short(id) {
            if (!id) return '--';
            // "obj-cas-imm-2705afca25e5" → keep prefix + hash
            return id.length > 24 ? id.substring(0, 24) + '...' : id;
        }

        _esc(str) {
            const d = document.createElement('div');
            d.textContent = String(str ?? '');
            return d.innerHTML;
        }

        // --- Styles ------------------------------------------------------------------

        static get styles() {
            return `
                .sgit { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

                .sgit-header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
                .sgit-title { font-size: var(--text-h3, 1.25rem); font-weight: 700; color: var(--color-text); margin: 0; }
                .sgit-tabs { display: flex; gap: 0.25rem; }
                .sgit-tab { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm, 6px); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
                .sgit-tab:hover { background: var(--bg-secondary); color: var(--color-text); }
                .sgit-tab--active { background: var(--color-primary); color: var(--bg-primary); border-color: var(--color-primary); }

                .sgit-body { flex: 1; overflow-y: auto; padding: 1rem; }
                .sgit-loading { color: var(--color-text-secondary); font-size: var(--text-sm); padding: 2rem; text-align: center; }
                .sgit-empty { color: var(--color-text-secondary); font-size: var(--text-sm); padding: 1rem 0; }
                .sgit-error { color: var(--color-error, #E94560); font-size: var(--text-sm); padding: 1rem; }

                /* --- Commit History --- */
                .sgit-commit-list { font-size: var(--text-small, 0.75rem); }
                .sgit-commit-header { display: grid; grid-template-columns: 32px 1fr 160px 100px; gap: 0.5rem; padding: 0.375rem 0.5rem; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--color-border); }
                .sgit-commit-row { display: grid; grid-template-columns: 32px 1fr 160px 100px; gap: 0.5rem; padding: 0.25rem 0.5rem; align-items: center; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.06)); }
                .sgit-commit-row:hover { background: var(--bg-secondary); }
                .sgit-commit-row--head { background: rgba(78, 205, 196, 0.04); }

                .sgit-ch-graph { display: flex; flex-direction: column; align-items: center; position: relative; height: 28px; justify-content: center; }
                .sgit-graph-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--color-primary, #4ECDC4); z-index: 1; flex-shrink: 0; }
                .sgit-graph-dot--head { width: 12px; height: 12px; box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 3px var(--color-primary); }
                .sgit-graph-dot--error { background: var(--color-error, #E94560); }
                .sgit-graph-line-top, .sgit-graph-line-bottom { position: absolute; width: 2px; background: var(--color-primary, #4ECDC4); opacity: 0.3; }
                .sgit-graph-line-top { top: 0; height: 50%; }
                .sgit-graph-line-bottom { bottom: 0; height: 50%; }
                .sgit-graph-line--hidden { display: none; }

                .sgit-ch-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 0.375rem; }
                .sgit-commit-msg { color: var(--color-text); }
                .sgit-commit-tree-link { font-size: 0.625rem; opacity: 0.5; margin-left: auto; flex-shrink: 0; }
                .sgit-commit-tree-link:hover { opacity: 1; }
                .sgit-ch-id { font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; }
                .sgit-ch-date { color: var(--color-text-secondary); text-align: right; }

                .sgit-badge { font-size: 0.625rem; padding: 0.0625rem 0.375rem; border-radius: 3px; font-weight: 600; font-family: var(--font-mono); white-space: nowrap; flex-shrink: 0; }
                .sgit-badge--head { background: var(--color-primary); color: var(--bg-primary); }
                .sgit-badge--branch { background: rgba(78, 205, 196, 0.15); color: var(--color-primary); }
                .sgit-badge--schema { background: rgba(78, 205, 196, 0.15); color: var(--color-primary); display: inline-block; margin-bottom: 1rem; }

                /* --- Refs & Sections --- */
                .sgit-section { margin-bottom: 1.5rem; }
                .sgit-section-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.5rem; }
                .sgit-kv-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; font-size: var(--text-sm); }
                .sgit-kv-key { color: var(--color-text-secondary); font-weight: 600; }
                .sgit-kv-value { color: var(--color-text); }
                .sgit-mono { font-family: var(--font-mono, monospace); font-size: var(--text-small); }

                /* --- Object links --- */
                .sgit-obj-link { color: var(--color-primary, #4ECDC4); text-decoration: none; font-family: var(--font-mono); font-size: inherit; cursor: pointer; }
                .sgit-obj-link:hover { text-decoration: underline; }

                /* --- Object Viewer --- */
                .sgit-object-viewer { display: flex; flex-direction: column; height: 100%; }
                .sgit-obj-header { display: flex; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); margin-bottom: 0.75rem; }
                .sgit-back-btn { font-size: var(--text-small); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); }
                .sgit-back-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
                .sgit-obj-path { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-text); font-weight: 600; flex: 1; }
                .sgit-obj-size { font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); }

                .sgit-obj-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
                .sgit-obj-tab { font-size: var(--text-sm); padding: 0.375rem 0.75rem; border: none; background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); border-bottom: 2px solid transparent; }
                .sgit-obj-tab:hover { color: var(--color-text); }
                .sgit-obj-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
                .sgit-obj-content { flex: 1; overflow-y: auto; }

                /* --- Schema View --- */
                .sgit-schema { }
                .sgit-schema-field { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.08)); }
                .sgit-schema-label { font-size: var(--text-small); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
                .sgit-schema-value { font-size: var(--text-sm); color: var(--color-text); font-family: var(--font-mono); }

                .sgit-schema-entries { }
                .sgit-schema-entry { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.06)); font-size: var(--text-sm); }
                .sgit-schema-entry:hover { background: var(--bg-secondary); }
                .sgit-entry-icon { color: var(--color-text-secondary); font-weight: 600; width: 1rem; text-align: center; flex-shrink: 0; }
                .sgit-entry-name { font-family: var(--font-mono); color: var(--color-text); flex: 1; }
                .sgit-entry-size { font-family: var(--font-mono); color: var(--color-text-secondary); font-size: var(--text-small); }
                .sgit-entry-link { font-size: var(--text-small); flex-shrink: 0; }

                /* --- Shared --- */
                .sgit-json { background: var(--bg-secondary); padding: 1rem; border-radius: 6px; font-family: var(--font-mono); font-size: var(--text-small); color: var(--color-text-secondary); overflow-x: auto; max-height: 400px; overflow-y: auto; border: 1px solid var(--color-border); margin: 0; white-space: pre-wrap; word-break: break-all; }
                .sgit-table { width: 100%; border-collapse: collapse; font-size: var(--text-small); }
                .sgit-table th { text-align: left; font-weight: 600; color: var(--color-text-secondary); padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border); }
                .sgit-table td { padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--color-border, rgba(78,205,196,0.08)); color: var(--color-text); }
                .sgit-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .sgit-interactive-tree { background: var(--bg-secondary); border: 1px solid var(--color-border); border-radius: 6px; padding: 0.5rem 0; max-height: 400px; overflow-y: auto; }
                .sgit-tree-row { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.5rem; font-size: var(--text-small); color: var(--color-text); white-space: nowrap; }
                .sgit-tree-row:hover { background: rgba(78,205,196,0.05); }
                .sgit-tree-chevron { font-size: 0.6rem; flex-shrink: 0; width: 0.75rem; text-align: center; color: var(--color-text-secondary); }
                .sgit-tree-icon { flex-shrink: 0; font-size: 0.875rem; }
                .sgit-tree-name { font-family: var(--font-mono); color: var(--color-text); }
                .sgit-tree-meta { font-family: var(--font-mono); color: var(--color-text-secondary); font-size: 0.625rem; margin-left: 0.5rem; }
            `;
        }
    }

    customElements.define('vault-sgit-view', VaultSgitView);
})();
