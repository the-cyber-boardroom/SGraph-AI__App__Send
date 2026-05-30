/* =================================================================================
   SGraph App — Debug: thin SG-API REPL  (app-debug-repl)   (ViV pack §3.4)

   A "deliberately small" operator console over the sg.* surface: file ops + mount
   inspection + broker log. NOT a shell. Parsing + output formatting are SgReplCore
   (pure, unit-tested); execution calls window._appDebug.repl — a thin async glue
   app-shell installs over the SAME composite data source the running app sees (so
   read-through sub-vaults resolve identically) + the KernelParent. Cross-vault writes
   relay through the broker exactly like the GUI — the REPL is just another caller.
   ================================================================================= */
(function () {
    'use strict';

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    class AppDebugRepl extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._lines   = [];          // [{ kind:'in'|'out'|'err', text }]
            this._history = [];
            this._hi      = -1;
            this._built   = false;
        }

        connectedCallback() {
            if (!this._built) { this._render(); this._built = true; this._print('out', (globalThis.SgReplCore && SgReplCore.help()) || 'REPL'); }
        }

        _render() {
            this.shadowRoot.innerHTML = `
                <style>
                    :host { display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; background:#0a0a18; font-family:monospace; }
                    .bar { display:flex; align-items:center; justify-content:space-between; padding:0.3rem 0.5rem; border-bottom:1px solid #1c1c38; flex:0 0 auto; }
                    .bar .title { color:#4ECDC4; font-size:0.7rem; font-weight:600; letter-spacing:0.05em; }
                    .rp-clear { background:none; border:1px solid #2a2a4a; color:#6a7888; border-radius:3px; font-size:0.65rem; padding:0.1rem 0.4rem; cursor:pointer; }
                    .rp-clear:hover { color:#8892a4; border-color:#3a3a5a; }
                    .scroll { flex:1; overflow-y:auto; padding:0.4rem 0.5rem; font-size:0.68rem; line-height:1.45; }
                    .ln { white-space:pre-wrap; word-break:break-word; }
                    .ln.in  { color:#8892a4; }
                    .ln.in .ps { color:#4ECDC4; }
                    .ln.out { color:#9aa7b8; }
                    .ln.err { color:#ff6b6b; }
                    .inputrow { display:flex; align-items:center; gap:0.4rem; border-top:1px solid #1c1c38; padding:0.3rem 0.5rem; flex:0 0 auto; }
                    .inputrow .ps { color:#4ECDC4; font-size:0.7rem; }
                    .inputrow input { flex:1; background:transparent; border:none; outline:none; color:#cdd6e0; font-family:monospace; font-size:0.7rem; }
                </style>
                <div class="bar">
                    <span class="title">›_ sg REPL</span>
                    <button class="rp-clear" title="Clear">clear</button>
                </div>
                <div class="scroll"></div>
                <div class="inputrow"><span class="ps">sg&gt;</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" /></div>
            `;
            var input = this.shadowRoot.querySelector('input');
            this.shadowRoot.querySelector('.rp-clear').addEventListener('click', () => { this._lines = []; this._paint(); input.focus(); });
            input.addEventListener('keydown', (e) => this._onKey(e, input));
            this.shadowRoot.querySelector('.scroll').addEventListener('click', () => input.focus());
        }

        _onKey(e, input) {
            if (e.key === 'Enter') {
                var line = input.value;
                input.value = '';
                if (line.trim()) { this._history.push(line); this._hi = this._history.length; }
                this._exec(line);
            } else if (e.key === 'ArrowUp') {
                if (this._hi > 0) { this._hi--; input.value = this._history[this._hi] || ''; e.preventDefault(); }
            } else if (e.key === 'ArrowDown') {
                if (this._hi < this._history.length - 1) { this._hi++; input.value = this._history[this._hi] || ''; }
                else { this._hi = this._history.length; input.value = ''; }
                e.preventDefault();
            }
        }

        _print(kind, text) { this._lines.push({ kind: kind, text: text }); this._paint(); }

        _paint() {
            var scroll = this.shadowRoot.querySelector('.scroll');
            if (!scroll) return;
            scroll.innerHTML = this._lines.map(function (l) {
                if (l.kind === 'in') return '<div class="ln in"><span class="ps">sg&gt; </span>' + esc(l.text) + '</div>';
                return '<div class="ln ' + l.kind + '">' + esc(l.text) + '</div>';
            }).join('');
            scroll.scrollTop = scroll.scrollHeight;
        }

        async _exec(rawLine) {
            var R = globalThis.SgReplCore;
            if (!R) { this._print('err', 'SgReplCore not loaded'); return; }
            var p = R.parse(rawLine);
            if (p.empty) return;
            this._print('in', rawLine.trim());
            if (p.error) { this._print('err', p.error); return; }
            if (p.cmd === 'clear') { this._lines = []; this._paint(); return; }
            if (p.cmd === 'help')  { this._print('out', R.help()); return; }

            var repl = window._appDebug && window._appDebug.repl;
            if (!repl) { this._print('err', 'no app mounted yet — open a vault in /app first'); return; }

            try {
                if (p.cmd === 'vfs.list') {
                    var entries = await repl.list(p.args[0] || '');
                    this._print('out', R.formatList(entries, p.args[0] || ''));
                } else if (p.cmd === 'vfs.read') {
                    var text = await repl.read(p.args[0]);
                    this._print('out', text === '' ? '(empty file)' : text);
                } else if (p.cmd === 'vfs.write') {
                    var res = await repl.write(p.args[0], p.args[1] || '');
                    this._print('out', 'ok · wrote ' + res.path);
                } else if (p.cmd === 'vfs.delete') {
                    var dres = await repl.del(p.args[0]);
                    this._print('out', 'ok · deleted ' + dres.path);
                } else if (p.cmd === 'mounts') {
                    this._print('out', R.formatMounts(repl.mounts()));
                } else if (p.cmd === 'broker.log') {
                    this._print('out', R.formatLog(repl.brokerLog()));
                }
            } catch (err) {
                this._print('err', (err && err.message) || String(err));
            }
        }
    }

    if (typeof customElements !== 'undefined' && !customElements.get('app-debug-repl')) {
        customElements.define('app-debug-repl', AppDebugRepl);
    }
})();
