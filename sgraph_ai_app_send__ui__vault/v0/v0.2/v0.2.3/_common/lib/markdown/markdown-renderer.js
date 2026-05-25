/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph — Markdown Renderer
   vault/lib/markdown v0.2.0

   Thin rendering layer over MarkdownParser. Owns the DOM structure for
   displaying a markdown file, and exposes a clean handle so consumers
   never need to query the rendered DOM.

   Requires: markdown-parser.js loaded first (defines MarkdownParser).

   API:
     const view = MarkdownRenderer.mount(container, bytes, options);
     view.getSource()          → original markdown string (never stale)
     view.getFrontMatter()     → parsed front matter config object (or {})
     view.refresh(newBytes)    → re-render with new content
     view.toggleSource()       → switch rendered ↔ raw source view
     view.isSourceVisible()    → boolean
     view.unmount()            → remove DOM, release listeners

   Options:
     resolveBlobUrl(src)  async fn — converts data-md-src to blob: URL
     onLinkClick(href, e) fn — intercepts relative-path link clicks

   Front matter (in the markdown file, between --- delimiters):
     page_break_before: h1          — page break before every h1
     page_break_before: [h1, h2]    — page break before h1 AND h2
     page_break_before: true        — shorthand for h1
     print_css: |
       h2 { color: navy; }          — extra CSS injected into sg-print window

   Inline body directive (standalone line):
     <!-- page-break -->            — manual page break at this point
   ═══════════════════════════════════════════════════════════════════════════════ */

const MarkdownRenderer = {

    mount(container, bytes, options = {}) {
        const source = new TextDecoder().decode(bytes);

        // Wrapper holds both rendered and source views
        const wrapper = document.createElement('div');
        wrapper.className = 'md-renderer';
        wrapper.style.cssText = 'width:100%;height:100%;overflow-y:auto;';

        // Rendered view
        const rendered = document.createElement('div');
        rendered.className = 'sb-file__markdown';

        // Raw source view (hidden by default)
        const sourcePre = document.createElement('pre');
        sourcePre.className = 'sb-file__md-source';
        sourcePre.style.cssText = 'display:none;margin:0;padding:1rem;overflow:auto;' +
            'font-family:var(--font-mono,monospace);font-size:0.8rem;line-height:1.6;' +
            'white-space:pre-wrap;word-break:break-all;color:var(--color-text,#e0e0e0);';

        wrapper.appendChild(rendered);
        wrapper.appendChild(sourcePre);
        container.appendChild(wrapper);

        let currentSource  = source;
        let currentConfig  = {};
        let sourceVisible  = false;

        function _render(text) {
            // Extract front matter (config + body without the --- block).
            // Falls back gracefully when MarkdownParser lacks extractFrontMatter.
            var fm = (typeof MarkdownParser !== 'undefined' && MarkdownParser.extractFrontMatter)
                ? MarkdownParser.extractFrontMatter(text)
                : { config: {}, body: text };

            currentConfig = fm.config || {};
            var body      = fm.body;

            var html;
            if (typeof MarkdownParser !== 'undefined') {
                html = MarkdownParser.parse(body, {
                    pageBreakBefore: currentConfig.page_break_before
                });
            } else {
                html = '<pre>' + body.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
            }

            rendered.innerHTML = html;

            // Mark the container so CSS can conditionally show/hide the
            // on-screen page-break indicators.
            if (currentConfig.page_break_before) {
                rendered.classList.add('has-page-breaks');
            } else {
                rendered.classList.remove('has-page-breaks');
            }

            // Inject print_css into a <style> scoped to this container.
            // Allows the author to fine-tune print layout (fonts, margins,
            // column counts) without touching the vault UI source.
            var oldStyle = rendered.querySelector('style.md-print-css');
            if (oldStyle) oldStyle.remove();
            if (currentConfig.print_css && typeof currentConfig.print_css === 'string') {
                var styleEl = document.createElement('style');
                styleEl.className = 'md-print-css';
                styleEl.textContent = '@media print {\n' + currentConfig.print_css + '\n}';
                rendered.insertBefore(styleEl, rendered.firstChild);
            }

            sourcePre.textContent = text;

            // Resolve blob URLs for images (BRW-005 equivalent)
            if (options.resolveBlobUrl) {
                rendered.querySelectorAll('img[data-md-src]').forEach(async img => {
                    const src = img.getAttribute('data-md-src');
                    try {
                        const blob = await options.resolveBlobUrl(src);
                        if (blob) img.src = blob;
                    } catch (_) {}
                });
            }

            // Intercept relative-path link clicks (BRW-004 equivalent)
            if (options.onLinkClick) {
                rendered.querySelectorAll('a[href]').forEach(a => {
                    const href = a.getAttribute('href');
                    if (href && !href.match(/^https?:\/\//i) && !href.startsWith('mailto:')) {
                        a.addEventListener('click', e => {
                            e.preventDefault();
                            options.onLinkClick(href, e);
                        });
                    }
                });
            }
        }

        _render(source);

        const view = {
            getSource()      { return currentSource; },
            getFrontMatter() { return currentConfig;  },
            isSourceVisible(){ return sourceVisible;  },

            refresh(newBytes) {
                currentSource = new TextDecoder().decode(newBytes);
                _render(currentSource);
            },

            toggleSource() {
                sourceVisible = !sourceVisible;
                rendered.style.display  = sourceVisible ? 'none' : '';
                sourcePre.style.display = sourceVisible ? '' : 'none';
                return sourceVisible;
            },

            unmount() {
                wrapper.remove();
            }
        };

        return view;
    }
};
