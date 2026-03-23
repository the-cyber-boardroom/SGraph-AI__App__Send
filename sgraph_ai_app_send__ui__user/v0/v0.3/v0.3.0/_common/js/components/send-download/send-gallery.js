/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Gallery Component v0.3.0 (extends SendComponent)
   Responsive thumbnail grid with lightbox

   View modes:  compact (5+ cols)  |  grid (4 cols)  |  large (2-3 cols)
   Features:    Lightbox, type badges, file save, share, print, info panel,
                PDF present mode
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendGallery extends SendComponent {

    /** Light DOM — CSS goes to document.head. No HTML template — dynamic render. */
    static useShadow   = false;
    static useTemplate = false;

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

    async connectedCallback() {
        await this.loadResources();
        this._resourcesLoaded = true;
        if (this.zipTree) this._build();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
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
        const files = this.zipTree.filter(e => !e.dir && !e.path.startsWith('_gallery.'));
        this._entries = files;

        this.innerHTML = `
            <div class="sg-gallery">
                <div class="sg-gallery__header">
                    <div class="sg-gallery__header-left">
                        <span class="sg-gallery__icon">${SendIcons.GRID}</span>
                        <span class="sg-gallery__name">${this.escapeHtml(this.fileName || 'Archive')}</span>
                        <span class="sg-gallery__badge">gallery</span>
                        <span class="sg-gallery__meta">${this.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)} · ${files.length} files</span>
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
                <div class="sg-gallery__info" id="sg-info-panel" style="display: none;">
                    <div class="sg-gallery__info-content">
                        <div class="sg-gallery__info-row"><span>Transfer ID</span><span>${this.escapeHtml(this.transferId || '—')}</span></div>
                        <div class="sg-gallery__info-row"><span>Archive</span><span>${this.escapeHtml(this.fileName || 'Unknown')}</span></div>
                        <div class="sg-gallery__info-row"><span>Size</span><span>${this.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)}</span></div>
                        <div class="sg-gallery__info-row"><span>Files</span><span>${files.length}</span></div>
                        <div class="sg-gallery__info-row"><span>Encryption</span><span>AES-256-GCM (client-side)</span></div>
                    </div>
                </div>
            </div>
            ${this._buildLightbox()}
        `;

        this._setupListeners();
        await this._loadThumbnails();
    }

    // ─── Thumbnail Loading ──────────────────────────────────────────────────

    async _loadThumbnails() {
        const grid = this.$('#sg-grid');
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
            } else if (type === 'pdf' && typeof UploadThumbnails !== 'undefined') {
                try {
                    const bytes = await entry.entry.async('arraybuffer');
                    const file = new File([bytes], entry.name, { type: 'application/pdf' });
                    const thumb = await UploadThumbnails.generatePdfThumbnail(file);
                    const blob = new Blob([thumb.buffer], { type: thumb.format });
                    const url = URL.createObjectURL(blob);
                    this._thumbUrls.push(url);
                    imgDiv.style.backgroundImage = `url(${url})`;
                } catch (_) {
                    imgDiv.innerHTML += (SendIcons.TYPE_ICONS.pdf || SendIcons.TYPE_ICONS.other);
                }
            } else if (type === 'markdown' && typeof UploadThumbnails !== 'undefined') {
                try {
                    const bytes = await entry.entry.async('arraybuffer');
                    const file = new File([bytes], entry.name, { type: 'text/markdown' });
                    const thumb = await UploadThumbnails.generateMarkdownThumbnail(file);
                    const blob = new Blob([thumb.buffer], { type: thumb.format });
                    const url = URL.createObjectURL(blob);
                    this._thumbUrls.push(url);
                    imgDiv.style.backgroundImage = `url(${url})`;
                } catch (_) {
                    imgDiv.innerHTML += (SendIcons.TYPE_ICONS.markdown || SendIcons.TYPE_ICONS.other);
                }
            } else {
                imgDiv.innerHTML += (SendIcons.TYPE_ICONS[type] || SendIcons.TYPE_ICONS.other);
            }

            const label = document.createElement('div');
            label.className = 'sg-thumb__label';
            label.textContent = entry.name;

            card.appendChild(imgDiv);
            card.appendChild(label);
            grid.appendChild(card);

            card.addEventListener('click', () => this._openLightbox(i));
        }
    }

    _findPreview(path) {
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
                    <button class="sg-gallery__action-btn sg-lightbox__present" id="sg-lb-present" style="display: none;" title="Present mode (f)">⛶ Present</button>
                    <button class="sg-gallery__save-btn sg-lightbox__save" id="sg-lb-save">${SendIcons.DOWNLOAD} Save</button>
                </div>
            </div>
        `;
    }

    async _openLightbox(index) {
        this._lightboxIndex = index;
        const lb = this.$('#sg-lightbox');
        if (!lb) return;
        lb.style.display = 'flex';
        await this._showLightboxItem(index);
        document.addEventListener('keydown', this._lbKeyHandler);
    }

    _closeLightbox() {
        const lb = this.$('#sg-lightbox');
        if (lb) lb.style.display = 'none';
        document.removeEventListener('keydown', this._lbKeyHandler);
    }

    async _showLightboxItem(index) {
        const entry = this._entries[index];
        if (!entry) return;

        this._lightboxIndex = index;
        const title      = this.$('#sg-lb-title');
        const content    = this.$('#sg-lb-content');
        const counter    = this.$('#sg-lb-counter');
        const presentBtn = this.$('#sg-lb-present');
        if (title)   title.textContent = entry.name;
        if (counter) counter.textContent = `${index + 1} / ${this._entries.length}`;
        if (!content) return;

        content.innerHTML = '<div style="color: var(--color-text-secondary);">Loading...</div>';

        const type = typeof FileTypeDetect !== 'undefined'
            ? FileTypeDetect.detect(entry.name, null) : null;
        this._lightboxType = type;

        // Show present button only for PDFs
        if (presentBtn) presentBtn.style.display = (type === 'pdf') ? '' : 'none';

        try {
            const bytes = await entry.entry.async('arraybuffer');

            if (type === 'image') {
                const mime = FileTypeDetect.getImageMime(entry.name) || 'image/jpeg';
                const blob = new Blob([bytes], { type: mime });
                const url = URL.createObjectURL(blob);
                this._thumbUrls.push(url);
                content.innerHTML = `<img src="${url}" class="sg-lightbox__img" alt="${this.escapeHtml(entry.name)}">`;
            } else if (type === 'markdown') {
                const text = new TextDecoder().decode(bytes);
                const html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(text) : this.escapeHtml(text);
                content.innerHTML = `<div class="sg-lightbox__doc">${html}</div>`;
            } else if (type === 'pdf') {
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                this._thumbUrls.push(url);
                this._lightboxPdfUrl = url;
                content.innerHTML = `<iframe src="${url}" class="sg-lightbox__pdf"></iframe>`;
            } else {
                const text = new TextDecoder().decode(bytes);
                content.innerHTML = `<pre class="sg-lightbox__code">${this.escapeHtml(text)}</pre>`;
            }
        } catch (err) {
            content.innerHTML = `<div style="color: var(--color-error);">Failed to load: ${this.escapeHtml(err.message)}</div>`;
        }
    }

    _lbKeyHandler = (e) => {
        if (e.key === 'Escape') this._closeLightbox();
        if (e.key === 'ArrowLeft')  this._showLightboxItem(Math.max(0, this._lightboxIndex - 1));
        if (e.key === 'ArrowRight') this._showLightboxItem(Math.min(this._entries.length - 1, this._lightboxIndex + 1));
        if (e.key === 'f') this._presentPdf();
    };

    _presentPdf() {
        if (this._lightboxType !== 'pdf' || !this._lightboxPdfUrl) return;
        // Open PDF in a new window for fullscreen presentation
        const win = window.open(this._lightboxPdfUrl + '#toolbar=1&navpanes=0&view=Fit', '_blank');
        if (!win) {
            // Popup blocked — try fullscreen on the iframe instead
            const iframe = this.$('.sg-lightbox__pdf');
            if (iframe && iframe.requestFullscreen) iframe.requestFullscreen();
        }
    }

    // ─── Event Listeners ────────────────────────────────────────────────────

    _setupListeners() {
        // View mode buttons
        this.$$('.sg-gallery__mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.$$('.sg-gallery__mode-btn').forEach(b => b.classList.remove('sg-gallery__mode-btn--active'));
                btn.classList.add('sg-gallery__mode-btn--active');
                const grid = this.$('#sg-grid');
                if (grid) {
                    grid.className = 'sg-gallery__grid sg-gallery__grid--' + btn.dataset.mode;
                }
            });
        });

        // Lightbox controls
        const close = this.$('#sg-lb-close');
        if (close) close.addEventListener('click', () => this._closeLightbox());

        const prev = this.$('#sg-lb-prev');
        if (prev) prev.addEventListener('click', () => {
            this._showLightboxItem(Math.max(0, this._lightboxIndex - 1));
        });

        const next = this.$('#sg-lb-next');
        if (next) next.addEventListener('click', () => {
            this._showLightboxItem(Math.min(this._entries.length - 1, this._lightboxIndex + 1));
        });

        // Save zip
        const saveBtn = this.$('#sg-save-zip');
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
        const lbSave = this.$('#sg-lb-save');
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

        // PDF present mode
        const presentBtn = this.$('#sg-lb-present');
        if (presentBtn) presentBtn.addEventListener('click', () => this._presentPdf());

        // Copy link
        const copyBtn = this.$('#sg-copy-link');
        if (copyBtn) copyBtn.addEventListener('click', async () => {
            try {
                await this.copyToClipboard(this.downloadUrl || window.location.href);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `${SendIcons.LINK} Copy Link`; }, 2000);
            } catch (_) {}
        });

        // Print
        const printBtn = this.$('#sg-print');
        if (printBtn) printBtn.addEventListener('click', () => window.print());

        // Email
        const emailBtn = this.$('#sg-email');
        if (emailBtn) emailBtn.addEventListener('click', () => {
            const url = this.downloadUrl || window.location.href;
            window.location.href = `mailto:?subject=Shared files via SG/Send&body=${encodeURIComponent(url)}`;
        });

        // Lightbox click-outside-to-close
        const lb = this.$('#sg-lightbox');
        if (lb) lb.addEventListener('click', (e) => {
            if (e.target === lb) this._closeLightbox();
        });

        // Info panel toggle
        const infoBtn   = this.$('#sg-info');
        const infoPanel = this.$('#sg-info-panel');
        if (infoBtn && infoPanel) {
            infoBtn.addEventListener('click', () => {
                const visible = infoPanel.style.display !== 'none';
                infoPanel.style.display = visible ? 'none' : '';
                infoBtn.classList.toggle('sg-gallery__action-btn--active', !visible);
            });
        }
    }
}

customElements.define('send-gallery', SendGallery);
