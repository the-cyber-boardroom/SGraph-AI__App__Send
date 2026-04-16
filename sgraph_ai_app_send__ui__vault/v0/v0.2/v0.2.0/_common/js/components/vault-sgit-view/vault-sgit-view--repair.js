/* =============================================================================
   SGraph Vault — SGit View: Repair Tab
   v0.2.0 — Vault health diagnostics and targeted repair operations

   This is the sgit-in-browser power panel: direct ref surgery on any vault,
   accessible from a browser without cloning locally. The same operations that
   sgit CLI provides — push, pull, reset, manual ref writes — but via the web
   vault's read/write key access to the server.

   Equivalent CLI operations:
     sgit pull               → Fast-forward clone to named (BEHIND case)
     sgit push               → Publish clone to named (AHEAD case)
     sgit push --force       → Force-publish when diverged
     sgit reset --hard       → Reset working to published
     sgit push --force --ref → Manual ref surgery

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    Object.assign(VaultSgitView.prototype, {

        // --- Entry point ---------------------------------------------------------

        async _renderRepair(container) {
            container.innerHTML = '<div class="sgit-loading">Running diagnostics…</div>';

            const vault = this._vault;
            if (!vault) {
                container.innerHTML = '<div class="sgit-empty">No vault open.</div>';
                return;
            }

            let diag;
            try {
                diag = await this._runDiagnostics(vault);
            } catch (err) {
                container.innerHTML = `<div class="sgit-error">Diagnostic error: ${this._esc(err.message)}</div>`;
                return;
            }

            this._renderRepairView(container, vault, diag);
        },

        // --- Diagnostics ---------------------------------------------------------

        async _runDiagnostics(vault) {
            const result = {
                namedRefId:    vault._refFileId,
                cloneRefId:    vault._cloneRefFileId,
                branchIndexId: vault._branchIndexFileId,
                writable:      vault.writable,
                checks:        [],
                syncState:     null,
            };

            const add = (status, label, detail) => result.checks.push({ status, label, detail });

            // Walk a commit chain, returning IDs (stops on error)
            const walkIds = async (headId, max = 60) => {
                const ids  = [];
                let cursor = headId;
                while (cursor && ids.length < max) {
                    ids.push(cursor);
                    let commit = this._commitCache.get(cursor);
                    if (!commit) {
                        try {
                            commit = await vault._commitManager.loadCommit(cursor);
                            this._commitCache.set(cursor, commit);
                        } catch (_) { break; }
                    }
                    cursor = commit.parents?.[0] || null;
                }
                return ids;
            };

            // 1 — Named HEAD ref
            let namedHead = null;
            try {
                namedHead = await vault._refManager.readRef(vault._refFileId);
                if (namedHead) {
                    try {
                        await vault._commitManager.loadCommit(namedHead);
                        add('ok', 'Named HEAD ref', `Resolves → ${namedHead}`);
                    } catch (_) {
                        add('error', 'Named HEAD ref', `Ref exists but commit unreadable: ${namedHead}`);
                        namedHead = null;
                    }
                } else {
                    add('error', 'Named HEAD ref', 'Ref is null or missing on server');
                }
            } catch (err) {
                add('error', 'Named HEAD ref', `Read error: ${err.message}`);
            }

            // 2 — Clone HEAD ref
            let cloneHead = null;
            try {
                cloneHead = await vault._refManager.readRef(vault._cloneRefFileId);
                if (cloneHead) {
                    try {
                        await vault._commitManager.loadCommit(cloneHead);
                        add('ok', 'Clone HEAD ref', `Resolves → ${cloneHead}`);
                    } catch (_) {
                        add('error', 'Clone HEAD ref', `Ref exists but commit unreadable: ${cloneHead}`);
                        cloneHead = null;
                    }
                } else {
                    add('info', 'Clone HEAD ref', 'Not present — opened in named-only / read mode');
                }
            } catch (err) {
                add('warn', 'Clone HEAD ref', `Read error: ${err.message}`);
            }

            // 3 — Sync state (compute relationship between the two heads)
            if (namedHead && cloneHead) {
                if (namedHead === cloneHead) {
                    result.syncState = { type: 'IN_SYNC', namedHead, cloneHead };
                    add('ok', 'Sync state', 'In sync — clone HEAD = named HEAD');
                } else {
                    const [cloneIds, namedIds] = await Promise.all([
                        walkIds(cloneHead), walkIds(namedHead)
                    ]);
                    const cloneSet = new Set(cloneIds);
                    const namedSet = new Set(namedIds);
                    const namedInCloneAncestry = cloneSet.has(namedHead);
                    const cloneInNamedAncestry = namedSet.has(cloneHead);

                    if (namedInCloneAncestry && !cloneInNamedAncestry) {
                        const ahead = cloneIds.indexOf(namedHead);
                        result.syncState = { type: 'AHEAD', ahead, namedHead, cloneHead };
                        add('warn', 'Sync state', `Working is ${ahead} commit(s) ahead of published — push needed`);
                    } else if (cloneInNamedAncestry && !namedInCloneAncestry) {
                        const behind = namedIds.indexOf(cloneHead);
                        result.syncState = { type: 'BEHIND', behind, namedHead, cloneHead };
                        add('warn', 'Sync state', `Working is ${behind} commit(s) behind published — pull needed`);
                    } else if (!namedInCloneAncestry && !cloneInNamedAncestry) {
                        let forkId = null;
                        for (const id of cloneIds) {
                            if (namedSet.has(id)) { forkId = id; break; }
                        }
                        const cloneOnlyCount = cloneIds.filter(id => id !== forkId && !namedSet.has(id)).length;
                        const namedOnlyCount = namedIds.filter(id => id !== forkId && !cloneSet.has(id)).length;
                        result.syncState = { type: 'DIVERGED', namedHead, cloneHead, forkId, cloneOnlyCount, namedOnlyCount };
                        add('error', 'Sync state',
                            `Diverged — ${cloneOnlyCount} local-only · ${namedOnlyCount} published-only · fork at ${forkId || '(not found in scanned range)'}`);
                    } else {
                        result.syncState = { type: 'IN_SYNC', namedHead, cloneHead };
                        add('ok', 'Sync state', 'In sync (both heads are mutual ancestors)');
                    }
                }
            } else if (namedHead && !cloneHead) {
                result.syncState = { type: 'CLONE_MISSING', namedHead };
                add('info', 'Sync state', 'No clone branch — named-only / read mode');
            } else if (!namedHead && cloneHead) {
                result.syncState = { type: 'NAMED_MISSING', cloneHead };
                add('error', 'Sync state', 'Named HEAD missing — vault is unpublished');
            } else {
                result.syncState = { type: 'BOTH_MISSING' };
                add('error', 'Sync state', 'Both refs missing — vault may be corrupted or empty');
            }

            // 4 — Branch index
            try {
                const idx = await vault._refManager.readBranchIndex(vault._branchIndexFileId);
                if (!idx) {
                    add('warn', 'Branch index', 'Not found — vault predates indexed format');
                } else {
                    const named = idx.branches?.find(b => b.branch_type === 'named');
                    if (named && named.head_ref_id && named.head_ref_id !== vault._refFileId) {
                        add('error', 'Branch index',
                            `Stale — index says named ref is ${named.head_ref_id} but vault uses ${vault._refFileId}`);
                    } else {
                        add('ok', 'Branch index', `${idx.branches?.length ?? 0} branch(es) · schema: ${idx.schema || 'unknown'}`);
                    }
                }
            } catch (err) {
                add('warn', 'Branch index', `Read error: ${err.message}`);
            }

            // 5 — Write access
            if (vault.writable) {
                add('ok', 'Write access', 'Vault is writable — all repair operations available');
            } else {
                add('warn', 'Write access', 'Read-only — ref-modifying repairs are disabled');
            }

            return result;
        },

        // --- Render --------------------------------------------------------------

        _renderRepairView(container, vault, diag) {
            const icon = { ok: '✓', warn: '⚠', error: '✗', info: '○' };
            const cls  = { ok: 'sgit-diag--ok', warn: 'sgit-diag--warn', error: 'sgit-diag--error', info: 'sgit-diag--info' };

            const checksHtml = diag.checks.map(c => `
                <div class="sgit-diag-row ${cls[c.status] || ''}">
                    <span class="sgit-diag-icon">${icon[c.status] || '?'}</span>
                    <span class="sgit-diag-label">${this._esc(c.label)}</span>
                    <span class="sgit-diag-detail">${this._esc(c.detail)}</span>
                </div>`).join('');

            const repairs     = this._buildRepairActions(vault, diag);
            const repairsHtml = repairs.length === 0
                ? '<div class="sgit-empty" style="margin-top:0.5rem">No repairs needed — vault looks healthy.</div>'
                : repairs.map(r => this._renderRepairCard(r)).join('');

            container.innerHTML = `
                <div class="sgit-repair-view">

                    <div class="sgit-section">
                        <div class="sgit-section-header">
                            <div class="sgit-section-title">Health Check</div>
                            <button class="sgit-repair-rerun sgit-back-btn">Re-run</button>
                        </div>
                        <div class="sgit-diag-list">${checksHtml}</div>
                    </div>

                    <hr class="sgit-status-hr">

                    <div class="sgit-section">
                        <div class="sgit-section-title">Repair Operations</div>
                        <p class="sgit-status-hint">
                            <strong>sgit-in-browser</strong> — direct ref surgery, no local clone needed.
                            Each operation shows exactly what will change before you confirm.
                            Equivalent CLI command shown on each card.
                        </p>
                        <div class="sgit-repair-list">${repairsHtml}</div>
                    </div>

                </div>
            `;

            container.querySelector('.sgit-repair-rerun')?.addEventListener('click', () => {
                this._renderRepair(container);
            });

            container.querySelectorAll('.sgit-repair-show-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const card = btn.closest('.sgit-repair-card');
                    this._activateRepairCard(card, vault, diag, container);
                });
            });
        },

        // --- Build contextual action list ----------------------------------------

        _buildRepairActions(vault, diag) {
            const s = diag.syncState;
            const w = diag.writable;
            const actions = [];

            if (!s) return actions;

            if (s.type === 'BEHIND' && w) {
                actions.push({
                    id: 'pull', severity: 'safe',
                    title: 'Pull — fast-forward clone to published',
                    cli:   'sgit pull',
                    desc:  `Clone HEAD will advance from\n  ${s.cloneHead}\nto published HEAD\n  ${s.namedHead}\n(${s.behind} new commit(s))`,
                    effect: 'Clone ref updated. No data lost.',
                });
            }

            if ((s.type === 'AHEAD' || s.type === 'DIVERGED') && w) {
                const localDesc = s.type === 'DIVERGED'
                    ? `your ${s.cloneOnlyCount} local-only commit(s)`
                    : `your ${s.ahead} unpushed commit(s)`;
                actions.push({
                    id: 'reset-working', severity: 'destructive',
                    title: 'Reset working to published',
                    cli:   'sgit reset --hard published',
                    desc:  `Clone ref will be reset to the published HEAD:\n  ${s.namedHead}\n\n${localDesc} will no longer be reachable from the clone branch.\nThe commit objects remain on the server permanently as orphans.`,
                    effect: 'Clone ref reset. Unpushed local commits become orphaned (not deleted from server).',
                });
            }

            if ((s.type === 'AHEAD' || s.type === 'DIVERGED') && w) {
                const isForce   = s.type === 'DIVERGED';
                const lossNote  = isForce
                    ? `\n\n⚠ The ${s.namedOnlyCount} published-only commit(s) will become orphaned.\nThis rewrites published history — equivalent to git push --force.`
                    : '';
                actions.push({
                    id: isForce ? 'force-publish' : 'push', severity: isForce ? 'destructive' : 'safe',
                    title: isForce ? 'Force-publish working (rewrites published history)' : 'Push — publish clone to named',
                    cli:   isForce ? 'sgit push --force' : 'sgit push',
                    desc:  `Named HEAD will be set to clone HEAD:\n  ${s.cloneHead}${lossNote}`,
                    effect: isForce
                        ? 'Named ref overwritten. Published-only commits become orphaned.'
                        : 'Named ref fast-forwarded. No data lost.',
                });
            }

            if (s.type === 'CLONE_MISSING' && w) {
                actions.push({
                    id: 'init-clone', severity: 'safe',
                    title: 'Initialise clone ref from published HEAD',
                    cli:   '(first commit after sgit clone)',
                    desc:  `Creates the clone ref pointing to the published HEAD:\n  ${s.namedHead}\n\nAllows local commits to be made in this session.`,
                    effect: 'Clone ref created. No existing data changed.',
                });
            }

            if (s.type === 'NAMED_MISSING' && w) {
                actions.push({
                    id: 'publish-from-clone', severity: 'safe',
                    title: 'Create named ref from clone HEAD',
                    cli:   'sgit push (initial)',
                    desc:  `Creates the named ref pointing to the clone HEAD:\n  ${s.cloneHead}\n\nMakes the vault accessible to other clients.`,
                    effect: 'Named ref created. No existing data changed.',
                });
            }

            // Manual ref surgery — always available when writable
            if (w) {
                actions.push({
                    id: 'manual-named', severity: 'destructive', manual: true, refTarget: 'named',
                    title: 'Set named HEAD to any commit ID',
                    cli:   'sgit push --force --commit <id>',
                    desc:  `Overwrite the named (published) HEAD ref with any commit ID.\nCurrent: ${s.namedHead || '(none)'}`,
                    effect: 'Named ref overwritten. Use only for recovery.',
                });
                actions.push({
                    id: 'manual-clone', severity: 'destructive', manual: true, refTarget: 'clone',
                    title: 'Set clone HEAD to any commit ID',
                    cli:   'sgit reset --hard <commit>',
                    desc:  `Overwrite the clone (working) HEAD ref with any commit ID.\nCurrent: ${s.cloneHead || '(none)'}`,
                    effect: 'Clone ref overwritten. Use only for recovery.',
                });
            }

            return actions;
        },

        // --- Render a single repair card -----------------------------------------

        _renderRepairCard(a) {
            const badge = a.severity === 'destructive'
                ? '<span class="sgit-repair-badge sgit-repair-badge--danger">Destructive</span>'
                : '<span class="sgit-repair-badge sgit-repair-badge--safe">Safe</span>';

            const manualInput = a.manual ? `
                <div class="sgit-repair-manual">
                    <input class="sgit-repair-input" type="text"
                           placeholder="obj-cas-imm-…" spellcheck="false" autocomplete="off">
                </div>` : '';

            return `
                <div class="sgit-repair-card${a.severity === 'destructive' ? ' sgit-repair-card--destructive' : ''}"
                     data-repair-id="${this._esc(a.id)}">
                    <div class="sgit-repair-card-header">
                        <span class="sgit-repair-title">${this._esc(a.title)}</span>
                        ${badge}
                        <code class="sgit-repair-cli">${this._esc(a.cli)}</code>
                    </div>
                    <pre class="sgit-repair-desc">${this._esc(a.desc)}</pre>
                    ${manualInput}
                    <div class="sgit-repair-confirm-zone" hidden>
                        <p class="sgit-repair-confirm-msg">
                            <strong>Effect:</strong> ${this._esc(a.effect)}<br>
                            This operation cannot be automatically undone.
                        </p>
                        <button class="sgit-repair-run-btn">Confirm — Run Now</button>
                        <button class="sgit-repair-cancel-btn">Cancel</button>
                    </div>
                    <div class="sgit-repair-result" hidden></div>
                    <button class="sgit-repair-show-btn">Run →</button>
                </div>`;
        },

        // --- Confirmation flow ----------------------------------------------------

        _activateRepairCard(card, vault, diag, container) {
            const zone    = card.querySelector('.sgit-repair-confirm-zone');
            const showBtn = card.querySelector('.sgit-repair-show-btn');
            if (!zone) return;

            zone.hidden  = false;
            showBtn.hidden = true;

            card.querySelector('.sgit-repair-cancel-btn').addEventListener('click', () => {
                zone.hidden    = false;
                showBtn.hidden = false;
                zone.hidden    = true;
            }, { once: true });

            card.querySelector('.sgit-repair-run-btn').addEventListener('click', async () => {
                zone.hidden = true;
                const actionId = card.dataset.repairId;
                await this._executeRepair(card, actionId, vault, diag);
            }, { once: true });
        },

        // --- Execute repair -------------------------------------------------------

        async _executeRepair(card, actionId, vault, diag) {
            const resultEl = card.querySelector('.sgit-repair-result');
            const showBtn  = card.querySelector('.sgit-repair-show-btn');
            const s        = diag.syncState;

            if (resultEl) {
                resultEl.hidden    = false;
                resultEl.className = 'sgit-repair-result sgit-repair-result--running';
                resultEl.textContent = 'Running…';
            }

            try {
                let successMsg = '';

                switch (actionId) {
                    case 'pull': {
                        await vault.pull();
                        successMsg = `Clone HEAD fast-forwarded to ${vault._headCommitId}`;
                        break;
                    }
                    case 'reset-working': {
                        await vault._refManager.writeRef(vault._cloneRefFileId, s.namedHead);
                        vault._headCommitId = s.namedHead;
                        await vault._loadTreeFromCommit(s.namedHead);
                        successMsg = `Clone ref reset to ${s.namedHead}`;
                        break;
                    }
                    case 'push':
                    case 'force-publish': {
                        await vault._refManager.writeRef(vault._refFileId, s.cloneHead);
                        vault._namedHeadId = s.cloneHead;
                        successMsg = `Named ref updated to ${s.cloneHead}`;
                        break;
                    }
                    case 'init-clone': {
                        await vault._refManager.writeRef(vault._cloneRefFileId, s.namedHead);
                        vault._headCommitId = s.namedHead;
                        successMsg = `Clone ref initialised to ${s.namedHead}`;
                        break;
                    }
                    case 'publish-from-clone': {
                        await vault._refManager.writeRef(vault._refFileId, s.cloneHead);
                        vault._namedHeadId = s.cloneHead;
                        successMsg = `Named ref created at ${s.cloneHead}`;
                        break;
                    }
                    case 'manual-named': {
                        const id = card.querySelector('.sgit-repair-input')?.value?.trim();
                        if (!id) throw new Error('Enter a commit ID first');
                        await vault._refManager.writeRef(vault._refFileId, id);
                        vault._namedHeadId = id;
                        successMsg = `Named ref set to ${id}`;
                        break;
                    }
                    case 'manual-clone': {
                        const id = card.querySelector('.sgit-repair-input')?.value?.trim();
                        if (!id) throw new Error('Enter a commit ID first');
                        await vault._refManager.writeRef(vault._cloneRefFileId, id);
                        vault._headCommitId = id;
                        await vault._loadTreeFromCommit(id);
                        successMsg = `Clone ref set to ${id}`;
                        break;
                    }
                    default:
                        throw new Error(`Unknown action: ${actionId}`);
                }

                if (resultEl) {
                    resultEl.className   = 'sgit-repair-result sgit-repair-result--ok';
                    resultEl.textContent = `✓ ${successMsg}`;
                }
                // Grey out card so it can't be re-run accidentally
                card.style.opacity = '0.65';
                card.querySelectorAll('button').forEach(b => b.disabled = true);

            } catch (err) {
                if (resultEl) {
                    resultEl.className   = 'sgit-repair-result sgit-repair-result--error';
                    resultEl.textContent = `✗ ${err.message}`;
                }
                if (showBtn) showBtn.hidden = false;
            }
        },

    });

})();
