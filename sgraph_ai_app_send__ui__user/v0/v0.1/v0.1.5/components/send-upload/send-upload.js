/* =============================================================================
   SGraph Send — Upload Component Override
   v0.1.5 — IFD surgical override

   Changes from v0.1.4:
     - #14: Token usage counter — shows "X of Y uses remaining" after upload
     - #8:  Workflow timings — captures per-stage performance.now() markers,
            shows timing breakdown in result panel
     - Download URLs point to v0.1.5/download.html
   ============================================================================= */

(function() {
    'use strict';

    // ─── #8: Workflow Timings ────────────────────────────────────────────

    const _originalStartUpload = SendUpload.prototype.startUpload;

    SendUpload.prototype.startUpload = async function() {
        // Initialize timing capture
        this._timings = { start: performance.now() };
        await _originalStartUpload.call(this);
    };

    // Patch render to capture stage timestamps
    const _originalRender = SendUpload.prototype.render;
    SendUpload.prototype.render = function() {
        if (this._timings && this.state && this.state !== 'idle') {
            this._timings[this.state] = performance.now();
        }
        _originalRender.call(this);
    };

    // ─── #14: Token Usage Counter ────────────────────────────────────────

    // After upload completes, fetch token info to show remaining uses
    const _originalSetupDynamic = SendUpload.prototype.setupDynamicListeners;
    SendUpload.prototype.setupDynamicListeners = function() {
        _originalSetupDynamic.call(this);

        if (this.state === 'complete' && this.result) {
            this._loadTokenUsage();
        }
    };

    SendUpload.prototype._loadTokenUsage = async function() {
        const tokenName = ApiClient.getAccessToken();
        if (!tokenName) return;

        try {
            const info = await ApiClient.checkToken(tokenName);
            const el   = this.querySelector('#token-usage');
            if (!el) return;

            if (info.remaining === -1) {
                el.textContent = this.t('upload.token.unlimited');
            } else if (info.remaining !== undefined) {
                el.textContent = this.t('upload.token.remaining', { remaining: info.remaining });
            }
            el.style.display = '';
        } catch (_) {
            // Silently fail — token info is non-critical
        }
    };

    // ─── Override renderResult to include token + timings ─────────────────

    SendUpload.prototype.renderResult = function() {
        if (this.state !== 'complete' || !this.result) return '';
        const { combinedUrl, linkOnlyUrl, keyString, transparency } = this.result;
        const successKey = this.result.isText ? 'upload.result.text_success' : 'upload.result.file_success';

        const separateSection = this._showSeparateKey ? `
            <div class="result-panel" style="margin-top: 0.75rem;">
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.link_only'))}</label>
                    <span class="value" id="link-only">${this.escapeHtml(linkOnlyUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="link-only">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                </div>
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.decryption_key'))}</label>
                    <span class="value" id="decryption-key">${this.escapeHtml(keyString)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="decryption-key">${this.escapeHtml(this.t('upload.result.copy'))}</button>
                </div>
            </div>
            <div class="guidance">
                ${this.t('upload.guidance.split_channels')}
            </div>
        ` : '';

        // #14: Token usage bar
        const tokenUsageHtml = `
            <div id="token-usage" class="token-usage" style="display: none; margin-top: 0.5rem; font-size: var(--font-size-sm); color: var(--color-text-secondary); text-align: center;"></div>
        `;

        // #8: Timing breakdown
        const timingHtml = this._renderTimings();

        return `
            <div class="status status--success">
                ${this.escapeHtml(this.t(successKey))}
            </div>
            ${tokenUsageHtml}
            <div class="result-panel">
                <div class="result-row">
                    <label>${this.escapeHtml(this.t('upload.result.share_link'))}</label>
                    <span class="value" id="combined-link">${this.escapeHtml(combinedUrl)}</span>
                    <button class="btn btn-copy btn-sm" data-copy="combined-link">${this.escapeHtml(this.t('upload.result.copy_link'))}</button>
                    <a href="${this.escapeHtml(combinedUrl)}" target="_blank" rel="noopener" class="btn btn-sm" style="text-decoration: none; margin-left: 0.25rem;">${this.escapeHtml(this.t('upload.result.open_tab'))}</a>
                </div>
            </div>
            <div style="margin-top: 0.5rem; text-align: right;">
                <button class="btn btn-sm" id="toggle-separate-key" style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">
                    ${this.escapeHtml(this._showSeparateKey ? this.t('upload.result.hide_key') : this.t('upload.result.show_separate_key'))}
                </button>
            </div>
            ${separateSection}
            ${timingHtml}
            ${transparency ? `<send-transparency id="transparency-panel"></send-transparency>` : ''}
            <div style="margin-top: 1.5rem; text-align: center;">
                <button class="btn btn-sm" id="send-another-btn" style="color: var(--color-primary);">
                    ${this.escapeHtml(this.t('upload.result.send_another'))}
                </button>
            </div>
        `;
    };

    // ─── Timing Renderer ─────────────────────────────────────────────────

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
                    ${this.escapeHtml(this.t('upload.timing.title'))} ${this._formatMs(total)}
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    ${rows.join('')}
                </div>
            </div>
        `;
    };

    SendUpload.prototype._formatMs = function(ms) {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    // ─── Update download URLs to v0.1.5 ──────────────────────────────────

    SendUpload.prototype.buildCombinedUrl = function(tid, key, token) {
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        return `${window.location.origin}/send/v0/v0.1/v0.1.5/download.html${tokenParam}#${tid}/${key}`;
    };

    SendUpload.prototype.buildLinkOnlyUrl = function(tid, token) {
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        return `${window.location.origin}/send/v0/v0.1/v0.1.5/download.html${tokenParam}#${tid}`;
    };

    console.log('[v0.1.5] SendUpload patched: token usage counter + workflow timings');
})();
