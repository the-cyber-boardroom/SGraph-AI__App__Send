/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Page Layout Renderer  (v2 schema)

   Renders _page.json layouts inside the Browse component (v0.3.1+).

   API:
     PageLayoutRenderer.render(container, pageJson, folderPath, zipTree, browseInstance)

   Dependencies (globals expected from v0.3.1 overlay):
     _resolvePath(base, relative)
     _findZipEntry(zipTree, resolved)
     _navigateToFolder(browseInstance, zipTree, folderPath)
     MarkdownParser.parse(text)
     SendHelpers.escapeHtml(s)
     FileTypeDetect.getImageMime(name)

   Components (Priority 1 — test vault):
     hero, section, text, bullet-points, image, slides, gallery, pdf, markdown

   Components (Priority 2):
     title, columns, cards
   ═══════════════════════════════════════════════════════════════════════════════ */

var PageLayoutRenderer = (function () {
    'use strict';

    // ── Utilities ─────────────────────────────────────────────────────────────

    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _kebab(str) {
        return (str || '').toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    // Resolve a component file prop against the folder path.
    // folderPath is e.g. 'articles' or '' for root.
    function _folderBase(folderPath) {
        return folderPath ? folderPath.replace(/\/?$/, '/') : '';
    }

    // ── v0.3.1 / v0.3.2 compatibility helpers ────────────────────────────────
    // v0.3.1 exposes _findZipEntry(zipTree, resolved) → { entry (JSZip), name, path }
    // v0.3.2 exposes _findEntry(fileList, resolved) → { path, name, ... } + dataSource.getFileBytes()

    function _findFileCombined(zipTree, resolved, browseInstance) {
        if (browseInstance && browseInstance.dataSource && typeof _findEntry !== 'undefined') {
            var fl = browseInstance.dataSource.getFileList();
            var entry = _findEntry(fl, resolved);
            if (!entry) return null;
            var n = entry.path.split('/').pop();
            return { path: entry.path, name: n,
                     getBytes: function (bi) { return bi.dataSource.getFileBytes(entry.path); } };
        }
        if (typeof _findZipEntry !== 'undefined') {
            var m = _findZipEntry(zipTree, resolved);
            if (!m) return null;
            return { path: m.path, name: m.name,
                     getBytes: function () { return m.entry.async('arraybuffer'); } };
        }
        return null;
    }

    function _navigateToFolder_compat(browseInstance, zipTree, fp) {
        if (typeof _navigateToFolder !== 'undefined') {
            var second = (browseInstance && browseInstance.dataSource)
                ? browseInstance.dataSource.getFileList()
                : zipTree;
            _navigateToFolder(browseInstance, second, fp);
        }
    }

    // Load a file path → blob URL; returns null if not found.
    async function _blobUrl(relPath, folderPath, zipTree, browseInstance, mimeOverride) {
        var resolved = _resolvePath(_folderBase(folderPath), relPath);
        var match = _findFileCombined(zipTree, resolved, browseInstance);
        if (!match) return null;
        var bytes = await match.getBytes(browseInstance);
        var mime = mimeOverride ||
            (typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getImageMime(match.name) : null) ||
            'image/png';
        var blob = new Blob([bytes], { type: mime });
        var url = URL.createObjectURL(blob);
        if (browseInstance._objectUrls) browseInstance._objectUrls.push(url);
        return url;
    }

    // ── Component: hero ───────────────────────────────────────────────────────

    async function _renderHero(props, folderPath, zipTree, browseInstance) {
        var el = document.createElement('div');
        var classes = ['plr-hero'];
        if (props.height) classes.push('plr-hero--' + props.height);   // small|medium|large|full
        if (props.align)  classes.push('plr-hero--align-' + props.align); // left|center|right
        el.className = classes.join(' ');

        if (props.color) el.style.background = props.color;

        if (props.image) {
            var url = await _blobUrl(props.image, folderPath, zipTree, browseInstance);
            if (url) {
                el.style.backgroundImage = 'url(' + url + ')';
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.classList.add('plr-hero--has-image');
            }
        }

        // overlay: gradient (default with image), dark, light, solid, none
        var overlay = props.overlay || (props.image ? 'gradient' : 'none');
        el.innerHTML =
            '<div class="plr-hero__overlay plr-hero__overlay--' + _esc(overlay) + '">' +
                '<h1 class="plr-hero__title">' + _esc(props.title || '') + '</h1>' +
                (props.subtitle
                    ? '<p class="plr-hero__subtitle">' + _esc(props.subtitle) + '</p>'
                    : '') +
            '</div>';
        return el;
    }

    // ── Component: section ────────────────────────────────────────────────────

    async function _renderSection(props, children, folderPath, zipTree, browseInstance) {
        var el = document.createElement('section');
        var classes = ['plr-section'];
        if (props.layout)  classes.push('plr-section--' + props.layout);   // full-bleed|narrow|wide
        if (props.divider) classes.push('plr-section--divider-' + props.divider); // line|space|none
        el.className = classes.join(' ');

        if (props.background) {
            el.style.background = props.background === 'alt'
                ? 'var(--plr-section-alt-bg, rgba(0,0,0,0.03))'
                : props.background;
        }

        var anchor = _kebab(props.title || '');
        if (anchor) el.id = anchor;

        if (props.title) {
            var h2 = document.createElement('h2');
            h2.className = 'plr-section__title';
            h2.textContent = props.title;
            el.appendChild(h2);
        }

        var body = document.createElement('div');
        body.className = 'plr-section__body';

        for (var i = 0; i < (children || []).length; i++) {
            var child = await _renderComponent(children[i], folderPath, zipTree, browseInstance);
            if (child) body.appendChild(child);
        }

        el.appendChild(body);
        return el;
    }

    // ── Component: text ───────────────────────────────────────────────────────

    function _renderText(props) {
        var el = document.createElement('p');
        el.className = 'plr-text';
        el.textContent = props.content || '';
        return el;
    }

    // ── Component: bullet-points ──────────────────────────────────────────────

    function _renderBulletPoints(props) {
        var el = document.createElement('ul');
        el.className = 'plr-bullet-points';
        (props.items || []).forEach(function (item) {
            var li = document.createElement('li');
            li.textContent = item;
            el.appendChild(li);
        });
        return el;
    }

    // ── Component: title ──────────────────────────────────────────────────────

    function _renderTitle(props) {
        var level = parseInt(String(props.level || '2').replace(/[^1-6]/g, ''), 10) || 2;
        var el = document.createElement('h' + level);
        el.className = 'plr-title';
        el.textContent = props.text || '';
        return el;
    }

    // ── Component: image ──────────────────────────────────────────────────────

    async function _renderImage(props, folderPath, zipTree, browseInstance) {
        var el = document.createElement('div');
        var classes = ['plr-image'];
        if (props.border)  classes.push('plr-image--border');
        if (props.shadow)  classes.push('plr-image--shadow');
        if (props.rounded) classes.push('plr-image--rounded');
        el.className = classes.join(' ');

        // Alignment of the image container
        var align = props.align || 'center';
        if (align === 'left')  { el.style.marginLeft = '0'; el.style.marginRight = 'auto'; }
        if (align === 'right') { el.style.marginLeft = 'auto'; el.style.marginRight = '0'; }
        if (props.width) el.style.width = props.width;

        var img = document.createElement('img');
        img.alt = props.caption || '';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '0 auto';

        if (props.file) {
            var url = await _blobUrl(props.file, folderPath, zipTree, browseInstance);
            if (url) img.src = url;
        }
        el.appendChild(img);

        if (props.caption) {
            var cap = document.createElement('p');
            cap.className = 'plr-image__caption';
            cap.textContent = props.caption;
            el.appendChild(cap);
        }
        return el;
    }

    // ── Component: slides ─────────────────────────────────────────────────────

    async function _renderSlides(props, folderPath, zipTree, browseInstance) {
        var images   = props.images   || [];
        var captions = props.captions || [];
        var controls   = props.controls   || 'bottom';    // bottom (default) | top
        var transition = props.transition || 'fade';      // fade | none
        var autoplay   = props.autoplay   || false;

        var el = document.createElement('div');
        el.className = 'plr-slides' + (transition === 'fade' ? ' plr-slides--fade' : '');
        if (images.length === 0) return el;

        var urls = await Promise.all(images.map(function (p) {
            return _blobUrl(p, folderPath, zipTree, browseInstance);
        }));

        var idx = 0;

        var imgEl = document.createElement('img');
        imgEl.className = 'plr-slides__img';

        var captionEl = document.createElement('p');
        captionEl.className = 'plr-slides__caption';

        var counterEl = document.createElement('span');
        counterEl.className = 'plr-slides__counter';

        function update() {
            imgEl.src = urls[idx] || '';
            captionEl.textContent = captions[idx] || '';
            counterEl.textContent = (idx + 1) + ' / ' + images.length;
        }

        var prevBtn = document.createElement('button');
        prevBtn.className = 'plr-slides__btn plr-slides__btn--prev';
        prevBtn.textContent = '‹';
        prevBtn.setAttribute('aria-label', 'Previous');
        prevBtn.addEventListener('click', function () {
            idx = (idx - 1 + images.length) % images.length;
            update();
        });

        var nextBtn = document.createElement('button');
        nextBtn.className = 'plr-slides__btn plr-slides__btn--next';
        nextBtn.textContent = '›';
        nextBtn.setAttribute('aria-label', 'Next');
        nextBtn.addEventListener('click', function () {
            idx = (idx + 1) % images.length;
            update();
        });

        var navRow = document.createElement('div');
        navRow.className = 'plr-slides__nav';
        navRow.appendChild(prevBtn);
        navRow.appendChild(counterEl);
        navRow.appendChild(nextBtn);

        // controls: 'bottom' (default) puts nav below image; 'top' puts it above
        if (controls === 'top') {
            el.appendChild(navRow);
            el.appendChild(imgEl);
            el.appendChild(captionEl);
        } else {
            el.appendChild(imgEl);
            el.appendChild(captionEl);
            el.appendChild(navRow);
        }

        el.tabIndex = 0;
        el.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') prevBtn.click();
            else if (e.key === 'ArrowRight') nextBtn.click();
        });

        // Autoplay: auto-advance every 3 s; stop on user interaction
        if (autoplay) {
            var timer = setInterval(function () {
                idx = (idx + 1) % images.length;
                update();
            }, 3000);
            el.addEventListener('click', function () { clearInterval(timer); }, { once: true });
        }

        update();
        return el;
    }

    // ── Component: gallery ────────────────────────────────────────────────────

    async function _renderGallery(props, folderPath, zipTree, browseInstance) {
        var images   = props.images   || [];
        var captions = props.captions || [];
        var columns  = props.columns  || 3;
        var gap      = props.gap      || 'small';   // none|small|medium|large
        var aspect   = props.aspect   || '16:9';    // 16:9|4:3|1:1|auto

        // show_captions: explicit prop; default = show when captions array is non-empty
        var showCaptions = (props.show_captions !== undefined)
            ? Boolean(props.show_captions)
            : (captions.length > 0);

        var aspectMap = { '16:9': '16/9', '4:3': '4/3', '1:1': '1/1', 'auto': null };
        var aspectRatio = (aspectMap[aspect] !== undefined) ? aspectMap[aspect] : '16/9';

        var el = document.createElement('div');
        el.className = 'plr-gallery plr-gallery--gap-' + gap;
        el.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';

        var urls = await Promise.all(images.map(function (p) {
            return _blobUrl(p, folderPath, zipTree, browseInstance);
        }));

        urls.forEach(function (url, i) {
            if (!url) return;
            var thumb = document.createElement('div');
            thumb.className = 'plr-gallery__thumb';
            if (aspectRatio) thumb.style.aspectRatio = aspectRatio;

            var img = document.createElement('img');
            img.src = url;
            img.alt = captions[i] || '';
            thumb.appendChild(img);

            if (showCaptions && captions[i]) {
                var cap = document.createElement('p');
                cap.className = 'plr-gallery__thumb__caption';
                cap.textContent = captions[i];
                thumb.appendChild(cap);
            }

            el.appendChild(thumb);

            thumb.addEventListener('click', function () {
                _openLightbox(urls, captions, i, browseInstance);
            });
        });

        return el;
    }

    function _openLightbox(urls, captions, startIdx, browseInstance) {
        var lb = document.createElement('div');
        lb.className = 'plr-lightbox';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-modal', 'true');

        var idx = startIdx;

        var img = document.createElement('img');
        img.className = 'plr-lightbox__img';

        var cap = document.createElement('p');
        cap.className = 'plr-lightbox__caption';

        var counter = document.createElement('span');
        counter.className = 'plr-lightbox__counter';

        function updateLb() {
            img.src = urls[idx] || '';
            cap.textContent = captions[idx] || '';
            counter.textContent = (idx + 1) + ' / ' + urls.length;
        }

        var closeBtn = document.createElement('button');
        closeBtn.className = 'plr-lightbox__close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close lightbox');

        var prevBtn = document.createElement('button');
        prevBtn.className = 'plr-lightbox__btn plr-lightbox__btn--prev';
        prevBtn.textContent = '‹';
        prevBtn.setAttribute('aria-label', 'Previous image');

        var nextBtn = document.createElement('button');
        nextBtn.className = 'plr-lightbox__btn plr-lightbox__btn--next';
        nextBtn.textContent = '›';
        nextBtn.setAttribute('aria-label', 'Next image');

        var dismiss = function () {
            if (document.body.contains(lb)) document.body.removeChild(lb);
            document.removeEventListener('keydown', onLbKey);
        };

        var onLbKey = function (e) {
            if (e.key === 'Escape') dismiss();
            else if (e.key === 'ArrowLeft') { idx = (idx - 1 + urls.length) % urls.length; updateLb(); }
            else if (e.key === 'ArrowRight') { idx = (idx + 1) % urls.length; updateLb(); }
        };

        prevBtn.addEventListener('click', function () { idx = (idx - 1 + urls.length) % urls.length; updateLb(); });
        nextBtn.addEventListener('click', function () { idx = (idx + 1) % urls.length; updateLb(); });
        closeBtn.addEventListener('click', dismiss);
        lb.addEventListener('click', function (e) { if (e.target === lb) dismiss(); });
        document.addEventListener('keydown', onLbKey);

        var content = document.createElement('div');
        content.className = 'plr-lightbox__content';
        content.appendChild(closeBtn);
        content.appendChild(prevBtn);
        content.appendChild(img);
        content.appendChild(nextBtn);
        content.appendChild(cap);
        content.appendChild(counter);

        lb.appendChild(content);
        document.body.appendChild(lb);
        updateLb();
    }

    // ── Component: pdf ────────────────────────────────────────────────────────

    async function _renderPdf(props, folderPath, zipTree, browseInstance) {
        var el = document.createElement('div');
        el.className = 'plr-pdf';
        if (!props.file) return el;

        var url = await _blobUrl(props.file, folderPath, zipTree, browseInstance, 'application/pdf');
        if (url) {
            var iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.className = 'sb-file__pdf';  // reuse existing Browse PDF styles
            el.appendChild(iframe);
        }
        return el;
    }

    // ── Component: markdown ───────────────────────────────────────────────────

    async function _renderMarkdown(props, folderPath, zipTree, browseInstance) {
        var el = document.createElement('div');
        el.className = 'sb-file__markdown plr-markdown';

        var rawText = '';
        var mdDir = _folderBase(folderPath);

        if (props.text) {
            rawText = props.text;
        } else if (props.file) {
            var resolved = _resolvePath(_folderBase(folderPath), props.file);
            var match = _findFileCombined(zipTree, resolved, browseInstance);
            if (match) {
                var bytes = await match.getBytes(browseInstance);
                rawText = new TextDecoder().decode(bytes);
                // Markdown dir: same folder as the .md file
                var parts = resolved.split('/');
                parts.pop();
                mdDir = parts.length > 0 ? parts.join('/') + '/' : '';
            }
        }

        if (!rawText) return el;

        var html = typeof MarkdownParser !== 'undefined'
            ? MarkdownParser.parse(rawText)
            : SendHelpers.escapeHtml(rawText);
        el.innerHTML = html;

        // Resolve images using data-md-src (v0.3.1 parser) or src fallback
        var imgs = el.querySelectorAll('img[data-md-src], img[src]');
        imgs.forEach(function (img) {
            var src = img.getAttribute('data-md-src') || img.getAttribute('src');
            if (!src || src.startsWith('http://') || src.startsWith('https://') ||
                src.startsWith('data:') || src.startsWith('blob:')) return;

            var imgResolved = _resolvePath(mdDir, src);
            var imgMatch = _findFileCombined(zipTree, imgResolved, browseInstance);
            if (imgMatch) {
                imgMatch.getBytes(browseInstance).then(function (imgBytes) {
                    var mime = typeof FileTypeDetect !== 'undefined'
                        ? FileTypeDetect.getImageMime(imgMatch.name) || 'image/png' : 'image/png';
                    var blob = new Blob([imgBytes], { type: mime });
                    var url = URL.createObjectURL(blob);
                    img.src = url;
                    if (browseInstance._objectUrls) browseInstance._objectUrls.push(url);
                });
            }
        });

        // Intercept internal links → open in browse tab
        el.querySelectorAll('a[href]').forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href || href.startsWith('http://') || href.startsWith('https://') ||
                href.startsWith('mailto:') || href.startsWith('#')) return;

            var linkResolved = _resolvePath(mdDir, href);
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var linkMatch = _findFileCombined(zipTree, linkResolved, browseInstance);
                if (linkMatch) {
                    browseInstance._openFileTab(linkMatch.path);
                } else {
                    var fp = linkResolved.replace(/\/$/, '');
                    _navigateToFolder_compat(browseInstance, zipTree, fp);
                }
            });
        });

        return el;
    }

    // ── Component: cards ─────────────────────────────────────────────────────
    // Navigable card grid: image + title + description; whole card is clickable.

    async function _renderCards(props, folderPath, zipTree, browseInstance) {
        var items   = props.items   || [];
        var columns = props.columns || 2;

        var el = document.createElement('div');
        el.className = 'plr-cards';
        el.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var card = document.createElement('div');
            card.className = 'plr-card';

            if (item.image) {
                var imgEl = document.createElement('img');
                imgEl.className = 'plr-card__img';
                imgEl.alt = item.title || '';
                var imgUrl = await _blobUrl(item.image, folderPath, zipTree, browseInstance);
                if (imgUrl) imgEl.src = imgUrl;
                card.appendChild(imgEl);
            }

            var body = document.createElement('div');
            body.className = 'plr-card__body';

            if (item.title) {
                var titleEl = document.createElement('h3');
                titleEl.className = 'plr-card__title';
                titleEl.textContent = item.title;
                body.appendChild(titleEl);
            }

            if (item.description) {
                var descEl = document.createElement('p');
                descEl.className = 'plr-card__desc';
                descEl.textContent = item.description;
                body.appendChild(descEl);
            }

            card.appendChild(body);

            if (item.link) {
                card.classList.add('plr-card--link');
                card.addEventListener('click', (function (link) {
                    return function () {
                        var resolved = _resolvePath(_folderBase(folderPath), link);
                        var match = _findFileCombined(zipTree, resolved, browseInstance);
                        if (match) {
                            browseInstance._openFileTab(match.path);
                        } else {
                            var fp = resolved.replace(/\/$/, '');
                            _navigateToFolder_compat(browseInstance, zipTree, fp);
                        }
                    };
                })(item.link));
            }

            el.appendChild(card);
        }

        return el;
    }

    // ── Component: columns ────────────────────────────────────────────────────
    // Side-by-side layout with configurable ratio and gap.

    async function _renderColumns(props, children, folderPath, zipTree, browseInstance) {
        var ratioMap = {
            '1:1': '1fr 1fr', '1:2': '1fr 2fr', '2:1': '2fr 1fr',
            '1:3': '1fr 3fr', '3:1': '3fr 1fr'
        };
        var ratio = ratioMap[props.ratio || '1:1'] || '1fr 1fr';
        var gap   = props.gap || 'medium';     // none|small|medium|large
        var vAlign = props.vertical_align || 'top'; // top|center|bottom

        var el = document.createElement('div');
        el.className = 'plr-columns plr-columns--gap-' + gap + ' plr-columns--align-' + vAlign;
        el.style.gridTemplateColumns = ratio;

        for (var i = 0; i < (children || []).length; i++) {
            var col = document.createElement('div');
            col.className = 'plr-columns__col';
            var child = await _renderComponent(children[i], folderPath, zipTree, browseInstance);
            if (child) col.appendChild(child);
            el.appendChild(col);
        }

        return el;
    }

    // ── Component: callout ────────────────────────────────────────────────────
    // Alert/notice box with variants: info | warning | success | tip

    function _renderCallout(props) {
        var variant = props.variant || 'info';  // info | warning | success | tip
        var el = document.createElement('div');
        el.className = 'plr-callout plr-callout--' + _esc(variant);

        var iconMap = { info: 'ℹ', warning: '⚠', success: '✓', tip: '💡' };
        var icon = iconMap[variant] || iconMap.info;

        var iconEl = document.createElement('span');
        iconEl.className = 'plr-callout__icon';
        iconEl.textContent = icon;
        el.appendChild(iconEl);

        var body = document.createElement('div');
        body.className = 'plr-callout__body';

        if (props.title) {
            var titleEl = document.createElement('strong');
            titleEl.className = 'plr-callout__title';
            titleEl.textContent = props.title;
            body.appendChild(titleEl);
        }
        if (props.text) {
            var textEl = document.createElement('p');
            textEl.className = 'plr-callout__text';
            textEl.textContent = props.text;
            body.appendChild(textEl);
        }

        el.appendChild(body);
        return el;
    }

    // ── Component: stats ──────────────────────────────────────────────────────
    // Horizontal row of metric cards: number + label + optional delta

    function _renderStats(props) {
        var items = props.items || [];
        var el = document.createElement('div');
        el.className = 'plr-stats';

        items.forEach(function (item) {
            var card = document.createElement('div');
            card.className = 'plr-stats__card';

            var val = document.createElement('div');
            val.className = 'plr-stats__value';
            val.textContent = item.value || '';
            card.appendChild(val);

            var label = document.createElement('div');
            label.className = 'plr-stats__label';
            label.textContent = item.label || '';
            card.appendChild(label);

            if (item.delta !== undefined) {
                var deltaEl = document.createElement('div');
                var isPositive = String(item.delta).charAt(0) !== '-';
                deltaEl.className = 'plr-stats__delta plr-stats__delta--' + (isPositive ? 'up' : 'down');
                deltaEl.textContent = item.delta;
                card.appendChild(deltaEl);
            }

            el.appendChild(card);
        });

        return el;
    }

    // ── Component: quote ──────────────────────────────────────────────────────
    // Styled pull-quote with optional author attribution

    function _renderQuote(props) {
        var el = document.createElement('blockquote');
        el.className = 'plr-quote';

        var textEl = document.createElement('p');
        textEl.className = 'plr-quote__text';
        textEl.textContent = props.text || '';
        el.appendChild(textEl);

        if (props.author) {
            var footer = document.createElement('footer');
            footer.className = 'plr-quote__attribution';

            var name = document.createElement('cite');
            name.className = 'plr-quote__author';
            name.textContent = props.author;
            footer.appendChild(name);

            if (props.role) {
                var roleEl = document.createElement('span');
                roleEl.className = 'plr-quote__role';
                roleEl.textContent = ', ' + props.role;
                footer.appendChild(roleEl);
            }

            el.appendChild(footer);
        }

        return el;
    }

    // ── Component: author ─────────────────────────────────────────────────────
    // Attribution block: author name, date, optional byline/role

    async function _renderAuthor(props, folderPath, zipTree, browseInstance) {
        var el = document.createElement('div');
        el.className = 'plr-author';

        if (props.avatar) {
            var avatarUrl = await _blobUrl(props.avatar, folderPath, zipTree, browseInstance);
            if (avatarUrl) {
                var img = document.createElement('img');
                img.className = 'plr-author__avatar';
                img.src = avatarUrl;
                img.alt = props.name || 'Author';
                el.appendChild(img);
            }
        }

        var meta = document.createElement('div');
        meta.className = 'plr-author__meta';

        if (props.name) {
            var nameEl = document.createElement('div');
            nameEl.className = 'plr-author__name';
            nameEl.textContent = props.name;
            meta.appendChild(nameEl);
        }

        if (props.role) {
            var roleEl = document.createElement('div');
            roleEl.className = 'plr-author__role';
            roleEl.textContent = props.role;
            meta.appendChild(roleEl);
        }

        if (props.date) {
            var dateEl = document.createElement('div');
            dateEl.className = 'plr-author__date';
            dateEl.textContent = props.date;
            meta.appendChild(dateEl);
        }

        el.appendChild(meta);
        return el;
    }

    // ── Component: banner ─────────────────────────────────────────────────────
    // A thin identity strip that tells new users what they're looking at.
    // Rendered automatically (before nav) when the first component is not a hero,
    // unless explicitly suppressed via `"banner": false` in the page JSON.
    // Can also be placed explicitly as `{ "type": "banner", "props": { ... } }`.
    //
    // Props:
    //   title       — overrides the page title (auto-banner uses page.title)
    //   badge       — label shown in the teal badge (default: "Page Layout")
    //   author      — optional author name shown on the right
    //   date        — optional date string shown on the right
    //   tags        — optional array of tag strings
    //   dismissible — if true (default), show an × button that hides the banner

    function _renderBanner(props) {
        var el = document.createElement('div');
        el.className = 'plr-banner';

        // Left side: icon + title + badge
        var left = document.createElement('div');
        left.className = 'plr-banner__left';

        var icon = document.createElement('span');
        icon.className = 'plr-banner__icon';
        icon.textContent = '📄';
        left.appendChild(icon);

        if (props.title) {
            var titleEl = document.createElement('span');
            titleEl.className = 'plr-banner__title';
            titleEl.textContent = props.title;
            left.appendChild(titleEl);
        }

        var badge = document.createElement('span');
        badge.className = 'plr-banner__badge';
        badge.textContent = props.badge || 'Page Layout';
        left.appendChild(badge);

        // Optional tags
        (props.tags || []).forEach(function (tag) {
            var t = document.createElement('span');
            t.className = 'plr-banner__tag';
            t.textContent = tag;
            left.appendChild(t);
        });

        el.appendChild(left);

        // Right side: author + date
        var hasMeta = props.author || props.date;
        if (hasMeta) {
            var right = document.createElement('div');
            right.className = 'plr-banner__right';

            if (props.author) {
                var authorEl = document.createElement('span');
                authorEl.className = 'plr-banner__meta';
                authorEl.textContent = props.author;
                right.appendChild(authorEl);
            }
            if (props.date) {
                var dateEl = document.createElement('span');
                dateEl.className = 'plr-banner__meta plr-banner__meta--date';
                dateEl.textContent = props.date;
                right.appendChild(dateEl);
            }
            el.appendChild(right);
        }

        // Dismiss button (default: shown)
        if (props.dismissible !== false) {
            var closeBtn = document.createElement('button');
            closeBtn.className = 'plr-banner__dismiss';
            closeBtn.textContent = '×';
            closeBtn.setAttribute('title', 'Dismiss');
            closeBtn.addEventListener('click', function () {
                el.style.transition = 'opacity 0.2s';
                el.style.opacity = '0';
                setTimeout(function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 220);
            });
            el.appendChild(closeBtn);
        }

        return el;
    }

    // ── Component dispatcher ──────────────────────────────────────────────────

    async function _renderComponent(comp, folderPath, zipTree, browseInstance) {
        if (!comp || !comp.type) return null;
        var props    = comp.props    || {};
        var children = comp.children || [];

        try {
            switch (comp.type) {
                case 'hero':          return await _renderHero(props, folderPath, zipTree, browseInstance);
                case 'section':       return await _renderSection(props, children, folderPath, zipTree, browseInstance);
                case 'text':          return _renderText(props);
                case 'bullet-points': return _renderBulletPoints(props);
                case 'title':         return _renderTitle(props);
                case 'image':         return await _renderImage(props, folderPath, zipTree, browseInstance);
                case 'slides':        return await _renderSlides(props, folderPath, zipTree, browseInstance);
                case 'gallery':       return await _renderGallery(props, folderPath, zipTree, browseInstance);
                case 'pdf':           return await _renderPdf(props, folderPath, zipTree, browseInstance);
                case 'markdown':      return await _renderMarkdown(props, folderPath, zipTree, browseInstance);
                case 'cards':         return await _renderCards(props, folderPath, zipTree, browseInstance);
                case 'columns':       return await _renderColumns(props, children, folderPath, zipTree, browseInstance);
                case 'callout':       return _renderCallout(props);
                case 'stats':         return _renderStats(props);
                case 'quote':         return _renderQuote(props);
                case 'author':        return await _renderAuthor(props, folderPath, zipTree, browseInstance);
                case 'banner':        return _renderBanner(props);
                default:              return null;  // Unknown type: skip silently
            }
        } catch (err) {
            console.warn('[PageLayoutRenderer] Component "' + comp.type + '" failed:', err);
            return null;
        }
    }

    // ── Navigation bar ────────────────────────────────────────────────────────

    function _renderNav(items, scrollRoot) {
        if (!items || items.length === 0) return null;

        var nav = document.createElement('nav');
        nav.className = 'plr-nav';

        items.forEach(function (item) {
            var a = document.createElement('a');
            a.className = 'plr-nav__link';
            a.textContent = item.label;
            a.href = '#' + (item.anchor || _kebab(item.label));
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var id = item.anchor || _kebab(item.label);
                var target = scrollRoot.querySelector('#' + id);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            nav.appendChild(a);
        });

        // IntersectionObserver: highlight active section in nav
        requestAnimationFrame(function () {
            var links = nav.querySelectorAll('.plr-nav__link');
            var obs = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var id = entry.target.id;
                        links.forEach(function (a) {
                            var href = a.getAttribute('href').slice(1);
                            a.classList.toggle('plr-nav__link--active', href === id);
                        });
                    }
                });
            }, { root: scrollRoot, threshold: 0.25 });

            links.forEach(function (a) {
                var id = a.getAttribute('href').slice(1);
                var sec = scrollRoot.querySelector('#' + id);
                if (sec) obs.observe(sec);
            });
        });

        return nav;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    async function render(container, pageJson, folderPath, zipTree, browseInstance) {
        container.innerHTML = '';

        var page;
        try {
            page = typeof pageJson === 'string' ? JSON.parse(pageJson) : pageJson;
        } catch (err) {
            container.innerHTML = '<div style="padding:2rem;color:#e74c3c;">Invalid _page.json: ' + _esc(err.message) + '</div>';
            return;
        }

        // ── Theme (v2 object or v1 string, both supported) ─────────────────────
        var themeRaw   = page.theme;
        var themeMode, themeAccent, themeFont, themeDensity;
        if (themeRaw && typeof themeRaw === 'object') {
            themeMode    = themeRaw.mode     || 'light';
            themeAccent  = themeRaw.accent   || null;
            themeFont    = themeRaw.font     || null;
            themeDensity = themeRaw.density  || null;
        } else {
            themeMode    = (themeRaw === 'dark') ? 'dark' : 'light';
            themeAccent  = null; themeFont = null; themeDensity = null;
        }
        // 'auto' inherits Browse shell → treat as light (shell default)
        if (themeMode === 'auto') themeMode = 'light';

        var classes = 'plr-page plr-page--' + themeMode;
        if (themeDensity) classes += ' plr-density--' + themeDensity;
        if (themeFont)    classes += ' plr-font--' + themeFont;
        container.className = classes;

        // Apply accent CSS custom property (overrides shell default)
        if (themeAccent) container.style.setProperty('--plr-accent', themeAccent);

        // Background: explicit theme.background always wins.
        // Light mode defaults to white so the Browse shell's dark palette doesn't bleed in.
        // Dark mode must NOT set an inline style — it would override the .plr-page--dark CSS
        // class rule (inline specificity beats class), leaving white bg with light-coloured text.
        if (themeRaw && typeof themeRaw === 'object' && themeRaw.background) {
            container.style.background = themeRaw.background;
        } else if (themeMode === 'dark') {
            container.style.removeProperty('background');
        } else {
            container.style.background = '#ffffff';
        }

        // Apply font family custom property
        var fontFamilyMap = {
            mono:   "'SF Mono','Fira Code','Cascadia Code',monospace",
            serif:  "Georgia,'Times New Roman',serif",
            sans:   "'Inter','Segoe UI',sans-serif",
            system: 'system-ui,sans-serif'
        };
        if (themeFont && fontFamilyMap[themeFont]) {
            container.style.setProperty('--plr-font', fontFamilyMap[themeFont]);
        }

        // ── Layout ─────────────────────────────────────────────────────────────
        // P1-B: scroll wrapper is the actual scroll container (overflow-y: auto).
        // The IntersectionObserver uses it as root so active-nav highlighting works.
        var wrapper = document.createElement('div');
        wrapper.className = 'plr-scroll-wrapper';
        container.appendChild(wrapper);

        // Auto-banner: render before nav when page doesn't start with a hero.
        // Suppressed when:  page.banner === false  OR  first component is 'hero'.
        // The banner uses page.title and optional page.meta (author, date, tags).
        // Auto-banner always renders unless explicitly suppressed with "banner": false,
        // or unless the page author placed an explicit "banner" component first.
        var firstType = (page.components && page.components[0]) ? page.components[0].type : null;
        if (page.banner !== false && firstType !== 'banner') {
            var meta = page.meta || {};
            var bannerEl = _renderBanner({
                title:       page.title  || '',
                badge:       meta.badge  || 'Page Layout',
                author:      meta.author || '',
                date:        meta.date   || '',
                tags:        meta.tags   || [],
                dismissible: true
            });
            wrapper.appendChild(bannerEl);
        }

        // Navigation bar (sticky inside wrapper, since wrapper is scroll container)
        if (page.navigation && page.navigation.length > 0) {
            var navEl = _renderNav(page.navigation, wrapper);
            if (navEl) wrapper.appendChild(navEl);
        }

        // Render all components in order
        for (var i = 0; i < (page.components || []).length; i++) {
            var el = await _renderComponent(page.components[i], folderPath, zipTree, browseInstance);
            if (el) wrapper.appendChild(el);
        }
    }

    return { render: render, renderBanner: _renderBanner };

})();

window.PageLayoutRenderer = PageLayoutRenderer;
