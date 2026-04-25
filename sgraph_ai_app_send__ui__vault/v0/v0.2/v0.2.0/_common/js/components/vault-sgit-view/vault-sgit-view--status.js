/* =============================================================================
   SGraph Vault — SGit View: Status Tab
   v0.2.0 — Equivalent to `sgit status` + `sgit info`

   Shows:
     • Sync state  — named HEAD (live), clone HEAD, ahead/behind counts
     • Vault info  — vault ID, name, created, version, description
     • Server info — endpoint in use
     • File stats  — files, folders, total size

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        async _renderStatus(container) {
            container.innerHTML = `<div class="sgit-loading">Loading status…</div>`;

            const vault = this._vault;
            if (!vault) {
                container.innerHTML = `<div class="sgit-empty">No vault open.</div>`;
                return;
            }

            // --- Live reads -------------------------------------------------------
            let aheadCount   = 0;
            let behindCount  = 0;
            let liveNamedHead = null;
            let aheadError   = null;

            try {
                // Live named HEAD from server (behind count also reads this)
                liveNamedHead = await vault._refManager.readRef(vault._refFileId);
                aheadCount    = await vault.getAheadCount();
                behindCount   = await vault.getBehindCount();
            } catch (err) {
                aheadError = err.message;
            }

            // --- File stats -------------------------------------------------------
            const stats = vault.getStats();

            // --- Sync diagnosis ---------------------------------------------------
            // The "Push ↑N" situation explained:
            //   _headCommitId  = clone branch HEAD (your local working tip)
            //   _namedHeadId   = named branch HEAD at open time (last pushed state)
            //   liveNamedHead  = current named HEAD on server right now
            //   aheadCount     = commits on clone not yet on named branch
            //   behindCount    = commits on named branch not yet on clone

            const cloneHead  = vault._headCommitId;
            const namedAtOpen = vault._namedHeadId;
            const inSync     = aheadCount === 0 && behindCount === 0;

            // --- Sync status badge -----------------------------------------------
            let syncLabel, syncClass;
            if (aheadError) {
                syncLabel = 'Error reading sync state';
                syncClass = 'sgit-status-badge--error';
            } else if (inSync) {
                syncLabel = 'Up to date';
                syncClass = 'sgit-status-badge--ok';
            } else {
                const parts = [];
                if (aheadCount > 0)  parts.push(`${aheadCount} to push`);
                if (behindCount > 0) parts.push(`${behindCount} to pull`);
                syncLabel = parts.join(' · ');
                syncClass = 'sgit-status-badge--pending';
            }

            // --- Next action suggestion -------------------------------------------
            let nextAction = '';
            if (aheadCount > 0 && behindCount === 0) {
                nextAction = `You have ${aheadCount} local commit${aheadCount > 1 ? 's' : ''} not yet pushed to the server. Use the Push button in the header to publish them.`;
            } else if (behindCount > 0 && aheadCount === 0) {
                nextAction = `The server has ${behindCount} new commit${behindCount > 1 ? 's' : ''} not yet in your vault. Use the Pull button to update.`;
            } else if (aheadCount > 0 && behindCount > 0) {
                nextAction = `The vault has diverged: ${aheadCount} local commits to push and ${behindCount} remote commits to pull. Push first, then pull.`;
            } else if (inSync) {
                nextAction = 'Everything is in sync. No action needed.';
            }

            // --- Render -----------------------------------------------------------
            const fmtId   = (id) => id ? `<span class="sgit-mono">${this._esc(id)}</span>` : '<span class="sgit-mono" style="opacity:0.4">—</span>';
            const fmtSize = (b)  => {
                if (b === 0) return '0 B';
                const u = ['B','KB','MB','GB'];
                let i = 0;
                while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
                return `${b.toFixed(i > 0 ? 1 : 0)} ${u[i]}`;
            };
            const fmtDate = (iso) => {
                if (!iso) return '—';
                try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
                catch (_) { return iso; }
            };

            // Current branch name from branch index
            const currentBranchName = typeof vault.getCurrentBranchName === 'function'
                ? vault.getCurrentBranchName() : null;

            // Endpoint from sgSend
            const endpoint = vault._sgSend?.endpoint || '—';

            container.innerHTML = `
                <div class="sgit-status-view">

                    <!-- Sync state -->
                    <div class="sgit-section">
                        <div class="sgit-section-header">
                            <div class="sgit-section-title">Sync State</div>
                            <span class="sgit-status-badge ${this._esc(syncClass)}">${this._esc(syncLabel)}</span>
                            <button class="sgit-status-refresh sgit-back-btn" title="Re-check sync state">Refresh</button>
                        </div>
                        ${nextAction ? `<p class="sgit-status-hint">${this._esc(nextAction)}</p>` : ''}
                        <div class="sgit-kv-grid sgit-status-kv">
                            <span class="sgit-kv-key">Ahead (to push)</span>
                            <span class="sgit-kv-value">${aheadError ? `<span class="sgit-error-inline">${this._esc(aheadError)}</span>` : `<strong>${aheadCount}</strong> commit${aheadCount !== 1 ? 's' : ''}`}</span>

                            <span class="sgit-kv-key">Behind (to pull)</span>
                            <span class="sgit-kv-value">${aheadError ? '—' : `<strong>${behindCount}</strong> commit${behindCount !== 1 ? 's' : ''}`}</span>

                            <span class="sgit-kv-key">Clone HEAD</span>
                            <span class="sgit-kv-value">${fmtId(cloneHead)}</span>

                            <span class="sgit-kv-key">Named HEAD (at open)</span>
                            <span class="sgit-kv-value">${fmtId(namedAtOpen)}</span>

                            <span class="sgit-kv-key">Named HEAD (live)</span>
                            <span class="sgit-kv-value">${fmtId(liveNamedHead)}</span>
                        </div>
                    </div>

                    <hr class="sgit-status-hr">

                    <!-- Vault info -->
                    <div class="sgit-section">
                        <div class="sgit-section-title">Vault Info</div>
                        <div class="sgit-kv-grid sgit-status-kv">
                            <span class="sgit-kv-key">Name</span>
                            <span class="sgit-kv-value">${this._esc(vault.name || '—')}</span>

                            <span class="sgit-kv-key">Vault ID</span>
                            <span class="sgit-kv-value sgit-mono">${this._esc(vault.vaultId || '—')}</span>

                            <span class="sgit-kv-key">Created</span>
                            <span class="sgit-kv-value">${this._esc(fmtDate(vault.created))}</span>

                            <span class="sgit-kv-key">Schema version</span>
                            <span class="sgit-kv-value">${this._esc(String(vault._settings?.version ?? '—'))}</span>

                            ${vault._settings?.description ? `
                            <span class="sgit-kv-key">Description</span>
                            <span class="sgit-kv-value">${this._esc(vault._settings.description)}</span>
                            ` : ''}

                            <span class="sgit-kv-key">Access</span>
                            <span class="sgit-kv-value">${vault.writable ? '<span class="sgit-status-badge sgit-status-badge--ok">Read + Write</span>' : '<span class="sgit-status-badge sgit-status-badge--readonly">Read-only</span>'}</span>

                            ${currentBranchName ? `
                            <span class="sgit-kv-key">Current branch</span>
                            <span class="sgit-kv-value sgit-mono">${this._esc(currentBranchName)}</span>
                            ` : ''}
                        </div>
                    </div>

                    <hr class="sgit-status-hr">

                    <!-- Server info -->
                    <div class="sgit-section">
                        <div class="sgit-section-title">Server</div>
                        <div class="sgit-kv-grid sgit-status-kv">
                            <span class="sgit-kv-key">Endpoint</span>
                            <span class="sgit-kv-value sgit-mono">${this._esc(endpoint)}</span>

                            <span class="sgit-kv-key">Named ref</span>
                            <span class="sgit-kv-value sgit-mono">${this._esc(vault._refFileId || '—')}</span>

                            <span class="sgit-kv-key">Clone ref</span>
                            <span class="sgit-kv-value sgit-mono">${this._esc(vault._cloneRefFileId || '—')}</span>
                        </div>
                    </div>

                    <hr class="sgit-status-hr">

                    <!-- File stats -->
                    <div class="sgit-section">
                        <div class="sgit-section-title">File Stats</div>
                        <div class="sgit-status-stats">
                            <div class="sgit-stat-card">
                                <div class="sgit-stat-value">${stats.files}</div>
                                <div class="sgit-stat-label">Files</div>
                            </div>
                            <div class="sgit-stat-card">
                                <div class="sgit-stat-value">${stats.folders}</div>
                                <div class="sgit-stat-label">Folders</div>
                            </div>
                            <div class="sgit-stat-card">
                                <div class="sgit-stat-value">${fmtSize(stats.totalSize)}</div>
                                <div class="sgit-stat-label">Total (unencrypted)</div>
                            </div>
                        </div>
                    </div>

                </div>
            `;

            // Refresh button re-renders the tab
            container.querySelector('.sgit-status-refresh')?.addEventListener('click', () => {
                this._renderStatus(container);
            });
        }

    });

})();
