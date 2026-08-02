/* =================================================================================
   SGraph Vault — native LLM chat panel

   "Talk to the file you're looking at." Runs at the REAL origin inside the vault UI,
   so it calls OpenRouter directly through SGLlm — no bridge, no sandbox, no
   postMessage streaming. The credential comes from `.vault/llm/config.json` via
   SGLlmVault (owner-sealed by default; a read-only session simply cannot open it).

   Deliberately NOT an agent: no tools, no vault writes, no autonomous loop. It reads
   the file you are viewing and talks about it. Tool-using agents remain app-side
   (the SG/Vault Workbench is the reference); this is the always-there, zero-setup
   surface that every vault gets.

   API:
     setVault(vault)                    — wire/refresh availability
     setContextFile({path, text})       — the file currently being viewed
     toggle() / open() / close()

   Requires: SGLlm, SGLlmConfig, SGLlmVault, VaultHelpers (optional).
   ================================================================================= */

(function () {
    'use strict';

    var MAX_CONTEXT_CHARS = 24000;
    var MAX_HISTORY_MSGS  = 20;

    var SYSTEM = 'You are a helpful assistant embedded in an encrypted SGraph vault. ' +
        'The user is viewing a file from that vault; its content is provided to you as context. ' +
        'Answer about the file directly and concisely. If the context is marked TRUNCATED, say so ' +
        'rather than implying you have read the whole file. You cannot modify the vault.';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    class VaultLlmChat extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._vault   = null;
            this._session = null;      // { ok, client, policy, model }
            this._ctx     = null;      // { path, text }
            this._history = [];
            this._busy    = false;
            this._abort   = null;
            this._cost    = 0;
            this._calls   = 0;
        }

        connectedCallback() {
            this.shadowRoot.innerHTML =
                '<style>' + VaultLlmChat.styles + '</style>' +
                '<div class="vlc-panel" hidden>' +
                  '<div class="vlc-head">' +
                    '<span class="vlc-title">Ask about this file</span>' +
                    '<span class="vlc-model"></span>' +
                    '<span class="vlc-cost"></span>' +
                    '<button class="vlc-x" aria-label="Close">✕</button>' +
                  '</div>' +
                  '<div class="vlc-ctx"></div>' +
                  '<div class="vlc-log" role="log" aria-live="polite"></div>' +
                  '<div class="vlc-status"></div>' +
                  '<form class="vlc-form">' +
                    '<textarea class="vlc-in" rows="2" placeholder="Ask about this file…"></textarea>' +
                    '<button class="vlc-send" type="submit">Send</button>' +
                  '</form>' +
                '</div>';

            this.shadowRoot.querySelector('.vlc-x').addEventListener('click', () => this.close());
            this.shadowRoot.querySelector('.vlc-form').addEventListener('submit', (e) => {
                e.preventDefault();
                if (this._busy) { this._stop(); return; }
                this._send();
            });
            // Enter sends, Shift+Enter newlines — the convention every chat surface uses.
            this.shadowRoot.querySelector('.vlc-in').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!this._busy) this._send(); }
            });
        }

        async setVault(vault) {
            this._vault = vault;
            this._session = null;
            if (!vault) return;
            try { this._session = await SGLlmVault.open(vault); } catch (_) { this._session = null; }
            this._renderHead();
            this._renderStatus();
        }

        // Called whenever the vault UI renders a file. Text-ish files become context;
        // binaries are noted but not sent (there is nothing useful to send).
        setContextFile(ctx) {
            this._ctx = ctx && ctx.path ? ctx : null;
            this._renderCtx();
        }

        isAvailable() { return !!(this._session && this._session.ok); }

        open()   { this.shadowRoot.querySelector('.vlc-panel').hidden = false;
                   this._renderHead(); this._renderStatus();
                   setTimeout(() => this.shadowRoot.querySelector('.vlc-in')?.focus(), 0); }
        close()  { this.shadowRoot.querySelector('.vlc-panel').hidden = true; }
        toggle() { const p = this.shadowRoot.querySelector('.vlc-panel');
                   if (p.hidden) this.open(); else this.close(); }

        // ── rendering ────────────────────────────────────────────────────────────
        _renderHead() {
            const m = this.shadowRoot.querySelector('.vlc-model');
            const c = this.shadowRoot.querySelector('.vlc-cost');
            if (m) m.textContent = (this._session && this._session.ok && this._session.model) || '';
            if (c) c.textContent = this._calls ? ('~$' + this._cost.toFixed(4) + ' · ' + this._calls + ' calls') : '';
        }

        _renderCtx() {
            const el = this.shadowRoot.querySelector('.vlc-ctx');
            if (!el) return;
            if (!this._ctx) { el.innerHTML = '<span class="vlc-dim">No file selected — open a file to ask about it.</span>'; return; }
            const n = (this._ctx.text || '').length;
            el.innerHTML = '<span class="vlc-chip">📄 ' + esc(this._ctx.path) + '</span>' +
                (this._ctx.text == null
                    ? '<span class="vlc-dim"> · binary, not sent as context</span>'
                    : '<span class="vlc-dim"> · ' + n.toLocaleString() + ' chars' +
                      (n > MAX_CONTEXT_CHARS ? ' (truncated to ' + MAX_CONTEXT_CHARS.toLocaleString() + ')' : '') + '</span>');
        }

        _renderStatus() {
            const el = this.shadowRoot.querySelector('.vlc-status');
            if (!el) return;
            const s = this._session;
            if (!s || s.ok) { el.textContent = ''; el.className = 'vlc-status'; return; }
            if (s.reason === 'ENOKEY') {
                el.innerHTML = 'No AI key configured for this vault — add one in <strong>Settings → AI models</strong>.';
            } else if (s.reason === 'EREADONLY') {
                el.textContent = s.message || 'This vault\'s AI key is owner-sealed and unavailable in a read-only session.';
            } else {
                el.textContent = s.message || 'AI is unavailable for this vault.';
            }
            el.className = 'vlc-status vlc-status--warn';
        }

        _push(role, text) {
            const log = this.shadowRoot.querySelector('.vlc-log');
            const div = document.createElement('div');
            div.className = 'vlc-msg vlc-msg--' + role;
            div.textContent = text;
            log.appendChild(div);
            log.scrollTop = log.scrollHeight;
            return div;
        }

        _setBusy(b) {
            this._busy = b;
            const btn = this.shadowRoot.querySelector('.vlc-send');
            if (btn) { btn.textContent = b ? 'Stop' : 'Send'; btn.classList.toggle('vlc-send--stop', b); }
        }

        _stop() {
            if (this._abort) { try { this._abort.abort(); } catch (_) {} }
        }

        // ── the call ─────────────────────────────────────────────────────────────
        async _send() {
            const inEl = this.shadowRoot.querySelector('.vlc-in');
            const q    = (inEl.value || '').trim();
            if (!q) return;
            if (!this.isAvailable()) { this._renderStatus(); return; }

            const s = this._session;
            const limits = SGLlmConfig.limitsFor(s.policy, null);
            if (limits.maxCallsPerSession && this._calls >= limits.maxCallsPerSession) {
                this._push('err', 'Session call limit reached (' + limits.maxCallsPerSession + '). Raise it in Settings → AI models.');
                return;
            }
            if (limits.maxCostPerSession && this._cost >= limits.maxCostPerSession) {
                this._push('err', 'Session spend cap reached ($' + limits.maxCostPerSession + '). Raise it in Settings → AI models.');
                return;
            }

            inEl.value = '';
            this._push('user', q);
            this._history.push({ role: 'user', content: q });

            // Context rides as a system message each turn: the user may switch files
            // mid-conversation and the model must always see the CURRENT one.
            const msgs = [{ role: 'system', content: SYSTEM }];
            if (this._ctx && this._ctx.text != null) {
                const c = SGLlm.buildFileContext({ path: this._ctx.path, content: this._ctx.text, maxChars: MAX_CONTEXT_CHARS });
                msgs.push({ role: 'system', content: c.text });
            }
            msgs.push.apply(msgs, this._history.slice(-MAX_HISTORY_MSGS));

            const bubble = this._push('bot', '');
            bubble.classList.add('vlc-msg--streaming');
            this._abort = new AbortController();
            this._setBusy(true);

            let acc = '', last = 0;
            try {
                const res = await s.client.chat(
                    { model: s.model, messages: msgs, maxTokens: limits.maxTokensPerCall || undefined },
                    (delta, all) => {
                        acc = all;
                        const now = Date.now();
                        if (now - last > 60) {          // ~16fps — same cadence the Workbench settled on
                            last = now;
                            bubble.textContent = acc;
                            const log = this.shadowRoot.querySelector('.vlc-log');
                            log.scrollTop = log.scrollHeight;
                        }
                    },
                    this._abort.signal);

                bubble.textContent = res.content || acc || '(empty reply)';
                bubble.classList.remove('vlc-msg--streaming');
                if (res.content) this._history.push({ role: 'assistant', content: res.content });
                if (res.aborted) bubble.textContent = (bubble.textContent || '') + '\n— stopped —';
                if (res.warning) this._push('err', 'Upstream warning: ' + res.warning);

                this._calls++;
                this._accrue(res);
                // Authoritative cost lands a beat later; refresh the pill when it does.
                s.client.reconcileCost(res).then((upgraded) => {
                    if (upgraded) { this._recost(res); this._renderHead(); }
                });
            } catch (err) {
                bubble.classList.remove('vlc-msg--streaming');
                if (err && err.name === 'AbortError') { bubble.textContent = (acc || '') + '\n— stopped —'; }
                else {
                    bubble.remove();
                    this._push('err', (err && err.message) || 'Request failed');
                }
            } finally {
                this._abort = null;
                this._setBusy(false);
                this._renderHead();
            }
        }

        _accrue(res) {
            const eff = SGLlm.effectiveCost(res);
            res.__counted = (eff.value != null) ? eff.value : 0;
            this._cost += res.__counted;
        }

        // Replace the previously-counted estimate with the authoritative figure.
        _recost(res) {
            const eff = SGLlm.effectiveCost(res);
            if (eff.value == null) return;
            this._cost += (eff.value - (res.__counted || 0));
            res.__counted = eff.value;
        }
    }

    VaultLlmChat.styles = `
        :host { display: block; }
        .vlc-panel {
            display: flex; flex-direction: column; height: 100%;
            background: var(--bg-secondary, #131a2b); color: var(--color-text, #e2e8f0);
            border-left: 1px solid var(--color-border, #24304a); box-sizing: border-box;
        }
        .vlc-panel[hidden] { display: none; }
        .vlc-head {
            display: flex; align-items: center; gap: .5rem; padding: .5rem .75rem;
            border-bottom: 1px solid var(--color-border, #24304a);
        }
        .vlc-title { font-weight: 700; font-size: .82rem; }
        .vlc-model { font-family: var(--font-mono, monospace); font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); }
        .vlc-cost  { margin-left: auto; font-family: var(--font-mono, monospace); font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); }
        .vlc-x { background: none; border: none; color: inherit; cursor: pointer; font-size: .8rem; opacity: .7; }
        .vlc-x:hover { opacity: 1; }
        .vlc-ctx { padding: .4rem .75rem; font-size: .7rem; border-bottom: 1px solid var(--color-border, #24304a); }
        .vlc-chip {
            font-family: var(--font-mono, monospace); background: rgba(78,205,196,.12);
            color: #4ecdc4; border-radius: 4px; padding: .1rem .4rem;
        }
        .vlc-dim { color: var(--color-text-secondary, #9aa4bf); }
        .vlc-log { flex: 1; overflow-y: auto; padding: .75rem; display: flex; flex-direction: column; gap: .5rem; min-height: 0; }
        .vlc-msg { white-space: pre-wrap; word-break: break-word; font-size: .8rem; line-height: 1.5; padding: .45rem .6rem; border-radius: 8px; max-width: 92%; }
        .vlc-msg--user { align-self: flex-end; background: rgba(78,205,196,.14); }
        .vlc-msg--bot  { align-self: flex-start; background: rgba(255,255,255,.05); }
        .vlc-msg--err  { align-self: stretch; background: rgba(255,107,107,.12); color: #ff9b9b; font-size: .74rem; }
        .vlc-msg--streaming::after { content: '▍'; opacity: .6; }
        .vlc-status { padding: 0 .75rem; font-size: .72rem; min-height: 0; }
        .vlc-status--warn { color: #E9C445; padding: .4rem .75rem; }
        .vlc-form { display: flex; gap: .4rem; padding: .5rem .75rem .75rem; border-top: 1px solid var(--color-border, #24304a); }
        .vlc-in {
            flex: 1; resize: none; font: inherit; font-size: .78rem; padding: .4rem .5rem;
            background: var(--bg-primary, #0d1120); color: inherit;
            border: 1px solid var(--color-border, #24304a); border-radius: 6px; outline: none;
        }
        .vlc-send {
            padding: .4rem .8rem; border-radius: 6px; cursor: pointer; font-size: .76rem; font-weight: 700;
            background: #4ecdc4; color: #0a0a18; border: 1px solid #4ecdc4;
        }
        .vlc-send--stop { background: #ff6b6b; border-color: #ff6b6b; color: #fff; }
    `;

    customElements.define('vault-llm-chat', VaultLlmChat);
})();
