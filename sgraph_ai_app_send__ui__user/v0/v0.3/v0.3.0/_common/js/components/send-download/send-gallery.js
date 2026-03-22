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

    // ═══════════════════════════════════════════════════════════════════════════
    // Build
    // ═══════════════════════════════════════════════════════════════════════════

    async _build() {
        const files = this.zipTree.filter(e => !e.dir);
        this._entries = files;

        this.innerHTML = `
            <style>${SendGallery.CSS}</style>
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
                        <a href="?id=${this.transferId}#folder" class="sg-gallery__action-btn" title="Folder view">${SendIcons.FOLDER_MD} Folder view</a>
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
    // CSS
    // ═══════════════════════════════════════════════════════════════════════════

    static CSS = `
/* ─── Gallery Container ──────────────────────────────────────────────── */

.sg-gallery {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 80px);
    overflow: hidden;
}

/* ─── Header ─────────────────────────────────────────────────────────── */

.sg-gallery__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
}

.sg-gallery__header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
}

.sg-gallery__header-right {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
}

.sg-gallery__icon {
    color: var(--accent, #4ECDC4);
    display: flex;
}

.sg-gallery__name {
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
}

.sg-gallery__badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--accent, #4ECDC4);
    color: #0a0e17;
    letter-spacing: 0.04em;
}

.sg-gallery__meta {
    font-size: 0.8rem;
    color: var(--color-text-secondary, #8892A0);
}

/* ─── View Mode Buttons ──────────────────────────────────────────────── */

.sg-gallery__modes {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.05);
    border-radius: 6px;
    padding: 2px;
}

.sg-gallery__mode-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary, #8892A0);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: background 0.15s, color 0.15s;
}

.sg-gallery__mode-btn:hover {
    background: rgba(255,255,255,0.08);
    color: var(--color-text, #E0E0E0);
}

.sg-gallery__mode-btn--active {
    background: rgba(78, 205, 196, 0.15);
    color: var(--accent, #4ECDC4);
}

/* ─── Action Buttons ─────────────────────────────────────────────────── */

.sg-gallery__action-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    color: var(--color-text-secondary, #8892A0);
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    text-decoration: none;
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
}

.sg-gallery__action-btn:hover {
    border-color: var(--accent, #4ECDC4);
    color: var(--accent, #4ECDC4);
}

.sg-gallery__save-btn {
    background: var(--accent, #4ECDC4);
    color: #0a0e17;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: opacity 0.15s;
    white-space: nowrap;
}

.sg-gallery__save-btn:hover { opacity: 0.85; }

/* ═══════════════════════════════════════════════════════════════════════
   Grid — The Core Layout
   ═══════════════════════════════════════════════════════════════════════ */

.sg-gallery__grid {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
    align-content: start;
}

/* Grid mode: 4 columns, responsive */
.sg-gallery__grid--grid {
    grid-template-columns: repeat(4, 1fr);
}

/* Compact mode: 5+ columns */
.sg-gallery__grid--compact {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
}

/* Large mode: 2 columns */
.sg-gallery__grid--large {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
}

/* ─── Responsive breakpoints ─────────────────────────────────────────── */

@media (max-width: 1200px) {
    .sg-gallery__grid--grid {
        grid-template-columns: repeat(3, 1fr);
    }
}

@media (max-width: 800px) {
    .sg-gallery__grid--grid {
        grid-template-columns: repeat(2, 1fr);
    }
    .sg-gallery__grid--large {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 500px) {
    .sg-gallery__grid--grid {
        grid-template-columns: 1fr;
    }
    .sg-gallery__grid--compact {
        grid-template-columns: repeat(2, 1fr);
    }
    .sg-gallery__header {
        flex-direction: column;
        align-items: flex-start;
    }
    .sg-gallery__header-right {
        width: 100%;
        justify-content: flex-start;
    }
}

/* ─── Thumbnail Cards ────────────────────────────────────────────────── */

.sg-thumb {
    cursor: pointer;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
    min-width: 0;
    max-width: 100%;
}

.sg-thumb:hover {
    border-color: var(--accent, #4ECDC4);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}

.sg-thumb__img {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-size: cover;
    background-position: center;
    background-color: rgba(255,255,255,0.02);
    background-repeat: no-repeat;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sg-thumb__badge {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 0.55rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    line-height: 1.4;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: white;
    z-index: 2;
    pointer-events: none;
}

.sg-thumb__label {
    padding: 6px 8px;
    font-size: 0.75rem;
    color: var(--color-text-secondary, #8892A0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ═══════════════════════════════════════════════════════════════════════
   Lightbox
   ═══════════════════════════════════════════════════════════════════════ */

.sg-lightbox {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.92);
    display: none;
    flex-direction: column;
}

.sg-lightbox__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    flex-shrink: 0;
}

.sg-lightbox__brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--accent, #4ECDC4);
    font-size: 0.85rem;
}

.sg-lightbox__title {
    flex: 1;
    font-size: 0.85rem;
    color: var(--color-text, #E0E0E0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.sg-lightbox__close {
    background: none;
    border: none;
    color: var(--color-text, #E0E0E0);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
}

.sg-lightbox__body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 1rem;
    gap: 0.5rem;
}

.sg-lightbox__nav {
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    flex-shrink: 0;
    transition: background 0.15s;
}

.sg-lightbox__nav:hover {
    background: rgba(255,255,255,0.2);
}

.sg-lightbox__content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    min-width: 0;
    overflow: auto;
}

.sg-lightbox__img {
    max-width: 90%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.sg-lightbox__doc {
    background: white;
    color: #1a1a1a;
    padding: 2rem;
    border-radius: 8px;
    max-width: 800px;
    max-height: 80vh;
    overflow: auto;
    line-height: 1.6;
}

.sg-lightbox__pdf {
    width: 90%;
    height: 80vh;
    border: none;
    border-radius: 8px;
}

.sg-lightbox__code {
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 1.5rem;
    border-radius: 8px;
    max-width: 900px;
    max-height: 80vh;
    overflow: auto;
    font-size: 0.85rem;
    line-height: 1.5;
}

.sg-lightbox__footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid rgba(255,255,255,0.1);
    color: var(--color-text-secondary, #8892A0);
    font-size: 0.8rem;
    flex-shrink: 0;
}

.sg-lightbox__save {
    font-size: 0.75rem;
    padding: 4px 12px;
}

/* ─── Print ──────────────────────────────────────────────────────────── */

@media print {
    .sg-gallery__header { display: none !important; }
    .sg-lightbox { display: none !important; }
    .sg-gallery__grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6px !important;
        overflow: visible !important;
        padding: 6px 0 !important;
    }
    .sg-thumb {
        break-inside: avoid;
        border: 1px solid #ccc !important;
        background: #f5f5f5 !important;
    }
    .sg-thumb__img {
        aspect-ratio: 4/3 !important;
        background-size: cover !important;
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
    }
}
`;
}

customElements.define('send-gallery', SendGallery);
