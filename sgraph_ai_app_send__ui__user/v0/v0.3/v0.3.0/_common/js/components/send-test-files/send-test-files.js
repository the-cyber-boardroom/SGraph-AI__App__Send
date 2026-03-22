/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Test Files Component
   v0.2.0 — Draggable file cards with type icons for testing upload/download

   Each card is:
     • Clickable → downloads the file
     • Draggable → drag directly into the upload drop zone

   Files are served from /test-files/ at the v0.2.0 root.

   Usage:
     <send-test-files></send-test-files>
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendTestFiles extends HTMLElement {

    // File definitions — path relative to locale folder (e.g., /en-gb/)
    static FILES = [
        { name: 'test-text.txt',       type: 'txt',  mime: 'text/plain',       size: '508 B'  },
        { name: 'test-data.json',      type: 'json', mime: 'application/json', size: '460 B'  },
        { name: 'test-page.html',      type: 'html', mime: 'text/html',        size: '1.9 KB' },
        { name: 'test-image.png',      type: 'png',  mime: 'image/png',        size: '522 B'  },
        { name: 'test-photo-2.png',    type: 'png',  mime: 'image/png',        size: '10.4 KB'},
        { name: 'test-document.pdf',   type: 'pdf',  mime: 'application/pdf',  size: '933 B'  },
        { name: 'test-readme.md',      type: 'md',   mime: 'text/markdown',    size: '1.0 KB' },
    ];

    // Inline SVG icons per file type (16×20 base document shape)
    static ICONS = {
        txt: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#8892A0" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#8892A0" stroke-width=".75"/>
                <line x1="3" y1="10" x2="13" y2="10" stroke="#8892A0" stroke-width=".75"/>
                <line x1="3" y1="13" x2="11" y2="13" stroke="#8892A0" stroke-width=".75"/>
                <line x1="3" y1="16" x2="9"  y2="16" stroke="#8892A0" stroke-width=".75"/>
              </svg>`,
        json: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#4ECDC4" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#4ECDC4" stroke-width=".75"/>
                <text x="8" y="15" text-anchor="middle" fill="#4ECDC4" font-size="5.5" font-weight="600" font-family="system-ui">{ }</text>
               </svg>`,
        html: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#E07C4F" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#E07C4F" stroke-width=".75"/>
                <text x="8" y="15" text-anchor="middle" fill="#E07C4F" font-size="4.5" font-weight="600" font-family="system-ui">&lt;/&gt;</text>
               </svg>`,
        png: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#9B59B6" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#9B59B6" stroke-width=".75"/>
                <rect x="3" y="10" width="10" height="7" rx="1" fill="none" stroke="#9B59B6" stroke-width=".75"/>
                <circle cx="5.5" cy="12.5" r="1" fill="#9B59B6"/>
                <path d="M3 16l3-3 2 1.5 2.5-2.5L13 15" stroke="#9B59B6" stroke-width=".75" fill="none"/>
              </svg>`,
        pdf: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#E94560" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#E94560" stroke-width=".75"/>
                <text x="8" y="15" text-anchor="middle" fill="#E94560" font-size="5" font-weight="700" font-family="system-ui">PDF</text>
               </svg>`,
        md: `<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#58A6FF" stroke-width=".75"/>
                <path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#58A6FF" stroke-width=".75"/>
                <text x="8" y="15" text-anchor="middle" fill="#58A6FF" font-size="4.5" font-weight="700" font-family="system-ui">MD</text>
              </svg>`,
    };

    connectedCallback() {
        this._onLocaleChanged = () => this.render();
        document.addEventListener('locale-changed', this._onLocaleChanged);
        this.render();
    }

    disconnectedCallback() {
        if (this._onLocaleChanged) document.removeEventListener('locale-changed', this._onLocaleChanged);
    }

    t(key, params) { return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key; }

    _basePath() {
        // test-files/ lives at the v0.2.0 root, sibling to en-gb/, _common/, etc.
        // From /en-gb/index.html → ../test-files/
        // Derive from SendComponentPaths if available
        if (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.basePath) {
            return SendComponentPaths.basePath.replace(/_common\/?$/, 'test-files');
        }
        return '../test-files';
    }

    render() {
        const basePath = this._basePath();

        const cards = SendTestFiles.FILES.map(f => {
            const icon = SendTestFiles.ICONS[f.type] || SendTestFiles.ICONS.txt;
            const url  = `${basePath}/${f.name}`;
            return `
                <div class="test-file" role="button" tabindex="0"
                   draggable="true" data-file-url="${url}" data-file-name="${f.name}" data-file-mime="${f.mime}">
                    ${icon}
                    <span class="test-file__name">${f.name}</span>
                    <span class="test-file__size">${f.size}</span>
                </div>`;
        }).join('');

        // Special test cards
        const specialCards = `
            <div class="test-file test-file--special" role="button" tabindex="0" id="test-multi-images">
                ${SendTestFiles.ICONS.png}
                <span class="test-file__name">4 test images</span>
                <span class="test-file__size">click to load</span>
            </div>
            <div class="test-file test-file--special" role="button" tabindex="0" id="test-folder">
                ${SendTestFiles.ICONS.txt}
                <span class="test-file__name">Test folder</span>
                <span class="test-file__size">all ${SendTestFiles.FILES.length} files</span>
            </div>
        `;

        this.innerHTML = `
            <div class="test-files">
                <h3 class="test-files__title">${this.t('test_files.title')}</h3>
                <p class="test-files__desc">${this.t('test_files.description')}</p>
                <div class="test-files__grid">
                    ${cards}
                    ${specialCards}
                </div>
                <p class="test-files__desc" style="margin-top: var(--space-3, 0.75rem);">${this.t('test_files.folder_hint')}</p>
            </div>
        `;

        this._setupHandlers();
    }

    _setupHandlers() {
        var self = this;

        // Click-to-load: fetch file and dispatch event for upload component
        this.querySelectorAll('.test-file[data-file-url]').forEach(function(card) {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                var url  = card.getAttribute('data-file-url');
                var name = card.getAttribute('data-file-name');
                var mime = card.getAttribute('data-file-mime');
                fetch(url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                    var file = new File([buf], name, { type: mime });
                    document.dispatchEvent(new CustomEvent('test-file-loaded', {
                        detail: { files: [file] }
                    }));
                }).catch(function(err) {
                    console.warn('[send-test-files] Failed to fetch ' + name, err);
                });
            });

            // Drag support
            card.addEventListener('dragstart', function(e) {
                var url  = card.getAttribute('data-file-url');
                var name = card.getAttribute('data-file-name');
                var mime = card.getAttribute('data-file-mime');
                e.dataTransfer.setData('text/uri-list', url);
                e.dataTransfer.setData('text/plain', url);
                e.dataTransfer.setData('application/x-sgraph-test-file', JSON.stringify({ url: url, name: name, mime: mime }));
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // "4 test images" — generate sample colored images
        var imagesCard = this.querySelector('#test-multi-images');
        if (imagesCard) {
            imagesCard.addEventListener('click', function() {
                var colors = ['#4ECDC4', '#E94560', '#FFD93D', '#6C5CE7'];
                var names  = ['teal.png', 'coral.png', 'gold.png', 'purple.png'];
                var files  = [];
                var pending = colors.length;
                colors.forEach(function(color, idx) {
                    var canvas = document.createElement('canvas');
                    canvas.width = 200; canvas.height = 200;
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, 200, 200);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 16px system-ui';
                    ctx.textAlign = 'center';
                    ctx.fillText('Test ' + (idx + 1), 100, 105);
                    canvas.toBlob(function(blob) {
                        files[idx] = new File([blob], names[idx], { type: 'image/png' });
                        pending--;
                        if (pending === 0) {
                            document.dispatchEvent(new CustomEvent('test-file-loaded', {
                                detail: { files: files }
                            }));
                        }
                    }, 'image/png');
                });
            });
        }

        // "Test folder" — fetch all files and bundle as multi-file
        var folderCard = this.querySelector('#test-folder');
        if (folderCard) {
            folderCard.addEventListener('click', function() {
                var basePath = self._basePath();
                var promises = SendTestFiles.FILES.map(function(f) {
                    return fetch(basePath + '/' + f.name)
                        .then(function(r) { return r.arrayBuffer(); })
                        .then(function(buf) { return new File([buf], f.name, { type: f.mime }); });
                });
                Promise.all(promises).then(function(files) {
                    document.dispatchEvent(new CustomEvent('test-file-loaded', {
                        detail: { files: files }
                    }));
                }).catch(function(err) {
                    console.warn('[send-test-files] Failed to fetch test folder', err);
                });
            });
        }
    }
}

customElements.define('send-test-files', SendTestFiles);
