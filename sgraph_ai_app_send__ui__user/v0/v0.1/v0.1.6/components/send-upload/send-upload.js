/* =============================================================================
   SG/Send — Upload Component Override
   v0.1.6 — IFD surgical override (design system)

   Changes from v0.1.5:
     - renderResult: dark-theme-aware colours (no hardcoded white/light backgrounds)
     - Download URLs point to v0.1.6/download.html
     - _renderTimings: uses design system tokens
   ============================================================================= */

(function() {
    'use strict';

    // ─── Override renderResult for dark-theme-aware styling ─────────────

    SendUpload.prototype.renderResult = function() {
        if (this.state !== 'complete' || !this.result) return '';
        const { combinedUrl, linkOnlyUrl, keyString, transparency } = this.result;
        const successKey = this.result.isText ? 'upload.result.text_success' : 'upload.result.file_success';

        const monoStyle   = "font-family: var(--font-mono, monospace); font-size: var(--font-size-sm);";
        const valueBoxStyle = `${monoStyle} flex: 1; min-width: 0; background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); padding: 0.375rem 0.5rem; white-space: nowrap; overflow-x: auto; color: var(--color-text);`;

        const separateSection = this._showSeparateKey ? `
            <div style="margin-top: var(--space-3, 0.75rem); padding: var(--space-4, 1rem); background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border); border-radius: var(--radius-md, 12px);">
                <div style="margin-bottom: var(--space-3, 0.75rem);">
                    <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1, 0.25rem);">
                        ${this.escapeHtml(this.t('upload.result.link_only'))}
                    </label>
                    <div style="display: flex; gap: var(--space-2, 0.5rem); align-items: center;">
                        <div style="${valueBoxStyle}" id="link-only">${this.escapeHtml(linkOnlyUrl)}</div>
                        <button class="btn btn-copy btn-sm" data-copy="link-only">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                    </div>
                </div>
                <div style="margin-bottom: var(--space-3, 0.75rem);">
                    <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1, 0.25rem);">
                        ${this.escapeHtml(this.t('upload.result.decryption_key'))}
                    </label>
                    <div style="display: flex; gap: var(--space-2, 0.5rem); align-items: center;">
                        <div style="${valueBoxStyle}" id="decryption-key">${this.escapeHtml(keyString)}</div>
                        <button class="btn btn-copy btn-sm" data-copy="decryption-key">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                    </div>
                </div>
                <div class="guidance">
                    ${this.t('upload.guidance.split_channels')}
                </div>
            </div>
        ` : '';

        // Token usage bar
        const tokenUsageHtml = `
            <div id="token-usage" class="token-usage" style="display: none; margin-top: var(--space-2, 0.5rem); font-size: var(--font-size-sm); color: var(--color-text-secondary); text-align: center;"></div>
        `;

        // Timing breakdown
        const timingHtml = this._renderTimings();

        return `
            <div class="status status--success">
                ${this.escapeHtml(this.t(successKey))}
            </div>
            ${tokenUsageHtml}
            <div style="margin-top: var(--space-4, 1rem);">
                <label style="display: block; font-weight: var(--weight-semibold, 600); font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--space-2, 0.5rem);">
                    ${this.escapeHtml(this.t('upload.result.share_link'))}
                </label>
                <div style="background: var(--bg-secondary, #16213E); border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px); padding: 0.5rem 0.75rem; ${monoStyle} white-space: nowrap; overflow-x: auto; color: var(--color-text);" id="combined-link">${this.escapeHtml(combinedUrl)}</div>
                <div style="display: flex; gap: var(--space-2, 0.5rem); margin-top: var(--space-3, 0.75rem); flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-primary btn-sm" data-copy="combined-link">${this.escapeHtml(this.t('upload.result.copy_link'))}</button>
                    <a href="${this.escapeHtml(combinedUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="text-decoration: none;">${this.escapeHtml(this.t('upload.result.open_tab'))}</a>
                    <button class="btn btn-sm" id="toggle-separate-key" style="margin-left: auto; font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                        ${this.escapeHtml(this._showSeparateKey ? this.t('upload.result.hide_key') : this.t('upload.result.show_separate_key'))}
                    </button>
                </div>
            </div>
            ${separateSection}
            ${timingHtml}
            ${transparency ? `<send-transparency id="transparency-panel"></send-transparency>` : ''}
            <div style="margin-top: var(--space-6, 1.5rem); text-align: center;">
                <button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary));">
                    ${this.escapeHtml(this.t('upload.result.send_another'))}
                </button>
            </div>
        `;
    };

    // ─── Override _renderTimings for design tokens ─────────────────────

    SendUpload.prototype._renderTimings = function() {
        if (!this._timings || !this._timings.start) return '';

        const t   = this._timings;
        const end = t.complete || performance.now();
        const total = Math.round(end - t.start);

        const stages = [
            { key: 'reading',    label: this.t('upload.progress.reading')    },
            { key: 'encrypting', label: this.t('upload.progress.encrypting') },
            { key: 'creating',   label: this.t('upload.progress.creating')   },
            { key: 'uploading',  label: this.t('upload.progress.uploading')  },
            { key: 'completing', label: this.t('upload.progress.completing') },
        ];

        const keys = ['start', 'reading', 'encrypting', 'creating', 'uploading', 'completing', 'complete'];
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
                    ${this.escapeHtml(this.t('upload.timing.title'))} ${this._formatMs(total)}
                </div>
                <div style="display: flex; flex-direction: column; gap: var(--space-1, 0.25rem);">
                    ${rows.join('')}
                </div>
            </div>
        `;
    };

    // ─── Update download URLs to v0.1.6 ──────────────────────────────

    SendUpload.prototype.buildCombinedUrl = function(tid, key) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.6/download.html#${tid}/${key}`;
    };

    SendUpload.prototype.buildLinkOnlyUrl = function(tid) {
        return `${window.location.origin}/send/v0/v0.1/v0.1.6/download.html#${tid}`;
    };

    console.log('[v0.1.6] SendUpload patched: dark-theme-aware result panel + v0.1.6 URLs');
})();
