// SGraph Send — Performance Tool — Main custom element <perf-app>
// Layout via <sg-layout> (resizable row of two stacks):
//   Left  stack: Scenarios list (locked)
//   Right stack: "Current run" + "Past runs" (both locked) + dynamic detail
//                tabs that open when the user clicks a result row.
// Each result row captures its own log lines during execution; clicking the
// row opens (or focuses) a detail tab with steps + that row's log.

(function (global) {
  'use strict';

  const $api      = global.ApiClient;
  const $art      = global.ArtifactTracker;
  const $runs     = global.RunStore;
  const SCENARIOS = global.SCENARIOS || [];

  class PerfApp extends HTMLElement {
    constructor() {
      super();
      this.results          = [];
      this.selected         = new Set();
      this.running          = false;
      this.logLines         = [];                // global activity log
      this._activeRowLog    = null;              // when set, log() also appends here
      this._sgLayout        = null;
      this._layoutReady     = false;
      this._currentDetailTabs = new Map();       // row.run_id  → tabId
      this._pastDetailTabs    = new Map();       // run.id      → tabId
      this._compareTabs       = new Map();       // "A|B"       → tabId
      this._compareSelection  = new Set();
    }

    connectedCallback() {
      this._renderShell();
      this._bindShellEvents();
      this._initLayout();
    }

    // ─────────────────────────────────────────────────────── shell render ──
    _renderShell() {
      const orphans = $art.countOrphans();
      const counts  = $art.countAll();

      this.innerHTML = `
        <div class="topbar">
          <div class="title">SGraph Send · Performance Tests</div>
          <div class="version">v0.1.0 · ${location.host}</div>
          <div class="spacer"></div>
          <label>x-sgraph-access-token</label>
          <input type="text" id="token-input" value="${escapeAttr($api.getToken())}" placeholder="paste access token…">
          <button id="save-token">Save</button>
          <button id="clear-token">Clear</button>
        </div>

        ${orphans.total > 0 ? `
          <div class="banner">
            ⚠ ${orphans.transfers} orphan transfer(s) and ${orphans.vaults} orphan vault(s) from previous runs.
            <button id="clean-orphans">Clean now</button>
            <button id="purge-tracker" class="danger">Forget all tracked</button>
          </div>
        ` : '<div></div>'}

        <sg-layout id="perf-layout"></sg-layout>

        <pre class="log-area" id="log-area"></pre>

        <div class="footer">
          <div class="stat">Tracked: <strong>${counts.transfers}</strong> transfers, <strong>${counts.vaults}</strong> vaults</div>
          <div class="stat">Orphans: <strong>${orphans.total}</strong></div>
          <div class="stat">Saved runs: <strong>${$runs.list().length}</strong> (${fmtBytes($runs.storageStats().bytes)})</div>
          <div class="spacer"></div>
          <div class="stat">Base URL: <strong>${$api.baseUrl() || '(same-origin)'}</strong></div>
        </div>
      `;
    }

    _bindShellEvents() {
      const $ = sel => this.querySelector(sel);

      $('#save-token').onclick = () => {
        const v = $('#token-input').value.trim();
        $api.setToken(v);
        this.log(`Token saved (${v ? v.slice(0, 8) + '…' : '(empty)'})`);
      };
      $('#clear-token').onclick = () => {
        $api.clearToken();
        $('#token-input').value = '';
        this.log('Token cleared.');
      };

      const cleanBtn = $('#clean-orphans');
      if (cleanBtn) cleanBtn.onclick = async () => {
        cleanBtn.disabled = true;
        this.log('Cleaning orphans…');
        const r = await $art.cleanOrphans($api, msg => this.log(msg));
        this.log(`Cleanup: ${r.transfers_cleaned} transfers, ${r.vaults_destroyed} vaults, ${r.failed} failed.`);
        this._refreshShell();
      };
      const purgeBtn = $('#purge-tracker');
      if (purgeBtn) purgeBtn.onclick = () => {
        if (confirm('Forget all tracked artefacts? (server-side artefacts will NOT be deleted)')) {
          $art.clearAll();
          this._refreshShell();
        }
      };
    }

    _refreshShell() {
      // Update only the dynamic stats — never replace sg-layout's DOM
      // (that would lose its internal state).
      const orphans = $art.countOrphans();
      const counts  = $art.countAll();
      const stats   = this.querySelectorAll('.footer .stat');
      if (stats[0]) stats[0].innerHTML = `Tracked: <strong>${counts.transfers}</strong> transfers, <strong>${counts.vaults}</strong> vaults`;
      if (stats[1]) stats[1].innerHTML = `Orphans: <strong>${orphans.total}</strong>`;
      if (stats[2]) stats[2].innerHTML = `Saved runs: <strong>${$runs.list().length}</strong> (${fmtBytes($runs.storageStats().bytes)})`;

      const banner = this.querySelector('.banner');
      if (banner && orphans.total === 0) banner.style.display = 'none';
    }

    // ─────────────────────────────────────────────────────── sg-layout ──
    _initLayout() {
      const layoutEl = this.querySelector('#perf-layout');
      this._sgLayout = layoutEl;
      if (!layoutEl) return;

      customElements.whenDefined('sg-layout').then(() => {
        layoutEl.setLayout({
          type: 'row', id: 'root', sizes: [0.30, 0.70],
          children: [
            {
              type: 'stack', id: 's-scenarios', activeTab: 0,
              tabs: [
                { type: 'tab', id: 't-scenarios', title: 'Scenarios', tag: 'div', state: {}, locked: true }
              ]
            },
            {
              type: 'stack', id: 's-main', activeTab: 0,
              tabs: [
                { type: 'tab', id: 't-current', title: 'Current run',            tag: 'div', state: {}, locked: true },
                { type: 'tab', id: 't-runs',    title: `Past runs (${$runs.list().length})`, tag: 'div', state: {}, locked: true }
              ]
            }
          ]
        });

        requestAnimationFrame(() => {
          this._layoutReady = true;
          this._populateScenarios();
          this._populateCurrent();
          this._populateRuns();
        });
      });
    }

    _refreshPastRunsCount() {
      // sg-layout has no rename-tab API in v0.1.0 — best-effort no-op. The
      // count is also shown in the footer + Past-runs tab body.
    }

    // ─────────────────────────────────────────── scenarios (left panel) ──
    _populateScenarios() {
      const el = this._sgLayout.getPanelElement('t-scenarios');
      if (!el) return;
      el.classList.add('tab-body');

      const byGroup = {};
      SCENARIOS.forEach(s => { (byGroup[s.group] = byGroup[s.group] || []).push(s); });

      el.innerHTML = `
        <div class="controls-bar">
          <button id="select-all">All</button>
          <button id="select-none">None</button>
          <div class="spacer" style="flex:1"></div>
          <button id="run-selected" class="primary">▶ Run selected (${this.selected.size})</button>
          <label>loop</label>
          <input type="number" id="loop-count" value="1" min="1" max="100" style="width:48px">
          <label>×</label>
          <button id="stop-run" class="danger" disabled>■ Stop</button>
        </div>
        <div class="scroll-area" id="scenarios-list">
          ${Object.keys(byGroup).map(group => `
            <div class="scenario-group">
              <div class="group-title">${escapeHtml(group)}</div>
              ${byGroup[group].map(s => `
                <div class="scenario ${this.selected.has(s.id) ? 'selected' : ''}" data-id="${escapeAttr(s.id)}">
                  <input type="checkbox" data-id="${escapeAttr(s.id)}" ${this.selected.has(s.id) ? 'checked' : ''}>
                  <div class="body">
                    <div class="name">${escapeHtml(s.name)}</div>
                    <div class="desc">${escapeHtml(s.desc)}</div>
                    <div class="flags">
                      ${(s.flags || []).map(f => `<span class="flag ${f.kind || ''}">${escapeHtml(f.label)}</span>`).join('')}
                      <span class="flag" style="cursor:pointer" data-run="${escapeAttr(s.id)}">▶ run</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `;

      const $ = sel => el.querySelector(sel);

      $('#select-all').onclick = () => {
        SCENARIOS.forEach(s => this.selected.add(s.id));
        this._populateScenarios();
      };
      $('#select-none').onclick = () => {
        this.selected.clear();
        this._populateScenarios();
      };
      el.querySelectorAll('#scenarios-list input[type=checkbox]').forEach(cb => {
        cb.onchange = () => {
          if (cb.checked) this.selected.add(cb.dataset.id);
          else this.selected.delete(cb.dataset.id);
          const row = cb.closest('.scenario');
          if (row) row.classList.toggle('selected', cb.checked);
          const btn = el.querySelector('#run-selected');
          if (btn) btn.textContent = `▶ Run selected (${this.selected.size})`;
        };
      });
      el.querySelectorAll('[data-run]').forEach(btn => {
        btn.onclick = (ev) => {
          ev.stopPropagation();
          const s = SCENARIOS.find(x => x.id === btn.dataset.run);
          if (s) this.runScenarios([s], 1);
        };
      });
      $('#run-selected').onclick = () => {
        const sel = SCENARIOS.filter(s => this.selected.has(s.id));
        const loops = parseInt($('#loop-count').value, 10) || 1;
        if (sel.length === 0) { this.log('Select at least one scenario.'); return; }
        this.runScenarios(sel, loops);
      };
      $('#stop-run').onclick = () => { this._stop = true; this.log('Stop requested.'); };
    }

    // ───────────────────────────────────────────── Current Run panel ────
    _populateCurrent() {
      const el = this._sgLayout.getPanelElement('t-current');
      if (!el) return;
      el.classList.add('tab-body');
      el.innerHTML = `
        <div class="controls-bar">
          <button id="copy-json">Copy JSON</button>
          <button id="clear-results">Clear</button>
          <div class="spacer" style="flex:1"></div>
          <span class="stat" style="color:var(--fg-dim);font-size:11px">${this.results.length} row(s) — click a row to inspect</span>
        </div>
        <div class="scroll-area">
          <table class="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Scenario</th>
                <th>Time</th>
                <th class="num">Total ms</th>
                <th class="num">Calls</th>
                <th class="num">Bytes in</th>
                <th class="num">Bytes out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="results-body"></tbody>
          </table>
        </div>
      `;

      el.querySelector('#copy-json').onclick = () => {
        const json = JSON.stringify({
          generated_at: new Date().toISOString(),
          host: location.host,
          tool_version: 'v0.1.0',
          results: this.results,
        }, null, 2);
        navigator.clipboard.writeText(json).then(
          () => this.log(`Copied ${this.results.length} result rows (${json.length} chars).`),
          err => this.log('Copy failed: ' + err)
        );
      };
      el.querySelector('#clear-results').onclick = () => {
        this.results = [];
        this._populateCurrent();
      };

      this._renderCurrentRows();
    }

    _renderCurrentRows() {
      const tbody = this._sgLayout && this._sgLayout.getPanelElement('t-current')
        && this._sgLayout.getPanelElement('t-current').querySelector('#results-body');
      if (!tbody) return;
      if (this.results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:var(--fg-dim);padding:16px;text-align:center">No runs yet. Pick a scenario and press Run.</td></tr>`;
        return;
      }
      tbody.innerHTML = this.results.map((r, i) => {
        const stepsHtml = (r.steps || []).map(s => `
          <tr class="step-row ${s.ok ? '' : 'err'}">
            <td></td>
            <td colspan="2">↳ ${escapeHtml(s.label)}${s.error ? ' — <span style="color:var(--err)">' + escapeHtml(s.error) + '</span>' : ''}</td>
            <td class="num">${s.duration_ms}</td>
            <td class="num">${s.status || ''}</td>
            <td class="num">${fmtBytes(s.bytes_in)}</td>
            <td class="num">${fmtBytes(s.bytes_out)}</td>
            <td></td>
          </tr>
        `).join('');
        return `
          <tr class="${r.ok ? 'ok' : 'err'} clickable" data-row-id="${escapeAttr(r.run_id)}">
            <td>${this.results.length - i}</td>
            <td class="scenario-name">${escapeHtml(r.scenario_name)}</td>
            <td>${r.ts.slice(11, 19)}</td>
            <td class="num">${r.summary.total_ms}</td>
            <td class="num">${r.summary.calls}</td>
            <td class="num">${fmtBytes(r.summary.bytes_in)}</td>
            <td class="num">${fmtBytes(r.summary.bytes_out)}</td>
            <td class="status">${r.ok ? '✓ ok' : '✗ fail'}</td>
          </tr>
          ${stepsHtml}
        `;
      }).join('');

      tbody.querySelectorAll('tr.clickable').forEach(tr => {
        tr.onclick = () => {
          const rowId = tr.dataset.rowId;
          const r = this.results.find(x => x.run_id === rowId);
          if (r) this._openCurrentDetailTab(r);
        };
      });
    }

    // ────────────────────────────────────────────── Past Runs panel ─────
    _populateRuns() {
      const el = this._sgLayout.getPanelElement('t-runs');
      if (!el) return;
      el.classList.add('tab-body');

      const runs = $runs.list();
      if (runs.length === 0) {
        el.innerHTML = `
          <div class="scroll-area">
            <div style="padding:24px;color:var(--fg-dim);text-align:center">
              No saved runs yet. Every batch you execute is auto-saved here.
            </div>
          </div>`;
        return;
      }

      el.innerHTML = `
        <div class="controls-bar">
          <button id="compare-selected" class="primary" ${this._compareSelection.size !== 2 ? 'disabled' : ''}>
            ⇆ Compare selected (${this._compareSelection.size}/2)
          </button>
          <button id="export-run">Export selected as JSON</button>
          <button id="delete-run" class="danger">Delete selected</button>
          <div class="spacer" style="flex:1"></div>
          <button id="clear-all-runs" class="danger">Clear all runs</button>
        </div>
        <div class="scroll-area">
          <table class="results-table">
            <thead>
              <tr>
                <th style="width:24px"></th>
                <th>Label</th>
                <th>When</th>
                <th>Scenarios</th>
                <th class="num">Total ms</th>
                <th class="num">OK</th>
                <th class="num">Fail</th>
                <th>Host · token</th>
              </tr>
            </thead>
            <tbody>
              ${runs.map(r => {
                const checked = this._compareSelection.has(r.id);
                return `
                  <tr class="${r.fail_count === 0 ? 'ok' : 'err'} clickable" data-run-id="${escapeAttr(r.id)}">
                    <td><input type="checkbox" class="run-cmp" data-run-id="${escapeAttr(r.id)}" ${checked ? 'checked' : ''}></td>
                    <td>
                      <input type="text" class="run-label" data-run-id="${escapeAttr(r.id)}"
                             value="${escapeAttr(r.label || '')}" placeholder="(no label)"
                             style="background:transparent;border:1px dashed var(--border);width:160px">
                    </td>
                    <td>${new Date(r.ts).toLocaleString()}</td>
                    <td>${r.scenarios.length} (${r.results.length} runs)</td>
                    <td class="num">${Math.round(r.wall_ms_total)}</td>
                    <td class="num">${r.ok_count}</td>
                    <td class="num">${r.fail_count}</td>
                    <td>${escapeHtml(r.host)}${r.token_hint ? ' · ' + escapeHtml(r.token_hint) : ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Click a run row → open detail tab. Don't propagate clicks from
      // checkboxes / label inputs into the row's onclick.
      el.querySelectorAll('tr.clickable').forEach(tr => {
        tr.onclick = (ev) => {
          if (ev.target.matches('input')) return;
          const id = tr.dataset.runId;
          const r = $runs.get(id);
          if (r) this._openPastDetailTab(r);
        };
      });

      el.querySelectorAll('.run-cmp').forEach(cb => {
        cb.onclick = (ev) => ev.stopPropagation();
        cb.onchange = () => {
          if (cb.checked) {
            this._compareSelection.add(cb.dataset.runId);
            if (this._compareSelection.size > 2) {
              const first = this._compareSelection.values().next().value;
              this._compareSelection.delete(first);
            }
          } else {
            this._compareSelection.delete(cb.dataset.runId);
          }
          this._populateRuns();
        };
      });

      el.querySelectorAll('.run-label').forEach(inp => {
        inp.onclick = (ev) => ev.stopPropagation();
        inp.onchange = () => {
          $runs.relabel(inp.dataset.runId, inp.value.trim());
          this.log(`Run ${inp.dataset.runId.slice(0, 12)}… relabelled.`);
        };
      });

      const cmpBtn = el.querySelector('#compare-selected');
      if (cmpBtn) cmpBtn.onclick = () => {
        if (this._compareSelection.size !== 2) return;
        const [a, b] = [...this._compareSelection];
        const rA = $runs.get(a), rB = $runs.get(b);
        const [first, second] = rA.ts <= rB.ts ? [a, b] : [b, a];
        const cv = $runs.compare(first, second);
        if (cv) this._openCompareTab(cv);
      };

      const exportBtn = el.querySelector('#export-run');
      if (exportBtn) exportBtn.onclick = () => {
        if (this._compareSelection.size === 0) { this.log('Select at least one run to export.'); return; }
        const selected = [...this._compareSelection].map(id => $runs.get(id)).filter(Boolean);
        const json = JSON.stringify(selected, null, 2);
        navigator.clipboard.writeText(json).then(
          () => this.log(`Copied ${selected.length} run(s).`),
          err => this.log('Copy failed: ' + err)
        );
      };

      const delBtn = el.querySelector('#delete-run');
      if (delBtn) delBtn.onclick = () => {
        if (this._compareSelection.size === 0) return;
        if (!confirm(`Delete ${this._compareSelection.size} run(s) from local storage?`)) return;
        this._compareSelection.forEach(id => $runs.remove(id));
        this._compareSelection.clear();
        this._populateRuns();
      };

      const clrBtn = el.querySelector('#clear-all-runs');
      if (clrBtn) clrBtn.onclick = () => {
        if (!confirm('Delete ALL saved runs?')) return;
        $runs.clearAll();
        this._compareSelection.clear();
        this._populateRuns();
      };
    }

    // ──────────────────────────────────────────── detail tab (current row) ──
    _openCurrentDetailTab(row) {
      const existing = this._currentDetailTabs.get(row.run_id);
      if (existing && this._tryFocusTab(existing)) return;

      const title = this._truncate(row.scenario_name, 28);
      const tabId = this._sgLayout.addTabToStack('s-main', {
        tag: 'div', title, state: { kind: 'row', id: row.run_id }
      }, true);
      if (!tabId) return;
      this._currentDetailTabs.set(row.run_id, tabId);

      requestAnimationFrame(() => {
        const el = this._sgLayout.getPanelElement(tabId);
        if (!el) return;
        el.classList.add('tab-body');
        this._renderRowDetail(el, row, { source: 'current' });
      });
    }

    // ────────────────────────────────────────────── detail tab (past run) ──
    _openPastDetailTab(run) {
      const existing = this._pastDetailTabs.get(run.id);
      if (existing && this._tryFocusTab(existing)) return;

      const title = this._truncate(run.label || run.id.slice(4, 20), 28);
      const tabId = this._sgLayout.addTabToStack('s-main', {
        tag: 'div', title, state: { kind: 'past', id: run.id }
      }, true);
      if (!tabId) return;
      this._pastDetailTabs.set(run.id, tabId);

      requestAnimationFrame(() => {
        const el = this._sgLayout.getPanelElement(tabId);
        if (!el) return;
        el.classList.add('tab-body');
        this._renderPastRunDetail(el, run);
      });
    }

    // ──────────────────────────────────────────── detail tab (compare) ───
    _openCompareTab(cv) {
      const key = cv.runA.id + '|' + cv.runB.id;
      const existing = this._compareTabs.get(key);
      if (existing && this._tryFocusTab(existing)) return;

      const title = `Compare ${cv.runA.id.slice(4, 10)}…vs ${cv.runB.id.slice(4, 10)}`;
      const tabId = this._sgLayout.addTabToStack('s-main', {
        tag: 'div', title: this._truncate(title, 28), state: { kind: 'compare', key }
      }, true);
      if (!tabId) return;
      this._compareTabs.set(key, tabId);

      requestAnimationFrame(() => {
        const el = this._sgLayout.getPanelElement(tabId);
        if (!el) return;
        el.classList.add('tab-body');
        this._renderCompare(el, cv);
      });
    }

    _tryFocusTab(tabId) {
      try {
        const tabEl = this._sgLayout && this._sgLayout.shadowRoot
          && this._sgLayout.shadowRoot.querySelector(`.sgl-tab[data-tab-id="${tabId}"]`);
        if (tabEl) { tabEl.click(); return true; }
      } catch { /* tab was closed externally */ }
      return false;
    }

    _renderRowDetail(el, r, opts) {
      const stepsHtml = (r.steps || []).map(s => `
        <tr class="${s.ok ? '' : 'err'}">
          <td>${escapeHtml(s.label)}</td>
          <td class="num">${s.duration_ms}</td>
          <td class="num">${s.status || ''}</td>
          <td class="num">${fmtBytes(s.bytes_in)}</td>
          <td class="num">${fmtBytes(s.bytes_out)}</td>
          <td>${s.error ? '<span style="color:var(--err)">' + escapeHtml(s.error) + '</span>' : '✓'}</td>
        </tr>
      `).join('');
      const logHtml = (r.log && r.log.length > 0)
        ? `<pre class="run-log">${escapeHtml(r.log.join('\n'))}</pre>`
        : `<div class="empty">No log entries captured for this run.</div>`;

      el.innerHTML = `
        <div class="scroll-area">
          <div class="detail-panel">
            <h3>${escapeHtml(r.scenario_name)}</h3>
            <div class="meta">
              ${escapeHtml(r.scenario_id)} · ${new Date(r.ts).toLocaleString()} ·
              ${r.ok ? '<span style="color:var(--ok)">✓ ok</span>' : '<span style="color:var(--err)">✗ fail</span>'} ·
              wall ${r.wall_ms} ms · ${r.summary.calls} calls · in ${fmtBytes(r.summary.bytes_in)} · out ${fmtBytes(r.summary.bytes_out)}
            </div>

            <div class="section-title">Steps</div>
            ${(r.steps || []).length === 0
              ? '<div class="empty">No steps recorded.</div>'
              : `<table class="results-table">
                  <thead><tr><th>Label</th><th class="num">ms</th><th class="num">Status</th><th class="num">In</th><th class="num">Out</th><th>Result</th></tr></thead>
                  <tbody>${stepsHtml}</tbody>
                </table>`
            }

            <div class="section-title">Run log</div>
            ${logHtml}

            ${r.error ? `<div class="section-title">Error</div><pre class="run-log" style="color:var(--err)">${escapeHtml(r.error)}</pre>` : ''}
            ${r.note  ? `<div class="section-title">Note</div><div class="meta">${escapeHtml(r.note)}</div>` : ''}
          </div>
        </div>
      `;
    }

    _renderPastRunDetail(el, run) {
      const headerHtml = `
        <h3>${escapeHtml(run.label || '(no label)')}</h3>
        <div class="meta">
          ${escapeHtml(run.id)} · ${new Date(run.ts).toLocaleString()} ·
          ${run.results.length} result(s) · wall ${Math.round(run.wall_ms_total)} ms ·
          ${run.ok_count} ok / ${run.fail_count} fail ·
          host ${escapeHtml(run.host)}${run.token_hint ? ' · token ' + escapeHtml(run.token_hint) : ''}
        </div>
      `;

      const rowsHtml = run.results.map((r, idx) => {
        const stepsHtml = (r.steps || []).map(s => `
          <tr class="${s.ok ? '' : 'err'}">
            <td>${escapeHtml(s.label)}</td>
            <td class="num">${s.duration_ms}</td>
            <td class="num">${s.status || ''}</td>
            <td class="num">${fmtBytes(s.bytes_in)}</td>
            <td class="num">${fmtBytes(s.bytes_out)}</td>
            <td>${s.error ? '<span style="color:var(--err)">' + escapeHtml(s.error) + '</span>' : '✓'}</td>
          </tr>
        `).join('');
        const logHtml = (r.log && r.log.length > 0)
          ? `<pre class="run-log">${escapeHtml(r.log.join('\n'))}</pre>`
          : `<div class="empty">No log entries captured for this scenario.</div>`;

        return `
          <div class="section-title">
            ${idx + 1}. ${escapeHtml(r.scenario_name)} ·
            ${r.ok ? '<span style="color:var(--ok)">✓</span>' : '<span style="color:var(--err)">✗</span>'} ·
            ${r.wall_ms} ms · ${r.summary && r.summary.calls} calls
          </div>
          ${(r.steps || []).length === 0
            ? '<div class="empty">No steps recorded.</div>'
            : `<table class="results-table">
                <thead><tr><th>Label</th><th class="num">ms</th><th class="num">Status</th><th class="num">In</th><th class="num">Out</th><th>Result</th></tr></thead>
                <tbody>${stepsHtml}</tbody>
              </table>`
          }
          ${logHtml}
        `;
      }).join('');

      el.innerHTML = `
        <div class="scroll-area">
          <div class="detail-panel">
            ${headerHtml}
            ${rowsHtml}
          </div>
        </div>
      `;
    }

    _renderCompare(el, cv) {
      const A = cv.runA, B = cv.runB;
      const fmt = ms => ms == null ? '—' : ms.toFixed(1);
      const fmtPct = pct => {
        if (pct == null) return '';
        const cls = pct < -5 ? 'ok' : pct > 5 ? 'err' : '';
        const sign = pct >= 0 ? '+' : '';
        return `<span style="color:var(--${cls === 'ok' ? 'ok' : cls === 'err' ? 'err' : 'fg-dim'})">${sign}${pct.toFixed(1)}%</span>`;
      };
      const fmtDelta = ms => {
        if (ms == null) return '';
        const sign = ms >= 0 ? '+' : '';
        return `${sign}${ms.toFixed(1)}`;
      };

      el.innerHTML = `
        <div class="controls-bar">
          <div class="stat" style="margin-left:4px">
            <strong>A:</strong> ${escapeHtml(A.label || A.id.slice(4, 20))} · ${new Date(A.ts).toLocaleString()}
          </div>
          <div class="stat">
            <strong>B:</strong> ${escapeHtml(B.label || B.id.slice(4, 20))} · ${new Date(B.ts).toLocaleString()}
          </div>
          <div class="spacer" style="flex:1"></div>
          <button id="export-compare">Export comparison</button>
        </div>
        <div class="scroll-area">
          <table class="results-table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th class="num">A ms</th>
                <th class="num">B ms</th>
                <th class="num">Δ ms</th>
                <th class="num">Δ %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${cv.rows.map(r => `
                <tr>
                  <td class="scenario-name">${escapeHtml(r.scenario_name)}<br>
                    <span style="color:var(--fg-dim);font-size:10px">${escapeHtml(r.scenario_id)}</span>
                  </td>
                  <td class="num">${fmt(r.a_ms)}${r.a_runs > 1 ? ' <span style="color:var(--fg-dim)">×' + r.a_runs + '</span>' : ''}</td>
                  <td class="num">${fmt(r.b_ms)}${r.b_runs > 1 ? ' <span style="color:var(--fg-dim)">×' + r.b_runs + '</span>' : ''}</td>
                  <td class="num">${fmtDelta(r.delta_ms)}</td>
                  <td class="num">${fmtPct(r.delta_pct)}</td>
                  <td>${r.a_ms == null ? 'A missing' : r.b_ms == null ? 'B missing' : (r.a_ok && r.b_ok ? '✓' : '✗')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="padding:12px;color:var(--fg-dim);font-size:11px;border-top:1px solid var(--border)">
            Δ = B − A. Negative % means B was faster than A. Green/red threshold = ±5%.
            Per-scenario timings shown are the mean of repeats inside that run (×N indicates loop count).
          </div>
        </div>
      `;
      el.querySelector('#export-compare').onclick = () => {
        const json = JSON.stringify({
          comparison: { run_a: A.id, run_b: B.id, generated_at: new Date().toISOString() },
          rows: cv.rows,
        }, null, 2);
        navigator.clipboard.writeText(json).then(
          () => this.log(`Copied comparison (${cv.rows.length} rows).`),
          err => this.log('Copy failed: ' + err)
        );
      };
    }

    // ─────────────────────────────────────────────────── running scenarios ─
    async runScenarios(scenarios, loops) {
      if (this.running) return;
      this.running = true; this._stop = false;
      const scenarioPanel = this._sgLayout.getPanelElement('t-scenarios');
      const runBtn  = scenarioPanel && scenarioPanel.querySelector('#run-selected');
      const stopBtn = scenarioPanel && scenarioPanel.querySelector('#stop-run');
      if (runBtn)  runBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;

      const dangerous = scenarios.filter(s => s.requiresConfirm);
      if (dangerous.length > 0) {
        const ok = confirm(`The following scenarios CONSUME token uses:\n  ${dangerous.map(s => s.name).join('\n  ')}\n\nProceed?`);
        if (!ok) {
          this.running = false;
          if (runBtn)  runBtn.disabled = false;
          if (stopBtn) stopBtn.disabled = true;
          return;
        }
      }

      const batchStart = this.results.length;

      for (let loop = 1; loop <= loops && !this._stop; loop++) {
        if (loops > 1) this.log(`--- loop ${loop}/${loops} ---`);
        for (const s of scenarios) {
          if (this._stop) break;
          await this.runOne(s);
        }
      }

      this.running = false;
      if (runBtn)  runBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;

      const newRows = this.results.slice(0, this.results.length - batchStart);
      if (newRows.length > 0) {
        const token = $api.getToken();
        const saved = $runs.save(newRows, {
          label:      this._defaultRunLabel(newRows, loops),
          base_url:   $api.baseUrl(),
          token_hint: token ? token.slice(0, 4) + '…' : '',
        });
        if (saved) this.log(`✓ Saved run ${saved.id.slice(0, 16)}… (${newRows.length} scenario result(s)).`);
      }

      this._refreshShell();
      this._populateRuns();
      this._renderCurrentRows();
    }

    async runOne(scenario) {
      const runId = $api.randomId(8);
      const rowLog = [];
      this._activeRowLog = rowLog;
      this.log(`▶ ${scenario.id}`);
      const t0 = performance.now();
      let result;
      try {
        result = await scenario.run({ client: $api, tracker: $art, log: m => this.log(m) });
      } catch (e) {
        result = { ok: false, steps: [], summary: { total_ms: 0, calls: 0, ok: false, bytes_in: 0, bytes_out: 0 }, error: String(e) };
      }
      const wall = performance.now() - t0;
      this.log(`  ${result.ok ? '✓' : '✗'} ${scenario.id} · ${result.summary.total_ms} ms · ${result.summary.calls} calls`);
      this._activeRowLog = null;

      const row = {
        run_id:        runId,
        scenario_id:   scenario.id,
        scenario_name: scenario.name,
        ok:            result.ok,
        wall_ms:       Math.round(wall * 100) / 100,
        summary:       result.summary,
        steps:         result.steps,
        log:           rowLog,
        note:          result.note || null,
        error:         result.error || null,
        ts:            new Date().toISOString(),
      };
      this.results.unshift(row);
      this._renderCurrentRows();
    }

    // ──────────────────────────────────────────────────────────── log ──
    log(line) {
      const ts = new Date().toISOString().slice(11, 19);
      const fmt = `[${ts}] ${line}`;
      this.logLines.push(fmt);
      if (this.logLines.length > 200) this.logLines.shift();
      if (this._activeRowLog) this._activeRowLog.push(fmt);
      this._flushLog();
    }

    _flushLog() {
      const el = this.querySelector('.log-area');
      if (!el) return;
      el.textContent = this.logLines.join('\n');
      el.scrollTop = el.scrollHeight;
    }

    _defaultRunLabel(newRows, loops) {
      const names = [...new Set(newRows.map(r => r.scenario_name))];
      if (names.length === 0) return '';
      const base = names.length === 1
        ? names[0]
        : names.length <= 3
          ? names.join(', ')
          : `${names[0]} + ${names.length - 1} more`;
      return loops > 1 ? `${base} ×${loops}` : base;
    }

    _truncate(s, n) {
      s = String(s == null ? '' : s);
      return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }
  }

  // ────────────────────────────────────────────────────────────── utils ──
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
  function fmtBytes(n) {
    if (!n) return '0';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  customElements.define('perf-app', PerfApp);
})(window);
