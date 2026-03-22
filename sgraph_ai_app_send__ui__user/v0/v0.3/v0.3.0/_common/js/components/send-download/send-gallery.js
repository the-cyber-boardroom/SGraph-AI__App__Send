/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Gallery Component v0.3.0
   Clean rewrite — responsive thumbnail grid with lightbox

   View modes:  compact (5+ cols)  |  grid (4 cols)  |  large (2-3 cols)
   Features:    Lightbox, type badges, file save, share, print
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendGallery extends HTMLElement {

    constructor() {
        super();
        this.zipTree      = null;
        this.zipInstance   = null;
        this.zipOrigBytes = null;
        this.zipOrigName  = null;
        this.fileName     = null;
        this.transferId   = null;
        this.downloadUrl  = null;

        this._viewMode      = 'grid';
        this._lightboxIndex = -1;
        this._thumbUrls     = [];
        this._entries       = [];
    }

    connectedCallback() {
        if (this.zipTree) this._build();
    }

    disconnectedCallback() {
        this._revokeUrls();
    }

    _revokeUrls() {
        this._thumbUrls.forEach(u => URL.revokeObjectURL(u));
        this._thumbUrls = [];
    }

    _buildSwitchUrl(targetMode) {
        const path = window.location.pathname.replace(/\/(gallery|browse|download|view)(\/|$)/, `/${targetMode}$2`);
        return path + window.location.search + window.location.hash;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Build
    // ═══════════════════════════════════════════════════════════════════════════

    async _build() {
        const files = this.zipTree.filter(e => !e.dir);
        this._entries = files;

        SendGallery._injectCss();
        this.innerHTML = `
            <div class="sg-gallery">
                <div class="sg-gallery__header">
                    <div class="sg-gallery__header-left">
                        <span class="sg-gallery__icon">${SendIcons.GRID}</span>
                        <span class="sg-gallery__name">${SendHelpers.escapeHtml(this.fileName || 'Archive')}</span>
                        <span class="sg-gallery__badge">gallery</span>
                        <span class="sg-gallery__meta">${SendHelpers.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)} · ${files.length} files</span>
                    </div>
                    <div class="sg-gallery__header-right">
                        <div class="sg-gallery__modes">
                            <button class="sg-gallery__mode-btn" data-mode="compact" title="Compact">${SendIcons.COMPACT}</button>
                            <button class="sg-gallery__mode-btn sg-gallery__mode-btn--active" data-mode="grid" title="Grid">${SendIcons.GRID_SM}</button>
                            <button class="sg-gallery__mode-btn" data-mode="large" title="Large">${SendIcons.LARGE}</button>
                        </div>
                        <button class="sg-gallery__action-btn" id="sg-copy-link" title="Copy Link">${SendIcons.LINK} Copy Link</button>
                        <button class="sg-gallery__action-btn" id="sg-email" title="Email">${SendIcons.MAIL}</button>
                        <button class="sg-gallery__action-btn" id="sg-print" title="Print">${SendIcons.PRINT}</button>
                        <button class="sg-gallery__save-btn" id="sg-save-zip">${SendIcons.DOWNLOAD} Save locally</button>
                        <a href="${this._buildSwitchUrl('browse')}" class="sg-gallery__action-btn" title="Folder view">${SendIcons.FOLDER_MD} Folder view</a>
                        <button class="sg-gallery__action-btn" id="sg-info" title="Info">${SendIcons.INFO}</button>
                    </div>
                </div>
                <div class="sg-gallery__grid sg-gallery__grid--grid" id="sg-grid"></div>
            </div>
            ${this._buildLightbox()}
        `;

        this._setupListeners();
        await this._loadThumbnails();
    }

    // ─── Thumbnail Loading ──────────────────────────────────────────────────

    async _loadThumbnails() {
        const grid = this.querySelector('#sg-grid');
        if (!grid) return;

        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            const card = document.createElement('div');
            card.className = 'sg-thumb';
            card.dataset.index = i;

            const type = typeof FileTypeDetect !== 'undefined'
                ? FileTypeDetect.detect(entry.name, null) : null;
            const ext = (entry.name.split('.').pop() || '').toUpperCase();

            const imgDiv = document.createElement('div');
            imgDiv.className = 'sg-thumb__img';

            // Type badge
            const badge = document.createElement('span');
            badge.className = 'sg-thumb__badge';
            badge.textContent = ext;
            badge.style.background = SendIcons.BADGE_COLORS[type] || 'rgba(0,0,0,0.6)';
            imgDiv.appendChild(badge);

            if (type === 'image') {
                // Load preview thumbnail if available, else load actual image
                const previewPath = this._findPreview(entry.path);
                const thumbEntry = previewPath
                    ? this.zipTree.find(e => e.path === previewPath)
                    : entry;

                try {
                    const bytes = await (thumbEntry || entry).entry.async('arraybuffer');
                    const mime = FileTypeDetect.getImageMime(entry.name) || 'image/jpeg';
                    const blob = new Blob([bytes], { type: mime });
                    const url = URL.createObjectURL(blob);
                    this._thumbUrls.push(url);
                    imgDiv.style.backgroundImage = `url(${url})`;
                } catch (_) {
                    imgDiv.innerHTML += SendIcons.TYPE_ICONS.image;
                }
            } else {
                // Non-image: show type icon
                imgDiv.innerHTML += (SendIcons.TYPE_ICONS[type] || SendIcons.TYPE_ICONS.other);
            }

            const label = document.createElement('div');
            label.className = 'sg-thumb__label';
            label.textContent = entry.name;

            card.appendChild(imgDiv);
            card.appendChild(label);
            grid.appendChild(card);

            // Click handler
            card.addEventListener('click', () => this._openLightbox(i));
        }
    }

    _findPreview(path) {
        // Look for _preview/ version of this file
        const name = path.split('/').pop();
        const candidates = [
            `_preview/${name}`,
            `_preview/${name.replace(/\.[^.]+$/, '.webp')}`,
            `_preview/${name.replace(/\.[^.]+$/, '.jpg')}`,
        ];
        for (const c of candidates) {
            if (this.zipTree.find(e => e.path === c)) return c;
        }
        return null;
    }

    // ─── Lightbox ───────────────────────────────────────────────────────────

    _buildLightbox() {
        return `
            <div class="sg-lightbox" id="sg-lightbox">
                <div class="sg-lightbox__header">
                    <span class="sg-lightbox__brand">${SendIcons.LOGO} SG/Send</span>
                    <span class="sg-lightbox__title" id="sg-lb-title"></span>
                    <button class="sg-lightbox__close" id="sg-lb-close">&times;</button>
                </div>
                <div class="sg-lightbox__body">
                    <button class="sg-lightbox__nav sg-lightbox__nav--prev" id="sg-lb-prev">&lsaquo;</button>
                    <div class="sg-lightbox__content" id="sg-lb-content"></div>
                    <button class="sg-lightbox__nav sg-lightbox__nav--next" id="sg-lb-next">&rsaquo;</button>
                </div>
                <div class="sg-lightbox__footer">
                    <span id="sg-lb-counter"></span>
                    <button class="sg-gallery__save-btn sg-lightbox__save" id="sg-lb-save">${SendIcons.DOWNLOAD} Save</button>
                </div>
            </div>
        `;
    }

    async _openLightbox(index) {
        this._lightboxIndex = index;
        const lb = this.querySelector('#sg-lightbox');
        if (!lb) return;
        lb.style.display = 'flex';
        await this._showLightboxItem(index);
        document.addEventListener('keydown', this._lbKeyHandler);
    }

    _closeLightbox() {
        const lb = this.querySelector('#sg-lightbox');
        if (lb) lb.style.display = 'none';
        document.removeEventListener('keydown', this._lbKeyHandler);
    }

    async _showLightboxItem(index) {
        const entry = this._entries[index];
        if (!entry) return;

        this._lightboxIndex = index;
        const title   = this.querySelector('#sg-lb-title');
        const content = this.querySelector('#sg-lb-content');
        const counter = this.querySelector('#sg-lb-counter');
        if (title)   title.textContent = entry.name;
        if (counter) counter.textContent = `${index + 1} / ${this._entries.length}`;
        if (!content) return;

        content.innerHTML = '<div style="color: var(--color-text-secondary);">Loading...</div>';

        const type = typeof FileTypeDetect !== 'undefined'
            ? FileTypeDetect.detect(entry.name, null) : null;

        try {
            const bytes = await entry.entry.async('arraybuffer');

            if (type === 'image') {
                const mime = FileTypeDetect.getImageMime(entry.name) || 'image/jpeg';
                const blob = new Blob([bytes], { type: mime });
                const url = URL.createObjectURL(blob);
                this._thumbUrls.push(url);
                content.innerHTML = `<img src="${url}" class="sg-lightbox__img" alt="${SendHelpers.escapeHtml(entry.name)}">`;
            } else if (type === 'markdown') {
                const text = new TextDecoder().decode(bytes);
                const html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(text) : SendHelpers.escapeHtml(text);
                content.innerHTML = `<div class="sg-lightbox__doc">${html}</div>`;
            } else if (type === 'pdf') {
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                this._thumbUrls.push(url);
                content.innerHTML = `<iframe src="${url}" class="sg-lightbox__pdf"></iframe>`;
            } else {
                const text = new TextDecoder().decode(bytes);
                content.innerHTML = `<pre class="sg-lightbox__code">${SendHelpers.escapeHtml(text)}</pre>`;
            }
        } catch (err) {
            content.innerHTML = `<div style="color: var(--color-error);">Failed to load: ${SendHelpers.escapeHtml(err.message)}</div>`;
        }
    }

    _lbKeyHandler = (e) => {
        if (e.key === 'Escape') this._closeLightbox();
        if (e.key === 'ArrowLeft')  this._showLightboxItem(Math.max(0, this._lightboxIndex - 1));
        if (e.key === 'ArrowRight') this._showLightboxItem(Math.min(this._entries.length - 1, this._lightboxIndex + 1));
    };

    // ─── Event Listeners ────────────────────────────────────────────────────

    _setupListeners() {
        // View mode buttons
        this.querySelectorAll('.sg-gallery__mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.querySelectorAll('.sg-gallery__mode-btn').forEach(b => b.classList.remove('sg-gallery__mode-btn--active'));
                btn.classList.add('sg-gallery__mode-btn--active');
                const grid = this.querySelector('#sg-grid');
                if (grid) {
                    grid.className = 'sg-gallery__grid sg-gallery__grid--' + btn.dataset.mode;
                }
            });
        });

        // Lightbox controls
        const close = this.querySelector('#sg-lb-close');
        if (close) close.addEventListener('click', () => this._closeLightbox());

        const prev = this.querySelector('#sg-lb-prev');
        if (prev) prev.addEventListener('click', () => {
            this._showLightboxItem(Math.max(0, this._lightboxIndex - 1));
        });

        const next = this.querySelector('#sg-lb-next');
        if (next) next.addEventListener('click', () => {
            this._showLightboxItem(Math.min(this._entries.length - 1, this._lightboxIndex + 1));
        });

        // Save zip
        const saveBtn = this.querySelector('#sg-save-zip');
        if (saveBtn) saveBtn.addEventListener('click', () => {
            if (this.zipOrigBytes) {
                const blob = new Blob([this.zipOrigBytes]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = this.zipOrigName || 'archive.zip';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });

        // Save single from lightbox
        const lbSave = this.querySelector('#sg-lb-save');
        if (lbSave) lbSave.addEventListener('click', async () => {
            const entry = this._entries[this._lightboxIndex];
            if (!entry) return;
            const bytes = await entry.entry.async('arraybuffer');
            const blob = new Blob([bytes]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = entry.name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // Copy link
        const copyBtn = this.querySelector('#sg-copy-link');
        if (copyBtn) copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this.downloadUrl || window.location.href);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `${SendIcons.LINK} Copy Link`; }, 2000);
            } catch (_) {}
        });

        // Print
        const printBtn = this.querySelector('#sg-print');
        if (printBtn) printBtn.addEventListener('click', () => window.print());

        // Email
        const emailBtn = this.querySelector('#sg-email');
        if (emailBtn) emailBtn.addEventListener('click', () => {
            const url = this.downloadUrl || window.location.href;
            window.location.href = `mailto:?subject=Shared files via SG/Send&body=${encodeURIComponent(url)}`;
        });

        // Lightbox click-outside-to-close
        const lb = this.querySelector('#sg-lightbox');
        if (lb) lb.addEventListener('click', (e) => {
            if (e.target === lb) this._closeLightbox();
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Static Assets
    // ═══════════════════════════════════════════════════════════════════════════

    // Icons, badges, and type icons are in SendIcons (send-icons.js)

    // ═══════════════════════════════════════════════════════════════════════════
    // CSS Loading
    // ═══════════════════════════════════════════════════════════════════════════

    static _cssInjected = false;

    static _injectCss() {
        if (SendGallery._cssInjected) return;
        SendGallery._cssInjected = true;
        const base = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath)
            || '../_common';
        const link  = document.createElement('link');
        link.rel    = 'stylesheet';
        link.href   = base + '/js/components/send-download/send-gallery.css';
        document.head.appendChild(link);
    }
}

customElements.define('send-gallery', SendGallery);
