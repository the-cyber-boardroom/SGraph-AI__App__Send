/* =================================================================================
   SGraph Vault — Vault Chat pane (Phase 1)
   Self-contained custom element (the vault-generate pattern: HTMLElement + shadow
   DOM). Wires the Phase-0 stack (MemoryVfs working set, tool policies, ExecutionCenter
   with budget + CONFIRM, ChatLoop) to an LLM transport that is either the MOCK (keyless)
   or the real <sg-llm-request> over a [data-llm-bus] (Phase 1).

   Vault-awareness: when mounted with the window.sg bridge present, the manifest is
   built from sg.vfs.list('/') and read_file pulls vault files through into the working
   set on a miss. Standalone (no bridge), it operates on the working set only.

   Depends on window.VaultChat.{MemoryVfs,ToolPolicies,BuiltinTools,ExecutionCenter,
   ChatLoop,ChatSession,createMockLlm,LlmBus}. Loads <sg-llm-request> from the page.
   ================================================================================= */
(function () {
    'use strict';
    const VC = () => window.VaultChat;
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    class VaultChatPane extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._sg = null;          // window.sg bridge (optional)
            this._mode = 'mock';      // 'mock' | 'real'
        }

        // Optional: app-shell / host injects the bridge here. When the chat is mounted
        // as a kernel app, the iframe wires this after sg-app:ready. We rebuild the
        // runners so pull-through engages on the next turn.
        setBridge(sg) {
            this._sg = sg;
            if (this._ec) this._ec.runners = this._runners(this._ecRef);
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultChatPane.styles}</style>
                <div class="vc">
                  <div class="bar">
                    <span class="title">Vault Chat</span>
                    <select class="model" title="model">
                      <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
                      <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
                      <option value="openai/gpt-4o-mini">GPT-4o mini</option>
                    </select>
                    <select class="mode" title="persistence mode"><option>ephemeral</option><option>snapshot</option><option>synced</option></select>
                    <select class="loadout" title="tool loadout"><option>edit</option><option>read-only</option><option>memory-curation</option></select>
                    <input class="scope" value="/" size="10" title="fractal scope (e.g. /, /work, /notes/2026)">
                    <button class="prune" title="self-prune: consolidate /chat/history → /chat/consolidated, shrink the live prompt">consolidate</button>
                    <label class="llm"><input type="checkbox" class="real"> real LLM</label>
                    <input type="password" class="key" placeholder="sk-or-… (real LLM)" autocomplete="off" spellcheck="false" style="display:none">
                  </div>
                  <div class="bus" data-llm-bus><sg-llm-request></sg-llm-request>
                    <div class="body">
                      <div class="main">
                        <div class="transcript"></div>
                        <div class="composer">
                          <input class="input" placeholder="try: list /   ·   read /notes.md   ·   write /work/x.md hello   ·   make an infographic">
                          <button class="send">Send</button>
                        </div>
                      </div>
                      <div class="side">
                        <div class="tabs">
                          <button class="tab active" data-tab="log">Log</button>
                          <button class="tab" data-tab="layers">Layers</button>
                          <button class="tab" data-tab="history">History</button>
                          <button class="tab" data-tab="tools">Tools</button>
                        </div>
                        <div class="tabpanel" data-panel="log">
                          <h4>Ledger</h4><div class="ledger"></div>
                          <h4>Execution log</h4><div class="log"></div>
                        </div>
                        <div class="tabpanel" data-panel="layers" hidden></div>
                        <div class="tabpanel" data-panel="history" hidden></div>
                        <div class="tabpanel" data-panel="tools" hidden></div>
                      </div>
                    </div>
                  </div>
                </div>`;
            this._q = (s) => this.shadowRoot.querySelector(s);
            this._activeTab = 'log';
            this._wire();
            this._build();
        }

        _wire() {
            this._q('.send').addEventListener('click', () => this._onSend());
            this._q('.input').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._onSend(); });
            this._q('.real').addEventListener('change', (e) => {
                this._mode = e.target.checked ? 'real' : 'mock';
                this._q('.key').style.display = e.target.checked ? '' : 'none';
                this._build();
            });
            ['.mode', '.loadout', '.model', '.scope'].forEach((s) => this._q(s).addEventListener('change', () => { this._syncControls(); this._renderActiveTab(); }));
            this.shadowRoot.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => this._showTab(t.dataset.tab)));
            this._q('.prune').addEventListener('click', () => this._runConsolidate());
        }

        _showTab(name) {
            this.shadowRoot.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
            this.shadowRoot.querySelectorAll('.tabpanel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
            this._activeTab = name;
            this._renderActiveTab();
        }

        _renderActiveTab() {
            if (this._activeTab === 'layers') this._renderLayers();
            else if (this._activeTab === 'history') this._renderHistory();
            else if (this._activeTab === 'tools') this._renderTools();
        }

        _busEl() { return this._q('.bus'); }

        _build() {
            const C = VC();
            this._vfs = new C.MemoryVfs();
            this._session = new C.ChatSession({ mode: this._q('.mode').value, loadout: this._q('.loadout').value, budgetUsd: 1.0, model: this._q('.model').value, scopeRoot: (this._q('.scope').value || '/') });
            this._log = [];
            this._ecRef = { ec: null };                              // late-bound so consolidate can preflight
            this._ec = new C.ExecutionCenter({
                policies: this._policies(),
                registry: C.BuiltinTools.OPENAI_SCHEMAS,            // model-ready tool schemas
                runners: this._runners(this._ecRef),
                confirm: (req) => this._confirm(req),
                log: (row) => { this._log.push(row); this._renderLog(); this._renderLedger(); },
                estimate: (name) => (name === 'create_infographic' ? 0.06 : name === 'consolidate_memory' ? 0.01 : 0),
                budgetUsd: 1.0,
            });
            this._ecRef.ec = this._ec;
            this._fc = new C.VaultFlushController(this._vfs, this._sg || this._mockSg(), this._q('.mode').value);
            this._loop = new C.ChatLoop({ executionCenter: this._ec, session: this._session, vfs: this._vfs, sendLlm: this._sendLlm(), onEvent: (e) => this._renderEvent(e) });
            this._renderLedger(); this._renderLog();
        }

        _mockSg() { this.__mock = this.__mock || VC().createMockSg(); return this.__mock; }

        _policies() {
            const C = VC();
            let p = C.ToolPolicies.applyLoadout(C.ToolPolicies.defaults(), this._q('.loadout').value);
            const writable = this._sg ? !!this._sg.app?.writable : true;
            return C.ToolPolicies.degradeIfReadOnly(p, writable);
        }

        _syncControls() {
            this._ec.policies = this._policies();
            this._fc.mode = this._q('.mode').value;
            this._session.mode = this._q('.mode').value;
            this._session.model = this._q('.model').value;
            this._session.scopeRoot = this._q('.scope').value || '/';
        }

        // Built-in runners against the working set, with vault pull-through when a bridge
        // is present, plus the consolidate_memory self-prune runner (doc 05 §4).
        _runners(ecRef) {
            const C = VC();
            const base = C.BuiltinTools.makeRunners(this._vfs);
            const sg = this._sg, vfs = this._vfs, session = this._session;
            const withPullThrough = !sg ? base : Object.assign({}, base, {
                async read_file(args) {
                    const path = C.BuiltinTools.guard(args.path);
                    if (await vfs.exists(path)) return base.read_file(args);
                    const text = await sg.vfs.readText(path);
                    await vfs.writeFile(path, text);
                    return { ok: true, path, content: text, untrusted: true, pulledFromVault: true };
                },
            });
            withPullThrough.consolidate_memory = C.ConsolidateMemory.makeRunner({
                ecRef, vfs, session, getSendLlm: () => this._loop && this._loop.sendLlm,
            });
            return withPullThrough;
        }

        async _runConsolidate() {
            try {
                const r = await this._ec.execute('consolidate_memory', { retainTail: 2 });
                if (r && r.consolidatedPath && this._loop) await this._loop.rebuildAfterConsolidate(r);
                this._renderEvent({ type: 'system', text: r && r.skipped ? `nothing to prune (${r.skipped})` : `consolidated → ${r.consolidatedPath}` });
            } catch (e) { this._renderEvent({ type: 'error', text: e.message }); }
            this._renderLedger(); this._renderActiveTab();
        }

        _sendLlm() {
            const C = VC();
            if (this._mode === 'mock') return C.createMockLlm();
            const bus = this._busEl();
            const model = this._q('.model').value;
            const key = this._q('.key').value.trim();
            C.LlmBus.connect(bus, { provider: 'openrouter', model, apiKey: key });
            C.LlmBus.setStreaming(bus, false);
            return C.LlmBus.createBusLlm(bus, { provider: 'openrouter', model });
        }

        async _manifest() {
            if (this._sg && this._sg.vfs) {
                try { const entries = await this._sg.vfs.list('/'); return this._session.buildManifest(entries); } catch (_) {}
            }
            return this._session.buildManifest(await this._vfs.listAll());
        }

        async _onSend() {
            const input = this._q('.input');
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            this._syncControls();
            if (this._mode === 'real') this._loop.sendLlm = this._sendLlm();   // refresh key/model
            try {
                const manifest = await this._manifest();
                await this._loop.runTurn(text, manifest);
                await this._fc.onTurnEnd(`turn: ${text.slice(0, 40)}`);
            } catch (err) {
                this._renderEvent({ type: 'error', text: err.message });
            }
            this._renderLedger();
            this._renderActiveTab();
        }

        _confirm({ name, args, estimate, remaining }) {
            return new Promise((resolve) => {
                const div = document.createElement('div');
                div.className = 'confirm';
                div.innerHTML = `<div>tool: <code>${esc(name)}</code> ${esc(JSON.stringify(args))}<br>` +
                    `est $${(estimate || 0).toFixed(2)} · budget left $${remaining.toFixed(2)}</div>`;
                [['approve', 'approve'], ['approve always', 'always'], ['deny', 'deny']].forEach(([label, val]) => {
                    const b = document.createElement('button');
                    b.textContent = label; b.className = 'cbtn';
                    b.onclick = () => { div.querySelectorAll('button').forEach((x) => (x.disabled = true)); resolve(val); };
                    div.appendChild(b);
                });
                this._q('.transcript').appendChild(div);
                this._scroll();
            });
        }

        _renderEvent(e) {
            const t = this._q('.transcript');
            const div = document.createElement('div');
            if (e.type === 'user') { div.className = 'm user'; div.innerHTML = `<span class="r">you</span>${esc(e.text)}`; }
            else if (e.type === 'assistant') { div.className = 'm asst'; div.innerHTML = `<span class="r">chat</span>${esc(e.text)}`; }
            else if (e.type === 'tool-call') { div.className = 'tc'; div.textContent = `🛠 ${e.name}(${JSON.stringify(e.args)})`; }
            else if (e.type === 'tool-result') {
                const r = e.result || {}; div.className = 'tc';
                div.textContent = r.denied ? '↳ denied' : r.refused ? `↳ REFUSED: ${r.reason}` : r.ok === false ? `↳ error: ${r.error}` : '↳ ok';
            } else if (e.type === 'system') { div.className = 'm sys'; div.innerHTML = `<span class="r">system</span>${esc(e.text)}`; }
            else { div.className = 'm err'; div.textContent = e.text || ''; }
            t.appendChild(div); this._scroll();
        }

        _renderLog() {
            this._q('.log').innerHTML = this._log.map((c) => {
                const ic = c.kind === 'llm' ? '🤖' : '🛠';
                let d = c.name || '';
                if (c.mode) d += ` [${c.mode}]`;
                if (c.cost) d += ` $${Number(c.cost).toFixed(4)}`;
                if (c.refused) d += ` REFUSED:${c.reason}`;
                if (c.denied) d += ' denied';
                return `<div class="lr${c.ok === false ? ' e' : ''}">${ic} ${esc(d)}</div>`;
            }).join('') || '<div class="lr">no activity</div>';
        }

        _renderLedger() {
            const l = this._ec.ledger;
            const left = isFinite(l.budgetUsd) ? (l.budgetUsd - l.spentUsd).toFixed(2) : '∞';
            this._q('.ledger').innerHTML = `spent $${l.spentUsd.toFixed(3)} / $${isFinite(l.budgetUsd) ? l.budgetUsd.toFixed(2) : '∞'} (left $${left})<br>task $${l.byTag.task.toFixed(3)} · mem $${l.byTag.memory.toFixed(3)}`;
        }

        _scroll() { const t = this._q('.transcript'); t.scrollTop = t.scrollHeight; }

        // --- Phase 2: context-layers inspector ---
        async _renderLayers() {
            const panel = this.shadowRoot.querySelector('[data-panel="layers"]');
            if (!panel) return;
            const files = await this._vfs.listAll();
            const work = files.filter((f) => !f.path.startsWith('/chat/'));
            const history = files.filter((f) => f.path.startsWith('/chat/history/'));
            const tokens = this._session.estimateTokens(this._loop ? this._loop._messages : []);
            const l = this._ec.ledger;
            const fileRows = work.length
                ? work.map((f) => `<div class="lr">${esc(f.path)} <span class="dim">${f.size}b</span></div>`).join('')
                : '<div class="lr dim">empty</div>';
            const vaultLine = this._sg ? 'vault: via window.sg bridge (read_file pulls through)' : 'vault: none (standalone — working set only)';
            const consolidated = files.filter((f) => f.path.startsWith('/chat/consolidated/'));
            panel.innerHTML =
                `<h4>Vault</h4><div class="lr dim">${esc(vaultLine)}</div>` +
                `<div class="lr">scope: <code>${esc(this._session.scopeRoot || '/')}</code></div>` +
                `<h4>VFS working set (${work.length})</h4>${fileRows}` +
                `<h4>History</h4><div class="lr">${history.length} turn file(s) under /chat/history</div>` +
                (consolidated.length ? `<h4>Consolidated</h4>` + consolidated.map((f) => `<div class="lr">${esc(f.path)} <span class="dim">${f.size}b</span></div>`).join('') : '') +
                `<h4>Assembled prompt</h4><div class="lr">~${tokens} tokens · ${this._loop ? this._loop._messages.length : 0} messages <button class="cbtn fp">view full prompt</button></div>` +
                `<pre class="fullprompt" hidden></pre>` +
                `<h4>Budget</h4><div class="lr">spent $${l.spentUsd.toFixed(3)} / $${isFinite(l.budgetUsd) ? l.budgetUsd.toFixed(2) : '∞'}  ·  mem $${l.byTag.memory.toFixed(3)}</div>`;
            const fp = panel.querySelector('.fp');
            const pre = panel.querySelector('.fullprompt');
            if (fp) fp.onclick = () => {
                if (pre.hidden) { pre.textContent = JSON.stringify(this._loop ? this._loop._messages : [], null, 2); pre.hidden = false; fp.textContent = 'hide full prompt'; }
                else { pre.hidden = true; fp.textContent = 'view full prompt'; }
            };
        }

        // Phase 4: History tab — list /chat/history/*, drop a turn from the live prompt
        // (originals stay in the working set; this is the lossless edit).
        async _renderHistory() {
            const panel = this.shadowRoot.querySelector('[data-panel="history"]');
            if (!panel) return;
            const files = (await this._vfs.listAll())
                .filter((f) => f.path.startsWith('/chat/history/'))
                .sort((a, b) => a.path.localeCompare(b.path));
            const rows = files.length
                ? files.map((f) => `<div class="tr"><code>${esc(f.path)}</code> <span class="dim">${f.size}b</span><button class="cbtn drop" data-path="${esc(f.path)}">drop</button></div>`).join('')
                : '<div class="lr dim">no history yet — send a message</div>';
            panel.innerHTML = `<h4>History (${files.length})</h4>${rows}` +
                `<div class="dim" style="margin-top:8px">"drop" removes a turn from the LIVE prompt only. Originals remain in /chat/history/ — the prune is lossless.</div>`;
            panel.querySelectorAll('button.drop').forEach((b) =>
                b.addEventListener('click', async () => {
                    const path = b.dataset.path;
                    if (this._loop && this._loop._messages) {
                        // remove any message whose history record path matches this file
                        // (best-effort: also remove the last message that mirrors this content)
                        // Conservative behaviour: drop by ordinal — N from /chat/history/NNNN.json
                        const n = parseInt(path.replace(/^.*\/(\d+)\.json$/, '$1'), 10);
                        if (Number.isFinite(n) && this._loop._messages.length > n) {
                            this._loop._messages.splice(n, 1);   // index n (system is [0]) maps to turn n
                        }
                    }
                    await this._vfs.deleteFile(path);
                    await this._renderHistory();
                    this._renderLedger();
                }));
        }

        // --- Phase 2: interactive tools / loadout panel (doc 07 §B5) ---
        _renderTools() {
            const panel = this.shadowRoot.querySelector('[data-panel="tools"]');
            if (!panel) return;
            const MODES = ['AUTO', 'CONFIRM', 'DRY_RUN', 'OFF'];
            const rows = this._ec.policies.map((p) => {
                const opts = MODES.map((m) => `<option ${m === p.mode ? 'selected' : ''}>${m}</option>`).join('');
                const sel = `<select data-tool="${esc(p.name)}" ${p.available ? '' : 'disabled'}>${opts}</select>`;
                const av = p.available ? '' : '<span class="dim"> (unavailable — loadout/read-only)</span>';
                return `<div class="tr"><code>${esc(p.name)}</code> <span class="tier">${esc(p.tier)}</span> ${sel}${av}</div>`;
            }).join('');
            panel.innerHTML = `<h4>Tools — loadout: ${esc(this._q('.loadout').value)}</h4>${rows}` +
                `<div class="dim" style="margin-top:8px">A tool set to OFF or unavailable is omitted from tools[] — invisible to the model, not refused at runtime. run_code is not registered (Track A).</div>`;
            panel.querySelectorAll('select[data-tool]').forEach((s) =>
                s.addEventListener('change', () => this._setToolMode(s.dataset.tool, s.value)));
        }

        _setToolMode(name, mode) {
            const p = this._ec.policies.find((x) => x.name === name);
            if (p) p.mode = mode;
        }
    }

    VaultChatPane.styles = `
      :host { display:block; height:100%; }
      .vc { display:flex; flex-direction:column; height:100%; background:var(--bg-primary,#0a0a18); color:var(--color-text,#e2e8f0); }
      .bar { display:flex; gap:8px; align-items:center; padding:8px 12px; background:var(--bg-surface,#111122); border-bottom:1px solid var(--color-border,#1a1a3a); flex-wrap:wrap; }
      .bar .title { color:var(--accent,#4ECDC4); font-weight:700; }
      .bar select, .bar input { background:var(--bg-primary,#0a0a18); color:inherit; border:1px solid #333d5a; border-radius:4px; padding:4px 6px; font-size:12px; }
      .bar .llm { font-size:12px; color:#a0aec0; }
      .bus { flex:1; display:flex; flex-direction:column; overflow:hidden; }
      .body { flex:1; display:flex; overflow:hidden; }
      .main { flex:1; display:flex; flex-direction:column; overflow:hidden; border-right:1px solid var(--color-border,#1a1a3a); }
      .transcript { flex:1; overflow:auto; padding:12px; }
      .m { margin:0 0 8px; padding:7px 10px; border-radius:6px; background:#0e0e20; }
      .m .r { display:block; font-size:10px; text-transform:uppercase; color:#8892a4; }
      .m.user { border-left:3px solid #4F8FF7; } .m.asst { border-left:3px solid var(--accent,#4ECDC4); } .m.err { border-left:3px solid #ff6b6b; }
      .tc { font-family:monospace; font-size:12px; background:#0b1a1a; border:1px solid #143; border-radius:5px; padding:5px 8px; margin:5px 0; }
      .confirm { border:1px solid var(--accent,#4ECDC4); border-radius:6px; padding:8px; margin:6px 0; background:rgba(78,205,196,.06); font-size:13px; }
      .confirm .cbtn { margin-right:6px; margin-top:6px; background:var(--accent,#4ECDC4); color:#0d0d1a; border:none; border-radius:4px; padding:4px 10px; font-weight:700; cursor:pointer; }
      .composer { display:flex; gap:8px; padding:10px; border-top:1px solid var(--color-border,#1a1a3a); }
      .composer .input { flex:1; background:var(--bg-primary,#0a0a18); color:inherit; border:1px solid #333d5a; border-radius:5px; padding:8px; }
      .composer .send { background:var(--accent,#4ECDC4); color:#0d0d1a; border:none; border-radius:5px; padding:7px 14px; font-weight:700; cursor:pointer; }
      .side { width:300px; flex-shrink:0; padding:0 10px 10px; overflow:auto; }
      .side h4 { font-size:11px; text-transform:uppercase; color:#8892a4; margin:12px 0 6px; }
      .tabs { position:sticky; top:0; display:flex; gap:4px; padding:8px 0; background:var(--bg-primary,#0a0a18); }
      .tab { background:#1a1a3a; color:#a0aec0; border:none; border-radius:4px; padding:4px 10px; font-size:12px; cursor:pointer; }
      .tab.active { background:var(--accent,#4ECDC4); color:#0d0d1a; font-weight:700; }
      .ledger { font-family:monospace; font-size:12px; }
      .lr { font-family:monospace; font-size:11px; padding:1px 2px; word-break:break-all; } .lr.e { color:#ff6b6b; }
      .dim { color:#5a6478; }
      .tr { font-size:12px; padding:3px 2px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .tr .tier { font-size:10px; color:#8892a4; }
      .tr select { background:var(--bg-primary,#0a0a18); color:inherit; border:1px solid #333d5a; border-radius:3px; font-size:11px; }
      code { color:var(--accent,#4ECDC4); }
    `;

    if (!customElements.get('vault-chat-pane')) customElements.define('vault-chat-pane', VaultChatPane);
})();
