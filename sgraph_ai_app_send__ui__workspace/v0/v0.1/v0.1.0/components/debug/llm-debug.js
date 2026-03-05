/* =============================================================================
   SGraph Workspace — LLM Debug Panel
   v0.1.0 — Shows semantic LLM request/response details

   Unlike the API logger (raw HTTP), this shows the assembled prompt content:
   system prompt, full user prompt with attachments, and complete response text.
   ============================================================================= */

(function() {
    'use strict';

    if (customElements.get('llm-debug')) return;

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    class LlmDebug extends HTMLElement {

        constructor() {
            super();
            this._entries   = [];
            this._pending   = null;
            this._unsubs    = [];
            this._filter    = '';
        }

        connectedCallback() {
            this._renderShell();

            const onRequest = (data) => this._onRequest(data);
            const onResponse = (data) => this._onResponse(data);
            const onComplete = (data) => this._onComplete(data);
            const onError = (data) => this._onError(data);

            window.sgraphWorkspace.events.on('llm-request-sent', onRequest);
            window.sgraphWorkspace.events.on('llm-response-text', onResponse);
            window.sgraphWorkspace.events.on('llm-request-complete', onComplete);
            window.sgraphWorkspace.events.on('llm-request-error', onError);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('llm-request-sent', onRequest),
                () => window.sgraphWorkspace.events.off('llm-response-text', onResponse),
                () => window.sgraphWorkspace.events.off('llm-request-complete', onComplete),
                () => window.sgraphWorkspace.events.off('llm-request-error', onError),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Event handlers ------------------------------------------------------

        _onRequest(data) {
            this._pending = {
                timestamp:    new Date(),
                model:        data.model || '?',
                provider:     data.provider || '?',
                systemPrompt: data.systemPrompt || '',
                userPrompt:   data.userPrompt || '',
                finalPrompt:  data.finalPrompt || '',
                attachments:  data.attachments || {},
                streaming:    data.streaming || false,
                imageCount:   data.imageCount || 0,
                response:     null,
                stats:        null,
                error:        null,
            };
        }

        _onResponse(data) {
            if (this._pending) {
                this._pending.response = data.content || '';
            }
        }

        _onComplete(data) {
            if (!this._pending) return;
            this._pending.stats = {
                promptTokens:     data.promptTokens,
                completionTokens: data.completionTokens,
                cost:             data.cost,
                speed:            data.speed,
                finishReason:     data.finishReason,
                length:           data.length,
            };
            this._finalize();
        }

        _onError(data) {
            if (!this._pending) return;
            this._pending.error = data.error || 'Unknown error';
            this._finalize();
        }

        _finalize() {
            const entry = this._pending;
            this._pending = null;
            this._entries.push(entry);
            if (this._entries.length > 50) this._entries.shift();
            if (this._matchesFilter(entry)) this._renderEntry(entry);
        }

        _matchesFilter(entry) {
            if (!this._filter) return true;
            const s = (entry.model + ' ' + entry.userPrompt).toLowerCase();
            return s.includes(this._filter);
        }

        // --- Render shell --------------------------------------------------------

        _renderShell() {
            this.innerHTML = `
                <style>${LlmDebug.styles}</style>
                <div class="ld-container">
                    <div class="ld-header">
                        <input class="ld-search" type="text" placeholder="Filter..." />
                        <button class="ld-clear-btn">Clear</button>
                    </div>
                    <div class="ld-list">
                        <div class="ld-empty">No LLM calls yet</div>
                    </div>
                </div>`;

            this.querySelector('.ld-search').addEventListener('input', (e) => {
                this._filter = e.target.value.toLowerCase();
                this._rerender();
            });

            this.querySelector('.ld-clear-btn').addEventListener('click', () => {
                this._entries = [];
                this._rerender();
            });
        }

        // --- Render entry --------------------------------------------------------

        _renderEntry(entry) {
            const list = this.querySelector('.ld-list');
            if (!list) return;
            const empty = list.querySelector('.ld-empty');
            if (empty) empty.remove();

            const time = entry.timestamp;
            const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;

            const shortModel = entry.model.split('/').pop();
            const stats = entry.stats;
            const tokens = stats && stats.promptTokens
                ? `${stats.promptTokens.toLocaleString()}\u2192${(stats.completionTokens || 0).toLocaleString()}`
                : '';
            const cost = stats && stats.cost != null
                ? `$${stats.cost < 0.001 ? stats.cost.toFixed(6) : stats.cost.toFixed(4)}`
                : '';

            const el = document.createElement('div');
            el.className = 'ld-entry' + (entry.error ? ' ld-entry--error' : '');

            // Summary line
            const summary = document.createElement('div');
            summary.className = 'ld-entry-summary';
            summary.innerHTML = `
                <span class="ld-time">${timeStr}</span>
                <span class="ld-model">${esc(shortModel)}</span>
                ${tokens ? `<span class="ld-tokens">${tokens}</span>` : ''}
                ${cost ? `<span class="ld-cost">${cost}</span>` : ''}
                ${entry.error ? `<span class="ld-error-badge">ERR</span>` : ''}
                <span class="ld-prompt-preview">${esc(this._truncate(entry.userPrompt, 60))}</span>
            `;
            summary.style.cursor = 'pointer';
            el.appendChild(summary);

            // Click to expand
            summary.addEventListener('click', () => {
                let detail = el.querySelector('.ld-detail');
                if (detail) { detail.remove(); return; }

                detail = document.createElement('div');
                detail.className = 'ld-detail';

                // Attachments badges
                const atts = Object.entries(entry.attachments || {}).filter(([,v]) => v).map(([k]) => k);
                const attBadges = atts.length > 0
                    ? `<div class="ld-att-row">Attachments: ${atts.map(a => `<span class="ld-att-badge">${esc(a)}</span>`).join(' ')}</div>`
                    : '';
                const imgBadge = entry.imageCount > 0
                    ? `<span class="ld-att-badge">${entry.imageCount} image${entry.imageCount > 1 ? 's' : ''}</span>`
                    : '';

                let html = attBadges + (imgBadge ? `<div class="ld-att-row">${imgBadge}</div>` : '');

                // System Prompt
                html += this._section('System Prompt', entry.systemPrompt || '(none)');
                // Full Prompt (assembled with attachments)
                html += this._section('Full Prompt', entry.finalPrompt || '(empty)');
                // Response
                html += this._section('Response', entry.response || entry.error || '(no response)');

                // Stats
                if (stats) {
                    let meta = `Model: ${entry.model}\n`;
                    if (stats.promptTokens)     meta += `Prompt tokens: ${stats.promptTokens.toLocaleString()}\n`;
                    if (stats.completionTokens) meta += `Completion tokens: ${stats.completionTokens.toLocaleString()}\n`;
                    if (stats.cost != null)     meta += `Cost: $${stats.cost.toFixed(6)}\n`;
                    if (stats.speed != null)    meta += `Speed: ${stats.speed.toFixed(1)} tps\n`;
                    if (stats.finishReason)     meta += `Finish: ${stats.finishReason}\n`;
                    if (stats.length)           meta += `Length: ${stats.length.toLocaleString()} chars\n`;
                    html += this._section('Stats', meta);
                }

                detail.innerHTML = html;

                // Add copy buttons
                detail.querySelectorAll('.ld-section-copy').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const pre = btn.closest('.ld-section').querySelector('.ld-pre');
                        if (pre) {
                            navigator.clipboard.writeText(pre.textContent).then(() => {
                                btn.textContent = 'Copied';
                                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
                            });
                        }
                    });
                });

                el.appendChild(detail);
            });

            list.prepend(el);
            while (list.children.length > 50) list.lastChild.remove();
        }

        _section(label, text) {
            return `<div class="ld-section">
                <div class="ld-section-header">
                    <span class="ld-section-label">${esc(label)}</span>
                    <button class="ld-section-copy">Copy</button>
                </div>
                <pre class="ld-pre">${esc(text)}</pre>
            </div>`;
        }

        _rerender() {
            const list = this.querySelector('.ld-list');
            if (!list) return;
            list.innerHTML = '';
            const filtered = this._entries.filter(e => this._matchesFilter(e));
            if (filtered.length === 0) {
                list.innerHTML = '<div class="ld-empty">No LLM calls yet</div>';
                return;
            }
            for (let i = filtered.length - 1; i >= 0; i--) {
                this._renderEntry(filtered[i]);
            }
        }

        _truncate(text, max) {
            if (!text) return '';
            const clean = text.replace(/\s+/g, ' ').trim();
            return clean.length > max ? clean.slice(0, max) + '...' : clean;
        }

        // --- Styles --------------------------------------------------------------

        static get styles() {
            return `
                .ld-container { height: 100%; display: flex; flex-direction: column; }

                .ld-header {
                    display: flex; align-items: center; gap: 0.375rem;
                    padding: 0.5rem 0.75rem;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .ld-search {
                    flex: 1; min-width: 60px;
                    padding: 0.25rem 0.5rem; font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    color: var(--ws-text, #F0F0F5);
                    background: var(--ws-bg, #1A1A2E);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    border-radius: var(--ws-radius, 6px);
                    outline: none;
                }
                .ld-search:focus { border-color: var(--ws-primary, #4ECDC4); }

                .ld-clear-btn {
                    font-size: 0.625rem; padding: 0.125rem 0.375rem;
                    border-radius: var(--ws-radius, 6px);
                    border: 1px solid var(--ws-border, #2C3E6B);
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    cursor: pointer;
                }
                .ld-clear-btn:hover { background: var(--ws-surface-hover, #253254); color: var(--ws-text-secondary, #8892A0); }

                .ld-list { flex: 1; overflow-y: auto; padding: 0.375rem; }
                .ld-empty {
                    padding: 1rem; text-align: center;
                    color: var(--ws-text-muted, #5a6478); font-size: 0.75rem;
                }

                .ld-entry {
                    margin-bottom: 0.25rem;
                    border-radius: var(--ws-radius, 6px);
                    font-size: 0.6875rem;
                    font-family: var(--ws-font-mono, monospace);
                    border-left: 3px solid var(--ws-success, #4ECDC4);
                }
                .ld-entry--error { border-left-color: var(--ws-error, #E94560); }
                .ld-entry:hover { background: var(--ws-surface-hover, #253254); }

                .ld-entry-summary {
                    display: flex; flex-wrap: wrap; gap: 0.375rem;
                    padding: 0.25rem 0.5rem; align-items: center;
                }
                .ld-time { color: var(--ws-text-muted, #5a6478); flex-shrink: 0; }
                .ld-model {
                    font-size: 0.625rem; font-weight: 600;
                    padding: 0.0625rem 0.375rem; border-radius: 9999px;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4); flex-shrink: 0;
                }
                .ld-tokens { color: var(--ws-text-secondary, #8892A0); flex-shrink: 0; }
                .ld-cost { color: var(--ws-warning, #fbbf24); flex-shrink: 0; }
                .ld-error-badge {
                    font-size: 0.5625rem; font-weight: 600;
                    padding: 0.0625rem 0.25rem; border-radius: 3px;
                    background: rgba(233,69,96,0.15); color: var(--ws-error, #E94560);
                }
                .ld-prompt-preview {
                    color: var(--ws-text-muted, #5a6478);
                    overflow: hidden; text-overflow: ellipsis;
                    white-space: nowrap; flex: 1; min-width: 0;
                }

                .ld-detail {
                    padding: 0.375rem 0.75rem 0.5rem;
                    border-top: 1px solid var(--ws-border-subtle, #222d4d);
                }

                .ld-att-row {
                    display: flex; align-items: center; gap: 0.25rem;
                    margin-bottom: 0.375rem; font-size: 0.625rem;
                    color: var(--ws-text-muted, #5a6478);
                }
                .ld-att-badge {
                    font-size: 0.5625rem; font-weight: 600;
                    padding: 0.0625rem 0.3125rem; border-radius: 9999px;
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    color: var(--ws-primary, #4ECDC4);
                }

                .ld-section { margin-bottom: 0.375rem; }
                .ld-section-header {
                    display: flex; align-items: center; justify-content: space-between;
                }
                .ld-section-label {
                    font-size: 0.625rem; font-weight: 600;
                    color: var(--ws-text-muted, #5a6478); text-transform: uppercase;
                }
                .ld-section-copy {
                    font-size: 0.5625rem; padding: 0.0625rem 0.3125rem;
                    border-radius: 3px; border: 1px solid var(--ws-border-subtle, #222d4d);
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    cursor: pointer; font-family: inherit;
                }
                .ld-section-copy:hover { color: var(--ws-text-secondary, #8892A0); background: var(--ws-surface-hover, #253254); }

                .ld-pre {
                    margin: 0.25rem 0 0; padding: 0.5rem;
                    font-size: 0.6875rem;
                    color: var(--ws-text-secondary, #8892A0);
                    background: var(--ws-bg, #1A1A2E);
                    border-radius: var(--ws-radius, 6px);
                    white-space: pre-wrap; word-break: break-all;
                    max-height: 200px; overflow-y: auto;
                }
            `;
        }
    }

    customElements.define('llm-debug', LlmDebug);
})();
