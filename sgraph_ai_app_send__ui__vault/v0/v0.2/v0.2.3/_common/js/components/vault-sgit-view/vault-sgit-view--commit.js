/* =============================================================================
   SGraph Vault — SGit View: Commit Detail + Diff
   v0.2.0 — A first-class commit screen: changed-files list + per-file line diff.

   Entry: a "diff" link on any history row → _openCommit(commitId).

   How the diff is computed (cheaply):
     - The changed-FILES list is a set-diff of two flattened trees (commit.tree_id
       vs parent.tree_id) keyed by path, comparing each entry's content_hash. The
       hash is already in the (decrypted) tree entry, so the file list costs ZERO
       blob reads — only the small tree objects are read.
     - The per-file LINE diff is lazy: blobs are read + decrypted only when the user
       expands that file. Binary (non-UTF-8) and over-cap files are flagged, not diffed.

   Merge commits diff against the FIRST parent (git's default), like the rest of the
   history view. RO-token sessions (no read_key) can't decrypt and so can't diff.

   Extends VaultSgitView.prototype. Must load AFTER vault-sgit-view.js + sgit-diff.js.
   ============================================================================= */

(function () {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        // A small "diff" affordance for history rows (called from --history.js renderers).
        _diffLink(commitId) {
            if (!commitId) return '';
            return `<a class="sgit-obj-link sgit-commit-diff-link" href="#" data-id="${this._esc(commitId)}" title="View the changes in this commit">diff</a>`;
        },

        // --- Tree flatten: treeId → Map<path, {blob_id, content_hash, size}> -------
        async _flattenTreeToMap(treeId) {
            const map = new Map();
            if (!treeId || !this._vault) return map;
            const cm = this._vault._commitManager;
            const visit = async (tid, prefix, depth) => {
                if (depth > 32) return;                       // pathological nesting guard
                let tree;
                try { tree = await cm.loadTree(tid); } catch (_) { return; }
                for (const e of (tree.entries || [])) {
                    const p = prefix ? prefix + '/' + e.name : e.name;
                    if (e.tree_id)       await visit(e.tree_id, p, depth + 1);
                    else if (e.blob_id)  map.set(p, { blob_id: e.blob_id, content_hash: e.content_hash || '', size: e.size | 0 });
                }
            };
            await visit(treeId, '', 0);
            return map;
        },

        // Compare a commit's tree to its first parent's. Returns sorted change list.
        async _computeCommitChanges(commit) {
            const parentId = (commit.parents && commit.parents[0]) || null;
            let parentCommit = null;
            if (parentId) {
                try { parentCommit = await this._vault._commitManager.loadCommit(parentId); } catch (_) {}
            }
            const [newMap, oldMap] = await Promise.all([
                this._flattenTreeToMap(commit.tree_id),
                parentCommit ? this._flattenTreeToMap(parentCommit.tree_id) : Promise.resolve(new Map())
            ]);

            const changes = [];
            for (const [path, n] of newMap) {
                const o = oldMap.get(path);
                if (!o) {
                    changes.push({ path, status: 'added', newBlob: n.blob_id, oldBlob: null, newSize: n.size, oldSize: 0 });
                } else if ((o.content_hash || '') !== (n.content_hash || '')) {
                    changes.push({ path, status: 'modified', newBlob: n.blob_id, oldBlob: o.blob_id, newSize: n.size, oldSize: o.size });
                }
            }
            for (const [path, o] of oldMap) {
                if (!newMap.has(path)) {
                    changes.push({ path, status: 'removed', newBlob: null, oldBlob: o.blob_id, newSize: 0, oldSize: o.size });
                }
            }
            // Stable order: added, modified, removed; alphabetical within each.
            const rank = { added: 0, modified: 1, removed: 2 };
            changes.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
            return { changes, parentId };
        },

        // --- Entry point ----------------------------------------------------------
        async _openCommit(commitId) {
            if (!commitId || !this._vault) return;
            this._commitViewData = { id: commitId, loading: true };
            this._switchTab('commit');

            const container = this.querySelector('.sgit-body');
            container.innerHTML = `<div class="sgit-loading">Loading changes for ${this._esc(this._short(commitId))}…</div>`;

            try {
                let commit = this._commitCache.get(commitId);
                if (!commit) {
                    commit = await this._vault._commitManager.loadCommit(commitId);   // decrypts message_enc
                    this._commitCache.set(commitId, commit);
                }
                const { changes, parentId } = await this._computeCommitChanges(commit);
                this._commitViewData = { id: commitId, commit, changes, parentId, loading: false };
                this._renderCommitDetail(container);
            } catch (err) {
                container.innerHTML = `<div class="sgit-error">Failed to compute diff: ${this._esc(err.message)}</div>`;
            }
        },

        _fmtBytes(n) {
            if (typeof VaultHelpers !== 'undefined' && VaultHelpers.formatBytes) return VaultHelpers.formatBytes(n || 0);
            n = n | 0;
            if (n < 1024) return n + ' B';
            if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
            return (n / (1024 * 1024)).toFixed(1) + ' MB';
        },

        _renderCommitDetail(container) {
            const cv = this._commitViewData;
            if (!cv || cv.loading) return;
            const c  = cv.commit;
            const ch = cv.changes;

            const date = c.timestamp_ms
                ? new Date(c.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '--';
            const counts = {
                added:    ch.filter(x => x.status === 'added').length,
                modified: ch.filter(x => x.status === 'modified').length,
                removed:  ch.filter(x => x.status === 'removed').length,
            };
            const sIcon = { added: '+', modified: '~', removed: '−' };

            const parentLink = cv.parentId
                ? `<a class="sgit-obj-link" href="#" data-id="${this._esc(cv.parentId)}">${this._esc(this._short(cv.parentId))}</a>`
                : '<span class="sgit-cd-muted">(root commit — no parent)</span>';

            const fileRows = ch.length
                ? ch.map((x, i) => {
                    const sizeNote = x.status === 'added'   ? `+${this._fmtBytes(x.newSize)}`
                                   : x.status === 'removed' ? `−${this._fmtBytes(x.oldSize)}`
                                   : `${this._fmtBytes(x.oldSize)} → ${this._fmtBytes(x.newSize)}`;
                    return `
                        <div class="sgit-cd-file sgit-cd-file--${x.status}">
                            <div class="sgit-cd-file-head" data-fidx="${i}" role="button" tabindex="0" title="Click to ${'expand'} the diff">
                                <span class="sgit-cd-chevron" data-fidx="${i}">▸</span>
                                <span class="sgit-cd-stat sgit-cd-stat--${x.status}">${sIcon[x.status]}</span>
                                <span class="sgit-cd-path">${this._esc(x.path)}</span>
                                <span class="sgit-cd-size">${sizeNote}</span>
                            </div>
                            <div class="sgit-cd-filediff" data-fdiff="${i}" style="display:none"></div>
                        </div>`;
                }).join('')
                : '<div class="sgit-empty">No file changes in this commit.</div>';

            container.innerHTML = `
                <div class="sgit-object-viewer">
                    <div class="sgit-obj-header">
                        <button class="sgit-back-btn">← Back</button>
                        <span class="sgit-obj-path">${this._esc(this._short(cv.id))}</span>
                        <button class="sgit-cd-copy-btn" title="Copy all changes as a unified diff (patch)">⎘ Copy patch</button>
                        <button class="sgit-checkout-btn sgit-cd-checkout" data-commit-id="${this._esc(cv.id)}" title="Load this commit as working state">load ↩</button>
                    </div>

                    <div class="sgit-cd-meta">
                        <div class="sgit-cd-message">${this._esc(c.message || '(no message)')}</div>
                        <div class="sgit-cd-meta-kv">
                            <span>${date}</span>
                            <span class="sgit-cd-dot">·</span>
                            <span>parent ${parentLink}</span>
                            <span class="sgit-cd-dot">·</span>
                            <span>tree <a class="sgit-obj-link" href="#" data-id="${this._esc(c.tree_id)}">${this._esc(this._short(c.tree_id))}</a></span>
                        </div>
                    </div>

                    <div class="sgit-cd-summary">
                        <span class="sgit-cd-sum sgit-cd-sum--added">${counts.added} added</span>
                        <span class="sgit-cd-sum sgit-cd-sum--modified">${counts.modified} modified</span>
                        <span class="sgit-cd-sum sgit-cd-sum--removed">${counts.removed} removed</span>
                    </div>

                    <div class="sgit-cd-files">${fileRows}</div>
                </div>
            `;
        },

        // --- Lazy per-file diff ----------------------------------------------------
        async _toggleFileDiff(fidx) {
            const cv = this._commitViewData;
            if (!cv || !cv.changes) return;
            const change = cv.changes[fidx | 0];
            if (!change) return;
            const panel   = this.querySelector(`[data-fdiff="${fidx}"]`);
            const chevron = this.querySelector(`.sgit-cd-chevron[data-fidx="${fidx}"]`);
            if (!panel) return;

            // Collapse if already open.
            if (panel.style.display !== 'none' && panel.dataset.loaded === '1') {
                panel.style.display = 'none';
                if (chevron) chevron.textContent = '▸';
                return;
            }
            if (chevron) chevron.textContent = '▾';

            // Already loaded once — just re-show.
            if (panel.dataset.loaded === '1') { panel.style.display = ''; return; }

            panel.style.display = '';
            panel.innerHTML = '<div class="sgit-cd-diff-loading">Loading diff…</div>';

            try {
                const [oldR, newR] = await Promise.all([
                    change.oldBlob ? this._readBlobText(change.oldBlob) : Promise.resolve({ text: '', binary: false, bytes: 0 }),
                    change.newBlob ? this._readBlobText(change.newBlob) : Promise.resolve({ text: '', binary: false, bytes: 0 })
                ]);
                change._old = oldR; change._new = newR;   // cache for copy-patch

                if (oldR.binary || newR.binary) {
                    panel.innerHTML = `<div class="sgit-cd-binary">Binary file — not shown. ${this._esc(this._fmtBytes(change.oldSize))} → ${this._esc(this._fmtBytes(change.newSize))}</div>`;
                } else {
                    const d = SgitDiff.lineDiff(oldR.text, newR.text);
                    panel.innerHTML = d.tooLarge
                        ? `<div class="sgit-cd-binary">File too large to diff inline (${d.oldLines} → ${d.newLines} lines).</div>`
                        : this._renderDiffHunks(d);
                }
            } catch (err) {
                panel.innerHTML = `<div class="sgit-error">Diff failed: ${this._esc(err.message)}</div>`;
            }
            panel.dataset.loaded = '1';
        },

        async _readBlobText(blobId) {
            const ct = await this._vault._objectStore.load(blobId);
            const pt = await SGSendCrypto.decrypt(ct, this._vault._readKey);
            const bytes = (pt && (pt.byteLength != null ? pt.byteLength : pt.length)) || 0;
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(pt);
                return { text, binary: false, bytes };
            } catch (_) {
                return { text: null, binary: true, bytes };
            }
        },

        _renderDiffHunks(d) {
            if (!d.hunks.length) return '<div class="sgit-cd-nochange">No textual changes (whitespace or identical content).</div>';
            const parts = [];
            for (const h of d.hunks) {
                parts.push(`<div class="sgit-dl sgit-dl--hunk"><span class="sgit-dl-gutter"></span><span class="sgit-dl-text">${this._esc(SgitDiff.hunkHeader(h))}</span></div>`);
                for (const r of h.rows) {
                    const cls = r.type === '+' ? 'add' : r.type === '-' ? 'del' : 'ctx';
                    const gutter = r.type === ' ' ? '' : r.type;
                    parts.push(`<div class="sgit-dl sgit-dl--${cls}"><span class="sgit-dl-gutter">${gutter}</span><span class="sgit-dl-text">${this._esc(r.text)}</span></div>`);
                }
            }
            return `<div class="sgit-difflines">${parts.join('')}</div>`;
        },

        // --- Copy as unified patch -------------------------------------------------
        async _copyCommitPatch() {
            const cv = this._commitViewData;
            if (!cv || !cv.changes) return;
            const btn = this.querySelector('.sgit-cd-copy-btn');
            const flash = (label) => { if (btn) { const o = btn.textContent; btn.textContent = label; setTimeout(() => { btn.textContent = o; }, 1600); } };
            if (btn) btn.textContent = 'Building…';

            try {
                const blocks = [];
                for (const change of cv.changes) {
                    const oldR = change._old || (change.oldBlob ? await this._readBlobText(change.oldBlob) : { text: '', binary: false });
                    const newR = change._new || (change.newBlob ? await this._readBlobText(change.newBlob) : { text: '', binary: false });
                    if (oldR.binary || newR.binary) {
                        blocks.push(`--- a/${change.path}\n+++ b/${change.path}\nBinary files differ`);
                    } else {
                        blocks.push(SgitDiff.toUnifiedPatch(change.path, oldR.text || '', newR.text || '', change.status));
                    }
                }
                const patch = blocks.join('\n') + '\n';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(patch);
                    flash('✓ Copied');
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = patch; ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.select();
                    const ok = document.execCommand('copy');
                    document.body.removeChild(ta);
                    flash(ok ? '✓ Copied' : '✗ Copy blocked');
                }
            } catch (_) { flash('✗ Copy failed'); }
        }

    });
})();
