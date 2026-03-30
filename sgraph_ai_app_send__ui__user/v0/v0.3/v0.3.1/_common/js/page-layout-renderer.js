/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Page Layout Renderer

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

   Components (Priority 2 — nice to have):
     title, csv
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

    // Load a file path → blob URL; returns null if not found.
    async function _blobUrl(relPath, folderPath, zipTree, browseInstance, mimeOverride) {
        var resolved = _resolvePath(_folderBase(folderPath), relPath);
        var match = _findZipEntry(zipTree, resolved);
        if (!match) return null;
        var bytes = await match.entry.async('arraybuffer');
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
        el.className = 'plr-hero';

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

        el.innerHTML =
            '<div class="plr-hero__overlay">' +
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
        el.className = 'plr-section';

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
        el.className = 'plr-image';
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
        var images = props.images || [];
        var captions = props.captions || [];

        var el = document.createElement('div');
        el.className = 'plr-slides';
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

        el.appendChild(navRow);
        el.appendChild(imgEl);
        el.appendChild(captionEl);

        el.tabIndex = 0;
        el.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') prevBtn.click();
            else if (e.key === 'ArrowRight') nextBtn.click();
        });

        update();
        return el;
    }

    // ── Component: gallery ────────────────────────────────────────────────────

    async function _renderGallery(props, folderPath, zipTree, browseInstance) {
        var images = props.images || [];
        var captions = props.captions || [];
        var columns = props.columns || 3;

        var el = document.createElement('div');
        el.className = 'plr-gallery';
        el.style.gridTemplateColumns = 'repeat(' + columns + ', 1fr)';

        var urls = await Promise.all(images.map(function (p) {
            return _blobUrl(p, folderPath, zipTree, browseInstance);
        }));

        urls.forEach(function (url, i) {
            if (!url) return;
            var thumb = document.createElement('div');
            thumb.className = 'plr-gallery__thumb';

            var img = document.createElement('img');
            img.src = url;
            img.alt = captions[i] || '';
            thumb.appendChild(img);

            // P1-C: visible caption below each thumbnail
            if (captions[i]) {
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
            var match = _findZipEntry(zipTree, resolved);
            if (match) {
                var bytes = await match.entry.async('arraybuffer');
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
            var imgMatch = _findZipEntry(zipTree, imgResolved);
            if (imgMatch) {
                imgMatch.entry.async('arraybuffer').then(function (imgBytes) {
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
                var linkMatch = _findZipEntry(zipTree, linkResolved);
                if (linkMatch) {
                    browseInstance._openFileTab(linkMatch.path);
                } else {
                    var fp = linkResolved.replace(/\/$/, '');
                    _navigateToFolder(browseInstance, zipTree, fp);
                }
            });
        });

        return el;
    }

    // ── Component dispatcher ──────────────────────────────────────────────────

    async function _renderComponent(comp, folderPath, zipTree, browseInstance) {
        if (!comp || !comp.type) return null;
        var props = comp.props || {};
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

        // P1-A / Theme: apply dark or light modifier based on page.theme field.
        // Default is light (white content area). 'dark' matches the Browse shell.
        var theme = (page.theme === 'dark') ? 'dark' : 'light';
        container.className = 'plr-page plr-page--' + theme;

        // P1-B: scroll wrapper is the actual scroll container (overflow-y: auto).
        // The IntersectionObserver uses it as root so active-nav highlighting works.
        var wrapper = document.createElement('div');
        wrapper.className = 'plr-scroll-wrapper';
        container.appendChild(wrapper);

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

    return { render: render };

})();

window.PageLayoutRenderer = PageLayoutRenderer;
