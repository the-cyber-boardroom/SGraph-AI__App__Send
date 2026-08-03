/* =================================================================================
   SGraph Vault — LLM requests & cost ledger pane

   Every call the vault chat makes, with its upstream generation id, so spend can be
   audited rather than guessed. Mounted as an sg-layout panel by vault-shell, so it is
   movable/resizable like every other pane.

   Pure consumer: it renders VaultLlmLog and owns no data of its own. Closing this pane
   loses nothing.

   The one rule this UI follows: an ESTIMATE IS NEVER SHOWN AS A BILL. Estimated costs
   carry a `~` and are totalled separately from figures upstream actually charged, so
   "what have I spent" has an honest answer even while calls are still reconciling.
   The generation id is displayed and copyable because it is the join key against an
   OpenRouter statement — the whole point of keeping this ledger.

   Requires: VaultLlmLog.
   ================================================================================= */

(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function money(v) {
        if (typeof v !== 'number') return '—';
        if (v === 0) return '$0';
        return '$' + (v < 0.01 ? v.toFixed(6) : v.toFixed(4));
    }

    function shortId(id) {
        if (!id) return '—';
        return id.length > 18 ? (id.slice(0, 10) + '…' + id.slice(-6)) : id;
    }

    function clock(ts) {
        try { return new Date(ts).toLocaleTimeString(); } catch (_) { return ''; }
    }

    class VaultLlmRequests extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._unsub = null;
        }

        connectedCallback() {
            if (!this._built) {
                this._built = true;
                this.shadowRoot.innerHTML =
                    '<style>' + VaultLlmRequests.styles + '</style>' +
                    '<div class="vlr">' +
                      '<div class="vlr-head">' +
                        '<span class="vlr-title">AI Requests</span>' +
                        '<span class="vlr-sum"></span>' +
                        '<button class="vlr-btn vlr-csv"  type="button" title="Copy the ledger as CSV (generation id is the join key on an OpenRouter statement)">CSV</button>' +
                        '<button class="vlr-btn vlr-json" type="button" title="Copy the ledger as JSON">JSON</button>' +
                        '<button class="vlr-btn vlr-clear" type="button" title="Clear the session ledger">Clear</button>' +
                        '<button class="vlr-x" type="button" aria-label="Close">&#10005;</button>' +
                      '</div>' +
                      '<div class="vlr-confirm" hidden>' +
                        '<span>Clear the ledger? Spend already incurred is not undone — this only clears the local record.</span>' +
                        '<button class="vlr-btn vlr-confirm-yes" type="button">Clear</button>' +
                        '<button class="vlr-btn vlr-confirm-no"  type="button">Cancel</button>' +
                      '</div>' +
                      '<div class="vlr-totals"></div>' +
                      '<div class="vlr-body"></div>' +
                    '</div>';

                this.shadowRoot.querySelector('.vlr-x').addEventListener('click', () => {
                    this.dispatchEvent(new CustomEvent('vault-llm-requests-close', { bubbles: true, composed: true }));
                });
                this.shadowRoot.querySelector('.vlr-csv').addEventListener('click', () => this._copy(VaultLlmLog.toCsv(), '.vlr-csv'));
                this.shadowRoot.querySelector('.vlr-json').addEventListener('click', () => this._copy(VaultLlmLog.toJSON(), '.vlr-json'));
                // Inline confirmation, not window.confirm(): a native dialog steals focus
                // from the whole page, cannot be styled to match the panel, and reads as a
                // browser-level alarm for what is a local, reversible-by-doing-nothing act.
                const bar = this.shadowRoot.querySelector('.vlr-confirm');
                this.shadowRoot.querySelector('.vlr-clear').addEventListener('click', () => {
                    bar.hidden = !bar.hidden;
                    if (!bar.hidden) this.shadowRoot.querySelector('.vlr-confirm-no').focus();
                });
                this.shadowRoot.querySelector('.vlr-confirm-no').addEventListener('click', () => { bar.hidden = true; });
                this.shadowRoot.querySelector('.vlr-confirm-yes').addEventListener('click', () => {
                    bar.hidden = true;
                    VaultLlmLog.clear();
                });
                // Copy one generation id — the handle you paste into a billing lookup.
                this.shadowRoot.querySelector('.vlr-body').addEventListener('click', (e) => {
                    const el = e.target.closest('[data-copy-id]');
                    if (el) this._copy(el.getAttribute('data-copy-id'), null, el);
                });
            }
            if (globalThis.VaultLlmLog) {
                this._unsub = VaultLlmLog.subscribe(() => this.render());
            }
            this.render();
        }

        disconnectedCallback() {
            if (this._unsub) { this._unsub(); this._unsub = null; }
        }

        _copy(text, btnSel, el) {
            const done = () => {
                const b = el || (btnSel && this.shadowRoot.querySelector(btnSel));
                if (!b) return;
                const orig = b.textContent;
                b.textContent = '✓';
                setTimeout(() => { b.textContent = orig; }, 1200);
            };
            try {
                navigator.clipboard.writeText(text).then(done, done);
            } catch (_) { done(); }
        }

        render() {
            if (!this._built || !globalThis.VaultLlmLog) return;
            const rows = VaultLlmLog.list();
            const t    = VaultLlmLog.totals();

            const sum = this.shadowRoot.querySelector('.vlr-sum');
            if (sum) sum.textContent = t.calls ? (t.calls + ' call' + (t.calls === 1 ? '' : 's')) : '';

            const tot = this.shadowRoot.querySelector('.vlr-totals');
            if (tot) {
                if (!t.calls) { tot.innerHTML = ''; }
                else {
                    // Billed and estimated stay visibly separate — a running total that
                    // quietly mixes the two is how people end up trusting a guess.
                    tot.innerHTML =
                        '<div class="vlr-tot">' +
                          '<span class="vlr-tot__big">' + (t.estimatedCost > 0 ? '~' : '') + money(t.totalCost) + '</span>' +
                          '<span class="vlr-tot__lab">session spend</span>' +
                        '</div>' +
                        '<div class="vlr-tot vlr-tot--split">' +
                          '<span>billed <strong>' + money(t.billedCost) + '</strong></span>' +
                          '<span>estimated <strong>~' + money(t.estimatedCost) + '</strong></span>' +
                          (t.uncostedCalls ? '<span class="vlr-dim">' + t.uncostedCalls + ' with no price yet</span>' : '') +
                        '</div>' +
                        '<div class="vlr-tot vlr-tot--split">' +
                          '<span>tokens <strong>' + t.totalTokens.toLocaleString() + '</strong></span>' +
                          '<span class="vlr-dim">' + t.promptTokens.toLocaleString() + ' in · ' + t.completionTokens.toLocaleString() + ' out</span>' +
                          '<span class="vlr-dim">' + t.files + ' file' + (t.files === 1 ? '' : 's') + ' referenced</span>' +
                          (t.pending ? '<span class="vlr-pending">' + t.pending + ' in flight</span>' : '') +
                          (t.errors  ? '<span class="vlr-err">' + t.errors + ' failed</span>' : '') +
                        '</div>';
                }
            }

            const body = this.shadowRoot.querySelector('.vlr-body');
            if (!body) return;
            if (!rows.length) {
                body.innerHTML = '<div class="vlr-empty">No requests yet. Every call the AI chat makes is recorded here with its ' +
                                 'generation id, tokens and cost.</div>';
                return;
            }

            body.innerHTML =
                '<table class="vlr-tbl"><thead><tr>' +
                    '<th>#</th><th>time</th><th>model</th><th>generation id</th>' +
                    '<th class="vlr-r">tokens</th><th class="vlr-r">cost</th><th class="vlr-r">ms</th><th>files</th>' +
                '</tr></thead><tbody>' +
                rows.slice().reverse().map((e) => {
                    const u  = e.usage || {};
                    const pt = (typeof u.prompt_tokens === 'number') ? u.prompt_tokens : null;
                    const ct = (typeof u.completion_tokens === 'number') ? u.completion_tokens : null;
                    const tk = (pt == null && ct == null) ? '—' : ((pt || 0) + (ct || 0)).toLocaleString();
                    const costTxt = (typeof e.cost === 'number')
                        ? ((e.estimated ? '~' : '') + money(e.cost))
                        : (e.status === 'pending' ? '…' : '—');
                    return '<tr class="vlr-row vlr-row--' + esc(e.status) + '">' +
                        '<td>' + e.seq + '</td>' +
                        '<td class="vlr-dim">' + esc(clock(e.ts)) + '</td>' +
                        '<td class="vlr-mono" title="' + esc(e.model || '') + '">' + esc(e.model || '—') + '</td>' +
                        '<td class="vlr-mono">' +
                            (e.id
                                ? '<button class="vlr-id" type="button" data-copy-id="' + esc(e.id) + '" title="' + esc(e.id) + ' — click to copy">' + esc(shortId(e.id)) + '</button>'
                                : '<span class="vlr-dim">' + (e.status === 'pending' ? '…' : '—') + '</span>') +
                        '</td>' +
                        '<td class="vlr-r vlr-mono" title="' + (pt == null ? '' : pt + ' in / ' + (ct || 0) + ' out') + '">' + tk + '</td>' +
                        '<td class="vlr-r vlr-mono' + (e.estimated && typeof e.cost === 'number' ? ' vlr-est' : '') + '" ' +
                            'title="' + esc(e.costSource || (e.status === 'pending' ? 'in flight' : 'no price reported')) + '">' + costTxt + '</td>' +
                        '<td class="vlr-r vlr-dim">' + (e.latencyMs != null ? e.latencyMs : '—') + '</td>' +
                        '<td class="vlr-files" title="' + esc(e.files.join('\n')) + '">' +
                            (e.files.length ? esc(e.files.length === 1 ? e.files[0].split('/').pop() : e.files.length + ' files') : '<span class="vlr-dim">none</span>') +
                        '</td>' +
                    '</tr>' +
                    (e.error ? '<tr class="vlr-errrow"><td colspan="8">' + esc(e.error) + '</td></tr>' : '');
                }).join('') +
                '</tbody></table>';
        }
    }

    VaultLlmRequests.styles = `
        :host { display: block; height: 100%; min-height: 0; }
        .vlr {
            display: flex; flex-direction: column; height: 100%; min-height: 0;
            background: var(--bg-secondary, #131a2b); color: var(--color-text, #e2e8f0);
            box-sizing: border-box;
        }
        .vlr-head {
            display: flex; align-items: center; gap: .4rem; padding: .5rem .75rem;
            border-bottom: 1px solid var(--color-border, #24304a);
        }
        .vlr-title { font-weight: 700; font-size: .82rem; }
        .vlr-sum { font-size: .68rem; color: var(--color-text-secondary, #9aa4bf); margin-right: auto; }
        .vlr-btn {
            background: none; border: 1px solid var(--color-border, #24304a); border-radius: 4px;
            color: var(--color-text-secondary, #9aa4bf); cursor: pointer; font: inherit; font-size: .64rem;
            padding: .1rem .35rem;
        }
        .vlr-btn:hover { color: var(--color-text, #e2e8f0); border-color: #4ecdc4; }
        .vlr-x { background: none; border: none; color: inherit; cursor: pointer; font-size: .8rem; opacity: .7; }
        .vlr-x:hover { opacity: 1; }
        .vlr-confirm {
            display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
            padding: .5rem .75rem; font-size: .68rem;
            background: rgba(233,196,69,.10); border-bottom: 1px solid var(--color-border, #24304a);
        }
        .vlr-confirm[hidden] { display: none; }
        .vlr-confirm span { flex: 1; min-width: 12rem; }
        .vlr-confirm-yes { border-color: #ff6b6b; color: #ff9b9b; }
        .vlr-confirm-yes:hover { border-color: #ff6b6b; color: #ff6b6b; }
        .vlr-totals { padding: .5rem .75rem; border-bottom: 1px solid var(--color-border, #24304a); }
        .vlr-totals:empty { display: none; }
        .vlr-tot { display: flex; align-items: baseline; gap: .5rem; font-size: .7rem; }
        .vlr-tot__big { font-size: 1.15rem; font-weight: 700; font-family: var(--font-mono, monospace); color: #4ecdc4; }
        .vlr-tot__lab { color: var(--color-text-secondary, #9aa4bf); font-size: .68rem; }
        .vlr-tot--split { gap: .9rem; margin-top: .25rem; flex-wrap: wrap; color: var(--color-text-secondary, #9aa4bf); }
        .vlr-tot--split strong { color: var(--color-text, #e2e8f0); font-family: var(--font-mono, monospace); font-weight: 600; }
        .vlr-pending { color: #4ecdc4; }
        .vlr-err { color: #ff9b9b; }
        .vlr-dim { color: var(--color-text-secondary, #9aa4bf); }
        .vlr-body { flex: 1; overflow: auto; min-height: 0; }
        .vlr-empty { padding: 1rem .75rem; font-size: .74rem; color: var(--color-text-secondary, #9aa4bf); }
        .vlr-tbl { width: 100%; border-collapse: collapse; font-size: .68rem; }
        .vlr-tbl th {
            position: sticky; top: 0; background: var(--bg-secondary, #131a2b);
            text-align: left; font-weight: 600; color: var(--color-text-secondary, #9aa4bf);
            padding: .35rem .5rem; border-bottom: 1px solid var(--color-border, #24304a); white-space: nowrap;
        }
        .vlr-tbl td { padding: .3rem .5rem; border-bottom: 1px solid rgba(255,255,255,.04); vertical-align: top; }
        .vlr-r { text-align: right; }
        .vlr-mono { font-family: var(--font-mono, monospace); }
        .vlr-est { color: #E9C445; }
        .vlr-row--error td { background: rgba(255,107,107,.07); }
        .vlr-row--pending td { opacity: .75; }
        .vlr-errrow td { color: #ff9b9b; font-size: .64rem; padding: .1rem .5rem .35rem 1.2rem; }
        .vlr-id {
            background: none; border: none; padding: 0; color: #4ecdc4; cursor: pointer;
            font-family: var(--font-mono, monospace); font-size: .66rem; text-decoration: underline dotted;
        }
        .vlr-id:hover { color: #7fe6df; }
        .vlr-files { max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;

    customElements.define('vault-llm-requests', VaultLlmRequests);
})();
