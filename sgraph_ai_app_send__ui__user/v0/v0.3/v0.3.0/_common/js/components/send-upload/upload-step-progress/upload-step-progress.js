/* =============================================================================
   SGraph Send — Upload Step Progress Component
   Step 5: Encrypt & Upload Progress (display-only)

   Usage:
     <upload-step-progress></upload-step-progress>

   Properties (set by orchestrator, trigger re-render):
     stage           — 'zipping' | 'reading' | 'encrypting' | 'creating' | 'uploading' | 'completing'
     stageTimestamps — { [stage]: timestamp } for timing calculation
     carouselMessage — { icon, text } current message to display

   Events emitted: None — pure display component.

   Extracted from monolith versions:
     v0.2.0  — basic progress bar
     v0.2.3  — processing layout with label and hint
     v0.2.7  — carousel messages with fade animation
     v0.2.8  — two-column layout with live timing stats
     v0.2.10 — vertical centering, transparent messages column
   ============================================================================= */

var PROGRESS_STAGES = {
    zipping    : 5,
    reading    : 10,
    encrypting : 30,
    creating   : 50,
    uploading  : 70,
    completing : 90
};

var STAGE_LABELS = {
    zipping    : 'Compressing',
    reading    : 'Reading',
    encrypting : 'Encrypting',
    creating   : 'Creating transfer',
    uploading  : 'Uploading',
    completing : 'Completing'
};

var ALL_STAGES = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];

class UploadStepProgress extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._stage           = null;
        this._stageTimestamps = {};
        this._carouselMessage = null;
        this._carouselKey     = 0;       // track message changes for re-animation
    }

    /* ─── Public properties ──────────────────────────────────────────── */

    get stage() { return this._stage; }
    set stage(value) {
        if (value !== this._stage) {
            this._stage = value;
            this._update();
        }
    }

    get stageTimestamps() { return this._stageTimestamps; }
    set stageTimestamps(value) {
        this._stageTimestamps = value || {};
        this._update();
    }

    get carouselMessage() { return this._carouselMessage; }
    set carouselMessage(value) {
        var changed = !this._carouselMessage ||
                      !value ||
                      this._carouselMessage.text !== value.text;
        this._carouselMessage = value;
        if (changed) {
            this._carouselKey++;
        }
        this._update();
    }

    /* ─── Lifecycle ──────────────────────────────────────────────────── */

    connectedCallback() {
        this._render();
    }

    /* ─── Initial render (structure + styles) ────────────────────────── */

    _render() {
        var shadow = this.shadowRoot;
        shadow.innerHTML = '';

        // Load CSS
        var link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = this._cssPath();
        shadow.appendChild(link);

        // Build template
        var wrapper = document.createElement('div');
        wrapper.className = 'step-progress';
        wrapper.innerHTML =
            '<span class="progress-bar__label"></span>' +
            '<div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">' +
                '<div class="progress-bar__fill"></div>' +
            '</div>' +
            '<div class="progress-columns">' +
                '<div class="progress-col progress-col--messages">' +
                    '<div class="carousel-message">' +
                        '<span class="carousel-message__icon"></span>' +
                        '<span class="carousel-message__text"></span>' +
                    '</div>' +
                '</div>' +
                '<div class="progress-col progress-col--timing">' +
                    '<div class="timing-rows"></div>' +
                '</div>' +
            '</div>' +
            '<div class="step-progress__hint">' +
                'Keep this tab open while your file uploads.' +
            '</div>';

        shadow.appendChild(wrapper);
        this._update();
    }

    /* ─── CSS path resolution ────────────────────────────────────────── */

    _cssPath() {
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.forComponent) {
            return SendComponentPaths.forComponent('send-upload/upload-step-progress', 'upload-step-progress.css');
        }
        // Fallback: resolve relative to current script
        try {
            var scripts = document.querySelectorAll('script[src]');
            for (var i = scripts.length - 1; i >= 0; i--) {
                if (scripts[i].src.indexOf('upload-step-progress') !== -1) {
                    return scripts[i].src.replace(/\.js$/, '.css');
                }
            }
        } catch (e) { /* ignore */ }
        return 'upload-step-progress.css';
    }

    /* ─── Incremental update ─────────────────────────────────────────── */

    _update() {
        var shadow = this.shadowRoot;
        if (!shadow || !shadow.querySelector('.step-progress')) return;

        var stage = this._stage;
        var pct   = stage && PROGRESS_STAGES[stage] !== undefined ? PROGRESS_STAGES[stage] : 5;
        var label = stage && STAGE_LABELS[stage] ? STAGE_LABELS[stage] : 'Processing...';

        // Translate label if I18n is available
        if (typeof I18n !== 'undefined' && I18n.t) {
            var translated = I18n.t(label);
            if (translated) label = translated;
        }

        // Update progress bar
        var fill = shadow.querySelector('.progress-bar__fill');
        if (fill) fill.style.width = pct + '%';

        var bar = shadow.querySelector('.progress-bar');
        if (bar) bar.setAttribute('aria-valuenow', pct);

        var barLabel = shadow.querySelector('.progress-bar__label');
        if (barLabel) barLabel.textContent = label;

        // Update carousel message
        this._updateCarousel();

        // Update timing rows
        this._updateTimingRows();
    }

    /* ─── Carousel message with fade-in ──────────────────────────────── */

    _updateCarousel() {
        var shadow  = this.shadowRoot;
        var wrapper = shadow.querySelector('.carousel-message');
        if (!wrapper) return;

        var msg = this._carouselMessage;
        if (!msg) {
            wrapper.style.display = 'none';
            return;
        }

        wrapper.style.display = '';

        var iconEl = wrapper.querySelector('.carousel-message__icon');
        var textEl = wrapper.querySelector('.carousel-message__text');

        if (iconEl) iconEl.textContent = msg.icon || '';
        if (textEl) textEl.textContent = msg.text || '';

        // Re-trigger fade-in animation by cloning
        var parent = wrapper.parentNode;
        if (parent) {
            var clone = wrapper.cloneNode(true);
            parent.replaceChild(clone, wrapper);
        }
    }

    /* ─── Timing rows for completed stages ───────────────────────────── */

    _updateTimingRows() {
        var shadow    = this.shadowRoot;
        var container = shadow.querySelector('.timing-rows');
        if (!container) return;

        var ts           = this._stageTimestamps;
        var currentIndex = ALL_STAGES.indexOf(this._stage);
        var html         = '';

        for (var i = 0; i < ALL_STAGES.length; i++) {
            var s    = ALL_STAGES[i];
            var next = ALL_STAGES[i + 1] || this._stage;

            if (ts[s] && ts[next] && i < currentIndex) {
                var ms       = ts[next] - ts[s];
                var duration = this._formatDuration(ms);
                var stageLabel = STAGE_LABELS[s] || s;

                // Translate if I18n available
                if (typeof I18n !== 'undefined' && I18n.t) {
                    var translated = I18n.t(stageLabel);
                    if (translated) stageLabel = translated;
                }

                html +=
                    '<div class="timing-row">' +
                        '<span class="timing-row__label">' + this._escapeHtml(stageLabel) + '</span>' +
                        '<span class="timing-row__check">&#10003;</span>' +
                        '<span class="timing-row__duration">' + duration + '</span>' +
                    '</div>';
            }
        }

        container.innerHTML = html;
    }

    /* ─── Helpers ─────────────────────────────────────────────────────── */

    _formatDuration(ms) {
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(1) + 's';
    }

    _escapeHtml(str) {
        if (typeof SendHelpers !== 'undefined' && SendHelpers.escapeHtml) {
            return SendHelpers.escapeHtml(str);
        }
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

/* ─── Constants exposed for orchestrator use ─────────────────────────── */

UploadStepProgress.PROGRESS_STAGES = PROGRESS_STAGES;
UploadStepProgress.STAGE_LABELS    = STAGE_LABELS;
UploadStepProgress.ALL_STAGES      = ALL_STAGES;

/* ─── Register ───────────────────────────────────────────────────────── */

if (!customElements.get('upload-step-progress')) {
    customElements.define('upload-step-progress', UploadStepProgress);
}
