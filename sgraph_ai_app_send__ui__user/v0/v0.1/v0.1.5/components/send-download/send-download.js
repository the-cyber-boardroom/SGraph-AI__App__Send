/* =============================================================================
   SGraph Send — Download Component Override
   v0.1.5 — IFD surgical override

   Changes from v0.1.4:
     - #8:  Workflow timings — captures per-stage performance.now() markers,
            shows timing breakdown after decryption
     - "Send another" link points to v0.1.5
   ============================================================================= */

(function() {
    'use strict';

    // ─── #8: Workflow Timings ────────────────────────────────────────────

    const _originalStartDownload = SendDownload.prototype.startDownload;

    SendDownload.prototype.startDownload = async function(keyOverride) {
        // Initialize timing capture
        this._timings = { start: performance.now() };
        await _originalStartDownload.call(this, keyOverride);
    };

    // Patch render to capture stage timestamps
    const _originalRender = SendDownload.prototype.render;
    SendDownload.prototype.render = function() {
        if (this._timings && this.state && this.state !== 'loading') {
            this._timings[this.state] = performance.now();
        }
        _originalRender.call(this);
    };

    // Patch renderComplete to include timing breakdown
    const _originalRenderComplete = SendDownload.prototype.renderComplete;
    SendDownload.prototype.renderComplete = function() {
        if (this.state !== 'complete') return '';

        const baseHtml = _originalRenderComplete.call(this);
        const timingHtml = this._renderTimings();

        // Insert timings before the "send another" link
        const sendAnotherIdx = baseHtml.lastIndexOf('<div style="margin-top: 1.5rem; text-align: center;">');
        if (sendAnotherIdx > 0 && timingHtml) {
            return baseHtml.slice(0, sendAnotherIdx) + timingHtml + baseHtml.slice(sendAnotherIdx);
        }
        return baseHtml + timingHtml;
    };

    // ─── Timing Renderer ─────────────────────────────────────────────────

    SendDownload.prototype._renderTimings = function() {
        if (!this._timings || !this._timings.start) return '';

        const t   = this._timings;
        const end = t.complete || performance.now();
        const total = Math.round(end - t.start);

        // Download flow has fewer stages: decrypting → complete
        const stages = [
            { key: 'decrypting', label: I18n.t('download.progress.decrypting') },
        ];

        const keys = ['start', 'decrypting', 'complete'];
        const rows = [];

        for (let i = 0; i < stages.length; i++) {
            const s     = stages[i];
            const begin = t[s.key];
            const next  = keys[keys.indexOf(s.key) + 1];
            const finish = t[next];
            if (begin !== undefined && finish !== undefined) {
                const ms  = Math.round(finish - begin);
                const pct = total > 0 ? Math.round((ms / total) * 100) : 0;
                rows.push(`
                    <div style="display: flex; align-items: center; gap: 0.5rem; font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                        <span style="min-width: 110px;">${this.escapeHtml(s.label.replace('...', ''))}</span>
                        <div style="flex: 1; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: var(--color-primary); border-radius: 2px;"></div>
                        </div>
                        <span style="min-width: 50px; text-align: right; font-family: var(--font-mono, monospace);">${this._formatMs(ms)}</span>
                    </div>
                `);
            }
        }

        if (rows.length === 0) return '';

        return `
            <div style="margin-top: 0.75rem; padding: 0.75rem; background: var(--color-bg-secondary, rgba(0,0,0,0.05)); border-radius: var(--border-radius, 8px);">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 0.5rem; font-weight: 500;">
                    ${this.escapeHtml(I18n.t('download.timing.title'))} ${this._formatMs(total)}
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    ${rows.join('')}
                </div>
            </div>
        `;
    };

    SendDownload.prototype._formatMs = function(ms) {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    // ─── Update "Send another" link to v0.1.5 ───────────────────────────

    const _originalRenderComplete2 = SendDownload.prototype.renderComplete;
    SendDownload.prototype.renderComplete = function() {
        let html = _originalRenderComplete2.call(this);
        // Patch send-another link to v0.1.5
        html = html.replace(/\/v0\.1\.4\//g, '/v0.1.5/');
        return html;
    };

    console.log('[v0.1.5] SendDownload patched: workflow timings + v0.1.5 links');
})();
