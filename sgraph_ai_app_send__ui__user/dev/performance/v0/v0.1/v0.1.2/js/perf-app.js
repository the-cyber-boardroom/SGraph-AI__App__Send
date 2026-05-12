// SGraph Send — Performance Tool — Main custom element <perf-app>  (v0.1.2 patch)
// Renders the layout, wires scenario selection / run / batch / results table.
// v0.1.2 changes:
//   - log area is now re-flushed after every full render so progress lines
//     persist instead of flashing-and-disappearing at end of a batch.
//   - saved runs default their label to the scenario name (or "+N more"
//     for batches) instead of an empty string.
//   - version label bumped to v0.1.2 in the topbar + Copy JSON metadata.

(function (global) {
  'use strict';

  const $api = global.ApiClient;
  const $art = global.ArtifactTracker;
  const $runs = global.RunStore;
  const SCENARIOS = global.SCENARIOS || [];

  class PerfApp extends HTMLElement {
    constructor() {
      super();
      this.results = [];           // current in-progress run's rows
      this.selected = new Set();
      this.running = false;
      this.logLines = [];
      this.view = 'current';       // 'current' | 'runs'
      this.compareSelection = new Set();
      this.compareView = null;     // { runA, runB, rows } | null
    }

    connectedCallback() {
      this.render();
    }

    log(line) {
      const ts = new Date().toISOString().slice(11, 19);
      this.logLines.push(`[${ts}] ${line}`);
      if (this.logLines.length > 200) this.logLines.shift();
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

    // ------------------------------------------------------- render layout ---
    render() {
      const orphans = $art.countOrphans();
      const counts  = $art.countAll();

      this.innerHTML = `
        <div class="topbar">
          <div class="title">SGraph Send · Performance Tests</div>
          <div class="version">v0.1.2 · ${location.host}</div>
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
        ` : ''}

        <div class="main">
          <div class="panel">
            <div class="panel-header">
              <h2>Scenarios</h2>
              <div class="spacer"></div>
              <button id="select-all">All</button>
              <button id="select-none">None</button>
            </div>
            <div class="controls-bar">
              <button id="run-selected" class="primary">▶ Run selected</button>
              <label>loop</label>
              <input type="number" id="loop-count" value="1" min="1" max="100" style="width:48px">
              <label>×</label>
              <button id="stop-run" class="danger" disabled>■ Stop</button>
            </div>
            <div id="scenarios-list"></div>
          </div>

          <div class="panel">
            <div class="panel-header">
              <h2>${this.view === 'runs' ? 'Past runs' : (this.compareView ? 'Compare' : 'Current run')}</h2>
              <div class="spacer"></div>
              <button id="view-current" class="${this.view === 'current' && !this.compareView ? 'primary' : ''}">Current</button>
              <button id="view-runs" class="${this.view === 'runs' && !this.compareView ? 'primary' : ''}">Past runs (${$runs.list().length})</button>
              ${this.view === 'current' ? '<button id="copy-json">Copy JSON</button>' : ''}
              ${this.view === 'current' ? '<button id="clear-results">Clear</button>' : ''}
            </div>
            <div id="right-panel-body"></div>
            <pre class="log-area" id="log-area"></pre>
          </div>
        </div>

        <div class="footer">
          <div class="stat">Tracked: <strong>${counts.transfers}</strong> transfers, <strong>${counts.vaults}</strong> vaults</div>
          <div class="stat">Orphans: <strong>${orphans.total}</strong></div>
          <div class="stat">Saved runs: <strong>${$runs.list().length}</strong> (${fmtBytes($runs.storageStats().bytes)})</div>
          <div class="spacer"></div>
          <div class="stat">Base URL: <strong>${$api.baseUrl() || '(same-origin)'}</strong></div>
        </div>
      `;

      this.renderScenarios();
      this.renderRightPanel();
      this.bindEvents();
      this._flushLog();
    }

    // ----------------------------------------------------- right-panel view --
    renderRightPanel() {
      const body = this.querySelector('#right-panel-body');
      if (!body) return;
      if (this.compareView) return this.renderCompare(body);
      if (this.view === 'runs') return this.renderRuns(body);
      return this.renderCurrent(body);
    }

    renderCurrent(body) {
      body.innerHTML = `
        <table class="results-table" id="results-table">
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
      `;
      this.renderResults();
    }

    renderRuns(body) {
      const runs = $runs.list();
      if (runs.length === 0) {
        body.innerHTML = `<div style="padding:24px;color:var(--fg-dim);text-align:center">
          No saved runs yet. Every batch you execute is auto-saved here.
        </div>`;
        return;
      }
      body.innerHTML = `
        <div class="controls-bar">
          <button id="compare-selected" class="primary" ${this.compareSelection.size !== 2 ? 'disabled' : ''}>
            ⇆ Compare selected (${this.compareSelection.size}/2)
          </button>
          <button id="export-run">Export selected as JSON</button>
          <button id="delete-run" class="danger">Delete selected</button>
          <div class="spacer" style="flex:1"></div>
          <button id="clear-all-runs" class="danger">Clear all runs</button>
        </div>
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
          <tbody id="runs-body">
            ${runs.map(r => {
              const checked = this.compareSelection.has(r.id);
              return `
                <tr class="${r.fail_count === 0 ? 'ok' : 'err'}" data-run-id="${escapeAttr(r.id)}">
                  <td><input type="checkbox" class="run-cmp" data-run-id="${escapeAttr(r.id)}" ${checked ? 'checked' : ''}></td>
                  <td>
                    <input type="text" class="run-label" data-run-id="${escapeAttr(r.id)}"
                           value="${escapeAttr(r.label || '')}" placeholder="(no label)"
                           style="background:transparent;border:1px dashed var(--border);width:140px">
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
      `;

      this.querySelectorAll('.run-cmp').forEach(cb => {
        cb.onchange = () => {
          if (cb.checked) {
            this.compareSelection.add(cb.dataset.runId);
            if (this.compareSelection.size > 2) {
              const first = this.compareSelection.values().next().value;
              this.compareSelection.delete(first);
            }
          } else {
            this.compareSelection.delete(cb.dataset.runId);
          }
          this.renderRightPanel();
        };
      });

      this.querySelectorAll('.run-label').forEach(inp => {
        inp.onchange = () => {
          $runs.relabel(inp.dataset.runId, inp.value.trim());
          this.log(`Run ${inp.dataset.runId.slice(0, 12)}… relabelled.`);
        };
      });

      const cmpBtn = this.querySelector('#compare-selected');
      if (cmpBtn) cmpBtn.onclick = () => {
        if (this.compareSelection.size !== 2) return;
        const [a, b] = [...this.compareSelection];
        // Pick earliest as A, latest as B (B-A delta is "what changed since A")
        const rA = $runs.get(a), rB = $runs.get(b);
        const [first, second] = rA.ts <= rB.ts ? [a, b] : [b, a];
        this.compareView = $runs.compare(first, second);
        this.render();
      };

      const exportBtn = this.querySelector('#export-run');
      if (exportBtn) exportBtn.onclick = () => {
        if (this.compareSelection.size === 0) { this.log('Select at least one run to export.'); return; }
        const selected = [...this.compareSelection].map(id => $runs.get(id)).filter(Boolean);
        const json = JSON.stringify(selected, null, 2);
        navigator.clipboard.writeText(json).then(
          () => this.log(`Copied ${selected.length} run(s).`),
          err => this.log('Copy failed: ' + err)
        );
      };

      const delBtn = this.querySelector('#delete-run');
      if (delBtn) delBtn.onclick = () => {
        if (this.compareSelection.size === 0) return;
        if (!confirm(`Delete ${this.compareSelection.size} run(s) from local storage?`)) return;
        this.compareSelection.forEach(id => $runs.remove(id));
        this.compareSelection.clear();
        this.render();
      };

      const clrBtn = this.querySelector('#clear-all-runs');
      if (clrBtn) clrBtn.onclick = () => {
        if (!confirm('Delete ALL saved runs?')) return;
        $runs.clearAll();
        this.compareSelection.clear();
        this.render();
      };
    }

    renderCompare(body) {
      const cv = this.compareView;
      const A = cv.runA, B = cv.runB;
      const fmt = ms => ms == null ? '—' : ms.toFixed(1);
      const fmtPct = pct => {
        if (pct == null) return '';
        const cls = pct < -5 ? 'ok' : pct > 5 ? 'err' : '';
        const sign = pct >= 0 ? '+' : '';
        return `<span class="status" style="color:var(--${cls === 'ok' ? 'ok' : cls === 'err' ? 'err' : 'fg-dim'})">${sign}${pct.toFixed(1)}%</span>`;
      };
      const fmtDelta = ms => {
        if (ms == null) return '';
        const sign = ms >= 0 ? '+' : '';
        return `${sign}${ms.toFixed(1)}`;
      };

      body.innerHTML = `
        <div class="controls-bar">
          <button id="back-to-runs">‹ Back to runs</button>
          <div class="stat" style="margin-left:12px">
            <strong>A:</strong> ${escapeHtml(A.label || A.id.slice(4, 20))} · ${new Date(A.ts).toLocaleString()}
          </div>
          <div class="stat">
            <strong>B:</strong> ${escapeHtml(B.label || B.id.slice(4, 20))} · ${new Date(B.ts).toLocaleString()}
          </div>
          <div class="spacer" style="flex:1"></div>
          <button id="export-compare">Export comparison</button>
        </div>
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
      `;

      this.querySelector('#back-to-runs').onclick = () => {
        this.compareView = null;
        this.render();
      };
      this.querySelector('#export-compare').onclick = () => {
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

    renderScenarios() {
      const list = this.querySelector('#scenarios-list');
      const byGroup = {};
      SCENARIOS.forEach(s => {
        (byGroup[s.group] = byGroup[s.group] || []).push(s);
      });

      list.innerHTML = Object.keys(byGroup).map(group => `
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
      `).join('');
    }

    // -------------------------------------------------------------- events ---
    bindEvents() {
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
        this.render();
      };
      const purgeBtn = $('#purge-tracker');
      if (purgeBtn) purgeBtn.onclick = () => {
        if (confirm('Forget all tracked artefacts? (server-side artefacts will NOT be deleted)')) {
          $art.clearAll();
          this.render();
        }
      };

      $('#select-all').onclick = () => {
        SCENARIOS.forEach(s => this.selected.add(s.id));
        this.renderScenarios(); this.updateRunButton();
      };
      $('#select-none').onclick = () => {
        this.selected.clear();
        this.renderScenarios(); this.updateRunButton();
      };

      this.querySelectorAll('#scenarios-list input[type=checkbox]').forEach(cb => {
        cb.onchange = () => {
          if (cb.checked) this.selected.add(cb.dataset.id);
          else this.selected.delete(cb.dataset.id);
          const row = cb.closest('.scenario');
          if (row) row.classList.toggle('selected', cb.checked);
          this.updateRunButton();
        };
      });

      this.querySelectorAll('[data-run]').forEach(el => {
        el.onclick = (ev) => {
          ev.stopPropagation();
          const s = SCENARIOS.find(x => x.id === el.dataset.run);
          if (s) this.runScenarios([s], 1);
        };
      });

      $('#run-selected').onclick = () => {
        const sel = SCENARIOS.filter(s => this.selected.has(s.id));
        const loops = parseInt($('#loop-count').value, 10) || 1;
        if (sel.length === 0) { this.log('Select at least one scenario.'); return; }
        this.runScenarios(sel, loops);
      };

      const copyBtn = $('#copy-json');
      if (copyBtn) copyBtn.onclick = () => {
        const json = JSON.stringify({
          generated_at: new Date().toISOString(),
          host: location.host,
          tool_version: 'v0.1.2',
          results: this.results,
        }, null, 2);
        navigator.clipboard.writeText(json).then(
          () => this.log(`Copied ${this.results.length} result rows (${json.length} chars).`),
          err => this.log('Copy failed: ' + err)
        );
      };

      const clrBtn = $('#clear-results');
      if (clrBtn) clrBtn.onclick = () => {
        this.results = [];
        this.renderResults();
      };

      const vcBtn = $('#view-current');
      if (vcBtn) vcBtn.onclick = () => {
        this.view = 'current'; this.compareView = null; this.render();
      };
      const vrBtn = $('#view-runs');
      if (vrBtn) vrBtn.onclick = () => {
        this.view = 'runs'; this.compareView = null; this.render();
      };

      $('#stop-run').onclick = () => { this._stop = true; this.log('Stop requested.'); };
    }

    updateRunButton() {
      const btn = this.querySelector('#run-selected');
      btn.textContent = `▶ Run selected (${this.selected.size})`;
    }

    // -------------------------------------------------------- run scenarios -
    async runScenarios(scenarios, loops) {
      if (this.running) return;
      this.running = true; this._stop = false;
      const runBtn = this.querySelector('#run-selected');
      const stopBtn = this.querySelector('#stop-run');
      runBtn.disabled = true; stopBtn.disabled = false;

      const dangerous = scenarios.filter(s => s.requiresConfirm);
      if (dangerous.length > 0) {
        const ok = confirm(`The following scenarios CONSUME token uses:\n  ${dangerous.map(s => s.name).join('\n  ')}\n\nProceed?`);
        if (!ok) {
          this.running = false; runBtn.disabled = false; stopBtn.disabled = true;
          return;
        }
      }

      // Capture only the rows produced by this invocation (not anything still in this.results from before).
      const batchStart = this.results.length;

      for (let loop = 1; loop <= loops && !this._stop; loop++) {
        if (loops > 1) this.log(`--- loop ${loop}/${loops} ---`);
        for (const s of scenarios) {
          if (this._stop) break;
          await this.runOne(s);
        }
      }

      this.running = false;
      runBtn.disabled = false; stopBtn.disabled = true;

      // Save this batch as a discrete "run" record.
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

      this.render();
    }

    async runOne(scenario) {
      const runId = $api.randomId(8);
      this.log(`▶ ${scenario.id}`);
      const t0 = performance.now();
      let result;
      try {
        result = await scenario.run({ client: $api, tracker: $art, log: m => this.log(m) });
      } catch (e) {
        result = { ok: false, steps: [], summary: { total_ms: 0, calls: 0, ok: false, bytes_in: 0, bytes_out: 0 }, error: String(e) };
      }
      const wall = performance.now() - t0;

      const row = {
        run_id: runId,
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        ok: result.ok,
        wall_ms: Math.round(wall * 100) / 100,
        summary: result.summary,
        steps: result.steps,
        note: result.note || null,
        error: result.error || null,
        ts: new Date().toISOString(),
      };
      this.results.unshift(row);
      this.log(`  ${result.ok ? '✓' : '✗'} ${scenario.id} · ${row.summary.total_ms} ms · ${row.summary.calls} calls`);
      this.renderResults();
    }

    // ---------------------------------------------------- render results -----
    renderResults() {
      const tbody = this.querySelector('#results-body');
      if (!tbody) return;        // not in current-view — nothing to do
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
          <tr class="${r.ok ? 'ok' : 'err'}">
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
    }
  }

  // ----------------------------------------------------------------- utils --
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
