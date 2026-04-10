/* =============================================================================
   SgPrint — Reusable print-to-PDF component for SGraph

   Zero-dependency, standalone print utility.
   Opens a clean print window with:
     - Screen: A4 page preview with toolbar (Print / Close buttons)
     - Print: Clean document with SG/Send branding header + footer

   Usage:
     SgPrint.printHtml(htmlContent, filename)
     SgPrint.printMarkdown(markdownText, filename)  // requires MarkdownParser

   Designed for extraction into the __Tools repo.

   v0.3.1 change: @page margin removed (was 2cm 2.5cm) so the browser's
   own print-dialog margin setting ("None", "Default", "Custom") is the
   sole control point. Previously the CSS @page rule persisted even when
   the user selected "None" in Chrome's print panel.
   ============================================================================= */

var SgPrint = (function() {
    'use strict';

    // ─── Print styles (A4-ready, screen preview + print media) ───────────────
    var PRINT_STYLES = [
        '*, *::before, *::after { box-sizing: border-box; }',
        '@page { margin: 0; }',   /* Let browser margin setting win completely */
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
        '        padding: 2cm 2.5cm; box-shadow: 0 2px 12px rgba(0,0,0,0.15);',
        '        border-radius: 2px; min-height: 297mm;',
        '    }',
        '}',
        '@media print {',
        '    .sg-print-toolbar { display: none !important; }',
        '    .sg-print-page { max-width: none; margin: 0; padding: 0; box-shadow: none; border-radius: 0; min-height: auto; }',
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

    // ─── Core: open print window with HTML content ───────────────────────────
    function printHtml(htmlContent, filename) {
        var displayName = filename || 'Document';
        var dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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
            htmlContent +
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
        setTimeout(function() { w.print(); }, 300);
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
        version:       '1.0.1'
    };
})();
