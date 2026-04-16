/* =============================================================================
   SGraph Vault — SGit View: History Tab
   v0.2.0 — Commit log with two-track diverged graph

   Linear mode: single chain from clone HEAD (existing behavior + Published HEAD mark).
   Diverged mode: when clone HEAD and named HEAD have diverged, renders a two-track
   graph showing both branches side-by-side until they converge at the fork point.

   Track colours:
     Left  (teal  #4ECDC4) = Working branch  (clone HEAD)
     Right (blue  #45b7d1) = Published branch (named HEAD)

   Extends VaultSgitView.prototype. Must load after vault-sgit-view.js.
   ============================================================================= */

(function() {
    'use strict';

    // Colours used for tracks (injected into inline styles / SVG paths)
    const C_CLONE = '#4ECDC4';
    const C_NAMED = '#45b7d1';

    Object.assign(VaultSgitView.prototype, {

        // --- Entry point ---------------------------------------------------------

        async _renderHistory(container) {
            container.innerHTML = '<div class="sgit-loading">Loading commit history...</div>';

            const vault     = this._vault;
            const cloneHead = vault._headCommitId;
            const namedHead = vault._namedHeadId;

            // Walk the first-parent chain (for graph rendering) → [{id, ...commit}]
            const walkChain = async (headId, max = 60) => {
                const result = [];
                let cursor   = headId;
                while (cursor && result.length < max) {
                    let commit = this._commitCache.get(cursor);
                    if (!commit) {
                        try {
                            commit = await vault._commitManager.loadCommit(cursor);
                            this._commitCache.set(cursor, commit);
                        } catch (err) {
                            result.push({ id: cursor, _error: err.message });
                            break;
                        }
                    }
                    result.push({ id: cursor, ...commit });
                    cursor = commit.parents?.[0] || null;
                }
                return result;
            };

            // BFS over ALL parents (for reachability — handles merge commits)
            // Returns Set<commitId> of every ancestor reachable from headId.
            const allAncestors = async (headId, max = 200) => {
                const seen  = new Set();
                const queue = headId ? [headId] : [];
                while (queue.length && seen.size < max) {
                    const id = queue.shift();
                    if (seen.has(id)) continue;
                    seen.add(id);
                    let commit = this._commitCache.get(id);
                    if (!commit) {
                        try {
                            commit = await vault._commitManager.loadCommit(id);
                            this._commitCache.set(id, commit);
                        } catch (_) { continue; }
                    }
                    for (const p of (commit.parents || [])) {
                        if (!seen.has(p)) queue.push(p);
                    }
                }
                return seen;
            };

            // Fast path: no divergence (or post-merge where both heads are the same commit)
            if (!cloneHead || !namedHead || cloneHead === namedHead) {
                await this._renderHistoryFull(container, cloneHead || namedHead, namedHead);
                return;
            }

            // Use BFS reachability to determine true relationship before rendering
            const [cloneAncestors, namedAncestors] = await Promise.all([
                allAncestors(cloneHead),
                allAncestors(namedHead)
            ]);

            // Named head reachable from clone → clone is AHEAD (may have mid-chain merge commits)
            if (cloneAncestors.has(namedHead)) {
                await this._renderHistoryFull(container, cloneHead, namedHead);
                return;
            }

            // Clone head reachable from named → clone is BEHIND
            if (namedAncestors.has(cloneHead)) {
                const commits = await walkChain(namedHead);
                this._renderHistoryLinear(container, commits, namedHead);
                return;
            }

            // Neither reachable from the other → truly diverged
            // Walk first-parent chains for the two-track graph
            const [cloneChain, namedChain] = await Promise.all([
                walkChain(cloneHead),
                walkChain(namedHead)
            ]);

            // Find fork point using the broader ancestor sets
            let forkId = null;
            for (const c of cloneChain) {
                if (namedAncestors.has(c.id)) { forkId = c.id; break; }
            }

            // True fork: render two-track graph
            this._renderHistoryDiverged(container, cloneChain, namedChain, cloneHead, namedHead, forkId);
        },

        // --- Full DAG renderer: linear sections + two-track merge sections --------
        // Used for AHEAD and same-head paths. Detects merge commits anywhere in the
        // first-parent chain and renders the two-track section at the correct position.

        async _renderHistoryFull(container, headId, namedHead) {
            const rows = await this._buildHistoryPlan(headId, 100);
            if (!rows.length) {
                container.innerHTML = '<div class="sgit-empty">No commits found</div>';
                return;
            }
            const hasMerge = rows.some(r => r._mode === 'two-track');
            const listCls  = hasMerge ? 'sgit-commit-list sgit-commit-list--two' : 'sgit-commit-list';
            const hdrCls   = hasMerge ? 'sgit-commit-header sgit-commit-header--two' : 'sgit-commit-header';
            container.innerHTML = `
                <div class="${listCls}">
                    <div class="${hdrCls}">
                        <span class="${hasMerge ? 'sgit-ch-graph--two' : 'sgit-ch-graph'}"></span>
                        <span class="sgit-ch-msg">Description</span>
                        <span class="sgit-ch-id">Commit</span>
                        <span class="sgit-ch-date">Date</span>
                    </div>
                    ${rows.map(row => this._renderPlanRow(row, namedHead, hasMerge)).join('')}
                </div>
            `;
        },

        async _buildHistoryPlan(headId, maxRows) {
            const vault  = this._vault;
            const loadC  = async (id) => {
                let c = this._commitCache.get(id);
                if (!c) { c = await vault._commitManager.loadCommit(id); this._commitCache.set(id, c); }
                return c;
            };
            const walkFrom = async (startId, stopSet, max) => {
                const res = []; let cur = startId;
                while (cur && res.length < max) {
                    if (stopSet.has(cur)) break;
                    try { const c = await loadC(cur); res.push({ id: cur, ...c }); cur = c.parents?.[0] || null; }
                    catch (_) { break; }
                }
                return res;
            };

            const allRows = []; const seenIds = new Set(); let cursor = headId;
            while (cursor && allRows.length < maxRows) {
                if (seenIds.has(cursor)) break;
                seenIds.add(cursor);
                let commit;
                try { commit = await loadC(cursor); } catch (_) { break; }

                if (commit.parents?.length >= 2) {
                    // Merge commit: build two-track section showing the pre-merge branches
                    const p0 = commit.parents[0], p1 = commit.parents[1];
                    const stopSet = new Set(seenIds);
                    const [chain0, chain1] = await Promise.all([
                        walkFrom(p0, stopSet, 60), walkFrom(p1, stopSet, 60)
                    ]);
                    const set0 = new Set(chain0.map(c => c.id)), set1 = new Set(chain1.map(c => c.id));
                    let forkId = null;
                    for (const c of chain1) { if (set0.has(c.id)) { forkId = c.id; break; } }
                    const cloneOnly  = chain0.filter(c => c.id !== forkId && !set1.has(c.id));
                    const namedOnly  = chain1.filter(c => c.id !== forkId && !set0.has(c.id));
                    const forkCommit = forkId ? chain0.find(c => c.id === forkId) : null;

                    const tRows = [
                        { id: cursor, ...commit, _track: 'merge' },
                        ...[...cloneOnly.map(c => ({ ...c, _track: 'clone' })),
                            ...namedOnly.map(c => ({ ...c, _track: 'named' }))]
                            .sort((a, b) => (b.timestamp_ms || 0) - (a.timestamp_ms || 0)),
                        ...(forkCommit ? [{ ...forkCommit, _track: 'fork' }] : [])
                    ];
                    const localForkIdx = tRows.findIndex(r => r._track === 'fork');
                    const base = allRows.length;

                    for (let i = 0; i < tRows.length; i++) {
                        const row = tRows[i], isMH = row._track === 'merge';
                        const inTTZ  = isMH || (localForkIdx >= 0 && i <= localForkIdx);
                        const isAtFk = row._track === 'fork';
                        allRows.push({ ...row, _mode: 'two-track', _s: {
                            cloneDot:        row._track !== 'named',
                            namedDot:        isMH || row._track === 'named',
                            cloneLineTop:    (base + i) > 0,
                            cloneLineBottom: true,  // fixed below
                            namedVisible:    inTTZ,
                            namedLineTop:    inTTZ && i > 0 && !isMH,
                            namedLineBottom: inTTZ && !isAtFk,
                            namedLineJoin:   isAtFk,
                            isCloneHead:     row.id === p0,
                            isNamedHead:     row.id === p1,
                            isHead:          isMH || row.id === p0 || row.id === p1,
                            isFork:          isAtFk,
                            isMergeHead:     isMH,
                        }});
                    }
                    for (const c of [...cloneOnly, ...namedOnly]) seenIds.add(c.id);
                    if (forkId) seenIds.add(forkId);
                    cursor = forkCommit?.parents?.[0] || null;
                } else {
                    allRows.push({ id: cursor, ...commit, _mode: 'linear',
                        _isHead: cursor === headId, _lineTop: allRows.length > 0, _lineBot: true });
                    cursor = commit.parents?.[0] || null;
                }
            }
            // Fix line indicators for last row in each run
            for (let i = 0; i < allRows.length; i++) {
                const isLast = i === allRows.length - 1;
                if (allRows[i]._mode === 'two-track') allRows[i]._s.cloneLineBottom = !isLast;
                if (allRows[i]._mode === 'linear')    allRows[i]._lineBot = !isLast;
            }
            return allRows;
        },

        _renderPlanRow(row, namedHead, hasMerge) {
            if (row._mode === 'two-track') return this._renderDivergedRow(row, row._s);

            const isHead      = row._isHead;
            const isNamedHere = namedHead && row.id === namedHead && !isHead;
            const msg    = row.message || '(no message)';
            const date   = row.timestamp_ms
                ? new Date(row.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '--';
            const branch = row.branch_id || '';
            const badges = [
                isHead      ? '<span class="sgit-badge sgit-badge--head">Working HEAD</span>'         : '',
                isNamedHere ? '<span class="sgit-badge sgit-badge--named-head">Published HEAD</span>' : '',
                branch      ? `<span class="sgit-badge sgit-badge--branch">${this._esc(this._shortBranch(branch))}</span>` : '',
            ].join('');
            const treeLink = row.tree_id
                ? `<a class="sgit-obj-link sgit-commit-tree-link" href="#" data-id="${this._esc(row.tree_id)}" title="View tree">tree</a>`
                : '';
            const rowCls = `sgit-commit-row${hasMerge ? ' sgit-commit-row--two' : ''}${(isHead || isNamedHere) ? ' sgit-commit-row--head' : ''}`;

            const checkoutBtn = `<button class="sgit-checkout-btn" data-commit-id="${this._esc(row.id)}" title="Load this commit as working state">load ↩</button>`;

            if (!hasMerge) {
                // Pure linear mode: use single-track cell
                return `<div class="${rowCls}">
                    <span class="sgit-ch-graph">
                        <span class="sgit-graph-line-top${!row._lineTop ? ' sgit-graph-line--hidden' : ''}"></span>
                        <span class="sgit-graph-dot${isHead ? ' sgit-graph-dot--head' : ''}"></span>
                        <span class="sgit-graph-line-bottom${!row._lineBot ? ' sgit-graph-line--hidden' : ''}"></span>
                    </span>
                    <span class="sgit-ch-msg">${badges}<span class="sgit-commit-msg">${this._esc(msg)}</span>${treeLink}${checkoutBtn}</span>
                    <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(row.id)}">${this._esc(this._short(row.id))}</a></span>
                    <span class="sgit-ch-date">${date}</span>
                </div>`;
            }
            // Mixed mode: use two-track cell builder for consistent 48px graph column
            const graphCell = this._buildGraphCell2T({
                cloneDot: true, namedDot: false,
                cloneLineTop: row._lineTop, cloneLineBottom: row._lineBot,
                namedVisible: false,
                namedLineTop: false, namedLineBottom: false, namedLineJoin: false,
                isCloneHead: isHead, isNamedHead: false,
                isHead: isHead || isNamedHere, isFork: false, isMergeHead: false,
            });
            return `<div class="${rowCls}">
                ${graphCell}
                <span class="sgit-ch-msg">${badges}<span class="sgit-commit-msg">${this._esc(msg)}</span>${treeLink}${checkoutBtn}</span>
                <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(row.id)}">${this._esc(this._short(row.id))}</a></span>
                <span class="sgit-ch-date">${date}</span>
            </div>`;
        },

        // --- Linear (single-chain) renderer (used for BEHIND path) ---------------

        _renderHistoryLinear(container, commits, namedHeadId) {
            if (!commits || commits.length === 0) {
                container.innerHTML = '<div class="sgit-empty">No commits found</div>';
                return;
            }
            container.innerHTML = `
                <div class="sgit-commit-list">
                    <div class="sgit-commit-header">
                        <span class="sgit-ch-graph"></span>
                        <span class="sgit-ch-msg">Description</span>
                        <span class="sgit-ch-id">Commit</span>
                        <span class="sgit-ch-date">Date</span>
                    </div>
                    ${commits.map((c, i) => this._renderCommitRow(c, i, commits.length, namedHeadId)).join('')}
                </div>
            `;
        },

        // --- Two-track (diverged or merged) renderer -----------------------------
        // opts.mergeHead : { id, ...commit } — prepend merge commit at top (post-merge view)
        // opts.isMerged  : true             — changes banner text and track labels

        _renderHistoryDiverged(container, cloneChain, namedChain, cloneHead, namedHead, forkId, opts = {}) {
            const cloneIdSet = new Set(cloneChain.map(c => c.id));
            const namedIdSet = new Set(namedChain.map(c => c.id));

            const cloneOnly    = cloneChain.filter(c => c.id !== forkId && !namedIdSet.has(c.id));
            const namedOnly    = namedChain.filter(c => c.id !== forkId && !cloneIdSet.has(c.id));
            const forkCommit   = forkId ? cloneChain.find(c => c.id === forkId) : null;
            const forkChainIdx = forkId ? cloneChain.findIndex(c => c.id === forkId) : -1;
            const sharedCommits = forkChainIdx >= 0 ? cloneChain.slice(forkChainIdx + 1) : [];

            // Interleave above-fork commits by timestamp (newest first)
            const aboveFork = [
                ...cloneOnly.map(c => ({ ...c, _track: 'clone' })),
                ...namedOnly.map(c => ({ ...c, _track: 'named' }))
            ].sort((a, b) => (b.timestamp_ms || 0) - (a.timestamp_ms || 0));

            const rows = [
                // Merge commit at top when rendering post-merge history
                ...(opts.mergeHead ? [{ ...opts.mergeHead, _track: 'merge' }] : []),
                ...aboveFork,
                ...(forkCommit ? [{ ...forkCommit, _track: 'fork' }] : []),
                ...sharedCommits.map(c => ({ ...c, _track: 'shared' }))
            ];

            const forkIdx = rows.findIndex(r => r._track === 'fork');

            // Pre-compute per-row graph state
            const states = rows.map((row, i) => {
                const isMergeHead    = row._track === 'merge';
                const inTwoTrackZone = isMergeHead || (forkIdx >= 0 && i <= forkIdx);
                const isAtFork       = row._track === 'fork';
                return {
                    cloneDot:        row._track !== 'named',
                    namedDot:        isMergeHead || row._track === 'named',
                    cloneLineTop:    i > 0,
                    cloneLineBottom: i < rows.length - 1,
                    namedVisible:    inTwoTrackZone,
                    namedLineTop:    inTwoTrackZone && i > 0 && !isMergeHead,
                    namedLineBottom: inTwoTrackZone && !isAtFork,
                    namedLineJoin:   isAtFork,   // curved connector at fork
                    isCloneHead:     row.id === cloneHead,
                    isNamedHead:     row.id === namedHead,
                    isHead:          isMergeHead || row.id === cloneHead || row.id === namedHead,
                    isFork:          isAtFork,
                    isMergeHead,
                };
            });

            const isMerged   = !!opts.isMerged;
            const label1     = isMerged ? '● Local (before merge)'     : '● Working (clone)';
            const label2     = isMerged ? '● Published (before merge)' : '● Published (named)';
            const bannerDesc = isMerged
                ? `Merged — ${cloneOnly.length} local · ${namedOnly.length} published · merge commit
                   <a class="sgit-obj-link" href="#" data-id="${this._esc(opts.mergeHead.id)}">${this._esc(this._short(opts.mergeHead.id))}</a>`
                : `Diverged — ${cloneOnly.length} local-only · ${namedOnly.length} published-only · fork at
                   <a class="sgit-obj-link" href="#" data-id="${this._esc(forkId)}">${this._esc(this._short(forkId))}</a>`;

            container.innerHTML = `
                <div class="sgit-commit-list sgit-commit-list--two">
                    <div class="sgit-fork-banner">
                        <span class="sgit-fork-lane sgit-fork-lane--clone">${label1}</span>
                        <span class="sgit-fork-lane sgit-fork-lane--named">${label2}</span>
                        <span class="sgit-fork-desc">${bannerDesc}</span>
                    </div>
                    <div class="sgit-commit-header sgit-commit-header--two">
                        <span class="sgit-ch-graph--two"></span>
                        <span class="sgit-ch-msg">Description</span>
                        <span class="sgit-ch-id">Commit</span>
                        <span class="sgit-ch-date">Date</span>
                    </div>
                    ${rows.map((row, i) => this._renderDivergedRow(row, states[i])).join('')}
                </div>
            `;
        },

        // --- Single row renderer for two-track mode ------------------------------

        _renderDivergedRow(row, s) {
            if (row._error) {
                return `<div class="sgit-commit-row sgit-commit-row--two">
                    <span class="sgit-ch-graph">${this._buildGraphCell2T(s)}</span>
                    <span class="sgit-ch-msg sgit-error-inline">Error: ${this._esc(row._error)}</span>
                    <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(row.id)}">${this._esc(this._short(row.id))}</a></span>
                    <span class="sgit-ch-date">--</span>
                </div>`;
            }

            const msg  = row.message || '(no message)';
            const date = row.timestamp_ms
                ? new Date(row.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '--';

            const badges = [
                s.isMergeHead ? '<span class="sgit-badge sgit-badge--merge-head">HEAD (Merged)</span>'  : '',
                s.isCloneHead ? '<span class="sgit-badge sgit-badge--head">Working HEAD</span>'          : '',
                s.isNamedHead ? '<span class="sgit-badge sgit-badge--named-head">Published HEAD</span>'  : '',
                s.isFork      ? '<span class="sgit-badge sgit-badge--fork">fork</span>'                  : '',
            ].join('');

            return `<div class="sgit-commit-row sgit-commit-row--two${s.isHead ? ' sgit-commit-row--head' : ''}${s.isFork ? ' sgit-commit-row--fork' : ''}">
                ${this._buildGraphCell2T(s)}
                <span class="sgit-ch-msg">
                    ${badges}
                    <span class="sgit-commit-msg">${this._esc(msg)}</span>
                    ${row.tree_id ? `<a class="sgit-obj-link sgit-commit-tree-link" href="#" data-id="${this._esc(row.tree_id)}" title="View tree">tree</a>` : ''}
                    <button class="sgit-checkout-btn" data-commit-id="${this._esc(row.id)}" title="Load this commit as working state">load ↩</button>
                </span>
                <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(row.id)}">${this._esc(this._short(row.id))}</a></span>
                <span class="sgit-ch-date">${date}</span>
            </div>`;
        },

        // --- Two-track graph cell builder ----------------------------------------
        // Layout: 48px wide, two 20px tracks (clone left at x=2, named right at x=26)
        // Track dot centres: clone x=12, named x=36

        _buildGraphCell2T(s) {
            const line = (show, color) =>
                `<span class="sgit-gt-line${show ? '' : ' sgit-gt-line--hidden'}" style="background:${color}"></span>`;

            const dot = (show, isHead, color) => {
                if (!show) return '<span class="sgit-gt-spacer"></span>';
                const headCls = isHead ? ' sgit-gt-dot--head' : '';
                return `<span class="sgit-gt-dot${headCls}" style="background:${color};${isHead ? `box-shadow:0 0 0 2px var(--bg-primary),0 0 0 3px ${color}` : ''}"></span>`;
            };

            const cloneTrack = `
                <span class="sgit-gt sgit-gt--clone">
                    ${line(s.cloneLineTop,    C_CLONE)}
                    ${dot(s.cloneDot, s.isCloneHead, C_CLONE)}
                    ${line(s.cloneLineBottom, C_CLONE)}
                </span>`;

            let namedTrack = '';
            if (s.namedVisible) {
                // At the fork row: replace the bottom line with an SVG curve joining named→clone.
                // The SVG is positioned at the top-left of the named-track span (left:0, top:0).
                // Named span starts at cell x=26 (= 48 - right:2 - width:20), so:
                //   named centre in span coords: x = 36-26 = 10
                //   clone centre in span coords: x = 12-26 = -14  (overflow:visible lets it render)
                // Path: start at named-track centre (10,14), arc down to (−14,14) at clone centre.
                const bottomHtml = s.namedLineJoin
                    ? `<svg style="position:absolute;left:0;top:0;width:20px;height:28px;pointer-events:none;overflow:visible"
                            viewBox="0 0 20 28">
                           <path d="M 10 14 C 10 22 -14 22 -14 14"
                                 stroke="${C_NAMED}" fill="none" stroke-width="2" opacity="0.5"/>
                       </svg>`
                    : line(s.namedLineBottom, C_NAMED);

                namedTrack = `
                    <span class="sgit-gt sgit-gt--named">
                        ${line(s.namedLineTop, C_NAMED)}
                        ${dot(s.namedDot, s.isNamedHead, C_NAMED)}
                        ${bottomHtml}
                    </span>`;
            }

            return `<span class="sgit-ch-graph sgit-ch-graph--two">${cloneTrack}${namedTrack}</span>`;
        },

        // --- Single row for linear mode ------------------------------------------

        _renderCommitRow(commit, index, total, namedHeadId) {
            if (commit._error) {
                return `<div class="sgit-commit-row">
                    <span class="sgit-ch-graph"><span class="sgit-graph-dot sgit-graph-dot--error"></span></span>
                    <span class="sgit-ch-msg">Error: ${this._esc(commit._error)}</span>
                    <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                    <span class="sgit-ch-date">--</span>
                </div>`;
            }

            const isHead      = index === 0;
            const isNamedHere = namedHeadId && commit.id === namedHeadId && !isHead;
            const msg         = commit.message || '(no message)';
            const date        = commit.timestamp_ms
                ? new Date(commit.timestamp_ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '--';
            const branch  = commit.branch_id || '';
            const hasLine = index < total - 1;

            return `<div class="sgit-commit-row${isHead ? ' sgit-commit-row--head' : ''}">
                <span class="sgit-ch-graph">
                    <span class="sgit-graph-line-top${index === 0 ? ' sgit-graph-line--hidden' : ''}"></span>
                    <span class="sgit-graph-dot${isHead ? ' sgit-graph-dot--head' : ''}"></span>
                    <span class="sgit-graph-line-bottom${!hasLine ? ' sgit-graph-line--hidden' : ''}"></span>
                </span>
                <span class="sgit-ch-msg">
                    ${isHead      ? '<span class="sgit-badge sgit-badge--head">Working HEAD</span>'         : ''}
                    ${isNamedHere ? '<span class="sgit-badge sgit-badge--named-head">Published HEAD</span>' : ''}
                    ${branch      ? `<span class="sgit-badge sgit-badge--branch">${this._esc(this._shortBranch(branch))}</span>` : ''}
                    <span class="sgit-commit-msg">${this._esc(msg)}</span>
                    <a class="sgit-obj-link sgit-commit-tree-link" href="#" data-id="${this._esc(commit.tree_id)}" title="View tree">tree</a>
                    <button class="sgit-checkout-btn" data-commit-id="${this._esc(commit.id)}" title="Load this commit as working state">load ↩</button>
                </span>
                <span class="sgit-ch-id"><a class="sgit-obj-link" href="#" data-id="${this._esc(commit.id)}">${this._esc(this._short(commit.id))}</a></span>
                <span class="sgit-ch-date">${date}</span>
            </div>`;
        },

        _shortBranch(branchId) {
            if (!branchId) return '';
            return branchId.length > 20 ? branchId.substring(0, 18) + '...' : branchId;
        }

    });
})();
