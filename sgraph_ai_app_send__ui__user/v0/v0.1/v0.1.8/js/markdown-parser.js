/* =============================================================================
   SG/Send — Mini Markdown Parser (Safe Subset)
   v0.1.8 — Security-first markdown rendering

   Supports ONLY a safe subset of markdown:
     - Headings (# through ######)
     - Bold (**text**), italic (*text*), bold+italic (***text***)
     - Inline code (`code`)
     - Code blocks (``` with optional language hint)
     - Unordered lists (- or *)
     - Ordered lists (1.)
     - Blockquotes (>)
     - Horizontal rules (--- or ***)
     - Tables (| col | col |)
     - Links [text](url) — rendered as text with title showing URL, not clickable by default
     - Images ![alt](url) — rendered as text description only (no loading external resources)

   Security:
     - NO arbitrary HTML passthrough — unknown input rendered as escaped text
     - All text content escaped via textContent-equivalent
     - Output is known-safe HTML elements only
     - Designed to be rendered inside a sandboxed iframe for defence-in-depth
   ============================================================================= */

const MarkdownParser = {

    /**
     * Parse markdown string to safe HTML.
     * @param {string} markdown - Raw markdown text
     * @returns {string} Safe HTML string
     */
    parse(markdown) {
        if (!markdown) return '';

        const lines = markdown.split('\n');
        const blocks = this._parseBlocks(lines);
        return blocks.map(b => this._renderBlock(b)).join('\n');
    },

    // ─── Escape HTML entities ─────────────────────────────────────────────

    _escape(str) {
        return str
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    },

    // ─── Block-level parsing ──────────────────────────────────────────────

    _parseBlocks(lines) {
        const blocks = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Fenced code block
            if (/^```/.test(line)) {
                const lang = line.slice(3).trim();
                const codeLines = [];
                i++;
                while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                    codeLines.push(lines[i]);
                    i++;
                }
                i++; // skip closing ```
                blocks.push({ type: 'code_block', lang: lang || null, content: codeLines.join('\n') });
                continue;
            }

            // Horizontal rule
            if (/^(\s*[-*_]\s*){3,}$/.test(line) && line.trim().length >= 3) {
                blocks.push({ type: 'hr' });
                i++;
                continue;
            }

            // Heading
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
                i++;
                continue;
            }

            // Table (detect header row with |)
            if (/^\|(.+)\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
                const tableLines = [];
                while (i < lines.length && /^\|/.test(lines[i])) {
                    tableLines.push(lines[i]);
                    i++;
                }
                blocks.push(this._parseTable(tableLines));
                continue;
            }

            // Blockquote
            if (/^>\s?/.test(line)) {
                const quoteLines = [];
                while (i < lines.length && /^>\s?/.test(lines[i])) {
                    quoteLines.push(lines[i].replace(/^>\s?/, ''));
                    i++;
                }
                blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
                continue;
            }

            // Unordered list
            if (/^[\s]*[-*+]\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^[\s]*[-*+]\s+/.test(lines[i])) {
                    items.push(lines[i].replace(/^[\s]*[-*+]\s+/, ''));
                    i++;
                }
                blocks.push({ type: 'ul', items });
                continue;
            }

            // Ordered list
            if (/^[\s]*\d+\.\s+/.test(line)) {
                const items = [];
                while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
                    items.push(lines[i].replace(/^[\s]*\d+\.\s+/, ''));
                    i++;
                }
                blocks.push({ type: 'ol', items });
                continue;
            }

            // Empty line
            if (line.trim() === '') {
                i++;
                continue;
            }

            // Paragraph (collect contiguous non-empty lines)
            const paraLines = [];
            while (i < lines.length && lines[i].trim() !== '' &&
                   !/^#{1,6}\s/.test(lines[i]) &&
                   !/^```/.test(lines[i]) &&
                   !/^>\s?/.test(lines[i]) &&
                   !/^\|/.test(lines[i]) &&
                   !/^[\s]*[-*+]\s+/.test(lines[i]) &&
                   !/^[\s]*\d+\.\s+/.test(lines[i]) &&
                   !/^(\s*[-*_]\s*){3,}$/.test(lines[i])) {
                paraLines.push(lines[i]);
                i++;
            }
            if (paraLines.length > 0) {
                blocks.push({ type: 'paragraph', content: paraLines.join('\n') });
            }
        }

        return blocks;
    },

    // ─── Table parsing ────────────────────────────────────────────────────

    _parseTable(lines) {
        if (lines.length < 2) return { type: 'paragraph', content: lines.join('\n') };

        const parseRow = (line) => {
            return line
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map(cell => cell.trim());
        };

        const headers = parseRow(lines[0]);

        // Parse alignment from separator row
        const separators = parseRow(lines[1]);
        const aligns = separators.map(sep => {
            const s = sep.trim();
            if (s.startsWith(':') && s.endsWith(':')) return 'center';
            if (s.endsWith(':')) return 'right';
            return 'left';
        });

        const rows = [];
        for (let i = 2; i < lines.length; i++) {
            rows.push(parseRow(lines[i]));
        }

        return { type: 'table', headers, aligns, rows };
    },

    // ─── Block rendering ──────────────────────────────────────────────────

    _renderBlock(block) {
        switch (block.type) {
            case 'heading':
                return `<h${block.level}>${this._renderInline(block.content)}</h${block.level}>`;

            case 'paragraph':
                return `<p>${this._renderInline(block.content)}</p>`;

            case 'code_block': {
                const escaped = this._escape(block.content);
                const langAttr = block.lang ? ` data-lang="${this._escape(block.lang)}"` : '';
                return `<pre><code${langAttr}>${escaped}</code></pre>`;
            }

            case 'blockquote':
                // Recursively parse blockquote content
                return `<blockquote>${this.parse(block.content)}</blockquote>`;

            case 'ul':
                return '<ul>' + block.items.map(item =>
                    `<li>${this._renderInline(item)}</li>`
                ).join('') + '</ul>';

            case 'ol':
                return '<ol>' + block.items.map(item =>
                    `<li>${this._renderInline(item)}</li>`
                ).join('') + '</ol>';

            case 'hr':
                return '<hr>';

            case 'table':
                return this._renderTable(block);

            default:
                return `<p>${this._escape(block.content || '')}</p>`;
        }
    },

    // ─── Table rendering ──────────────────────────────────────────────────

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
                const cell = (i < row.length) ? row[i] : '';
                html += `<td style="text-align:${align}">${this._renderInline(cell)}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    },

    // ─── Inline parsing ───────────────────────────────────────────────────

    _renderInline(text) {
        if (!text) return '';

        let result = '';
        let i = 0;

        while (i < text.length) {
            // Inline code: `code`
            if (text[i] === '`') {
                const end = text.indexOf('`', i + 1);
                if (end > i) {
                    result += '<code>' + this._escape(text.slice(i + 1, end)) + '</code>';
                    i = end + 1;
                    continue;
                }
            }

            // Link: [text](url)
            if (text[i] === '[') {
                const closeBracket = text.indexOf(']', i + 1);
                if (closeBracket > i && text[closeBracket + 1] === '(') {
                    const closeParen = text.indexOf(')', closeBracket + 2);
                    if (closeParen > closeBracket) {
                        const linkText = text.slice(i + 1, closeBracket);
                        const linkUrl  = text.slice(closeBracket + 2, closeParen);
                        // Render as a link that opens in new tab with noopener
                        const safeUrl = this._sanitizeUrl(linkUrl);
                        if (safeUrl) {
                            result += `<a href="${this._escape(safeUrl)}" target="_blank" rel="noopener noreferrer">${this._renderInline(linkText)}</a>`;
                        } else {
                            // Unsafe URL — render as plain text
                            result += this._escape(linkText) + ' (' + this._escape(linkUrl) + ')';
                        }
                        i = closeParen + 1;
                        continue;
                    }
                }
            }

            // Image: ![alt](url) — render as text description only
            if (text[i] === '!' && text[i + 1] === '[') {
                const closeBracket = text.indexOf(']', i + 2);
                if (closeBracket > i && text[closeBracket + 1] === '(') {
                    const closeParen = text.indexOf(')', closeBracket + 2);
                    if (closeParen > closeBracket) {
                        const altText = text.slice(i + 2, closeBracket);
                        result += '<em>[image: ' + this._escape(altText) + ']</em>';
                        i = closeParen + 1;
                        continue;
                    }
                }
            }

            // Bold+Italic: ***text***
            if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '*') {
                const end = text.indexOf('***', i + 3);
                if (end > i) {
                    result += '<strong><em>' + this._renderInline(text.slice(i + 3, end)) + '</em></strong>';
                    i = end + 3;
                    continue;
                }
            }

            // Bold: **text**
            if (text[i] === '*' && text[i + 1] === '*') {
                const end = text.indexOf('**', i + 2);
                if (end > i) {
                    result += '<strong>' + this._renderInline(text.slice(i + 2, end)) + '</strong>';
                    i = end + 2;
                    continue;
                }
            }

            // Italic: *text*  (single *, not preceded by another *)
            if (text[i] === '*' && text[i + 1] !== '*') {
                const end = text.indexOf('*', i + 1);
                if (end > i && text[end + 1] !== '*') {
                    result += '<em>' + this._renderInline(text.slice(i + 1, end)) + '</em>';
                    i = end + 1;
                    continue;
                }
            }

            // Underscore bold: __text__
            if (text[i] === '_' && text[i + 1] === '_') {
                const end = text.indexOf('__', i + 2);
                if (end > i) {
                    result += '<strong>' + this._renderInline(text.slice(i + 2, end)) + '</strong>';
                    i = end + 2;
                    continue;
                }
            }

            // Underscore italic: _text_
            if (text[i] === '_' && text[i + 1] !== '_') {
                const end = text.indexOf('_', i + 1);
                if (end > i && text[end + 1] !== '_') {
                    result += '<em>' + this._renderInline(text.slice(i + 1, end)) + '</em>';
                    i = end + 1;
                    continue;
                }
            }

            // Strikethrough: ~~text~~
            if (text[i] === '~' && text[i + 1] === '~') {
                const end = text.indexOf('~~', i + 2);
                if (end > i) {
                    result += '<del>' + this._renderInline(text.slice(i + 2, end)) + '</del>';
                    i = end + 2;
                    continue;
                }
            }

            // Line break: two trailing spaces or \n
            if (text[i] === '\n') {
                result += '<br>';
                i++;
                continue;
            }

            // Default: escape and append
            result += this._escape(text[i]);
            i++;
        }

        return result;
    },

    // ─── URL sanitization ─────────────────────────────────────────────────

    /**
     * Only allow http, https, and mailto URLs. Block javascript:, data:, etc.
     * @param {string} url
     * @returns {string|null} Sanitized URL or null if unsafe
     */
    _sanitizeUrl(url) {
        const trimmed = url.trim();
        // Relative URLs are OK
        if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
            return trimmed;
        }
        // Allow http, https, mailto
        if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
            return trimmed;
        }
        // Block everything else (javascript:, data:, vbscript:, etc.)
        return null;
    }
};
