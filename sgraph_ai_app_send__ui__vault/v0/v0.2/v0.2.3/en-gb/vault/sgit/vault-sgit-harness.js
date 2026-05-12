/* =================================================================================
   SGit Performance Harness — Custom Elements
   Prefix: vs- ("vault sgit")

   Elements:
     <vs-vault-loader>     key entry + pair creation
     <vs-opt-toggles>      per-optimisation checkboxes
     <vs-scenario-picker>  scenario list + run button
     <vs-metrics-card>     side-by-side baseline vs optimised results
     <vs-request-trace>    wrapper around <sg-vault-trace>
     <vs-run-history>      accumulated run table
     <vs-vault-setup-panel>  ephemeral vault creation + state helpers
   ================================================================================= */

// ── Global harness singleton ───────────────────────────────────────────────────
window.__vsHarness = {
    setup:     null,    // VaultSetup instance
    opts:      {},      // current toggle set
    lastRun:   null,    // { scenario, baseline, optimised, deltas }
    history:   [],      // accumulated runs
}

function _hFire(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }))
}

// ── <vs-vault-loader> ──────────────────────────────────────────────────────────

class VsVaultLoader extends HTMLElement {
    connectedCallback() { this._render() }

    _render() {
        this.innerHTML = `
<style>
  vs-vault-loader { display: block; padding: 0.75rem; font-family: system-ui, sans-serif; }
  .vsl-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.4rem; }
  .vsl-input { width: 100%; background: var(--bg3); border: 1px solid var(--border); color: var(--text); font-family: monospace; font-size: 0.78rem; padding: 0.35rem 0.5rem; border-radius: 4px; }
  .vsl-input:focus { outline: none; border-color: var(--teal); }
  .vsl-row { display: flex; gap: 0.4rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .vsl-btn { flex: 1; background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 0.72rem; padding: 0.3rem 0.5rem; border-radius: 4px; cursor: pointer; }
  .vsl-btn:hover { border-color: rgba(78,205,196,0.4); color: var(--teal); }
  .vsl-btn--primary { border-color: rgba(78,205,196,0.35); color: var(--teal); }
  .vsl-status { margin-top: 0.5rem; font-size: 0.72rem; color: var(--muted); min-height: 1.5em; }
  .vsl-status--ok   { color: var(--teal); }
  .vsl-status--err  { color: var(--err); }
  .vsl-section { margin-top: 0.85rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
  .vsl-check { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.3rem; }
  .vsl-check label { font-size: 0.72rem; color: var(--text); cursor: pointer; }
</style>
<div class="vsl-label">Vault key</div>
<input class="vsl-input" id="vsl-key" type="text" placeholder="word-word-NNNN or passphrase:vault_id" autocomplete="off" spellcheck="false">
<div class="vsl-row">
  <button class="vsl-btn vsl-btn--primary" id="vsl-load">Load vault</button>
  <button class="vsl-btn" id="vsl-create">New ephemeral</button>
  <button class="vsl-btn" id="vsl-clear">Clear</button>
</div>
<div class="vsl-status" id="vsl-status">Enter a vault key above</div>

<div class="vsl-section">
  <div class="vsl-label">Endpoint</div>
  <input class="vsl-input" id="vsl-ep" type="text" value="https://dev.send.sgraph.ai" style="margin-bottom:0.35rem">
  <div class="vsl-label" style="margin-top:0.45rem">Access token</div>
  <input class="vsl-input" id="vsl-tok" type="password" placeholder="(optional — needed for writes)">
</div>`

        const epEl  = this.querySelector('#vsl-ep')
        const tokEl = this.querySelector('#vsl-tok')

        // Restore from sessionStorage
        const savedEp  = sessionStorage.getItem('sg-vault-endpoint')
        const savedTok = sessionStorage.getItem('sg-vault-access-key') || localStorage.getItem('sg-vault-access-key-saved')
        if (savedEp)  epEl.value  = savedEp
        if (savedTok) tokEl.value = savedTok

        this.querySelector('#vsl-load').onclick   = () => this._load()
        this.querySelector('#vsl-create').onclick = () => this._createEphemeral()
        this.querySelector('#vsl-clear').onclick  = () => this._clear()

        this.querySelector('#vsl-key').addEventListener('keydown', e => { if (e.key === 'Enter') this._load() })
    }

    _getSetup() {
        const ep  = this.querySelector('#vsl-ep').value.trim()
        const tok = this.querySelector('#vsl-tok').value.trim()
        sessionStorage.setItem('sg-vault-endpoint', ep)
        return new VaultSetup({ endpoint: ep, token: tok })
    }

    _setStatus(msg, cls = '') {
        const el    = this.querySelector('#vsl-status')
        el.textContent = msg
        el.className   = 'vsl-status' + (cls ? ' vsl-status--' + cls : '')
    }

    async _load() {
        const key = this.querySelector('#vsl-key').value.trim()
        if (!key) return this._setStatus('Enter a vault key', 'err')
        this._setStatus('Loading…')
        try {
            const setup = this._getSetup()
            setup.loadKey(key)
            window.__vsHarness.setup = setup
            this._setStatus(`Vault loaded — key starts ${key.slice(0,10)}…  opening pair…`, 'ok')
            _hFire('vs:vault-loaded', { vaultKey: key, setup })
        } catch (e) {
            this._setStatus(e.message, 'err')
        }
    }

    async _createEphemeral() {
        this._setStatus('Creating ephemeral vault…')
        try {
            const setup = this._getSetup()
            const key   = await setup.createEphemeral('sgit-perf-' + Date.now().toString(36))
            window.__vsHarness.setup = setup
            this.querySelector('#vsl-key').value = key
            this._setStatus(`Ephemeral vault created. Deletes on "Clear".`, 'ok')
            _hFire('vs:vault-loaded', { vaultKey: key, setup, ephemeral: true })
        } catch (e) {
            this._setStatus(e.message, 'err')
        }
    }

    async _clear() {
        const setup = window.__vsHarness.setup
        if (setup?.isEphemeral) {
            this._setStatus('Deleting ephemeral vault…')
            await setup.deleteVault()
        }
        window.__vsHarness.setup = null
        this.querySelector('#vsl-key').value = ''
        this._setStatus('Cleared')
        _hFire('vs:vault-cleared', {})
    }
}

// ── <vs-opt-toggles> ──────────────────────────────────────────────────────────

const OPT_DEFS = [
    { id: 'localCloneRef',  label: 'Skip clone-ref on open',  hint: '−1 req per open (removes 404 round-trip)' },
    { id: 'singleBranch',   label: 'Skip branch-index read',  hint: '−1 req per open for single-branch vaults' },
    { id: 'refTTLCache',    label: 'Ref TTL cache (3 s)',      hint: 'Removes duplicate ref reads in status / Check combos' },
    { id: 'batchPush',      label: 'Batch push (fuse 2 refs)', hint: 'Fuses clone-ref + named-ref write into 1 batch: 5 → 4 req' },
    { id: 'subtreeFanout',  label: 'Subtree fan-out',          hint: 'Prefetch sibling lazy folders in parallel (wall-clock win)' },
    { id: 'lcaCache',       label: 'LCA cache',                hint: 'Cache divergence ancestor on repeated status checks' },
]

class VsOptToggles extends HTMLElement {
    connectedCallback() { this._render() }

    _render() {
        this.innerHTML = `
<style>
  vs-opt-toggles { display: block; padding: 0.75rem; font-family: system-ui, sans-serif; }
  .vot-row   { display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.55rem; padding-bottom: 0.55rem; border-bottom: 1px solid var(--border); }
  .vot-row:last-child { border-bottom: none; }
  .vot-cb    { margin-top: 0.2rem; cursor: pointer; accent-color: var(--teal); }
  .vot-info  {}
  .vot-label { font-size: 0.78rem; color: var(--text); cursor: pointer; display: block; }
  .vot-hint  { font-size: 0.65rem; color: var(--muted); }
  .vot-row-on .vot-label { color: var(--teal); }
  .vot-header { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.5rem; display: flex; justify-content: space-between; }
  .vot-all   { font-size: 0.65rem; color: var(--teal); cursor: pointer; text-decoration: underline; }
</style>
<div class="vot-header">
  Optimisations <span class="vot-all" id="vot-all">toggle all</span>
</div>
${OPT_DEFS.map(o => `
<div class="vot-row" id="vot-row-${o.id}">
  <input type="checkbox" class="vot-cb" id="vot-${o.id}" data-opt="${o.id}">
  <div class="vot-info">
    <label class="vot-label" for="vot-${o.id}">${o.label}</label>
    <span class="vot-hint">${o.hint}</span>
  </div>
</div>`).join('')}`

        this.querySelectorAll('.vot-cb').forEach(cb => {
            cb.onchange = () => this._update()
        })

        this.querySelector('#vot-all').onclick = () => {
            const all = this.querySelectorAll('.vot-cb')
            const anyOff = [...all].some(c => !c.checked)
            all.forEach(c => { c.checked = anyOff })
            this._update()
        }

        this._restoreFromSession()
    }

    _restoreFromSession() {
        try {
            const saved = JSON.parse(sessionStorage.getItem('vs-opts') || '{}')
            OPT_DEFS.forEach(o => {
                const cb = this.querySelector(`#vot-${o.id}`)
                if (cb && saved[o.id]) cb.checked = true
            })
            this._update(false)
        } catch (_) {}
    }

    _update(dispatch = true) {
        const opts = {}
        OPT_DEFS.forEach(o => {
            const cb = this.querySelector(`#vot-${o.id}`)
            const on = cb?.checked || false
            opts[o.id] = on
            const row = this.querySelector(`#vot-row-${o.id}`)
            if (row) row.classList.toggle('vot-row-on', on)
        })
        window.__vsHarness.opts = opts
        sessionStorage.setItem('vs-opts', JSON.stringify(opts))
        if (dispatch) _hFire('vs:opts-changed', { opts })
    }
}

// ── <vs-scenario-picker> ──────────────────────────────────────────────────────

class VsScenarioPicker extends HTMLElement {
    connectedCallback() { this._render() }

    _render() {
        this.innerHTML = `
<style>
  vs-scenario-picker { display: block; padding: 0.75rem; font-family: system-ui, sans-serif; }
  .vsp-header { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.6rem; }
  .vsp-row    { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
  .vsp-row:last-child { border-bottom: none; }
  .vsp-name   { font-size: 0.78rem; color: var(--text); flex: 1; }
  .vsp-name small { display: block; font-size: 0.65rem; color: var(--muted); }
  .vsp-btn    { background: transparent; border: 1px solid rgba(78,205,196,0.35); color: var(--teal); font-size: 0.68rem; padding: 0.15rem 0.55rem; border-radius: 4px; cursor: pointer; white-space: nowrap; }
  .vsp-btn:disabled { opacity: 0.4; cursor: default; }
  .vsp-btn:hover:not(:disabled) { background: var(--teal-dim); }
  .vsp-run-all { display: block; width: 100%; margin-top: 0.7rem; background: transparent; border: 1px solid rgba(78,205,196,0.35); color: var(--teal); font-size: 0.75rem; padding: 0.4rem; border-radius: 4px; cursor: pointer; }
  .vsp-run-all:disabled { opacity: 0.4; cursor: default; }
  .vsp-running { color: var(--warn); font-size: 0.7rem; margin-top: 0.5rem; min-height: 1.2em; }
</style>
<div class="vsp-header">Scenarios</div>
${SCENARIOS.map(s => `
<div class="vsp-row">
  <div class="vsp-name">${s.label}<small>${s.description.slice(0, 65)}…</small></div>
  <button class="vsp-btn" data-scenario="${s.id}">Run</button>
</div>`).join('')}
<button class="vsp-run-all" id="vsp-run-all">▶ Run all scenarios</button>
<div class="vsp-running" id="vsp-running"></div>`

        this.querySelectorAll('[data-scenario]').forEach(btn => {
            btn.onclick = () => this._run(btn.dataset.scenario)
        })
        this.querySelector('#vsp-run-all').onclick = () => this._runAll()
    }

    _setRunning(msg) {
        const el = this.querySelector('#vsp-running')
        if (el) el.textContent = msg
        this.querySelectorAll('.vsp-btn, .vsp-run-all').forEach(b => b.disabled = !!msg)
    }

    async _run(id) {
        const scenario = SCENARIO_MAP[id]
        if (!scenario) return
        const setup = window.__vsHarness?.setup
        if (!setup?.isLoaded) { alert('Load a vault key first'); return }
        this._setRunning(`Running ${scenario.label}…`)
        try {
            await _runScenario(scenario, setup)
        } catch (e) {
            console.error('[vs-scenario-picker] run error:', e)
            this._setRunning('Error: ' + e.message)
            setTimeout(() => this._setRunning(''), 3000)
            return
        }
        this._setRunning('')
    }

    async _runAll() {
        const setup = window.__vsHarness?.setup
        if (!setup?.isLoaded) { alert('Load a vault key first'); return }
        for (const s of SCENARIOS) {
            this._setRunning(`Running ${s.label}…`)
            try { await _runScenario(s, setup) } catch (e) { console.error(e) }
            await new Promise(r => setTimeout(r, 150))   // brief gap for UI
        }
        this._setRunning('')
    }
}

// ── Scenario runner (shared) ───────────────────────────────────────────────────

async function _runScenario(scenario, setup) {
    const opts = window.__vsHarness.opts || {}

    // Create fresh client pair for each scenario
    const bSend   = new InstrumentedSGSend({ endpoint: setup._endpoint, token: setup._token }, { client: 'baseline' })
    const oSend   = new InstrumentedSGSend({ endpoint: setup._endpoint, token: setup._token }, { client: 'optimised' })

    _hFire('vs:scenario-started', { scenario: scenario.id, client: 'both' })

    // ── Baseline ──
    bSend.resetMetrics()
    let bErr = null
    try {
        const bVault = await SGVault.open(bSend, setup._vaultKey)
        await scenario.setup?.({ setup, vault: bVault, send: bSend })
        await scenario.run?.(bVault, bSend)
    } catch (e) { bErr = e.message }
    const bMetrics = bSend.getMetrics()
    _hFire('vs:scenario-completed', { scenario: scenario.id, client: 'baseline', metrics: bMetrics, error: bErr })

    // ── Optimised ──
    oSend.resetMetrics()
    let oErr = null
    try {
        const oFast = new SGVaultFast(oSend, opts)
        await oFast.open(setup._vaultKey)
        await scenario.run?.(oFast, oSend)
    } catch (e) { oErr = e.message }
    const oMetrics = oSend.getMetrics()
    _hFire('vs:scenario-completed', { scenario: scenario.id, client: 'optimised', metrics: oMetrics, error: oErr })

    // ── Deltas ──
    const deltas = {
        requests: oMetrics.requests - bMetrics.requests,
        totalMs:  oMetrics.totalMs  - bMetrics.totalMs,
        bytes:    (oMetrics.totalReqBytes + oMetrics.totalResBytes) - (bMetrics.totalReqBytes + bMetrics.totalResBytes)
    }

    const result = { scenario: scenario.id, label: scenario.label, baseline: bMetrics, optimised: oMetrics, deltas, opts: { ...opts }, ts: Date.now() }
    window.__vsHarness.lastRun = result
    window.__vsHarness.history.unshift(result)
    if (window.__vsHarness.history.length > 50) window.__vsHarness.history.pop()

    _hFire('vs:run-completed', result)
}

// ── <vs-metrics-card> ─────────────────────────────────────────────────────────

class VsMetricsCard extends HTMLElement {
    connectedCallback() {
        this._render('Waiting for a scenario run…')
        document.addEventListener('vs:run-completed', e => this._update(e.detail))
    }

    _render(placeholder) {
        this.innerHTML = `
<style>
  vs-metrics-card { display: block; height: 100%; font-family: system-ui, sans-serif; }
  .vmc-wrap   { padding: 0.75rem; height: 100%; overflow: auto; }
  .vmc-ph     { color: var(--muted); font-style: italic; font-size: 0.8rem; margin-top: 2rem; text-align: center; }
  .vmc-title  { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.6rem; }
  .vmc-grid   { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .vmc-col    { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 0.65rem; }
  .vmc-col--b { border-left: 3px solid var(--teal); }
  .vmc-col--o { border-left: 3px solid var(--warn); }
  .vmc-col-title { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; letter-spacing: 0.07em; }
  .vmc-col-title--b { color: var(--teal); }
  .vmc-col-title--o { color: var(--warn); }
  .vmc-stat   { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.3rem; }
  .vmc-stat-k { font-size: 0.72rem; color: var(--muted); }
  .vmc-stat-v { font-size: 0.85rem; font-weight: 700; color: var(--text); font-family: monospace; }
  .vmc-stat-v--good { color: #1f9d55; }
  .vmc-stat-v--bad  { color: var(--err); }
  .vmc-delta  { margin-top: 0.8rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem; }
  .vmc-delta-row { display: flex; justify-content: space-between; margin-bottom: 0.2rem; font-size: 0.75rem; }
  .vmc-delta-k { color: var(--muted); }
  .vmc-delta-v { font-family: monospace; font-weight: 700; }
  .vmc-log    { margin-top: 0.75rem; }
  .vmc-log-title { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 0.35rem; }
  .vmc-log-row { font-size: 0.68rem; font-family: monospace; padding: 0.15rem 0; color: var(--text); display: flex; gap: 0.5rem; }
  .vmc-tag-b  { color: var(--teal); }
  .vmc-tag-o  { color: var(--warn); }
  .vmc-err    { color: var(--err); font-size: 0.72rem; margin-top: 0.4rem; }
</style>
<div class="vmc-wrap">
  <div id="vmc-body"><div class="vmc-ph">${placeholder}</div></div>
</div>`
    }

    _update(d) {
        const b = d.baseline, o = d.optimised
        const good = (n) => n <= 0 ? 'good' : 'bad'
        const pct  = (b, o) => b === 0 ? '—' : `${o < b ? '−' : '+'}${Math.abs(Math.round((o - b) / b * 100))} %`
        const ms   = (n) => n.toFixed(1) + ' ms'
        const kb   = (n) => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' kB'

        const expected = SCENARIO_MAP[d.scenario]?.expectedOptimised?.requests
        const discrepancy = expected != null && o.requests !== expected
            ? `<div class="vmc-err">⚠ Expected ${expected} optimised requests, got ${o.requests}</div>` : ''

        const logRows = (log, tag) => log.slice(0, 8).map(r =>
            `<div class="vmc-log-row"><span class="vmc-tag-${tag}">[${tag.slice(0,1).toUpperCase()}]</span> ${r.type} ${r.fileId||''} <span style="color:var(--muted)">${r.durationMs?.toFixed(1)}ms</span></div>`
        ).join('')

        const bBytes = b.totalReqBytes + b.totalResBytes
        const oBytes = o.totalReqBytes + o.totalResBytes

        this.querySelector('#vmc-body').innerHTML = `
<div class="vmc-title">Scenario: ${d.label}</div>
<div class="vmc-grid">
  <div class="vmc-col vmc-col--b">
    <div class="vmc-col-title vmc-col-title--b">Baseline (today)</div>
    <div class="vmc-stat"><span class="vmc-stat-k">HTTP requests</span><span class="vmc-stat-v">${b.requests}</span></div>
    <div class="vmc-stat"><span class="vmc-stat-k">Total bytes</span><span class="vmc-stat-v">${kb(bBytes)}</span></div>
    <div class="vmc-stat"><span class="vmc-stat-k">Wall-clock</span><span class="vmc-stat-v">${ms(b.totalMs)}</span></div>
  </div>
  <div class="vmc-col vmc-col--o">
    <div class="vmc-col-title vmc-col-title--o">Optimised (${Object.keys(d.opts).filter(k=>d.opts[k]).join(', ') || 'none on'})</div>
    <div class="vmc-stat"><span class="vmc-stat-k">HTTP requests</span><span class="vmc-stat-v vmc-stat-v--${good(o.requests - b.requests)}">${o.requests}</span></div>
    <div class="vmc-stat"><span class="vmc-stat-k">Total bytes</span><span class="vmc-stat-v vmc-stat-v--${good(oBytes - bBytes)}">${kb(oBytes)}</span></div>
    <div class="vmc-stat"><span class="vmc-stat-k">Wall-clock</span><span class="vmc-stat-v vmc-stat-v--${good(o.totalMs - b.totalMs)}">${ms(o.totalMs)}</span></div>
  </div>
</div>
${discrepancy}
<div class="vmc-delta">
  <div class="vmc-delta-row"><span class="vmc-delta-k">Δ Requests</span><span class="vmc-delta-v" style="color:${d.deltas.requests <= 0 ? '#1f9d55' : 'var(--err)'}">${d.deltas.requests <= 0 ? '−' + Math.abs(d.deltas.requests) : '+' + d.deltas.requests} (${pct(b.requests, o.requests)})</span></div>
  <div class="vmc-delta-row"><span class="vmc-delta-k">Δ Bytes</span><span class="vmc-delta-v" style="color:${d.deltas.bytes <= 0 ? '#1f9d55' : 'var(--err)'}">${pct(bBytes, oBytes)}</span></div>
  <div class="vmc-delta-row"><span class="vmc-delta-k">Δ Wall-clock</span><span class="vmc-delta-v" style="color:${d.deltas.totalMs <= 0 ? '#1f9d55' : 'var(--err)'}">${pct(b.totalMs, o.totalMs)}</span></div>
</div>
<div class="vmc-log">
  <div class="vmc-log-title">Request log (first 8 each side)</div>
  ${logRows(b.log, 'baseline')}${logRows(o.log, 'optimised')}
</div>`
    }
}

// ── <vs-request-trace> ────────────────────────────────────────────────────────
// Thin wrapper that hosts <sg-vault-trace> and adds a filter bar.

class VsRequestTrace extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
<style>
  vs-request-trace { display: block; height: 100%; overflow: hidden; }
  .vrt-bar  { display: flex; gap: 0.5rem; padding: 0.4rem 0.6rem; background: var(--bg3); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .vrt-btn  { background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 0.65rem; padding: 0.1rem 0.45rem; border-radius: 3px; cursor: pointer; }
  .vrt-btn.active { border-color: var(--teal); color: var(--teal); }
  .vrt-trace { height: calc(100% - 34px); overflow: auto; }
  sg-vault-trace { display: block; height: 100%; }
</style>
<div class="vrt-bar" id="vrt-bar">
  <span style="font-size:0.62rem;color:var(--muted);align-self:center">Filter:</span>
  <button class="vrt-btn active" data-filter="all">All</button>
  <button class="vrt-btn" data-filter="baseline">Baseline</button>
  <button class="vrt-btn" data-filter="optimised">Optimised</button>
  <button class="vrt-btn" data-filter="writes">Writes</button>
  <button class="vrt-btn" data-filter="reads">Reads</button>
  <button class="vrt-btn" style="margin-left:auto" id="vrt-clear">Clear</button>
  <button class="vrt-btn" id="vrt-export">Copy log</button>
</div>
<div class="vrt-trace">
  <sg-vault-trace id="vrt-trace" format="compact"></sg-vault-trace>
</div>`

        // Filter buttons
        this.querySelector('#vrt-bar').addEventListener('click', e => {
            const btn = e.target.closest('[data-filter]')
            if (!btn) return
            this.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            // sg-vault-trace doesn't have a native filter API, so we show/hide rows
            this._applyFilter(btn.dataset.filter)
        })

        this.querySelector('#vrt-clear').onclick  = () => {
            const t = this.querySelector('sg-vault-trace')
            t?.clearLog?.()
            this.querySelector('#vrt-trace').innerHTML = '<sg-vault-trace id="vrt-trace" format="compact"></sg-vault-trace>'
        }

        this.querySelector('#vrt-export').onclick = () => {
            const t = this.querySelector('sg-vault-trace')
            const log = t?.getLog?.() || []
            const md = '| ts | client | event | fileId | ms |\n|---|---|---|---|---|\n' +
                log.map(e => `| ${e.ts?.toFixed(0)||''} | ${e.detail?.client||''} | ${e.type} | ${e.detail?.fileId||''} | ${e.detail?.fetchMs||e.detail?.writeMs||e.detail?.batchMs||''} |`).join('\n')
            navigator.clipboard?.writeText(md).catch(() => {})
        }
    }

    _applyFilter(f) { /* sg-vault-trace renders its own rows; filter is best-effort */ }
}

// ── <vs-run-history> ──────────────────────────────────────────────────────────

class VsRunHistory extends HTMLElement {
    connectedCallback() {
        this._render()
        document.addEventListener('vs:run-completed', () => this._render())
    }

    _render() {
        const hist = window.__vsHarness?.history || []
        const rows = hist.map(r => {
            const dr = r.deltas.requests
            const color = dr < 0 ? '#1f9d55' : dr > 0 ? 'var(--err)' : 'var(--muted)'
            const pct = r.baseline.requests === 0 ? '—' : `${Math.round(Math.abs(dr) / r.baseline.requests * 100)} %`
            return `<tr>
  <td>${r.label}</td>
  <td>${r.baseline.requests} / ${(r.baseline.totalMs).toFixed(0)} ms</td>
  <td>${r.optimised.requests} / ${(r.optimised.totalMs).toFixed(0)} ms</td>
  <td style="color:${color};font-weight:700">${dr <= 0 ? '−' : '+'}${Math.abs(dr)} (${pct})</td>
  <td style="font-size:0.65rem;color:var(--muted)">${Object.keys(r.opts||{}).filter(k=>r.opts[k]).join(',') || '—'}</td>
</tr>`
        }).join('')

        this.innerHTML = `
<style>
  vs-run-history { display: block; height: 100%; overflow: auto; }
  .vrh-wrap { padding: 0.6rem; }
  .vrh-header { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 0.4rem; display: flex; justify-content: space-between; }
  .vrh-table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  .vrh-table th { font-size: 0.62rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--border); text-align: left; }
  .vrh-table td { padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border); font-family: monospace; }
  .vrh-empty { color: var(--muted); font-style: italic; font-size: 0.8rem; text-align: center; margin-top: 2rem; }
  .vrh-export { background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 0.65rem; padding: 0.1rem 0.4rem; border-radius: 3px; cursor: pointer; }
  .vrh-export:hover { color: var(--teal); border-color: rgba(78,205,196,0.4); }
</style>
<div class="vrh-wrap">
  <div class="vrh-header">Run History (${hist.length})
    <button class="vrh-export" id="vrh-export">Export Markdown</button>
  </div>
  ${hist.length === 0
    ? '<div class="vrh-empty">No runs yet. Run a scenario to see results.</div>'
    : `<table class="vrh-table">
  <thead><tr><th>Scenario</th><th>Baseline (req/ms)</th><th>Optimised (req/ms)</th><th>Δ Req</th><th>Toggles</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`}
</div>`

        this.querySelector('#vrh-export')?.addEventListener('click', () => this._export())
    }

    _export() {
        const hist = window.__vsHarness?.history || []
        const md = `## SGit Performance Harness — Run History\n\n| Scenario | Baseline (req) | Optimised (req) | Δ | Toggles |\n|---|---|---|---|---|\n` +
            hist.map(r => `| ${r.label} | ${r.baseline.requests} | ${r.optimised.requests} | ${r.deltas.requests <= 0 ? '−' : '+'}${Math.abs(r.deltas.requests)} | ${Object.keys(r.opts||{}).filter(k=>r.opts[k]).join(', ')||'none'} |`).join('\n')
        navigator.clipboard?.writeText(md).catch(() => {})
        alert('Copied to clipboard')
    }
}

// ── <vs-vault-setup-panel> ────────────────────────────────────────────────────

class VsVaultSetupPanel extends HTMLElement {
    connectedCallback() { this._render() }

    _render() {
        this.innerHTML = `
<style>
  vs-vault-setup-panel { display: block; padding: 0.75rem; font-family: system-ui, sans-serif; }
  .vvs-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.4rem; margin-top: 0.75rem; }
  .vvs-label:first-child { margin-top: 0; }
  .vvs-btn { display: block; width: 100%; margin-bottom: 0.35rem; background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: 0.72rem; padding: 0.3rem 0.5rem; border-radius: 4px; cursor: pointer; text-align: left; }
  .vvs-btn:hover { border-color: rgba(78,205,196,0.4); color: var(--teal); }
  .vvs-status { font-size: 0.7rem; color: var(--muted); min-height: 1.3em; margin-top: 0.3rem; }
  .vvs-warn { background: var(--warn-dim); border: 1px solid rgba(224,172,78,0.25); border-radius: 4px; padding: 0.4rem 0.6rem; font-size: 0.7rem; color: var(--warn); margin-top: 0.6rem; }
</style>
<div class="vvs-label">Test data</div>
<button class="vvs-btn" id="vvs-add5">Add 5 small files to vault</button>
<button class="vvs-btn" id="vvs-deep">Create deep tree (alpha/beta → sub → deep)</button>

<div class="vvs-label">Vault info</div>
<div id="vvs-info" style="font-size:0.72rem;color:var(--muted);font-family:monospace">—</div>

<div class="vvs-status" id="vvs-status"></div>
<div class="vvs-warn">Use a <strong>dedicated test vault</strong>. Write scenarios leave CAS objects in S3. Ephemeral vaults (created via Vault Loader) delete their ref pointers on Clear.</div>`

        this.querySelector('#vvs-add5').onclick = () => this._addFiles(5)
        this.querySelector('#vvs-deep').onclick = () => this._deepTree()

        document.addEventListener('vs:vault-loaded', () => this._refreshInfo())
        document.addEventListener('vs:run-completed', () => this._refreshInfo())
    }

    _setStatus(msg) {
        const el = this.querySelector('#vvs-status')
        if (el) el.textContent = msg
    }

    async _refreshInfo() {
        const setup = window.__vsHarness?.setup
        if (!setup?.isLoaded) return
        const el = this.querySelector('#vvs-info')
        if (el) el.textContent = `Key: ${setup.vaultKey?.slice(0, 20)}…  Ephemeral: ${setup._isEphemeral ? 'yes' : 'no'}`
    }

    async _addFiles(n) {
        const setup = window.__vsHarness?.setup
        if (!setup?.isLoaded) { alert('Load a vault key first'); return }
        this._setStatus(`Adding ${n} files…`)
        try {
            const send  = new SGSend({ endpoint: setup._endpoint, token: setup._token })
            const vault = await SGVault.open(send, setup._vaultKey)
            await new VaultSetup()._addFilesTo(vault, n)
            this._setStatus(`Added ${n} files and pushed.`)
        } catch (e) {
            this._setStatus('Error: ' + e.message)
        }
    }

    async _deepTree() {
        const setup = window.__vsHarness?.setup
        if (!setup?.isLoaded) { alert('Load a vault key first'); return }
        this._setStatus('Creating deep tree…')
        try {
            const send  = new SGSend({ endpoint: setup._endpoint, token: setup._token })
            const vault = await SGVault.open(send, setup._vaultKey)
            const vs    = new VaultSetup()
            await vs.createDeepTree(vault)
            this._setStatus('Deep tree created and pushed.')
        } catch (e) {
            this._setStatus('Error: ' + e.message)
        }
    }
}

// Fix the missing helper in VaultSetup (addFilesTo)
VaultSetup.prototype._addFilesTo = async function(vault, count) {
    for (let i = 0; i < count; i++) {
        const data = new TextEncoder().encode(`file-${i}-${Date.now()}-${'x'.repeat(64)}`)
        await vault.addFile('/', `file-${i}-${Date.now()}.txt`, data)
    }
    await vault.push()
}

// ── Register ──────────────────────────────────────────────────────────────────

customElements.define('vs-vault-loader',       VsVaultLoader)
customElements.define('vs-opt-toggles',        VsOptToggles)
customElements.define('vs-scenario-picker',    VsScenarioPicker)
customElements.define('vs-metrics-card',       VsMetricsCard)
customElements.define('vs-request-trace',      VsRequestTrace)
customElements.define('vs-run-history',        VsRunHistory)
customElements.define('vs-vault-setup-panel',  VsVaultSetupPanel)
