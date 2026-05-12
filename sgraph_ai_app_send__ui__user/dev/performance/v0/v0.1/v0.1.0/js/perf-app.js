// SGraph Send — Performance Tool — Main custom element <perf-app>
// Renders the layout, wires scenario selection / run / batch / results table.

(function (global) {
  'use strict';

  const $api = global.ApiClient;
  const $art = global.ArtifactTracker;
  const SCENARIOS = global.SCENARIOS || [];

  class PerfApp extends HTMLElement {
    constructor() {
      super();
      this.results = [];           // { run_id, scenario_id, scenario_name, ok, summary, steps, ts }
      this.selected = new Set();
      this.running = false;
      this.logLines = [];
    }

    connectedCallback() {
      this.render();
    }

    log(line) {
      const ts = new Date().toISOString().slice(11, 19);
      this.logLines.push(`[${ts}] ${line}`);
      if (this.logLines.length > 200) this.logLines.shift();
      const el = this.querySelector('.log-area');
      if (el) {
        el.textContent = this.logLines.join('\n');
        el.scrollTop = el.scrollHeight;
      }
    }

    // ------------------------------------------------------- render layout ---
    render() {
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
              <h2>Results</h2>
              <div class="spacer"></div>
              <button id="copy-json">Copy JSON</button>
              <button id="clear-results">Clear</button>
            </div>
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
              <tbody id="results-body">
                <tr><td colspan="8" style="color:var(--fg-dim);padding:16px;text-align:center">No runs yet. Pick a scenario and press Run.</td></tr>
              </tbody>
            </table>
            <pre class="log-area" id="log-area"></pre>
          </div>
        </div>

        <div class="footer">
          <div class="stat">Tracked: <strong>${counts.transfers}</strong> transfers, <strong>${counts.vaults}</strong> vaults</div>
          <div class="stat">Orphans: <strong>${orphans.total}</strong></div>
          <div class="stat">Results: <strong>${this.results.length}</strong></div>
          <div class="spacer"></div>
          <div class="stat">Base URL: <strong>${$api.baseUrl() || '(same-origin)'}</strong></div>
        </div>
      `;

      this.renderScenarios();
      this.bindEvents();
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

      $('#copy-json').onclick = () => {
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

      $('#clear-results').onclick = () => {
        this.results = [];
        this.renderResults();
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

      for (let loop = 1; loop <= loops && !this._stop; loop++) {
        if (loops > 1) this.log(`--- loop ${loop}/${loops} ---`);
        for (const s of scenarios) {
          if (this._stop) break;
          await this.runOne(s);
        }
      }

      this.running = false;
      runBtn.disabled = false; stopBtn.disabled = true;
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
      if (!tbody) return;
      if (this.results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:var(--fg-dim);padding:16px;text-align:center">No runs yet.</td></tr>`;
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
