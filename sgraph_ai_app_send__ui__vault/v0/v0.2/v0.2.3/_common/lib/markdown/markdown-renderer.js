/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph — Markdown Renderer
   vault/lib/markdown v0.1.0

   Thin rendering layer over MarkdownParser. Owns the DOM structure for
   displaying a markdown file, and exposes a clean handle so consumers
   never need to query the rendered DOM.

   Requires: markdown-parser.js loaded first (defines MarkdownParser).

   API:
     const view = MarkdownRenderer.mount(container, bytes, options);
     view.getSource()          → original markdown string (never stale)
     view.refresh(newBytes)    → re-render with new content
     view.toggleSource()       → switch rendered ↔ raw source view
     view.isSourceVisible()    → boolean
     view.unmount()            → remove DOM, release listeners

   Options:
     resolveBlobUrl(src)  async fn — converts data-md-src to blob: URL
     onLinkClick(href, e) fn — intercepts relative-path link clicks
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

        let currentSource = source;
        let sourceVisible = false;

        function _render(text) {
            const html = typeof MarkdownParser !== 'undefined'
                ? MarkdownParser.parse(text)
                : '<pre>' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>';
            rendered.innerHTML = html;
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
            getSource()         { return currentSource; },
            isSourceVisible()   { return sourceVisible; },

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
