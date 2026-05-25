/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph — Standalone Markdown Parser
   vault/lib/markdown v0.2.0

   Derived from Send UI v0.3.0 markdown-parser.js +
   v0.3.1 overlay (BRW-007, BRW-008, BRW-018, BRW-020, BRW-021) +
   list-continuation fix.

   Security: NO arbitrary HTML pass-through. All text content escaped.
   No DOM dependency. No CDN dependency. Ships inside the vault tree.

   API:
     MarkdownParser.parse(text [, options]) → safe HTML string
     MarkdownParser.extractFrontMatter(text) → { config, body }

   Page-break options (front matter or options object):
     page_break_before: h1           — break before every h1
     page_break_before: [h1, h2]     — break before h1 AND h2
     page_break_before: true         — shorthand for h1

   Inline directive (anywhere in body, on its own line):
     <!-- page-break -->             — explicit manual page break

   The page-break marker div is visible on screen as a labelled dashed line
   and becomes an invisible page-break-after element in @media print.
   ═══════════════════════════════════════════════════════════════════════════════ */

const MarkdownParser = {

    // ── Public API ──────────────────────────────────────────────────────────────

    parse(markdown, options) {
        if (!markdown) return '';
        options = options || {};
        const lines  = markdown.split('\n');
        const blocks = this._parseBlocks(lines);
        const pbSet  = _normPageBreakLevels(options.pageBreakBefore);

        return blocks.map(function(b, idx) {
            // Insert page-break marker before heading if:
            //  • this heading level is in the break-set
            //  • it is not the very first block (no break at top of document)
            var prefix = '';
            if (pbSet.size > 0 && b.type === 'heading' && pbSet.has(b.level) && idx > 0) {
                prefix = _pbMarkerHtml() + '\n';
            }
            return prefix + MarkdownParser._renderBlock(b);
        }).join('\n');
    },

    // ── Front matter ────────────────────────────────────────────────────────────
    // Extracts a YAML front matter block delimited by --- / --- from the start of
    // the text. Returns { config: {...}, body: '...' }.  If no front matter, body
    // is the full text and config is {}.
    //
    // Supported YAML subset (flat key: value only — no nesting):
    //   page_break_before: h1
    //   page_break_before: [h1, h2]
    //   page_break_before: true
    //   print_css: |
    //     h2 { color: navy; }    ← raw CSS injected into sg-print window
    //
    extractFrontMatter(text) {
        if (!text) return { config: {}, body: '' };
        // Must start with '---' on the very first line
        if (!text.startsWith('---\n') && text !== '---') return { config: {}, body: text };
        // Find closing ---
        var closeIdx = text.indexOf('\n---', 4);
        if (closeIdx === -1) return { config: {}, body: text };
        var yamlBlock = text.slice(4, closeIdx).trim();
        var body      = text.slice(closeIdx + 4).replace(/^\n/, '');
        var config    = this._parseSimpleYaml(yamlBlock);
        return { config: config, body: body };
    },

    // Simple key: value YAML parser.
    // Handles: strings, true/false, integers, inline arrays [a, b, c].
    _parseSimpleYaml(yaml) {
        var config = {};
        var lines  = yaml.split('\n');
        var i = 0;
        while (i < lines.length) {
            var line = lines[i];
            var m    = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
            if (!m) { i++; continue; }
            var key = m[1];
            var val = m[2].trim();

            // Multiline literal block scalar (|)
            if (val === '|') {
                i++;
                var blockLines = [];
                while (i < lines.length && (lines[i].startsWith('  ') || lines[i] === '')) {
                    blockLines.push(lines[i].startsWith('  ') ? lines[i].slice(2) : '');
                    i++;
                }
                config[key] = blockLines.join('\n').trimEnd();
                continue;
            }

            // Inline array: [h1, h2]
            if (val.startsWith('[') && val.endsWith(']')) {
                config[key] = val.slice(1, -1).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
            } else if (val === 'true')  { config[key] = true;  }
            else if (val === 'false') { config[key] = false; }
            else if (/^\d+$/.test(val)) { config[key] = parseInt(val, 10); }
            else { config[key] = val; }

            i++;
        }
        return config;
    },

    // ── Escape ──────────────────────────────────────────────────────────────────

    _escape(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // ── BRW-008: allow bare relative file paths ─────────────────────────────────
    _sanitizeUrl(url) {
        const trimmed = url.trim();
        const lower   = trimmed.toLowerCase();
        if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:'))
            return null;
        if (trimmed.startsWith('/') || trimmed.startsWith('#') ||
            trimmed.startsWith('./') || trimmed.startsWith('../'))
            return trimmed;
        if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed))
            return trimmed;
        // BRW-008: bare relative paths (filenames, folder/file)
        if (/^[a-zA-Z0-9_\-\/\.\(\)\[\] %]+$/.test(trimmed))
            return trimmed;
        return null;
    },

    _parseBlocks(lines) {
        const blocks = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // ── Explicit page-break directive ──────────────────────────────────
            // <!-- page-break --> (case-insensitive, optional whitespace)
            if (/^\s*<!--\s*page-?break\s*-->\s*$/i.test(line)) {
                blocks.push({ type: 'page_break' });
                i++;
                continue;
            }

            if (/^```/.test(line)) {
                const lang = line.slice(3).trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++;
                blocks.push({ type: 'code_block', lang: lang || null, content: codeLines.join('\n') });
                continue;
            }

            if (/^(\s*[-*_]\s*){3,}$/.test(line) && line.trim().length >= 3) {
                blocks.push({ type: 'hr' });
                i++;
                continue;
            }

            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
                i++;
                continue;
            }

            if (/^\|(.+)\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
                const tableLines = [];
                while (i < lines.length && /^\|/.test(lines[i])) {
                    tableLines.push(lines[i]);
                    i++;
                }
                blocks.push(this._parseTable(tableLines));
                continue;
            }

            if (/^>\s?/.test(line)) {
                const quoteLines = [];
                while (i < lines.length && /^>\s?/.test(lines[i])) {
                    quoteLines.push(lines[i].replace(/^>\s?/, ''));
                    i++;
                }
                blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
                continue;
            }

            // UL — with multi-line continuation (CommonMark: indent ≥ marker-indent + 2)
            if (/^[\s]*[-*+]\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^[\s]*[-*+]\s+/.test(lines[i])) {
                    const m = lines[i].match(/^(\s*)[-*+]\s+(.*)/);
                    const minCont = (m[1] || '').length + 2;
                    let itemText = m[2];
                    i++;
                    while (i < lines.length) {
                        const next = lines[i];
                        if (!next.trim()) break;
                        if (/^#{1,6}\s/.test(next) || /^```/.test(next) || /^>\s?/.test(next) || /^\|/.test(next)) break;
                        const spaces = (next.match(/^(\s*)/)[1] || '').length;
                        if (spaces < minCont) break;
                        const stripped = next.slice(spaces);
                        if (/^[-*+]\s+/.test(stripped) || /^\d+\.\s+/.test(stripped)) break;
                        itemText += '\n' + stripped;
                        i++;
                    }
                    items.push(itemText);
                }
                blocks.push({ type: 'ul', items });
                continue;
            }

            // OL — with multi-line continuation
            if (/^[\s]*\d+\.\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
                    const m = lines[i].match(/^(\s*)\d+\.\s+(.*)/);
                    const minCont = (m[1] || '').length + 2;
                    let itemText = m[2];
                    i++;
                    while (i < lines.length) {
                        const next = lines[i];
                        if (!next.trim()) break;
                        if (/^#{1,6}\s/.test(next) || /^```/.test(next) || /^>\s?/.test(next) || /^\|/.test(next)) break;
                        const spaces = (next.match(/^(\s*)/)[1] || '').length;
                        if (spaces < minCont) break;
                        const stripped = next.slice(spaces);
                        if (/^[-*+]\s+/.test(stripped) || /^\d+\.\s+/.test(stripped)) break;
                        itemText += '\n' + stripped;
                        i++;
                    }
                    items.push(itemText);
                }
                blocks.push({ type: 'ol', items });
                continue;
            }

            if (line.trim() === '') { i++; continue; }

            const paraLines = [];
            while (i < lines.length && lines[i].trim() !== '' &&
                   !/^#{1,6}\s/.test(lines[i]) && !/^```/.test(lines[i]) &&
                   !/^>\s?/.test(lines[i]) && !/^\|/.test(lines[i]) &&
                   !/^[\s]*[-*+]\s+/.test(lines[i]) && !/^[\s]*\d+\.\s+/.test(lines[i]) &&
                   !/^(\s*[-*_]\s*){3,}$/.test(lines[i]) &&
                   !/^\s*<!--\s*page-?break\s*-->\s*$/i.test(lines[i])) {
                paraLines.push(lines[i]);
                i++;
            }
            if (paraLines.length > 0)
                blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
        }

        return blocks;
    },

    _parseTable(lines) {
        if (lines.length < 2) return { type: 'paragraph', content: lines.join('\n') };
        const parseRow = line =>
            line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        const headers = parseRow(lines[0]);
        const aligns  = parseRow(lines[1]).map(s => {
            const t = s.trim();
            if (t.startsWith(':') && t.endsWith(':')) return 'center';
            if (t.endsWith(':')) return 'right';
            return 'left';
        });
        const rows = [];
        for (let i = 2; i < lines.length; i++) rows.push(parseRow(lines[i]));
        return { type: 'table', headers, aligns, rows };
    },

    _renderBlock(block) {
        switch (block.type) {
            case 'heading':
                return `<h${block.level}>${this._renderInline(block.content)}</h${block.level}>`;
            case 'paragraph':
                return `<p>${this._renderInline(block.content)}</p>`;
            case 'code_block': {
                const escaped  = this._escape(block.content);
                const langAttr = block.lang ? ` data-lang="${this._escape(block.lang)}"` : '';
                return `<pre><code${langAttr}>${escaped}</code></pre>`;
            }
            case 'blockquote':
                return `<blockquote>${this.parse(block.content)}</blockquote>`;
            case 'ul':
                return '<ul>' + block.items.map(item => `<li>${this._renderInline(item)}</li>`).join('') + '</ul>';
            case 'ol':
                return '<ol>' + block.items.map(item => `<li>${this._renderInline(item)}</li>`).join('') + '</ol>';
            case 'hr':
                return '<hr>';
            case 'table':
                return this._renderTable(block);
            case 'page_break':
                return _pbMarkerHtml();
            default:
                return `<p>${this._escape(block.content || '')}</p>`;
        }
    },

    _renderTable(block) {
        let html = '<table><thead><tr>';
        for (let i = 0; i < block.headers.length; i++) {
            const align = block.aligns[i] || 'left';
            html += `<th style="text-align:${align}">${this._renderInline(block.headers[i])}</th>`;
        }
        html += '</tr></thead><tbody>';
        for (const row of block.rows) {
            html += '<tr>';
            for (let i = 0; i < block.headers.length; i++) {
                const align = block.aligns[i] || 'left';
                const cell  = i < row.length ? row[i] : '';
                html += `<td style="text-align:${align}">${this._renderInline(cell)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    },

    // ── BRW-007 / BRW-018 / BRW-020 / BRW-021 ──────────────────────────────────
    // Images render as <img data-md-src> (prevents 404 before blob rewrite).
    // Discourse-style dimensions: ![alt|400](img.png) or ![alt|50%](img.png).
    // Code-span guard: backtick spans are passed through first so ![ inside
    // `` `![alt](url)` `` is never mistaken for an image tag.
    _renderInline(text) {
        if (!text) return '';
        let result = '';
        let i = 0;

        while (i < text.length) {

            // Inline code — must be checked BEFORE image to handle BRW-021
            if (text[i] === '`') {
                const end = text.indexOf('`', i + 1);
                if (end > i) {
                    result += '<code>' + this._escape(text.slice(i + 1, end)) + '</code>';
                    i = end + 1; continue;
                }
            }

            // BRW-007/018/020: image
            if (text[i] === '!' && text[i + 1] === '[') {
                const cb = text.indexOf(']', i + 2);
                if (cb > i && text[cb + 1] === '(') {
                    const cp = text.indexOf(')', cb + 2);
                    if (cp > cb) {
                        const altText  = text.slice(i + 2, cb);
                        const imgUrl   = text.slice(cb + 2, cp);
                        const safeUrl  = this._sanitizeUrl(imgUrl);
                        if (safeUrl) {
                            const pipeIdx    = altText.indexOf('|');
                            const displayAlt = pipeIdx === -1 ? altText : altText.slice(0, pipeIdx);
                            let   imgStyle   = 'max-width:100%;border-radius:6px;margin:0.5em 0;';
                            if (pipeIdx !== -1) {
                                const dim      = altText.slice(pipeIdx + 1).trim();
                                const pctMatch = dim.match(/^(\d+)%$/);
                                const pxhMatch = dim.match(/^(\d+)x(\d+)$/);
                                const wMatch   = dim.match(/^(\d+)$/);
                                if (pctMatch)
                                    imgStyle = `width:${pctMatch[1]}%;border-radius:6px;margin:0.5em 0;`;
                                else if (pxhMatch)
                                    imgStyle = `width:${pxhMatch[1]}px;height:${pxhMatch[2]}px;border-radius:6px;margin:0.5em 0;`;
                                else if (wMatch)
                                    imgStyle = `width:${wMatch[1]}px;border-radius:6px;margin:0.5em 0;`;
                                else displayAlt === altText; // unrecognised dim → keep full altText
                            }
                            result += `<img data-md-src="${this._escape(safeUrl)}" alt="${this._escape(displayAlt)}" style="${imgStyle}">`;
                        } else {
                            result += '<em>[image: ' + this._escape(altText) + ']</em>';
                        }
                        i = cp + 1; continue;
                    }
                }
            }

            // Link
            if (text[i] === '[') {
                const cb = text.indexOf(']', i + 1);
                if (cb > i && text[cb + 1] === '(') {
                    const cp = text.indexOf(')', cb + 2);
                    if (cp > cb) {
                        const linkText = text.slice(i + 1, cb);
                        const linkUrl  = text.slice(cb + 2, cp);
                        const safeUrl  = this._sanitizeUrl(linkUrl);
                        if (safeUrl) {
                            result += `<a href="${this._escape(safeUrl)}" target="_blank" rel="noopener noreferrer">${this._renderInline(linkText)}</a>`;
                        } else {
                            result += this._escape(linkText) + ' (' + this._escape(linkUrl) + ')';
                        }
                        i = cp + 1; continue;
                    }
                }
            }

            if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '*') {
                const end = text.indexOf('***', i + 3);
                if (end > i) {
                    result += '<strong><em>' + this._renderInline(text.slice(i + 3, end)) + '</em></strong>';
                    i = end + 3; continue;
                }
            }
            if (text[i] === '*' && text[i + 1] === '*') {
                const end = text.indexOf('**', i + 2);
                if (end > i) {
                    result += '<strong>' + this._renderInline(text.slice(i + 2, end)) + '</strong>';
                    i = end + 2; continue;
                }
            }
            if (text[i] === '*' && text[i + 1] !== '*') {
                const end = text.indexOf('*', i + 1);
                if (end > i && text[end + 1] !== '*') {
                    result += '<em>' + this._renderInline(text.slice(i + 1, end)) + '</em>';
                    i = end + 1; continue;
                }
            }
            if (text[i] === '_' && text[i + 1] === '_') {
                const end = text.indexOf('__', i + 2);
                if (end > i) {
                    result += '<strong>' + this._renderInline(text.slice(i + 2, end)) + '</strong>';
                    i = end + 2; continue;
                }
            }
            if (text[i] === '_' && text[i + 1] !== '_') {
                const end = text.indexOf('_', i + 1);
                if (end > i && text[end + 1] !== '_') {
                    result += '<em>' + this._renderInline(text.slice(i + 1, end)) + '</em>';
                    i = end + 1; continue;
                }
            }
            if (text[i] === '~' && text[i + 1] === '~') {
                const end = text.indexOf('~~', i + 2);
                if (end > i) {
                    result += '<del>' + this._renderInline(text.slice(i + 2, end)) + '</del>';
                    i = end + 2; continue;
                }
            }

            if (text[i] === '\n') { result += '<br>'; i++; continue; }
            result += this._escape(text[i]);
            i++;
        }

        return result;
    }
};

// ── Module-level helpers ─────────────────────────────────────────────────────

// Normalise page_break_before to a Set of heading levels (integers 1-6).
// Accepts: 'h1' | 'h2' | ... | 1 | 2 | ... | true | [h1,h2] | [1,2]
function _normPageBreakLevels(option) {
    if (!option && option !== 0) return new Set();
    if (option === true)         return new Set([1]);
    const items = Array.isArray(option) ? option : [option];
    const s = new Set();
    for (const x of items) {
        if (typeof x === 'number' && x >= 1 && x <= 6) { s.add(x); continue; }
        if (typeof x === 'string') {
            const m = x.match(/^h?([1-6])$/i);
            if (m) s.add(parseInt(m[1], 10));
        }
    }
    return s;
}

// Returns the HTML string for a page-break marker.
// Self-contained: uses inline styles so it renders correctly in ANY window
// (vault viewer, sg-print preview, standalone HTML) without needing external CSS.
//
// Screen: renders as a labelled dashed rule so the author can see breaks.
// Print:  becomes an invisible element with page-break-after:always.
function _pbMarkerHtml() {
    // Outer div — screen style via inline; print style via class (for @media print override)
    var outerStyle = [
        'display:flex',
        'align-items:center',
        'gap:0.75rem',
        'margin:2rem 0 0.5rem',
        'color:#aaa',
        'font-size:10px',
        'font-family:monospace',
        'letter-spacing:0.12em',
        'text-transform:uppercase',
        'user-select:none',
        'pointer-events:none'
    ].join(';');

    var lineStyle = 'flex:1;border:none;border-top:1px dashed #ccc;margin:0;padding:0;height:0;display:block;';
    var labelStyle = [
        'flex-shrink:0',
        'padding:1px 6px',
        'border:1px dashed #ccc',
        'border-radius:3px',
        'color:#bbb',
        'font-size:10px',
        'font-family:monospace'
    ].join(';');

    return '<div class="md-pb-marker" role="separator" aria-label="page break" style="' + outerStyle + '">' +
           '<span style="' + lineStyle + '"></span>' +
           '<span class="md-pb-marker__label" style="' + labelStyle + '">page break</span>' +
           '<span style="' + lineStyle + '"></span>' +
           '</div>';
}
