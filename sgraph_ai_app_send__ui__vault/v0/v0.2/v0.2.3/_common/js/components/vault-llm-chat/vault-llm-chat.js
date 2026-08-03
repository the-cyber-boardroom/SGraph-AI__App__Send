/* =================================================================================
   SGraph Vault — native LLM chat panel

   "Talk to the files you've picked." Runs at the REAL origin inside the vault UI, so
   it calls OpenRouter directly through SGLlm — no bridge, no sandbox, no postMessage
   streaming. The credential comes from `.vault/llm/config.json` via SGLlmVault
   (owner-sealed by default; a read-only session simply cannot open it).

   Deliberately NOT an agent: no tools, no vault writes, no autonomous loop. It reads
   the files you attached and talks about them. Tool-using agents remain app-side (the
   SG/Vault Workbench is the reference); this is the always-there, zero-setup surface.

   CONTEXT IS AN EXPLICIT SET, NOT "whatever is on screen". The previous version tracked
   the file being viewed and silently swapped context underneath the conversation —
   which broke outright once a file's tab was already open (send-browse's _openFileTab
   returns early on an existing tab, so nothing re-announced the file and the context
   went stale without saying so). Files are now ADDED by an explicit "Add to chat"
   action, listed as removable chips, and the set can be empty (a plain chat).

   Mounted as an sg-layout panel by vault-shell, so it is movable/resizable like every
   other pane. It therefore does NOT manage its own visibility — the layout does.

   API:
     setVault(vault)                    — wire/refresh availability
     addContextFile({path,text,type})   — attach a file (dedup by path)
     removeContextFile(path) / clearContextFiles()
     contextFiles()                     — current set (copy)
     setContextFile({path,text})        — records the file being VIEWED (for the
                                          empty-state hint only; never auto-attaches)
     focusInput() / open() / close()

   Requires: SGLlm, SGLlmConfig, SGLlmVault, VaultLlmLog.
   ================================================================================= */

(function () {
    'use strict';

    var MAX_CONTEXT_CHARS = 24000;   // total budget across ALL attached files
    var MIN_PER_FILE      = 1500;    // never shave a file below this before dropping it
    var MAX_FILES         = 20;
    var MAX_HISTORY_MSGS  = 20;

    var SYSTEM_WITH_FILES =
        'You are a helpful assistant embedded in an encrypted SGraph vault. ' +
        'The user has attached one or more files from that vault; their contents are provided as context. ' +
        'Answer about those files directly and concisely. When several files are attached, be explicit about ' +
        'which file you are referring to. If a file is marked TRUNCATED, say so rather than implying you have ' +
        'read the whole thing. You cannot modify the vault.';

    var SYSTEM_NO_FILES =
        'You are a helpful assistant embedded in an encrypted SGraph vault. ' +
        'No vault files are attached to this conversation, so answer from general knowledge. ' +
        'If the user asks about vault content, tell them to attach a file with "Add to chat". ' +
        'You cannot modify the vault.';

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
            this._files   = [];        // [{ path, text, type, chars }] — the explicit context set
            this._viewing = null;      // last file rendered by the browser (hint only)
            this._history = [];
            this._busy    = false;
            this._abort   = null;
            this._cost    = 0;
            this._calls   = 0;
            this._params  = { temperature: null, topP: null, maxTokens: null };  // null = provider/policy default
        }

        connectedCallback() {
            if (this._built) return;                       // sg-layout re-slots on every re-render
            this._built = true;
            this.shadowRoot.innerHTML =
                '<style>' + VaultLlmChat.styles + '</style>' +
                '<div class="vlc-panel">' +
                  '<div class="vlc-head">' +
                    '<span class="vlc-title">AI Chat</span>' +
                    '<select class="vlc-model-sel" title="Model" hidden></select>' +
                    '<span class="vlc-model"></span>' +
                    '<span class="vlc-cost" title="Session spend — click for the request ledger"></span>' +
                    '<button class="vlc-params" type="button" title="Request parameters">&#9881;</button>' +
                    '<button class="vlc-reqs" type="button" title="Requests &amp; cost ledger">&#129534;</button>' +
                    '<button class="vlc-x" type="button" aria-label="Close">&#10005;</button>' +
                  '</div>' +
                  '<div class="vlc-parambar" hidden>' +
                    '<label title="Sampling temperature. Blank = the provider\'s own default.">temp' +
                      '<input class="vlc-p-temp" type="number" min="0" max="2" step="0.1" placeholder="default"></label>' +
                    '<label title="Nucleus sampling. Blank = the provider\'s own default.">top-p' +
                      '<input class="vlc-p-topp" type="number" min="0" max="1" step="0.05" placeholder="default"></label>' +
                    '<label title="Max tokens in the reply. Capped by the vault policy (Settings → AI models).">max tok' +
                      '<input class="vlc-p-maxtok" type="number" min="1" step="100"></label>' +
                    '<button class="vlc-mini vlc-p-reset" type="button" title="Back to the vault policy defaults">reset</button>' +
                    '<span class="vlc-dim vlc-p-note"></span>' +
                  '</div>' +
                  '<div class="vlc-ctx"></div>' +
                  '<div class="vlc-log" role="log" aria-live="polite"></div>' +
                  '<div class="vlc-status"></div>' +
                  '<form class="vlc-form">' +
                    '<textarea class="vlc-in" rows="2" placeholder="Ask anything — attach files with &quot;Add to chat&quot;…"></textarea>' +
                    '<button class="vlc-send" type="submit">Send</button>' +
                  '</form>' +
                '</div>';

            this.shadowRoot.querySelector('.vlc-x').addEventListener('click', () => this.close());
            this.shadowRoot.querySelector('.vlc-reqs').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('vault-llm-requests-open', { bubbles: true, composed: true }));
            });
            this.shadowRoot.querySelector('.vlc-params').addEventListener('click', () => this.toggleParams());
            ['.vlc-p-temp', '.vlc-p-topp', '.vlc-p-maxtok'].forEach((s) => {
                this.shadowRoot.querySelector(s).addEventListener('change', () => this._readParams());
            });
            this.shadowRoot.querySelector('.vlc-p-reset').addEventListener('click', () => this.resetParams());
            this.shadowRoot.querySelector('.vlc-model-sel').addEventListener('change', (e) => {
                this._model = e.target.value || null;
                this._renderHead();
            });
            this.shadowRoot.querySelector('.vlc-form').addEventListener('submit', (e) => {
                e.preventDefault();
                if (this._busy) { this._stop(); return; }
                this._send();
            });
            // Enter sends, Shift+Enter newlines — the convention every chat surface uses.
            this.shadowRoot.querySelector('.vlc-in').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!this._busy) this._send(); }
            });
            // Chip removal + clear-all (delegated: chips are re-rendered constantly).
            this.shadowRoot.querySelector('.vlc-ctx').addEventListener('click', (e) => {
                const del = e.target.closest('[data-del]');
                if (del) { this.removeContextFile(del.getAttribute('data-del')); return; }
                if (e.target.closest('.vlc-clear')) this.clearContextFiles();
                if (e.target.closest('.vlc-add-viewing') && this._viewing) this.addContextFile(this._viewing);
            });

            this._renderCtx();
            this._renderHead();
            this._renderStatus();
        }

        async setVault(vault) {
            this._vault   = vault;
            this._session = null;
            this._models  = null;
            this._model   = null;
            if (!vault) return;
            try { this._session = await SGLlmVault.open(vault); } catch (_) { this._session = null; }
            if (this._session && this._session.ok) this._model = this._session.model || null;
            this._renderHead();
            this._renderStatus();
        }

        // Model list, fetched once and filtered by the admin's allow-list. Lazy: only on
        // first open, so merely having a key configured costs no network.
        async _ensureModels() {
            if (this._models) return this._models;
            const s = this._session;
            if (!s || !s.ok) return [];
            this._models = [];                       // set first: prevents a re-entrant refetch
            try {
                const all = await s.client.models();
                this._models = all.map((m) => m && m.id)
                                  .filter((id) => id && SGLlmConfig.modelAllowed(s.policy, id))
                                  .sort();
            } catch (_) { this._models = []; }
            return this._models;
        }

        async _refreshModels() {
            const s = this._session;
            if (!s || !s.ok) return;
            const ids = await this._ensureModels();
            const sel = this.shadowRoot.querySelector('.vlc-model-sel');

            // Resolve a model even when the admin left `models.default` empty — that is
            // exactly the state that used to send {model:null} and earn a remote 404.
            const chosen = this._model || SGLlmConfig.pickModel(s.policy, ids);
            const autoPicked = !this._model && !s.model && !!chosen;
            this._model = chosen;

            if (sel && ids.length) {
                sel.innerHTML = ids.map((id) =>
                    '<option value="' + esc(id) + '"' + (id === chosen ? ' selected' : '') + '>' + esc(id) + '</option>').join('');
                sel.hidden = false;
            }
            if (!chosen) {
                this._setStatus('No usable model — the vault\'s allow-list matches nothing available on this key.', 'warn');
            } else if (autoPicked) {
                // Never switch models silently: say which one, and where to make it stick.
                this._setStatus('Using ' + chosen + ' (no default set — choose one in Settings → AI models to make it permanent).', 'info');
            }
            this._renderHead();
        }

        // ── context set ──────────────────────────────────────────────────────────
        // Explicit, additive, de-duplicated by path. Re-adding a path REPLACES its text,
        // so "Add to chat" on a file you just edited refreshes the copy the model sees.
        addContextFile(f) {
            if (!f || !f.path) return { added: false, reason: 'nofile' };
            if (this._files.length >= MAX_FILES && !this._files.some((x) => x.path === f.path)) {
                this._setStatus('Attachment limit reached (' + MAX_FILES + ' files). Remove one first.', 'warn');
                return { added: false, reason: 'limit' };
            }
            const rec = {
                path : f.path,
                text : (f.text == null) ? null : String(f.text),
                type : f.type || null,
                chars: (f.text == null) ? 0 : String(f.text).length
            };
            const i = this._files.findIndex((x) => x.path === rec.path);
            const replaced = i >= 0;
            if (replaced) this._files[i] = rec; else this._files.push(rec);
            this._renderCtx();
            if (rec.text == null) {
                this._setStatus('"' + rec.path + '" is binary — attached as a filename only, its bytes are not sent.', 'info');
            } else {
                this._setStatus('');
            }
            return { added: true, replaced: replaced };
        }

        removeContextFile(path) {
            const n = this._files.length;
            this._files = this._files.filter((x) => x.path !== path);
            if (this._files.length !== n) this._renderCtx();
        }

        clearContextFiles() { this._files = []; this._renderCtx(); }

        contextFiles() { return this._files.map((f) => ({ path: f.path, type: f.type, chars: f.chars })); }

        // The file currently on screen. Recorded ONLY so the empty state can offer a
        // one-click "add the file you're looking at" — it never attaches by itself.
        setContextFile(ctx) {
            this._viewing = (ctx && ctx.path) ? ctx : null;
            if (!this._files.length) this._renderCtx();
        }

        isAvailable() { return !!(this._session && this._session.ok); }

        // ── request parameters ───────────────────────────────────────────────────
        // Per-session overrides on top of the vault policy. Blank means "the provider's
        // own default" — deliberately NOT a hard-coded 0.7, because silently pinning a
        // temperature is the kind of invisible behaviour change that makes two vaults
        // answer differently for no stated reason. maxTokens is CLAMPED to the policy:
        // a per-session control must never be a way around the vault's spend ceiling.
        _policyMaxTokens() {
            const s = this._session;
            if (!s || !s.policy) return null;
            const l = SGLlmConfig.limitsFor(s.policy, null);
            return l.maxTokensPerCall || null;
        }

        _readParams() {
            const num = (sel) => {
                const raw = (this.shadowRoot.querySelector(sel).value || '').trim();
                if (raw === '') return null;
                const n = Number(raw);
                return isFinite(n) ? n : null;
            };
            const cap = this._policyMaxTokens();
            let maxTok = num('.vlc-p-maxtok');
            let clamped = false;
            if (maxTok != null && cap && maxTok > cap) { maxTok = cap; clamped = true; }
            if (maxTok != null && maxTok < 1) maxTok = 1;

            this._params = {
                temperature: num('.vlc-p-temp'),
                topP       : num('.vlc-p-topp'),
                maxTokens  : maxTok
            };
            this._renderParams(clamped);
        }

        resetParams() {
            this._params = { temperature: null, topP: null, maxTokens: null };
            this.shadowRoot.querySelector('.vlc-p-temp').value   = '';
            this.shadowRoot.querySelector('.vlc-p-topp').value   = '';
            this.shadowRoot.querySelector('.vlc-p-maxtok').value = '';
            this._renderParams(false);
        }

        toggleParams(force) {
            const bar = this.shadowRoot.querySelector('.vlc-parambar');
            bar.hidden = (force === undefined) ? !bar.hidden : !force;
            if (!bar.hidden) this._renderParams(false);
        }

        _renderParams(clamped) {
            const p    = this._params || {};
            const cap  = this._policyMaxTokens();
            const note = this.shadowRoot.querySelector('.vlc-p-note');
            const box  = this.shadowRoot.querySelector('.vlc-p-maxtok');
            if (box && !box.value && cap) box.placeholder = String(cap);   // show what will be sent
            if (!note) return;
            const parts = [];
            if (p.temperature != null) parts.push('temp ' + p.temperature);
            if (p.topP        != null) parts.push('top-p ' + p.topP);
            parts.push('max ' + (p.maxTokens != null ? p.maxTokens : (cap || 'provider default')));
            note.textContent = (clamped ? 'capped by policy · ' : '') + parts.join(' · ');
            note.className = 'vlc-dim vlc-p-note' + (clamped ? ' vlc-warn' : '');
        }

        // Visibility belongs to sg-layout now; open() just readies + focuses.
        open() {
            // Availability is resolved once, at vault-open. If it failed then — the config
            // was unreadable, or a key has been added in Settings since — re-resolve now.
            // Otherwise a vault that DOES have a key keeps insisting it has none until a
            // full page reload, which is exactly how the lazy-subtree bug presented.
            if (this._vault && !this.isAvailable()) {
                this.setVault(this._vault).then(() => this._refreshModels());
            } else {
                this._refreshModels();                   // lazy: first open only
            }
            this._renderHead(); this._renderStatus();
            this.focusInput();
        }
        focusInput() { setTimeout(() => this.shadowRoot.querySelector('.vlc-in')?.focus(), 0); }
        close() { this.dispatchEvent(new CustomEvent('vault-llm-close', { bubbles: true, composed: true })); }

        // ── rendering ────────────────────────────────────────────────────────────
        _renderHead() {
            const m = this.shadowRoot.querySelector('.vlc-model');
            const c = this.shadowRoot.querySelector('.vlc-cost');
            const sel = this.shadowRoot.querySelector('.vlc-model-sel');
            if (!m || !c) return;
            // The <select> is the model display once it is populated; the text span is the
            // fallback for the pre-fetch moment (and when /models is unreachable).
            m.textContent = (sel && !sel.hidden) ? '' : (this._model || '');
            c.textContent = this._calls ? ('~$' + this._cost.toFixed(4) + ' · ' + this._calls + ' calls') : '';
        }

        _renderCtx() {
            const el = this.shadowRoot.querySelector('.vlc-ctx');
            if (!el) return;

            if (!this._files.length) {
                el.innerHTML =
                    '<span class="vlc-dim">No files attached — this is a plain chat. ' +
                    'Open a file and click <strong>➕ Add to chat</strong> to give the model context.</span>' +
                    (this._viewing
                        ? ' <button class="vlc-mini vlc-add-viewing" type="button">➕ Add ' + esc(this._viewing.path) + '</button>'
                        : '');
                return;
            }

            const total = this._files.reduce((n, f) => n + f.chars, 0);
            const over  = total > MAX_CONTEXT_CHARS;
            el.innerHTML =
                this._files.map((f) =>
                    '<span class="vlc-chip' + (f.text == null ? ' vlc-chip--bin' : '') + '">' +
                        '📄 ' + esc(f.path) +
                        '<span class="vlc-chip__n">' + (f.text == null ? 'binary' : f.chars.toLocaleString()) + '</span>' +
                        '<button class="vlc-chip__x" type="button" data-del="' + esc(f.path) + '" ' +
                                'title="Remove from chat" aria-label="Remove ' + esc(f.path) + '">✕</button>' +
                    '</span>').join('') +
                '<span class="vlc-dim vlc-ctxsum"> ' + this._files.length + ' file' + (this._files.length > 1 ? 's' : '') +
                    ' · ' + total.toLocaleString() + ' chars' +
                    (over ? ' <span class="vlc-warn">(trimmed to ' + MAX_CONTEXT_CHARS.toLocaleString() + ' total)</span>' : '') +
                '</span>' +
                '<button class="vlc-mini vlc-clear" type="button" title="Remove all attached files">clear all</button>';
        }

        _setStatus(msg, type) {
            const el = this.shadowRoot.querySelector('.vlc-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className   = 'vlc-status' + (type ? ' vlc-status--' + type : '');
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

        // Every attached file rides as its own system message, sharing one character
        // budget. Splitting evenly (rather than first-come-first-served) means adding a
        // huge file cannot silently starve the small one you actually asked about; each
        // slice is labelled TRUNCATED by buildFileContext so the model never pretends.
        _contextMessages() {
            const withText = this._files.filter((f) => f.text != null);
            if (!withText.length) return [];
            let per = Math.floor(MAX_CONTEXT_CHARS / withText.length);
            if (per < MIN_PER_FILE) per = MIN_PER_FILE;
            return withText.map((f) => ({
                role: 'system',
                content: SGLlm.buildFileContext({ path: f.path, content: f.text, maxChars: per }).text
            }));
        }

        // ── the call ─────────────────────────────────────────────────────────────
        async _send() {
            const inEl = this.shadowRoot.querySelector('.vlc-in');
            const q    = (inEl.value || '').trim();
            if (!q) return;
            if (!this.isAvailable()) { this._renderStatus(); return; }

            const s = this._session;
            // Resolve a model before spending a turn. Without this the request went out as
            // {model:null} and OpenRouter answered `404 No endpoints found for .`
            if (!this._model) {
                await this._refreshModels();
                if (!this._model) {
                    this._push('err', 'No model selected. Set a default in Settings → AI models, or widen the allowed-models list.');
                    return;
                }
            }
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

            const ctxMsgs = this._contextMessages();
            const msgs = [{ role: 'system', content: ctxMsgs.length ? SYSTEM_WITH_FILES : SYSTEM_NO_FILES }];
            msgs.push.apply(msgs, ctxMsgs);
            msgs.push.apply(msgs, this._history.slice(-MAX_HISTORY_MSGS));

            // Ledger entry is created at SEND time so an in-flight or failed call is
            // still visible in the requests pane (and so cost can never be silently lost).
            const rec = (globalThis.VaultLlmLog || null) && VaultLlmLog.add({
                model      : this._model,
                files      : this._files.map((f) => f.path),
                promptChars: msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0),
                status     : 'pending'
            });

            const bubble = this._push('bot', '');
            bubble.classList.add('vlc-msg--streaming');
            this._abort = new AbortController();
            this._setBusy(true);

            let acc = '', last = 0;
            try {
                const p = this._params || {};
                const res = await s.client.chat(
                    {
                        model      : this._model,
                        messages   : msgs,
                        maxTokens  : p.maxTokens || limits.maxTokensPerCall || undefined,
                        temperature: (p.temperature != null) ? p.temperature : undefined,
                        topP       : (p.topP        != null) ? p.topP        : undefined
                    },
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
                if (rec) VaultLlmLog.update(rec.key, this._ledgerPatch(res));

                // Authoritative cost lands a beat later; refresh the pill when it does.
                s.client.reconcileCost(res).then((upgraded) => {
                    if (upgraded) {
                        this._recost(res);
                        this._renderHead();
                        if (rec) VaultLlmLog.update(rec.key, this._ledgerPatch(res));
                    }
                });
            } catch (err) {
                bubble.classList.remove('vlc-msg--streaming');
                const aborted = err && err.name === 'AbortError';
                if (aborted) { bubble.textContent = (acc || '') + '\n— stopped —'; }
                else {
                    bubble.remove();
                    this._push('err', (err && err.message) || 'Request failed');
                }
                if (rec) VaultLlmLog.update(rec.key, {
                    status: aborted ? 'aborted' : 'error',
                    error : aborted ? null : ((err && err.message) || 'Request failed')
                });
            } finally {
                this._abort = null;
                this._setBusy(false);
                this._renderHead();
            }
        }

        _ledgerPatch(res) {
            const eff = SGLlm.effectiveCost(res);
            return {
                id        : res.id || null,
                model     : res.model || this._model,
                status    : res.aborted ? 'aborted' : 'ok',
                usage     : res.usage || {},
                cost      : (eff.value != null) ? eff.value : null,
                costSource: eff.source,
                estimated : eff.estimated,
                latencyMs : res.latencyMs || null
            };
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
        :host { display: block; height: 100%; min-height: 0; }
        .vlc-panel {
            display: flex; flex-direction: column; height: 100%;
            background: var(--bg-secondary, #131a2b); color: var(--color-text, #e2e8f0);
            box-sizing: border-box; min-height: 0;
        }
        .vlc-head {
            display: flex; align-items: center; gap: .5rem; padding: .5rem .75rem;
            border-bottom: 1px solid var(--color-border, #24304a);
        }
        .vlc-title { font-weight: 700; font-size: .82rem; }
        .vlc-model-sel {
            font-family: var(--font-mono, monospace); font-size: .66rem; max-width: 11rem;
            background: var(--bg-primary, #0d1120); color: inherit;
            border: 1px solid var(--color-border, #24304a); border-radius: 4px; padding: .1rem .2rem;
        }
        .vlc-model { font-family: var(--font-mono, monospace); font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); }
        .vlc-cost  { margin-left: auto; font-family: var(--font-mono, monospace); font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); }
        .vlc-params, .vlc-reqs, .vlc-x { background: none; border: none; color: inherit; cursor: pointer; font-size: .8rem; opacity: .7; padding: 0 .1rem; }
        .vlc-params:hover, .vlc-reqs:hover, .vlc-x:hover { opacity: 1; }
        .vlc-parambar {
            display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
            padding: .4rem .75rem; font-size: .66rem;
            border-bottom: 1px solid var(--color-border, #24304a);
            color: var(--color-text-secondary, #9aa4bf);
        }
        .vlc-parambar[hidden] { display: none; }
        .vlc-parambar label { display: inline-flex; align-items: center; gap: .25rem; }
        .vlc-parambar input {
            width: 4.5rem; font: inherit; font-size: .66rem; padding: .1rem .25rem;
            background: var(--bg-primary, #0d1120); color: var(--color-text, #e2e8f0);
            border: 1px solid var(--color-border, #24304a); border-radius: 4px;
        }
        .vlc-p-note { margin-left: auto; font-family: var(--font-mono, monospace); }
        .vlc-ctx {
            padding: .4rem .75rem; font-size: .7rem; border-bottom: 1px solid var(--color-border, #24304a);
            display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; max-height: 6.5rem; overflow-y: auto;
        }
        .vlc-chip {
            display: inline-flex; align-items: center; gap: .3rem;
            font-family: var(--font-mono, monospace); background: rgba(78,205,196,.12);
            color: #4ecdc4; border-radius: 4px; padding: .1rem .2rem .1rem .4rem; max-width: 100%;
        }
        .vlc-chip--bin { background: rgba(233,196,69,.12); color: #E9C445; }
        .vlc-chip__n { opacity: .65; font-size: .62rem; }
        .vlc-chip__x {
            background: none; border: none; color: inherit; cursor: pointer;
            font-size: .62rem; opacity: .6; padding: 0 .15rem; line-height: 1;
        }
        .vlc-chip__x:hover { opacity: 1; color: #ff6b6b; }
        .vlc-mini {
            background: none; border: 1px solid var(--color-border, #24304a); border-radius: 4px;
            color: var(--color-text-secondary, #9aa4bf); cursor: pointer; font: inherit; font-size: .64rem;
            padding: .1rem .35rem;
        }
        .vlc-mini:hover { color: var(--color-text, #e2e8f0); border-color: #4ecdc4; }
        .vlc-ctxsum { margin-left: auto; }
        .vlc-warn { color: #E9C445; }
        .vlc-dim { color: var(--color-text-secondary, #9aa4bf); }
        .vlc-log { flex: 1; overflow-y: auto; padding: .75rem; display: flex; flex-direction: column; gap: .5rem; min-height: 0; }
        .vlc-msg { white-space: pre-wrap; word-break: break-word; font-size: .8rem; line-height: 1.5; padding: .45rem .6rem; border-radius: 8px; max-width: 92%; }
        .vlc-msg--user { align-self: flex-end; background: rgba(78,205,196,.14); }
        .vlc-msg--bot  { align-self: flex-start; background: rgba(255,255,255,.05); }
        .vlc-msg--err  { align-self: stretch; background: rgba(255,107,107,.12); color: #ff9b9b; font-size: .74rem; }
        .vlc-msg--streaming::after { content: '▍'; opacity: .6; }
        .vlc-status { padding: 0 .75rem; font-size: .72rem; min-height: 0; }
        .vlc-status--warn { color: #E9C445; padding: .4rem .75rem; }
        .vlc-status--info { color: var(--color-text-secondary, #9aa4bf); padding: .4rem .75rem; }
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
