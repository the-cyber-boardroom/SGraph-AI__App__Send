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

        // Optional: app-shell / host injects the bridge here (Phase 3+ uses it for the key too).
        setBridge(sg) { this._sg = sg; }

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
                        <h4>Ledger</h4><div class="ledger"></div>
                        <h4>Execution log</h4><div class="log"></div>
                      </div>
                    </div>
                  </div>
                </div>`;
            this._q = (s) => this.shadowRoot.querySelector(s);
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
            ['.mode', '.loadout'].forEach((s) => this._q(s).addEventListener('change', () => this._syncControls()));
        }

        _busEl() { return this._q('.bus'); }

        _build() {
            const C = VC();
            this._vfs = new C.MemoryVfs();
            this._session = new C.ChatSession({ mode: this._q('.mode').value, loadout: this._q('.loadout').value, budgetUsd: 1.0, model: this._q('.model').value });
            this._log = [];
            this._ec = new C.ExecutionCenter({
                policies: this._policies(),
                registry: C.BuiltinTools.OPENAI_SCHEMAS,            // model-ready tool schemas
                runners: this._runners(),
                confirm: (req) => this._confirm(req),
                log: (row) => { this._log.push(row); this._renderLog(); this._renderLedger(); },
                estimate: (name) => (name === 'create_infographic' ? 0.06 : 0),
                budgetUsd: 1.0,
            });
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
        }

        // Built-in runners against the working set, with vault pull-through when a bridge is present.
        _runners() {
            const C = VC();
            const base = C.BuiltinTools.makeRunners(this._vfs);
            const sg = this._sg;
            if (!sg) return base;
            const vfs = this._vfs;
            return Object.assign({}, base, {
                async read_file(args) {
                    const path = C.BuiltinTools.guard(args.path);
                    if (await vfs.exists(path)) return base.read_file(args);
                    const text = await sg.vfs.readText(path);    // pull vault file into the working set
                    await vfs.writeFile(path, text);
                    return { ok: true, path, content: text, pulledFromVault: true };
                },
            });
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
            } else { div.className = 'm err'; div.textContent = e.text || ''; }
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
      .side { width:280px; flex-shrink:0; padding:10px; overflow:auto; }
      .side h4 { font-size:11px; text-transform:uppercase; color:#8892a4; margin:12px 0 6px; }
      .ledger { font-family:monospace; font-size:12px; }
      .lr { font-family:monospace; font-size:11px; padding:1px 2px; } .lr.e { color:#ff6b6b; }
      code { color:var(--accent,#4ECDC4); }
    `;

    if (!customElements.get('vault-chat-pane')) customElements.define('vault-chat-pane', VaultChatPane);
})();
