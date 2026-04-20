/* =============================================================================
   SgPrint — Reusable print-to-PDF component for SGraph

   Zero-dependency, standalone print utility.
   Opens a clean print window with:
     - Screen: A4 page preview with toolbar (Print / Close buttons)
     - Print: Clean document with SG/Send branding header + footer

   Usage:
     SgPrint.printHtml(htmlContent, filename)
     SgPrint.printMarkdown(markdownText, filename)  // requires MarkdownParser

   Page breaks in markdown:
     Add <div class="page-break"></div> in the markdown (raw HTML).
     On screen: invisible. In print: forces a page break.

   v0.3.1 changes over v0.3.0:
     - @page margin set to 0 (was 2cm 2.5cm) — browser dialog controls margins
     - Screen preview padding reduced from 2cm 2.5cm → 0.8cm 1.2cm
     - Dark inline backgrounds stripped before printing (prevents dark-themed
       HTML blocks from creating dark pages in the PDF output)
     - .page-break CSS support added
   ============================================================================= */

var SgPrint = (function() {
    'use strict';

    // ─── Print styles (A4-ready, screen preview + print media) ───────────────
    var PRINT_STYLES = [
        '*, *::before, *::after { box-sizing: border-box; }',
        '@page { margin: 1cm 1.25cm; }',  /* Half original 2cm/2.5cm — user can override with "None" */
        'body {',
        '    font-family: "DM Sans", system-ui, -apple-system, sans-serif;',
        '    font-size: 11pt; line-height: 1.6; color: #1a1a1a; background: #fff;',
        '    margin: 0; padding: 0; word-wrap: break-word;',
        '}',
        '',
        '/* --- Screen-only toolbar and layout --- */',
        '@media screen {',
        '    body { background: #f0f0f0; padding: 0; margin: 0; }',
        '    .sg-print-toolbar {',
        '        position: sticky; top: 0; z-index: 100;',
        '        background: #2d2d2d; color: #fff; padding: 12px 24px;',
        '        display: flex; align-items: center; gap: 16px;',
        '        font-family: system-ui, -apple-system, sans-serif; font-size: 13px;',
        '        box-shadow: 0 2px 8px rgba(0,0,0,0.2);',
        '    }',
        '    .sg-print-toolbar .toolbar-brand {',
        '        display: flex; align-items: center; gap: 6px; font-size: 14px;',
        '    }',
        '    .sg-print-toolbar .toolbar-brand b { color: #4ECDC4; }',
        '    .sg-print-toolbar .toolbar-sep {',
        '        width: 1px; height: 20px; background: #555;',
        '    }',
        '    .sg-print-toolbar .toolbar-info { color: #bbb; flex: 1; }',
        '    .sg-print-toolbar .toolbar-info strong { color: #fff; }',
        '    .sg-print-toolbar button {',
        '        padding: 6px 16px; border: none; border-radius: 4px;',
        '        font-size: 13px; cursor: pointer; font-weight: 500;',
        '    }',
        '    .sg-print-toolbar .btn-print {',
        '        background: #4ECDC4; color: #1a1a1a;',
        '    }',
        '    .sg-print-toolbar .btn-print:hover { background: #3dbdb5; }',
        '    .sg-print-toolbar .btn-close {',
        '        background: transparent; color: #bbb; border: 1px solid #555;',
        '    }',
        '    .sg-print-toolbar .btn-close:hover { background: #444; color: #fff; }',
        '    .sg-print-page {',
        '        max-width: 210mm; margin: 24px auto; background: #fff;',
        '        padding: 0.8cm 1.2cm; box-shadow: 0 2px 12px rgba(0,0,0,0.15);',
        '        border-radius: 2px; min-height: 297mm;',
        '    }',
        '    /* Page break marker: dashed line on screen so authors can see it */',
        '    .page-break { display: block; border-top: 2px dashed #ccc; margin: 1.5em 0; }',
        '}',
        '@media print {',
        '    .sg-print-toolbar { display: none !important; }',
        '    .sg-print-page { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; min-height: auto; }',
        '    /* Page break: invisible in print but forces a new page */',
        '    .page-break { display: block; page-break-after: always; break-after: page; height: 0; border: none; }',
        '}',
        '',
        '/* --- Document styles (both screen and print) --- */',
        '.sg-print-header {',
        '    display: flex; align-items: center; gap: 8px;',
        '    padding-bottom: 0.5em; margin-bottom: 1.5em;',
        '    border-bottom: 2px solid #4ECDC4; color: #888; font-size: 9pt;',
        '}',
        '.sg-print-header b { color: #555; }',
        '.sg-print-header .sg-print-filename {',
        '    margin-left: auto; font-style: italic; color: #999;',
        '}',
        'h1, h2, h3, h4, h5, h6 { color: #111; margin: 1.5em 0 0.5em; line-height: 1.3; page-break-after: avoid; }',
        'h1 { font-size: 1.6em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.3em; }',
        'h2 { font-size: 1.35em; }',
        'h3 { font-size: 1.15em; }',
        'p { margin: 0.8em 0; orphans: 3; widows: 3; }',
        'a { color: #0066cc; text-decoration: none; }',
        'code {',
        '    font-family: "JetBrains Mono", "SF Mono", Consolas, monospace;',
        '    font-size: 0.88em; background: #f5f5f5; padding: 0.15em 0.4em;',
        '    border-radius: 3px; color: #d63384;',
        '}',
        'pre {',
        '    background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 6px;',
        '    padding: 0.8em 1em; overflow-x: auto; margin: 1em 0;',
        '    page-break-inside: avoid;',
        '}',
        'pre code { background: none; padding: 0; color: #333; font-size: 0.85em; }',
        'blockquote {',
        '    border-left: 3px solid #ccc; margin: 1em 0; padding: 0.5em 1em;',
        '    background: #fafafa; color: #555; page-break-inside: avoid;',
        '}',
        'ul, ol { padding-left: 1.5em; margin: 0.8em 0; }',
        'li { margin: 0.3em 0; }',
        'hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }',
        'table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; }',
        'th, td { border: 1px solid #ddd; padding: 0.4em 0.75em; text-align: left; font-size: 0.95em; }',
        'th { background: #f5f5f5; font-weight: 600; color: #111; }',
        'strong { color: #111; }',
        'del { color: #999; }',
        'img { max-width: 100%; page-break-inside: avoid; }',
        '.sg-print-footer {',
        '    margin-top: 2em; padding-top: 0.5em;',
        '    border-top: 1px solid #e0e0e0; color: #bbb; font-size: 8pt;',
        '    display: flex; justify-content: space-between;',
        '}'
    ].join('\n');

    // ─── SG/Send logo SVG (tiny, inline) ─────────────────────────────────────
    var LOGO_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

    // ─── Sanitize: strip dark inline backgrounds ──────────────────────────────
    //
    // Markdown content may include raw HTML with dark-themed backgrounds
    // (slide decks, infographics, etc.) that create dark blocks in the PDF.
    // This strips inline background/background-color styles from non-code
    // elements where the computed color is very dark (luminance < 60).
    //
    function _sanitizeForPrint(htmlStr) {
        var tmp = document.createElement('div');
        tmp.innerHTML = htmlStr;

        tmp.querySelectorAll('[style]').forEach(function(el) {
            // Leave code/pre alone — they may legitimately want dark backgrounds
            var tag = el.tagName.toLowerCase();
            if (tag === 'pre' || tag === 'code') return;

            var s = el.style;
            // Check both background and background-color (el.style properties)
            var bgColor = s.backgroundColor || '';
            var bg      = s.background || '';
            var raw     = bgColor || bg;

            if (!raw) return;

            // Parse rgb/rgba or #hex to get luminance
            var isDark = false;
            var rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (rgb) {
                var r = parseInt(rgb[1]), g = parseInt(rgb[2]), b = parseInt(rgb[3]);
                isDark = (0.299 * r + 0.587 * g + 0.114 * b) < 60;
            } else {
                var hex = raw.match(/#([0-9a-f]{3,8})/i);
                if (hex) {
                    var h = hex[1];
                    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
                    var r2 = parseInt(h.substr(0,2),16), g2 = parseInt(h.substr(2,2),16), b2 = parseInt(h.substr(4,2),16);
                    isDark = (0.299 * r2 + 0.587 * g2 + 0.114 * b2) < 60;
                }
            }

            if (isDark) {
                s.backgroundColor = 'transparent';
                s.background      = 'transparent';
            }
        });

        return tmp.innerHTML;
    }

    // ─── Core: open print window with HTML content ───────────────────────────
    function printHtml(htmlContent, filename) {
        var displayName = filename || 'Document';
        var dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        // Strip dark inline backgrounds before writing to the print window
        var safeContent = _sanitizeForPrint(htmlContent);

        var printDoc = '<!DOCTYPE html><html><head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>' + escapeHtml(displayName) + '</title>' +
            '<style>' + PRINT_STYLES + '</style>' +
            '</head><body>' +
            '<div class="sg-print-toolbar">' +
                '<div class="toolbar-brand">' +
                    LOGO_SVG +
                    '<span>SG/<b>Send</b></span>' +
                '</div>' +
                '<div class="toolbar-sep"></div>' +
                '<div class="toolbar-info">Print preview for <strong>' + escapeHtml(displayName) + '</strong></div>' +
                '<button class="btn-print" onclick="window.print()">Print / Save PDF</button>' +
                '<button class="btn-close" onclick="window.close()">Close</button>' +
            '</div>' +
            '<div class="sg-print-page">' +
            '<div class="sg-print-header">' +
                LOGO_SVG +
                '<span>SG/<b>Send</b></span>' +
                '<span class="sg-print-filename">' + escapeHtml(filename || '') + '</span>' +
            '</div>' +
            safeContent +
            '<div class="sg-print-footer">' +
                '<span>SG/Send &mdash; sgraph.ai</span>' +
                '<span>Printed ' + dateStr + '</span>' +
            '</div>' +
            '</div>' +
            '</body></html>';

        var w = window.open('', '_blank');
        if (!w) {
            window.print();
            return;
        }
        w.document.write(printDoc);
        w.document.close();
        // Explicitly set title after close so Chrome uses it as the PDF filename.
        // Without this, Chrome sometimes reads the opener window's title instead.
        w.document.title = displayName;
        setTimeout(function() { w.print(); }, 400);
    }

    // ─── Convenience: print markdown (requires MarkdownParser) ───────────────
    function printMarkdown(markdownText, filename) {
        var html;
        if (typeof MarkdownParser !== 'undefined') {
            html = MarkdownParser.parse(markdownText);
        } else {
            html = '<pre>' + escapeHtml(markdownText) + '</pre>';
        }
        printHtml(html, filename);
    }

    // ─── Utility ─────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── Public API ──────────────────────────────────────────────────────────
    return {
        printHtml:     printHtml,
        printMarkdown: printMarkdown,
        PRINT_STYLES:  PRINT_STYLES,
        version:       '1.0.2'
    };
})();
