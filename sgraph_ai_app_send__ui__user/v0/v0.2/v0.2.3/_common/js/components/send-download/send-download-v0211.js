// ═══════════════════════════════════════════════════════════════════════════
// send-download-v0211.js — Route-aware single-file rendering
// ═══════════════════════════════════════════════════════════════════════════
//
// Problem: For single files (non-zip), all three routes (/download/, /gallery/,
// /browse/) show the identical two-column viewer layout.
//
// Fix:
//   /download/  → auto-download on decrypt, minimal confirmation page
//   /gallery/   → full-width rendered content with minimal chrome (gallery UX)
//   /browse/    → two-column viewer (current behaviour, unchanged)
//
// This overlay patches renderComplete() to check the URL route and dispatch
// to different layouts for single-file transfers.
// ═══════════════════════════════════════════════════════════════════════════

(function() {
'use strict';

// ─── Route detection ─────────────────────────────────────────────────────

function getRoute() {
    var p = window.location.pathname;
    if (p.indexOf('/gallery')  !== -1) return 'gallery';
    if (p.indexOf('/download') !== -1) return 'download';
    return 'browse';  // /browse/ or anything else → viewer
}

// ─── Patch the decrypt completion to auto-download for /download/ route ──

// The base code (line 994-998) skips auto-download for previewable types.
// On the /download/ route, we WANT auto-download regardless of type.

var _v0210_processDecrypted = SendDownload.prototype._processDecryptedContent
                           || SendDownload.prototype._decryptContent;

// We need to hook into the completion flow. The simplest approach:
// after state becomes 'complete', if we're on /download/ and the file
// was previewable (so it wasn't auto-downloaded), trigger the download.

var _v0210_setupListeners = SendDownload.prototype.setupEventListeners;

SendDownload.prototype.setupEventListeners = function() {
    _v0210_setupListeners.call(this);

    if (this.state !== 'complete') return;

    var route = getRoute();

    // On /download/ route: trigger auto-download for previewable single files
    if (route === 'download' && this._renderType && this._renderType !== 'zip' && this.decryptedBytes) {
        var self = this;
        // Small delay to let the UI render the confirmation first
        setTimeout(function() {
            self.saveFile(self.decryptedBytes, self.fileName || 'download');
        }, 300);
    }
};

// ─── Patch renderComplete for route-aware single-file layouts ────────────

var _v0210_renderComplete = SendDownload.prototype.renderComplete;

SendDownload.prototype.renderComplete = function() {
    if (this.state !== 'complete') return '';

    // Only intercept single files (non-zip, non-text)
    var isSinglePreviewable = this._renderType && this._renderType !== 'zip' && this._renderType !== 'text';
    if (!isSinglePreviewable) {
        return _v0210_renderComplete.call(this);
    }

    var route = getRoute();

    // /browse/ → default two-column viewer (existing behaviour)
    if (route === 'browse') {
        return _v0210_renderComplete.call(this);
    }

    // /download/ → minimal confirmation with re-download button
    if (route === 'download') {
        return this._v0211_renderDownloadConfirmation();
    }

    // /gallery/ → full-width gallery-style presentation
    if (route === 'gallery') {
        return this._v0211_renderGallerySingle();
    }

    return _v0210_renderComplete.call(this);
};

// ─── Download confirmation layout ────────────────────────────────────────
// Shows: success banner, file info, "Save Again" button, share section

SendDownload.prototype._v0211_renderDownloadConfirmation = function() {
    var filename   = this.fileName || 'download';
    var type       = this._renderType;
    var badgeLabel = (type === 'code' && typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getLanguage(filename) : type;
    var sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    var uploadDate = this.transferInfo ? this.formatTimestamp(this.transferInfo.created_at) : '';
    var downloads  = this.transferInfo ? (this.transferInfo.download_count || 0) : 0;
    var timingHtml = this._renderTimings ? this._renderTimings() : '';

    // Build share section
    var hash      = window.location.hash || '';
    var viewerUrl = window.location.pathname.replace('/download', '/browse') + hash;
    var galleryUrl = window.location.pathname.replace('/download', '/gallery') + hash;

    return '\
        <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-4);">\
            File decrypted and downloading...\
        </div>\
        <div style="max-width: 600px; margin: 0 auto;">\
            <div style="text-align: center; margin-bottom: var(--space-6);">\
                <div style="font-size: 3rem; margin-bottom: var(--space-3);">\u2B07\uFE0F</div>\
                <h3 style="margin: 0 0 var(--space-2) 0; font-size: var(--text-h3); font-weight: var(--weight-bold); color: var(--color-text); word-break: break-all;">' + this.escapeHtml(filename) + '</h3>\
                <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; margin-bottom: var(--space-2);">\
                    <span style="font-size: var(--text-small); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle); padding: 2px 8px; border-radius: var(--radius-sm);">' + this.escapeHtml(badgeLabel) + '</span>\
                    <span style="font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono);">' + this.escapeHtml(sizeStr) + '</span>\
                </div>\
                <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">\
                    Uploaded: ' + this.escapeHtml(uploadDate) + '\
                    ' + (downloads > 0 ? '&nbsp;&middot;&nbsp; Downloads: ' + downloads : '') + '\
                </div>\
            </div>\
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-5);">\
                <button class="btn btn-primary" id="save-file-btn" style="width: 100%; padding: var(--space-4); font-size: var(--text-body); font-weight: var(--weight-bold);">\
                    Save Again\
                </button>\
                <div style="display: flex; gap: var(--space-2);">\
                    <a href="' + this.escapeHtml(viewerUrl) + '" class="btn btn-sm btn-secondary" style="flex: 1; text-align: center; text-decoration: none;">\uD83D\uDCC4 View file</a>\
                    <a href="' + this.escapeHtml(galleryUrl) + '" class="btn btn-sm btn-secondary" style="flex: 1; text-align: center; text-decoration: none;">\uD83D\uDDBC\uFE0F Gallery view</a>\
                </div>\
            </div>\
            <send-transparency id="transparency-panel"></send-transparency>\
            ' + timingHtml + '\
        </div>';
};

// ─── Gallery single-file layout ──────────────────────────────────────────
// Full-width rendered content with minimal sidebar (file info below content)

SendDownload.prototype._v0211_renderGallerySingle = function() {
    var filename   = this.fileName || 'download';
    var type       = this._renderType;
    var badgeLabel = (type === 'code' && typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.getLanguage(filename) : type;
    var sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    var uploadDate = this.transferInfo ? this.formatTimestamp(this.transferInfo.created_at) : '';
    var downloads  = this.transferInfo ? (this.transferInfo.download_count || 0) : 0;
    var timingHtml = this._renderTimings ? this._renderTimings() : '';

    // Render content based on type (reuse existing renderers)
    var contentHtml = '';
    switch (type) {
        case 'markdown': contentHtml = this._renderMarkdownContent(); break;
        case 'image':    contentHtml = this._renderImageContent();    break;
        case 'pdf':      contentHtml = this._renderPdfContent();      break;
        case 'code':     contentHtml = this._renderCodeContent();     break;
        case 'audio':    contentHtml = this._renderAudioContent();    break;
        case 'video':    contentHtml = this._renderVideoContent();    break;
        default:         contentHtml = this._renderRawContent();
    }

    var rawToggle = (type === 'markdown' || type === 'code')
        ? '<button class="btn btn-sm btn-secondary" id="toggle-raw-btn">' + this.escapeHtml(this._showRaw ? 'View rendered' : 'View raw') + '</button>'
        : '';

    var printBtn = (type === 'markdown' && typeof SgPrint !== 'undefined')
        ? '<button class="btn btn-sm btn-secondary" id="v0211-print-btn">\u2399 Print</button>'
        : '';

    var hash       = window.location.hash || '';
    var viewerUrl  = window.location.pathname.replace('/gallery', '/browse') + hash;

    return '\
        <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-4);">\
            ' + this.escapeHtml(this.t('download.result.file_success')) + '\
        </div>\
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">\
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2);">\
                <div style="display: flex; align-items: center; gap: var(--space-3);">\
                    <h3 style="margin: 0; font-size: var(--text-h3); font-weight: var(--weight-bold); color: var(--color-text); word-break: break-all;">' + this.escapeHtml(filename) + '</h3>\
                    <span style="font-size: var(--text-small); color: var(--accent); font-family: var(--font-mono); background: var(--accent-subtle); padding: 2px 8px; border-radius: var(--radius-sm);">' + this.escapeHtml(badgeLabel) + '</span>\
                    <span style="font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono);">' + this.escapeHtml(sizeStr) + '</span>\
                </div>\
                <div style="display: flex; gap: var(--space-2); align-items: center;">\
                    <button class="btn btn-primary btn-sm" id="save-file-btn">Save Locally</button>\
                    ' + printBtn + '\
                    ' + rawToggle + '\
                    <a href="' + this.escapeHtml(viewerUrl) + '" class="btn btn-sm btn-secondary" style="text-decoration: none;">\uD83D\uDCC4 Viewer</a>\
                </div>\
            </div>\
            <div id="gallery-content-panel" style="border: 2px solid var(--accent); border-radius: var(--radius-md); background: var(--bg-secondary); min-height: 500px; overflow: auto;">\
                ' + contentHtml + '\
            </div>\
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">\
                <send-transparency id="transparency-panel"></send-transparency>\
                <div style="display: flex; flex-direction: column; gap: var(--space-2);">\
                    <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">\
                        Uploaded: ' + this.escapeHtml(uploadDate) + '\
                        ' + (downloads > 0 ? '&nbsp;&middot;&nbsp; Downloads: ' + downloads : '') + '\
                    </div>\
                    ' + timingHtml + '\
                </div>\
            </div>\
        </div>';
};

// ─── Print button handler for gallery view ───────────────────────────────

var _v0211_setupListeners = SendDownload.prototype.setupEventListeners;
SendDownload.prototype.setupEventListeners = function() {
    _v0211_setupListeners.call(this);

    var printBtn = document.getElementById('v0211-print-btn');
    if (printBtn && !printBtn._v0211) {
        printBtn._v0211 = true;
        var self = this;
        printBtn.addEventListener('click', function() {
            if (typeof SgPrint !== 'undefined' && self.decryptedBytes) {
                var rawText  = new TextDecoder().decode(self.decryptedBytes);
                var html     = (typeof MarkdownParser !== 'undefined') ? MarkdownParser.parse(rawText) : self.escapeHtml(rawText);
                SgPrint.printMarkdown(html, self.fileName || 'document.md');
            }
        });
    }
};

})();
