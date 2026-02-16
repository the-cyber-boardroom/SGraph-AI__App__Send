/* =============================================================================
   SG/Send — Download Component Override
   v0.1.6 — IFD surgical override (design system)

   Changes from v0.1.5:
     - renderComplete: dark-theme-aware colours for decrypted text panel
     - _renderTimings: uses design system tokens
     - "Send another" link points to v0.1.6
   ============================================================================= */

(function() {
    'use strict';

    // ─── Override renderComplete for dark-theme-aware styling ───────────

    const _originalRenderComplete = SendDownload.prototype.renderComplete;

    SendDownload.prototype.renderComplete = function() {
        if (this.state !== 'complete') return '';

        const sendAnotherHtml = `
            <div style="margin-top: var(--space-6, 1.5rem); text-align: center;">
                <a href="${window.location.origin}/send/v0/v0.1/v0.1.6/index.html" class="btn btn-sm" style="color: var(--accent, var(--color-primary)); text-decoration: none;">
                    ${this.escapeHtml(this.t('download.result.send_another'))}
                </a>
            </div>
        `;

        // Timing breakdown (if available from v0.1.5 patch)
        const timingHtml = typeof this._renderTimings === 'function' ? this._renderTimings() : '';

        if (this.decryptedText !== null) {
            return `
                <div class="status status--success" style="font-size: var(--font-size-sm); padding: 0.5rem 0.75rem;">
                    ${this.escapeHtml(this.t('download.result.text_success'))}
                </div>
                <div style="margin-top: var(--space-4, 1rem);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3, 0.75rem);">
                        <h3 style="margin: 0; font-size: var(--text-h3, 1.1rem); font-weight: var(--weight-bold, 700); color: var(--color-text);">
                            ${this.escapeHtml(this.t('download.result.decrypted_message'))}
                        </h3>
                        <button class="btn btn-primary btn-sm" id="copy-text-btn">
                            ${this.escapeHtml(this.t('download.result.copy_text'))}
                        </button>
                    </div>
                    <pre id="decrypted-text" style="background: var(--accent-subtle, rgba(78, 205, 196, 0.12)); border: 2px solid var(--accent, #4ECDC4); border-radius: var(--radius-md, 12px); padding: var(--space-6, 1.25rem); white-space: pre-wrap; word-wrap: break-word; font-size: var(--text-body, 1rem); line-height: 1.6; max-height: 400px; overflow-y: auto; min-height: 60px; margin: 0; color: var(--color-text);"></pre>
                    <div style="text-align: right; margin-top: var(--space-2, 0.5rem);">
                        <button class="btn btn-sm btn-secondary" id="download-text-btn">
                            ${this.escapeHtml(this.t('download.result.download_file'))}
                        </button>
                    </div>
                </div>
                <send-transparency id="transparency-panel"></send-transparency>
                ${timingHtml}
                ${sendAnotherHtml}
            `;
        }

        return `
            <div class="status status--success">${this.escapeHtml(this.t('download.result.file_success'))}</div>
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
            ${sendAnotherHtml}
        `;
    };

    // ─── Override _renderTimings for design tokens ─────────────────────

    SendDownload.prototype._renderTimings = function() {
        if (!this._timings || !this._timings.start) return '';

        const t   = this._timings;
        const end = t.complete || performance.now();
        const total = Math.round(end - t.start);

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
                    <div style="display: flex; align-items: center; gap: var(--space-2, 0.5rem); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                        <span style="min-width: 110px;">${this.escapeHtml(s.label.replace('...', ''))}</span>
                        <div style="flex: 1; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: var(--accent, var(--color-primary)); border-radius: 2px;"></div>
                        </div>
                        <span style="min-width: 50px; text-align: right; font-family: var(--font-mono, monospace);">${this._formatMs(ms)}</span>
                    </div>
                `);
            }
        }

        if (rows.length === 0) return '';

        return `
            <div style="margin-top: var(--space-3, 0.75rem); padding: var(--space-3, 0.75rem); background: var(--bg-secondary, rgba(0,0,0,0.05)); border: 1px solid var(--color-border); border-radius: var(--radius-sm, 8px);">
                <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2, 0.5rem); font-weight: var(--weight-medium, 500);">
                    ${this.escapeHtml(I18n.t('download.timing.title'))} ${this._formatMs(total)}
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-1, 0.25rem);">
                    ${rows.join('')}
                </div>
            </div>
        `;
    };

    console.log('[v0.1.6] SendDownload patched: dark-theme-aware result panel + v0.1.6 URLs');
})();
