/* =============================================================================
   SGraph Send — Upload Step Done Component
   Step 6: Done / Share Results

   Usage:  <upload-step-done></upload-step-done>

   Properties (set by orchestrator):
     result           — { transferId, combinedUrl, linkOnlyUrl, keyString,
                          friendlyKey, delivery, transparency, isText }
     shareMode        — 'token' | 'combined' | 'separate'
     showPicker       — boolean (true to show share mode card picker)
     fileSummary      — { icon, name, meta, isFolder }
     deliveryOptions  — Array of { id, icon, title }
     stageTimestamps  — object (for timing breakdown)
     selectedDelivery — string (delivery mode id)

   Events emitted:
     step-send-another      — user wants to start over
     step-change-mode       — user clicked "Change"
     step-share-mode-changed — detail: { mode: string }
     step-copy              — detail: { text: string, button: Element }
     step-email-link        — user clicked email link button
   ============================================================================= */

class UploadStepDone extends HTMLElement {

    static _templateHtml = null;

    static PROGRESS_STAGES = {
        'zipping':    { label: 'upload.progress.zipping'    },
        'reading':    { label: 'upload.progress.reading'    },
        'encrypting': { label: 'upload.progress.encrypting' },
        'creating':   { label: 'upload.progress.creating'   },
        'uploading':  { label: 'upload.progress.uploading'  },
        'completing': { label: 'upload.progress.completing' }
    };

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready            = false;
        this._result           = null;
        this._shareMode        = 'token';
        this._showPicker       = false;
        this._fileSummary      = null;
        this._deliveryOptions  = [];
        this._stageTimestamps  = null;
        this._selectedDelivery = null;
    }

    connectedCallback() { this._init(); }

    async _init() {
        var basePath = this._resolveBasePath();
        var compPath = basePath + '/js/components/send-upload/upload-step-done';

        // Load CSS
        var link  = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = compPath + '/upload-step-done.css';
        this.shadowRoot.appendChild(link);

        // Load and cache HTML template
        if (!UploadStepDone._templateHtml) {
            try {
                var resp = await fetch(compPath + '/upload-step-done.html');
                UploadStepDone._templateHtml = await resp.text();
            } catch (e) {
                UploadStepDone._templateHtml = '<div class="step-done"><div class="step-done__content"></div></div>';
            }
        }

        // Clone template into shadow root
        var wrapper = document.createElement('div');
        wrapper.innerHTML = UploadStepDone._templateHtml;
        while (wrapper.firstChild) {
            this.shadowRoot.appendChild(wrapper.firstChild);
        }

        this._container = this.shadowRoot.querySelector('.step-done__content');
        this._ready = true;
        this.render();
    }

    // ── Properties ───────────────────────────────────────────────────────────────

    set result(v)           { this._result = v;           this.render(); }
    get result()            { return this._result; }

    set shareMode(v)        { this._shareMode = v;        this.render(); }
    get shareMode()         { return this._shareMode; }

    set showPicker(v)       { this._showPicker = !!v;     this.render(); }
    get showPicker()        { return this._showPicker; }

    set fileSummary(v)      { this._fileSummary = v;      this.render(); }
    get fileSummary()       { return this._fileSummary; }

    set deliveryOptions(v)  { this._deliveryOptions = v;  this.render(); }
    get deliveryOptions()   { return this._deliveryOptions; }

    set stageTimestamps(v)  { this._stageTimestamps = v;  this.render(); }
    get stageTimestamps()   { return this._stageTimestamps; }

    set selectedDelivery(v) { this._selectedDelivery = v; this.render(); }
    get selectedDelivery()  { return this._selectedDelivery; }

    // ── Rendering ────────────────────────────────────────────────────────────────

    render() {
        if (!this._ready || !this._container) return;

        var result       = this._result;
        var selectedMode = this._shareMode || 'token';
        var showPicker   = this._showPicker;
        var fileSummary  = this._fileSummary;
        var modes        = this._getShareModes();
        var modeConfig   = this._findMode(modes, selectedMode);

        if (!result) {
            this._container.innerHTML = '';
            return;
        }

        // Token mode simplification (v0.2.8): strip everything except share values + send another
        var isTokenStripped = selectedMode === 'token' && !showPicker;

        var html = '';

        // ── Picker mode ──────────────────────────────────────────────────────
        if (showPicker) {
            html += this._renderSuccessBanner();
            html += this._renderFileSummary(fileSummary);
            html += '<h3 class="step-title">How do you want to share it?</h3>';
            html += this._renderShareCards(modes, selectedMode);
            html += this._renderSendAnother();
            this._container.innerHTML = html;
            this._setupListeners();
            return;
        }

        // ── Normal mode ──────────────────────────────────────────────────────

        if (!isTokenStripped) {
            html += this._renderSuccessBanner();
            html += this._renderFileSummary(fileSummary);
            html += this._renderDeliveryLabel(result);
            html += this._renderModeHeader(modeConfig, result, selectedMode);
        }

        // Detail section based on share mode
        if (selectedMode === 'token') {
            html += this._renderToken(result, fileSummary);
        } else if (selectedMode === 'combined') {
            html += this._renderCombined(result);
        } else if (selectedMode === 'separate') {
            html += this._renderSeparate(result);
        }

        if (!isTokenStripped) {
            html += this._renderSecurityNote(modeConfig);
            html += this._renderTimings();
            if (result.transparency) {
                html += '<send-transparency class="transparency-panel"></send-transparency>';
            }
        }

        html += this._renderSendAnother();

        this._container.innerHTML = html;
        this._setupListeners();

        // Set transparency data after DOM insertion
        if (result.transparency && !isTokenStripped) {
            var panel = this.shadowRoot.querySelector('.transparency-panel');
            if (panel && panel.setData) {
                panel.setData(result.transparency);
            }
        }
    }

    // ── Section renderers ────────────────────────────────────────────────────────

    _renderSuccessBanner() {
        return '<div class="success-banner">' +
            '<span class="success-banner__icon">&#10003;</span>' +
            '<span>' + this._esc(this._t('upload.result.encrypted_success', 'Encrypted and uploaded successfully')) + '</span>' +
        '</div>';
    }

    _renderFileSummary(summary) {
        if (!summary) return '';
        return '<div class="file-summary file-summary--compact">' +
            '<span class="file-summary__icon">' + (summary.icon || '&#128196;') + '</span>' +
            '<div>' +
                '<div class="file-summary__name">' + this._esc(summary.name || '') + '</div>' +
                '<div class="file-summary__meta">' + (summary.meta || '') + '</div>' +
            '</div>' +
        '</div>';
    }

    _renderDeliveryLabel(result) {
        if (!result.delivery || result.delivery === 'download') return '';
        var opts = this._deliveryOptions || [];
        var opt  = opts.find(function(o) { return o.id === result.delivery; });
        if (!opt) return '';
        return '<div class="delivery-choice">' +
            '<span class="delivery-choice__label">Delivery:</span>' +
            '<span class="delivery-choice__value">' + opt.icon + ' ' + this._esc(opt.title) + '</span>' +
        '</div>';
    }

    _renderModeHeader(modeConfig, result, selectedMode) {
        if (!modeConfig) return '';
        var modeLocked = selectedMode === 'token' && result.friendlyKey;
        var changeBtn  = modeLocked ? '' : '<button class="mode-change" id="change-mode-btn">Change</button>';
        return '<div class="mode-header">' +
            '<span class="mode-header__icon">' + modeConfig.icon + '</span>' +
            '<span class="mode-header__title">' + this._esc(modeConfig.title) + '</span>' +
            changeBtn +
        '</div>';
    }

    _renderSecurityNote(modeConfig) {
        if (!modeConfig || !modeConfig.security) return '';
        return '<div class="security-note">' +
            '<span>&#128274;</span> ' + this._esc(modeConfig.security) +
        '</div>';
    }

    // ── Token mode rendering (v0.2.8 — file info + simple token + full link + QR) ──

    _renderToken(result, fileSummary) {
        var friendlyKey = result.friendlyKey || '';
        var tokenLink   = this._buildTokenLink(result, friendlyKey);
        var html        = '';

        // File info bar (shown in token-stripped mode where file-summary is removed)
        if (fileSummary) {
            html += '<div class="file-info-bar">' +
                '<span class="file-info-bar__icon">' + (fileSummary.icon || '&#128196;') + '</span>' +
                '<span class="file-info-bar__name">' + this._esc(fileSummary.name || '') + '</span>' +
                '<span class="file-info-bar__size">' + (fileSummary.meta || '') + '</span>' +
            '</div>';
        }

        // Simple token
        html += '<div class="share-value">' +
            '<label class="share-label">Simple token</label>' +
            '<div class="share-row">' +
                '<div class="share-box share-box--friendly" id="simple-token" data-testid="share-simple-token">' + this._esc(friendlyKey) + '</div>' +
                '<button class="copy-btn" data-copy="simple-token" data-testid="copy-simple-token">Copy</button>' +
            '</div>' +
            '<div class="share-guidance">This token derives both the transfer ID and decryption key</div>' +
        '</div>';

        // Full link
        html += '<div class="share-value">' +
            '<label class="share-label">Full link</label>' +
            '<div class="share-row">' +
                '<div class="share-box" id="full-link" data-testid="share-full-link">' + this._esc(tokenLink) + '</div>' +
                '<button class="copy-btn" data-copy="full-link" data-testid="copy-full-link">Copy</button>' +
            '</div>' +
            '<div class="share-guidance">Direct link &mdash; anyone with this can decrypt the file</div>' +
        '</div>';

        // QR code + Open in new tab
        var qrSvg = '';
        if (typeof window !== 'undefined' && window.sgraphSend && window.sgraphSend.qr && tokenLink) {
            qrSvg = window.sgraphSend.qr.toSvg(tokenLink, {
                ecl: 'medium', border: 2, lightColor: '#ffffff', darkColor: '#1A1A2E'
            });
        }

        var openLinkHtml = tokenLink
            ? '<a class="qr-open-row__link" href="' + this._esc(tokenLink) + '" target="_blank" rel="noopener">' +
                  '<span class="qr-open-row__link-icon">&#8599;</span>' +
                  '<span class="qr-open-row__link-text">Open in new tab</span>' +
                  '<span class="qr-open-row__link-hint">Test the recipient experience</span>' +
              '</a>'
            : '';

        if (qrSvg || openLinkHtml) {
            html += '<div class="qr-open-row">';
            if (qrSvg) {
                html += '<div class="qr-section">' +
                    '<div class="qr-code">' + qrSvg + '</div>' +
                    '<div class="qr-label">Scan to open link</div>' +
                '</div>';
            }
            if (openLinkHtml) {
                html += openLinkHtml;
            }
            html += '</div>';
        }

        // Email link button
        html += '<div style="text-align: center;">' +
            '<button class="email-link-btn" id="email-link-btn">&#9993; Email link</button>' +
        '</div>';

        return html;
    }

    // ── Combined link rendering ──────────────────────────────────────────────────

    _renderCombined(result) {
        return '<div class="share-value">' +
            '<label class="share-label">Share this link</label>' +
            '<div class="share-row">' +
                '<div class="share-box" id="combined-link">' + this._esc(result.combinedUrl || '') + '</div>' +
                '<button class="copy-btn" data-copy="combined-link">' + this._esc(this._t('upload.result.copy_link', 'Copy link')) + '</button>' +
            '</div>' +
            '<a href="' + this._esc(result.combinedUrl || '') + '" target="_blank" rel="noopener" class="open-link">Open in new tab &#8599;</a>' +
        '</div>';
    }

    // ── Separate link + key rendering ────────────────────────────────────────────

    _renderSeparate(result) {
        return '<div class="share-value">' +
            '<label class="share-label">1. Send this link</label>' +
            '<div class="share-row">' +
                '<div class="share-box" id="link-only">' + this._esc(result.linkOnlyUrl || '') + '</div>' +
                '<button class="copy-btn" data-copy="link-only">' + this._esc(this._t('upload.result.copy', 'Copy')) + '</button>' +
            '</div>' +
        '</div>' +
        '<div class="share-value">' +
            '<label class="share-label">2. Send this key separately</label>' +
            '<div class="share-row">' +
                '<div class="share-box share-box--key" id="decryption-key">' + this._esc(result.keyString || '') + '</div>' +
                '<button class="copy-btn" data-copy="decryption-key">' + this._esc(this._t('upload.result.copy', 'Copy')) + '</button>' +
            '</div>' +
            '<div class="share-guidance">Send through a different channel (e.g. link via email, key via chat)</div>' +
        '</div>';
    }

    // ── Share cards (picker mode) ────────────────────────────────────────────────

    _renderShareCards(modes, selectedMode) {
        var self = this;
        var cardsHtml = modes.map(function(mode) {
            var activeClass = mode.id === selectedMode ? ' share-card--active' : '';
            return '<div class="share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
                '<div class="share-card__icon">' + mode.icon + '</div>' +
                '<div class="share-card__body">' +
                    '<div class="share-card__title">' + self._esc(mode.title) + '</div>' +
                    '<div class="share-card__desc">' + self._esc(mode.desc) + '</div>' +
                    '<div class="share-card__hint">' + self._esc(mode.hint) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        return '<div class="share-cards">' + cardsHtml + '</div>';
    }

    // ── Timings breakdown ────────────────────────────────────────────────────────

    _renderTimings() {
        var ts = this._stageTimestamps;
        if (!ts || !ts.complete) return '';

        var allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing', 'complete'];
        var stages    = allStages.filter(function(s) { return ts[s] !== undefined; });
        if (stages.length < 2) return '';

        var totalMs = ts.complete - ts[stages[0]];
        var rows    = [];
        var self    = this;

        for (var i = 0; i < stages.length - 1; i++) {
            var from = stages[i];
            var to   = stages[i + 1];
            if (ts[from] && ts[to]) {
                var ms    = ts[to] - ts[from];
                var pct   = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
                var cfg   = UploadStepDone.PROGRESS_STAGES[from];
                var label = cfg ? self._t(cfg.label, from) : from;
                label     = label.replace('...', '');

                rows.push(
                    '<div class="timings__row">' +
                        '<span class="timings__label">' + self._esc(label) + '</span>' +
                        '<div class="timings__bar">' +
                            '<div class="timings__bar-fill" style="width: ' + pct + '%;"></div>' +
                        '</div>' +
                        '<span class="timings__ms">' + ms + 'ms</span>' +
                    '</div>'
                );
            }
        }

        if (rows.length === 0) return '';

        return '<div class="timings">' +
            '<div class="timings__title">' +
                this._esc(this._t('upload.timing.title', 'Completed in')) + ' ' + (totalMs / 1000).toFixed(2) + 's' +
            '</div>' +
            '<div class="timings__rows">' + rows.join('') + '</div>' +
        '</div>';
    }

    // ── Send another button ──────────────────────────────────────────────────────

    _renderSendAnother() {
        return '<div class="send-another-wrap">' +
            '<button class="send-another-btn" id="send-another-btn">' +
                this._esc(this._t('upload.result.send_another', 'Send another')) +
            '</button>' +
        '</div>';
    }

    // ── Event Listeners ──────────────────────────────────────────────────────────

    _setupListeners() {
        var self = this;

        // Copy buttons — handle clipboard internally within shadow DOM
        this.shadowRoot.querySelectorAll('[data-copy]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var targetId = e.currentTarget.getAttribute('data-copy');
                var el       = self.shadowRoot.querySelector('#' + targetId);
                if (!el) return;
                var text = el.textContent;

                navigator.clipboard.writeText(text).then(function() {
                    var original     = btn.textContent;
                    btn.textContent  = 'Copied!';
                    setTimeout(function() { btn.textContent = original; }, 1500);
                }).catch(function() {
                    // Fallback: emit event for orchestrator to handle
                });

                self._emit('step-copy', { text: text, button: btn });
            });
        });

        // Share mode card selection (picker mode)
        this.shadowRoot.querySelectorAll('[data-share-mode]').forEach(function(card) {
            card.addEventListener('click', function() {
                self._emit('step-share-mode-changed', { mode: card.getAttribute('data-share-mode') });
            });
        });

        // Change mode button
        var changeBtn = this.shadowRoot.querySelector('#change-mode-btn');
        if (changeBtn) {
            changeBtn.addEventListener('click', function() {
                self._emit('step-change-mode');
            });
        }

        // Email link button
        var emailBtn = this.shadowRoot.querySelector('#email-link-btn');
        if (emailBtn) {
            emailBtn.addEventListener('click', function() {
                self._emit('step-email-link');
            });
        }

        // Send another
        var sendAnotherBtn = this.shadowRoot.querySelector('#send-another-btn');
        if (sendAnotherBtn) {
            sendAnotherBtn.addEventListener('click', function() {
                self._emit('step-send-another');
            });
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            bubbles:  true,
            composed: true,
            detail:   detail || {}
        }));
    }

    _esc(str) {
        return (typeof SendHelpers !== 'undefined' && SendHelpers.escapeHtml)
            ? SendHelpers.escapeHtml(str)
            : String(str || '');
    }

    _t(key, fallback) {
        if (typeof I18n !== 'undefined' && I18n.t) {
            var val = I18n.t(key);
            return val !== key ? val : (fallback || key);
        }
        return fallback || key;
    }

    _getShareModes() {
        if (typeof UploadCrypto !== 'undefined' && UploadCrypto.SHARE_MODES) {
            return UploadCrypto.SHARE_MODES;
        }
        // Inline fallback
        return [
            { id: 'token',    icon: '\uD83C\uDFAB', title: 'Simple token',         desc: 'A short transfer ID they can enter on the site. Key sent separately.', hint: 'Easiest \u2014 share verbally or in a message',  security: 'Recipient needs both the token and the key'  },
            { id: 'combined', icon: '\uD83D\uDD17', title: 'Combined link',         desc: 'One link with the decryption key embedded. Recipient clicks and gets the file.', hint: 'Simplest \u2014 one click for the recipient', security: 'Anyone with this link can decrypt the file'  },
            { id: 'separate', icon: '\uD83D\uDD10', title: 'Link + key separate',   desc: 'Send the link and decryption key through different channels.', hint: 'More secure \u2014 requires both pieces',               security: 'Neither piece works alone'                    }
        ];
    }

    _findMode(modes, id) {
        return modes.find(function(m) { return m.id === id; }) || modes[0] || null;
    }

    _buildTokenLink(result, friendlyKey) {
        var delivery = result.delivery || 'download';
        var route    = delivery === 'download' ? 'download' : delivery;
        var origin   = (typeof window !== 'undefined') ? window.location.origin : '';
        // Detect locale prefix from current URL path
        var locale   = this._detectLocalePrefix();
        return origin + '/' + locale + '/' + route + '/#' + friendlyKey;
    }

    _detectLocalePrefix() {
        if (typeof window === 'undefined') return 'en-gb';
        var match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
        return match ? match[1] : 'en-gb';
    }

    _resolveBasePath() {
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath) {
            return SendComponentPaths.basePath;
        }
        return '../_common';
    }
}

customElements.define('upload-step-done', UploadStepDone);
