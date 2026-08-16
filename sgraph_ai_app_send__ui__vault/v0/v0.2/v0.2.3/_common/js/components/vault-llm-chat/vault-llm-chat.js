/* =================================================================================
   SGraph Vault — native LLM chat panel

   "Talk to the files you've picked." Runs at the REAL origin inside the vault UI, so
   it calls OpenRouter directly through SGLlm — no bridge, no sandbox, no postMessage
   streaming. The credential comes from `.vault/llm/config.json` via SGLlmVault
   (owner-sealed by default; a read-only session simply cannot open it).

   TOOLS ARE OPT-IN AND COMMITTED (B1, 2026-08-06). By default this is still not an
   agent — no tools, no writes; the model sees only attached files and pasted images.
   Enabling a group in the 🔧 bar commits a grant to /.vault/llm/tools.json (that file's
   history is the privilege audit log) and turns on a bounded tool loop: READ-tier tools
   only, results fenced as untrusted data, every round on the VaultLlmLog ledger, and
   `.vault/**` structurally unreachable — including the grants file itself.

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

   Requires: SGLlm, SGLlmConfig, SGLlmVault, VaultLlmLog. Optional: SGLlmTools (the 🔧
   bar renders a not-loaded note without it), SGVision, SGVoice.
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
            this._images  = [];        // [{ data, mime, bytes, name }] — pasted/dropped screenshots
            this._viewing = null;      // last file rendered by the browser (hint only)
            this._history = [];
            this._busy    = false;
            this._abort   = null;
            this._cost    = 0;
            this._calls   = 0;
            this._params  = { temperature: null, topP: null, maxTokens: null };  // null = provider/policy default
            this._grants  = null;      // parsed .vault/llm/tools.json — null until loaded; all-off by default
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
                    '<button class="vlc-tools" type="button" title="Vault tools — what the model may do here">&#128295;</button>' +
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
                  '<div class="vlc-toolbar" hidden></div>' +
                  '<div class="vlc-ctx"></div>' +
                  '<div class="vlc-log" role="log" aria-live="polite"></div>' +
                  '<div class="vlc-status"></div>' +
                  '<form class="vlc-form">' +
                    '<textarea class="vlc-in" rows="2" placeholder="Ask anything — paste a screenshot, or attach files with &quot;Add to chat&quot;…"></textarea>' +
                    '<button class="vlc-mic" type="button" title="Ask by voice">&#127908;</button>' +
                    '<button class="vlc-send" type="submit">Send</button>' +
                  '</form>' +
                '</div>';

            this.shadowRoot.querySelector('.vlc-x').addEventListener('click', () => this.close());
            this.shadowRoot.querySelector('.vlc-reqs').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('vault-llm-requests-open', { bubbles: true, composed: true }));
            });
            this.shadowRoot.querySelector('.vlc-params').addEventListener('click', () => this.toggleParams());
            this.shadowRoot.querySelector('.vlc-tools').addEventListener('click', () => this.toggleTools());
            this.shadowRoot.querySelector('.vlc-mic').addEventListener('click', () => this.toggleVoice());

            // Paste a screenshot straight into the composer. The clipboard also carries a
            // text/plain flavour for most copies, so we only claim the event when it
            // actually holds image FILES — otherwise pasting text would stop working.
            const inEl = this.shadowRoot.querySelector('.vlc-in');
            inEl.addEventListener('paste', (e) => {
                if (typeof SGVision === 'undefined') return;
                const imgs = SGVision.imagesFromEvent(e);
                if (!imgs.length) return;                  // ordinary text paste — leave it alone
                e.preventDefault();
                this.addImages(imgs);
            });
            // Drop anywhere on the panel: aiming at a small textarea is a needless chore.
            const panel = this.shadowRoot.querySelector('.vlc-panel');
            panel.addEventListener('dragover', (e) => {
                if (typeof SGVision === 'undefined') return;
                if (!Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files')) return;
                e.preventDefault();
                panel.classList.add('vlc-panel--drop');
            });
            panel.addEventListener('dragleave', () => panel.classList.remove('vlc-panel--drop'));
            panel.addEventListener('drop', (e) => {
                panel.classList.remove('vlc-panel--drop');
                if (typeof SGVision === 'undefined') return;
                const imgs = SGVision.imagesFromEvent(e);
                if (!imgs.length) return;
                e.preventDefault();
                this.addImages(imgs);
            });
            ['.vlc-p-temp', '.vlc-p-topp', '.vlc-p-maxtok'].forEach((s) => {
                this.shadowRoot.querySelector(s).addEventListener('change', () => this._readParams());
            });
            this.shadowRoot.querySelector('.vlc-p-reset').addEventListener('click', () => this.resetParams());
            this.shadowRoot.querySelector('.vlc-model-sel').addEventListener('change', (e) => {
                this._model = e.target.value || null;
                this._renderHead();
                // The auto-pick notice ("Using X — no default set") names a model that is no
                // longer in use the instant the picker changes. Leaving it up is a status
                // line that contradicts the control right above it.
                this._setStatus('');
                // …and re-check: switching TO a text-only model with an image attached must
                // say so now, not at send time.
                this._warnIfModelCannotSee();
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
                const delImg = e.target.closest('[data-delimg]');
                if (delImg) { this.removeImage(Number(delImg.getAttribute('data-delimg'))); return; }
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
            this._grants  = null;
            if (!vault) return;
            try { this._session = await SGLlmVault.open(vault); } catch (_) { this._session = null; }
            // Grants load lazily and never block the chat: a vault with no tools.json is
            // simply a chat with no tools — today's behaviour, verbatim.
            if (typeof SGLlmTools !== 'undefined') {
                SGLlmTools.loadGrants(vault).then((g) => { this._grants = g; this._renderTools(); })
                                            .catch(() => { this._grants = SGLlmTools.parseGrants(null); });
            }
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
                // Keep the RAW entries too: `architecture.modality` is where "can this model
                // read an image?" actually lives, and reading it beats maintaining a list
                // that goes stale every time a provider ships a model.
                this._modelMeta = all.filter((m) => m && m.id && SGLlmConfig.modelAllowed(s.policy, m.id));
                this._models = this._modelMeta.map((m) => m.id).sort();
            } catch (_) { this._models = []; this._modelMeta = null; }
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

        // ── images ───────────────────────────────────────────────────────────────
        // Attached to the NEXT message only, then cleared. A screenshot is a thing you are
        // asking about now, not standing context like a file — leaving it attached would
        // re-send (and re-bill) it on every subsequent turn without the user noticing.
        async addImages(files) {
            if (typeof SGVision === 'undefined') { this._setStatus('Image support is not loaded on this page.', 'warn'); return; }
            const list = Array.from(files || []);
            for (const f of list) {
                if (this._images.length >= SGVision.MAX_IMAGES) {
                    this._setStatus('Image limit reached (' + SGVision.MAX_IMAGES + ' per message).', 'warn');
                    break;
                }
                try {
                    this._images.push(await SGVision.readImage(f));
                } catch (err) {
                    this._setStatus((err && err.message) || 'Could not read that image.', 'warn');
                }
            }
            this._renderCtx();
            this._warnIfModelCannotSee();
            this.focusInput();
        }

        removeImage(i) {
            if (i >= 0 && i < this._images.length) { this._images.splice(i, 1); this._renderCtx(); }
        }

        clearImages() { this._images = []; this._renderCtx(); }

        images() { return this._images.map((im) => ({ name: im.name, mime: im.mime, bytes: im.bytes })); }

        // Say it BEFORE the send, not after the provider does. A text-only model answers an
        // image with a 400 that names nothing — the same failure mode that made voice look
        // broken. Warn, don't block: the user can switch model from the picker right here.
        _warnIfModelCannotSee() {
            if (!this._images.length || typeof SGVision === 'undefined') return true;
            const m = this._model;
            if (!m) return true;                       // nothing chosen yet — _send resolves one
            if (SGVision.supportsImages(m, this._modelMeta)) return true;
            const alt = SGVision.visionModelsIn(this._modelMeta).filter(
                (id) => !this._session || SGLlmConfig.modelAllowed(this._session.policy, id)).slice(0, 3);
            this._setStatus(m + ' cannot read images.' +
                (alt.length ? ' Try ' + alt.join(', ') + '.' : ' Pick a vision model in the picker above.'), 'warn');
            return false;
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

        // ── voice input ──────────────────────────────────────────────────────────
        // This panel runs at the REAL origin (it is vault chrome, not a sandboxed app
        // frame), so it can hold the microphone directly — no bridge needed. Transcription
        // goes through the SAME SGVoice.transcribeWith used by sg.llm.listen, so budget,
        // model policy and the request ledger are identical on both surfaces.
        async toggleVoice() {
            if (this._recording) return this._stopVoice(false);
            if (typeof SGVoice === 'undefined') { this._setStatus('Voice capture is not loaded on this page.', 'warn'); return; }
            if (!this.isAvailable()) { this._renderStatus(); return; }

            const av = SGVoice.available();
            if (!av.ok) {
                this._setStatus(av.reason === 'EINSECURE'
                    ? 'Voice needs a secure (https) page.'
                    : 'No microphone available on this device or browser.', 'warn');
                return;
            }
            try {
                this._recSession = await SGVoice.start();
            } catch (err) {
                // Most often the browser permission prompt was dismissed.
                this._setStatus('Could not start recording: ' + ((err && err.message) || err), 'warn');
                return;
            }
            this._recording  = true;
            this._recStarted = Date.now();
            this._renderMic();
            this._recTimer = setInterval(() => this._renderMic(), 500);
        }

        async _stopVoice(cancelled) {
            if (!this._recording) return;
            this._recording = false;
            clearInterval(this._recTimer);
            const session = this._recSession;
            this._recSession = null;
            this._renderMic();

            if (cancelled) {
                // Releasing the device matters more than the transcript — never leave the
                // microphone open just because the user changed their mind.
                try { await SGVoice.cancel(session); } catch (_) {}
                this._setStatus('');
                return;
            }
            this._setStatus('Transcribing…', 'info');
            try {
                const audio = await SGVoice.stop(session);
                // No model passed on purpose: the composer's picker chooses the model that
                // ANSWERS, which is rarely one that accepts audio. SGVoice picks a
                // transcription model; the answer still comes from `this._model`.
                const out  = await SGVoice.transcribeWith(this._session, audio, {});
                // Trim here too rather than trusting the caller's contract: a whitespace-only
                // reply would otherwise send an empty message and spend a second call on it.
                const text = String((out && out.text) || '').trim();
                if (!text) { this._setStatus('Nothing was heard — try again closer to the mic.', 'warn'); return; }
                this._setStatus('');
                const inEl = this.shadowRoot.querySelector('.vlc-in');
                inEl.value = text;              // visible before it goes, so a misheard word is obvious
                this._send();
            } catch (err) {
                this._setStatus('Voice failed: ' + ((err && err.message) || err), 'warn');
            }
        }

        _renderMic() {
            const btn = this.shadowRoot.querySelector('.vlc-mic');
            if (!btn) return;
            btn.classList.toggle('vlc-mic--rec', this._recording);
            if (!this._recording) {
                btn.innerHTML = '&#127908;';
                btn.title = 'Ask by voice';
                if (!this._busy) this._setStatus('');
                return;
            }
            const secs = Math.floor((Date.now() - this._recStarted) / 1000);
            btn.textContent = '■ ' + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
            btn.title = 'Stop and send';
            // The mic being live is never left to a small icon state alone.
            this._setStatus('● Recording — your microphone is on. Tap ■ to stop and send.', 'rec');
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
        // The HOST surface's spend, read from the ledger (app: null = the host's own
        // calls). The ledger is module-global, so the figure SURVIVES the panel being
        // closed and re-mounted — the old `this._cost`/`this._calls` were instance state
        // that reset to zero on every remount, which made the vault policy's session
        // caps evadable by simply reopening the pane (08/16 review, B1). The instance
        // counters remain only as a fallback for pages without VaultLlmLog.
        _hostTotals() {
            if (globalThis.VaultLlmLog) {
                const t = VaultLlmLog.totals(null);
                return { cost: t.totalCost, calls: t.calls, pending: t.pending, estimated: t.estimatedCost > 0 };
            }
            return { cost: this._cost, calls: this._calls, pending: 0, estimated: true };
        }

        _renderHead() {
            const m = this.shadowRoot.querySelector('.vlc-model');
            const c = this.shadowRoot.querySelector('.vlc-cost');
            const sel = this.shadowRoot.querySelector('.vlc-model-sel');
            if (!m || !c) return;
            // The <select> is the model display once it is populated; the text span is the
            // fallback for the pre-fetch moment (and when /models is unreachable).
            m.textContent = (sel && !sel.hidden) ? '' : (this._model || '');
            const t = this._hostTotals();
            c.textContent = t.calls
                ? ((t.estimated ? '~' : '') + '$' + t.cost.toFixed(4) + ' · ' + t.calls + ' calls' + (t.pending ? ' …' : ''))
                : '';
        }

        _renderCtx() {
            const el = this.shadowRoot.querySelector('.vlc-ctx');
            if (!el) return;

            // Image chips carry a thumbnail: a screenshot is identified by what it LOOKS
            // like, and "pasted-image.png ✕" tells the user nothing about which one it is.
            const imgHtml = this._images.map((im, i) =>
                '<span class="vlc-chip vlc-chip--img" title="' + esc(im.name) + '">' +
                    '<img class="vlc-thumb" alt="" src="' + esc(SGVision.dataUrl(im)) + '">' +
                    '<span class="vlc-chip__n">' + Math.max(1, Math.round(im.bytes / 1024)) + ' KB</span>' +
                    '<button class="vlc-chip__x" type="button" data-delimg="' + i + '" ' +
                            'title="Remove this image" aria-label="Remove image ' + (i + 1) + '">✕</button>' +
                '</span>').join('');
            // Stated, because it is genuinely surprising otherwise: the image goes with the
            // NEXT message and is then gone, unlike a file which stays attached.
            const imgNote = this._images.length
                ? '<span class="vlc-dim vlc-ctxsum"> ' + this._images.length + ' image' +
                  (this._images.length > 1 ? 's' : '') + ' · sent with your next message only</span>'
                : '';

            if (!this._files.length) {
                el.innerHTML = imgHtml + (this._images.length ? imgNote :
                    '<span class="vlc-dim">No files attached — this is a plain chat. ' +
                    'Open a file and click <strong>➕ Add to chat</strong> to give the model context, ' +
                    'or paste a screenshot.</span>' +
                    (this._viewing
                        ? ' <button class="vlc-mini vlc-add-viewing" type="button">➕ Add ' + esc(this._viewing.path) + '</button>'
                        : ''));
                return;
            }

            const total    = this._files.reduce((n, f) => n + f.chars, 0);
            const over     = total > MAX_CONTEXT_CHARS;
            const nText    = this._files.filter((f) => f.text != null).length;
            const nExcluded = Math.max(0, nText - this._contextCapacity());
            el.innerHTML = imgHtml + imgNote +
                this._files.map((f) =>
                    '<span class="vlc-chip' + (f.text == null ? ' vlc-chip--bin' : '') + '">' +
                        '📄 ' + esc(f.path) +
                        '<span class="vlc-chip__n">' + (f.text == null ? 'binary' : f.chars.toLocaleString()) + '</span>' +
                        '<button class="vlc-chip__x" type="button" data-del="' + esc(f.path) + '" ' +
                                'title="Remove from chat" aria-label="Remove ' + esc(f.path) + '">✕</button>' +
                    '</span>').join('') +
                '<span class="vlc-dim vlc-ctxsum"> ' + this._files.length + ' file' + (this._files.length > 1 ? 's' : '') +
                    ' · ' + total.toLocaleString() + ' chars' +
                    (nExcluded ? ' <span class="vlc-warn">(' + nExcluded + ' file' + (nExcluded > 1 ? 's' : '') + ' won\'t fit — remove some)</span>'
                               : (over ? ' <span class="vlc-warn">(trimmed to ' + MAX_CONTEXT_CHARS.toLocaleString() + ' total)</span>' : '')) +
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

        _push(role, text, images) {
            const log = this.shadowRoot.querySelector('.vlc-log');
            const div = document.createElement('div');
            div.className = 'vlc-msg vlc-msg--' + role;
            div.textContent = text;
            // The transcript shows what was actually sent. A message that reads "what is
            // wrong here?" with no picture above it is a transcript that lies about the
            // conversation — and about what the call was billed for.
            if (images && images.length) {
                const strip = document.createElement('div');
                strip.className = 'vlc-msg__imgs';
                images.forEach((im) => {
                    const t = document.createElement('img');
                    t.className = 'vlc-thumb vlc-thumb--sent';
                    t.alt = im.name || 'attached image';
                    t.src = SGVision.dataUrl(im);
                    strip.appendChild(t);
                });
                div.appendChild(strip);
            }
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
            let per      = Math.floor(MAX_CONTEXT_CHARS / withText.length);
            let included = withText, excluded = [];
            if (per < MIN_PER_FILE) {
                // Splitting below MIN_PER_FILE gives every file a useless sliver — worse,
                // the old code raised `per` back to the floor and quietly OVERSHOT the
                // stated budget by up to 25% (B4). Keep whole files at the floor size and
                // exclude the rest, saying so to both the user (chip row) and the model.
                const k  = Math.max(1, Math.floor(MAX_CONTEXT_CHARS / MIN_PER_FILE));
                included = withText.slice(0, k);
                excluded = withText.slice(k);
                per      = MIN_PER_FILE;
            }
            const msgs = included.map((f) => ({
                role: 'system',
                content: SGLlm.buildFileContext({ path: f.path, content: f.text, maxChars: per }).text
            }));
            if (excluded.length) {
                msgs.push({ role: 'system',
                    content: 'NOTE: ' + excluded.length + ' more attached file(s) did NOT fit the shared context budget and their contents are NOT included: ' +
                             excluded.map((f) => f.path).join(', ') +
                             '. If the user asks about these, say you cannot see them and suggest detaching other files first.' });
            }
            return msgs;
        }

        // How many text files actually fit the budget — the chip row uses this to warn.
        _contextCapacity() { return Math.max(1, Math.floor(MAX_CONTEXT_CHARS / MIN_PER_FILE)); }

        // One LLM request: its own ledger entry, its own streaming bubble, its own cost
        // accrual. The tool loop calls this per round, so nothing about a tool-using turn
        // is invisible in the requests pane.
        async _chatOnce(msgs, tools, meta) {
            const s      = this._session;
            const limits = SGLlmConfig.limitsFor(s.policy, null);
            // Re-checked EVERY call, not once per turn: a tool turn makes up to 9 calls,
            // and a cap checked only at the door lets rounds 2..9 spend past it (B5).
            const spent = this._hostTotals();
            if ((limits.maxCallsPerSession && spent.calls >= limits.maxCallsPerSession) ||
                (limits.maxCostPerSession  && spent.cost  >= limits.maxCostPerSession)) {
                throw Object.assign(new Error('Session budget reached mid-turn — answered with what was gathered. Raise the caps in Settings → AI models.'), { code: 'EBUDGET' });
            }
            const pc     = (typeof SGVision !== 'undefined') ? SGVision.promptChars(msgs)
                                                             : { chars: 0, images: 0 };
            const rec = (globalThis.VaultLlmLog || null) && VaultLlmLog.add({
                model      : this._model,
                files      : (meta && meta.files) || [],
                promptChars: pc.chars,
                images     : (meta && meta.images) || 0,
                status     : 'pending'
            });

            const bubble = this._push('bot', '');
            bubble.classList.add('vlc-msg--streaming');
            let acc = '', last = 0;
            try {
                const p = this._params || {};
                const res = await s.client.chat(
                    {
                        model      : this._model,
                        messages   : msgs,
                        tools      : (tools && tools.length) ? tools : undefined,
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

                if (res.toolCalls && res.toolCalls.length && !res.content && !acc) {
                    // A pure tool round has no prose — the chips are its transcript.
                    bubble.remove();
                } else {
                    bubble.textContent = res.content || acc || '(empty reply)';
                    bubble.classList.remove('vlc-msg--streaming');
                    if (res.aborted) bubble.textContent = (bubble.textContent || '') + '\n— stopped —';
                }
                if (res.warning) this._push('err', 'Upstream warning: ' + res.warning);

                this._calls++;
                this._accrue(res);
                if (rec) VaultLlmLog.update(rec.key, this._ledgerPatch(res));
                s.client.reconcileCost(res).then((upgraded) => {
                    if (upgraded) {
                        this._recost(res);
                        this._renderHead();
                        if (rec) VaultLlmLog.update(rec.key, this._ledgerPatch(res));
                    }
                });
                return res;
            } catch (err) {
                bubble.classList.remove('vlc-msg--streaming');
                const aborted = err && err.name === 'AbortError';
                if (aborted) { bubble.textContent = (acc || '') + '\n— stopped —'; }
                else         { bubble.remove(); }
                if (rec) VaultLlmLog.update(rec.key, {
                    status: aborted ? 'aborted' : 'error',
                    error : aborted ? null : ((err && err.message) || 'Request failed')
                });
                throw err;
            }
        }

        // Dispatch each tool call and render it as a chip WHILE it runs — pic2's rule:
        // no invisible actions. Returns the tool-result messages for the next round.
        async _runTools(toolCalls) {
            const strip = document.createElement('div');
            strip.className = 'vlc-msg vlc-msg--tools';
            this.shadowRoot.querySelector('.vlc-log').appendChild(strip);

            const out = [];
            for (const tc of toolCalls) {
                const row  = document.createElement('div');
                row.className = 'vlc-tool-row';
                const argHint = (tc.args && typeof tc.args.path === 'string') ? ' ' + tc.args.path : '';
                row.textContent = '🔧 ' + tc.name + argHint + ' …';
                strip.appendChild(row);

                const r = await SGLlmTools.dispatch(tc, { vault: this._vault, grants: this._grants });
                row.textContent = '🔧 ' + tc.name + argHint + (r.ok ? ' ✓' : ' ✗ ' + (r.error || r.code));
                row.classList.add(r.ok ? 'vlc-tool-row--ok' : 'vlc-tool-row--err');

                out.push({
                    role: 'tool', tool_call_id: tc.id,
                    content: JSON.stringify(r.ok ? r.result : { error: r.error, code: r.code })
                });
            }
            const log = this.shadowRoot.querySelector('.vlc-log');
            log.scrollTop = log.scrollHeight;
            return out;
        }

        // ── the 🔧 tools bar ─────────────────────────────────────────────────────
        toggleTools(force) {
            const bar = this.shadowRoot.querySelector('.vlc-toolbar');
            if (!bar) return;
            bar.hidden = (force === undefined) ? !bar.hidden : !force;
            if (!bar.hidden) this._renderTools();
        }

        _renderTools() {
            const bar = this.shadowRoot.querySelector('.vlc-toolbar');
            if (!bar || bar.hidden) return;
            if (typeof SGLlmTools === 'undefined') { bar.innerHTML = '<span class="vlc-dim">Tools are not loaded on this page.</span>'; return; }
            if (!this._grants) { bar.innerHTML = '<span class="vlc-dim">Loading grants…</span>'; return; }

            const writable = !!(this._vault && this._vault.writable);
            const rows = SGLlmTools.GROUP_NAMES.map((name) => {
                const g      = this._grants.groups[name] || { enabled: false, allow: [], deny: [] };
                const scoped = SGLlmTools.isPathScoped && SGLlmTools.isPathScoped(name);
                const deny   = g.deny.length ? ' · never ' + g.deny.join(', ') : '';
                // A path-scoped group REQUIRES an allow-list (empty grants nothing — P3).
                // The scope must therefore be editable RIGHT HERE: before this input
                // existed, the only in-product flow was tick-the-box → every call refused
                // with ENOSCOPE → hand-edit tools.json (08/16 review, B3).
                const scopeUi = scoped
                    ? '<input class="vlc-tool-scope" type="text" data-scope="' + esc(name) + '"' +
                          ' value="' + esc(g.allow.join(', ')) + '" placeholder="docs/**, *.md"' +
                          (writable ? '' : ' disabled') +
                          ' title="Allowed paths — comma-separated globs (* within a folder, ** across folders). Required: an empty scope grants nothing.">' +
                      (g.enabled && !g.allow.length
                          ? '<span class="vlc-warn vlc-tool-noscope">no allowed paths — every call will be refused until a scope is set</span>'
                          : '')
                    : '';
                return '<div class="vlc-tool-row-wrap"><label class="vlc-tool-grp" title="Adds ~' + SGLlmTools.tokenWeight(this._grants, name) + ' tokens to every request while enabled">' +
                    '<input type="checkbox" data-grp="' + esc(name) + '"' + (g.enabled ? ' checked' : '') + (writable ? '' : ' disabled') + '>' +
                    '<span class="vlc-tool-name">' + esc(name) + '</span>' +
                    '<span class="vlc-dim">READ · ~' + SGLlmTools.tokenWeight(this._grants, name) + ' tok/req' + esc(deny) + '</span>' +
                '</label>' + scopeUi + '</div>';
            }).join('');
            bar.innerHTML = rows +
                '<span class="vlc-dim vlc-tool-note">' +
                (writable
                    ? 'Grants are saved to ' + esc(SGLlmTools.TOOLS_PATH) + ' — every change is a commit (that history is the audit log).'
                    : 'Read-only vault — grants can be seen here but changing them needs the write key.') +
                '</span>';

            bar.querySelectorAll('input[data-grp]').forEach((cb) => {
                cb.addEventListener('change', () => this._setGroupEnabled(cb.getAttribute('data-grp'), cb.checked, cb));
            });
            bar.querySelectorAll('input[data-scope]').forEach((inp) => {
                inp.addEventListener('change', () => this._setGroupScope(inp.getAttribute('data-scope'), inp.value, inp));
            });
        }

        // Parse the comma-separated globs, save with the grant, revert on failure — the
        // same claim-no-refused-authority rule as _setGroupEnabled.
        async _setGroupScope(name, value, inp) {
            const g = this._grants && this._grants.groups[name];
            if (!g) return;
            const before = g.allow.slice();
            g.allow = String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
            try {
                await SGLlmTools.saveGrants(this._vault, this._grants);
                this._setStatus(g.allow.length
                    ? 'Scope for "' + name + '" set to: ' + g.allow.join(', ') + ' — committed.'
                    : 'Scope for "' + name + '" cleared — every call will be refused until one is set.',
                    g.allow.length ? 'info' : 'warn');
                this._renderTools();                       // refresh the no-scope warning
            } catch (err) {
                g.allow = before;
                if (inp) inp.value = before.join(', ');
                this._setStatus('Could not save the scope: ' + ((err && err.message) || err), 'warn');
            }
        }

        async _setGroupEnabled(name, enabled, cb) {
            const g = this._grants && this._grants.groups[name];
            if (!g) return;
            const before = g.enabled;
            g.enabled = !!enabled;
            try {
                await SGLlmTools.saveGrants(this._vault, this._grants);
                this._setStatus((enabled ? 'Enabled' : 'Disabled') + ' "' + name + '" — committed to ' + SGLlmTools.TOOLS_PATH + '.', 'info');
            } catch (err) {
                // The grant did not land — the UI must not claim authority the vault refused.
                g.enabled = before;
                if (cb) cb.checked = before;
                this._setStatus('Could not save the grant: ' + ((err && err.message) || err), 'warn');
            }
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
            // From the LEDGER (survives panel remounts), not instance counters — see _hostTotals.
            const spent = this._hostTotals();
            if (limits.maxCallsPerSession && spent.calls >= limits.maxCallsPerSession) {
                this._push('err', 'Session call limit reached (' + limits.maxCallsPerSession + '). Raise it in Settings → AI models.');
                return;
            }
            if (limits.maxCostPerSession && spent.cost >= limits.maxCostPerSession) {
                this._push('err', 'Session spend cap reached ($' + limits.maxCostPerSession + '). Raise it in Settings → AI models.');
                return;
            }

            // An image on a model that cannot see it earns a provider error naming nothing.
            // Refuse here, where the model picker is one click away.
            if (this._images.length && !this._warnIfModelCannotSee()) return;

            inEl.value = '';
            this._push('user', q, this._images);

            // Multimodal only when there is actually an image: a plain string content is what
            // every provider handles best, and wrapping every message in a one-element part
            // array for no reason is a gratuitous difference.
            const outgoing = this._images.length
                ? { role: 'user', content: [{ type: 'text', text: q }].concat(this._images.map(SGVision.imagePart)) }
                : { role: 'user', content: q };
            this._history.push(outgoing);
            // Cleared BEFORE the await: the image belongs to the message just sent, and a
            // second send while the first is in flight must not re-attach (and re-bill) it.
            const sentImages = this._images.length;
            const sentImageNames = this._images.map((im) => im.name || 'image');
            this._images = [];
            this._renderCtx();

            const ctxMsgs = this._contextMessages();
            const msgs = [{ role: 'system', content: ctxMsgs.length ? SYSTEM_WITH_FILES : SYSTEM_NO_FILES }];
            msgs.push.apply(msgs, ctxMsgs);
            msgs.push.apply(msgs, this._history.slice(-MAX_HISTORY_MSGS));

            // tools[] only when a committed grant enables something — a disabled group is
            // OMITTED, so the default chat pays zero tokens for machinery it never uses.
            const tools = (typeof SGLlmTools !== 'undefined' && this._grants && SGLlmTools.anyEnabled(this._grants))
                ? SGLlmTools.compileTools(this._grants) : null;
            if (tools && tools.length) {
                msgs[0] = { role: 'system', content: msgs[0].content + '\n\n' + SGLlmTools.SYSTEM_TOOLS_NOTE };
            }

            this._abort = new AbortController();
            this._setBusy(true);
            try {
                // The loop: send → (tool calls) → dispatch each → tool results → resend,
                // until a round returns prose. Each round is its OWN ledger entry — the
                // requests pane shows what actually happened, call by call.
                let msgsWork = msgs;
                let meta     = { files: this._files.map((f) => f.path), images: sentImages };
                let rounds   = 0;
                for (;;) {
                    const res = await this._chatOnce(msgsWork, tools, meta);
                    if (!res.toolCalls || !res.toolCalls.length) {
                        // Only the FINAL prose joins the conversation history. Tool
                        // exchanges are per-turn plumbing: fenced file bodies re-sent on
                        // every later turn would balloon both the context and the bill.
                        if (res.content) this._history.push({ role: 'assistant', content: res.content });
                        break;
                    }
                    rounds++;
                    const outcome = await this._runTools(res.toolCalls);
                    msgsWork = msgsWork.concat([{
                        role: 'assistant', content: res.content || '',
                        tool_calls: res.toolCalls.map((tc) => ({
                            id: tc.id, type: 'function',
                            'function': { name: tc.name, arguments: tc.argsRaw || JSON.stringify(tc.args || {}) }
                        }))
                    }], outcome);
                    if (rounds >= SGLlmTools.MAX_ITERATIONS) {
                        // One final round WITHOUT tools[]: the model must land the answer
                        // from what it has, not silently drop mid-investigation.
                        const fin = await this._chatOnce(msgsWork, null, { files: [], images: 0 });
                        if (fin.content) this._history.push({ role: 'assistant', content: fin.content });
                        this._setStatus('Tool limit reached (' + SGLlmTools.MAX_ITERATIONS + ' rounds) — answered with what was gathered.', 'warn');
                        break;
                    }
                    meta = { files: [], images: 0 };
                }
            } catch (err) {
                if (!(err && err.name === 'AbortError')) {
                    this._push('err', (err && err.message) || 'Request failed');
                }
            } finally {
                // B2: the pixels went with THIS request; they must not ride every later
                // turn via the history window. The transcript keeps its thumbnails (DOM),
                // and the model keeps a text record of what was attached — but the base64
                // parts (the most expensive tokens we send) are not resent 19 more times.
                // This also makes the chip note — "sent with your next message only" —
                // true in billing terms, not only visually.
                if (sentImages && Array.isArray(outgoing.content)) {
                    outgoing.content = q + '\n[' + sentImages + ' image' + (sentImages > 1 ? 's' : '') +
                        ' (' + sentImageNames.join(', ') + ') — attached to this message when it was sent]';
                }
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
        .vlc-tool-row-wrap { display: flex; flex-direction: column; gap: .2rem; margin-bottom: .35rem; }
        .vlc-tool-scope {
            font: inherit; font-size: .72rem; font-family: var(--font-mono, monospace);
            background: var(--bg-primary, #0d1120); color: inherit;
            border: 1px solid var(--color-border, #24304a); border-radius: 5px;
            padding: .25rem .45rem; margin-left: 1.6rem; outline: none;
        }
        .vlc-tool-noscope { font-size: .7rem; margin-left: 1.6rem; }

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
        .vlc-msg--tools { align-self: stretch; background: transparent; padding: 0 .2rem; }
        .vlc-tool-row { font-size: .72rem; font-family: var(--font-mono, monospace); color: var(--color-text-secondary, #9aa4bf); padding: .1rem 0; }
        .vlc-tool-row--ok  { color: #4ecdc4; }
        .vlc-tool-row--err { color: #E9C445; }
        .vlc-toolbar { display: flex; flex-direction: column; gap: .25rem; padding: .4rem .75rem; border-bottom: 1px solid var(--color-border, #24304a); }
        .vlc-toolbar[hidden] { display: none; }
        .vlc-tool-grp { display: flex; align-items: center; gap: .45rem; font-size: .74rem; cursor: pointer; }
        .vlc-tool-name { font-weight: 700; }
        .vlc-tool-note { padding-top: .2rem; }
        .vlc-msg__imgs { display: flex; gap: .3rem; flex-wrap: wrap; margin-top: .35rem; }
        .vlc-thumb {
            width: 34px; height: 34px; object-fit: cover; border-radius: 4px;
            border: 1px solid var(--color-border, #24304a); display: block;
        }
        .vlc-thumb--sent { width: 92px; height: auto; max-height: 120px; object-fit: contain; }
        .vlc-chip--img { padding-left: .25rem; }
        /* Drop target feedback — the whole panel, not a small textarea. */
        .vlc-panel--drop { outline: 2px dashed #4ecdc4; outline-offset: -4px; }
        .vlc-status { padding: 0 .75rem; font-size: .72rem; min-height: 0; }
        .vlc-status--warn { color: #E9C445; padding: .4rem .75rem; }
        .vlc-status--info { color: var(--color-text-secondary, #9aa4bf); padding: .4rem .75rem; }
        /* A live microphone is the one state in this panel that must never be missed — but
           it is a GOOD state, and this panel already spends red on failure (.vlc-msg--err,
           .vlc-status--warn). Alarm colours for "working as intended" read as something
           going wrong. Recording uses the panel's accent teal and earns its visibility from
           weight, a filled chip and a slow pulse instead. */
        .vlc-status--rec  { color: #4ecdc4; padding: .4rem .75rem; font-weight: 600; }
        .vlc-mic {
            padding: .4rem .55rem; border-radius: 6px; cursor: pointer; font-size: .8rem;
            background: transparent; color: var(--color-text-secondary, #9aa4bf);
            border: 1px solid var(--color-border, #24304a); font-family: inherit; white-space: nowrap;
        }
        .vlc-mic:hover { color: var(--color-text, #e2e8f0); border-color: #4ecdc4; }
        /* Tinted rather than solid: the Send button beside it is solid teal, and two solid
           teal blocks side by side stop reading as two different things. */
        .vlc-mic--rec {
            background: rgba(78,205,196,.16); border-color: #4ecdc4; color: #4ecdc4; font-weight: 700;
            animation: vlc-rec-pulse 1.6s ease-in-out infinite;
        }
        @keyframes vlc-rec-pulse { 0%,100% { opacity: 1; } 50% { opacity: .72; } }
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
