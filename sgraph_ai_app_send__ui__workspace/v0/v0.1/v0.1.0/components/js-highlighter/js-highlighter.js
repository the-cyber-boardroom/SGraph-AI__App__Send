/* =============================================================================
   SGraph Workspace — JS Syntax Highlighter
   v0.1.0 — Lightweight regex-based tokenizer for JavaScript

   Returns HTML with <span> elements for CSS-based coloring.
   No dependencies. Used by script-editor and llm-output.
   ============================================================================= */

(function() {
    'use strict';

    const KEYWORDS = new Set([
        'const','let','var','function','return','if','else','for','while','do',
        'class','new','this','import','export','async','await','try','catch',
        'throw','switch','case','break','continue','default','typeof','instanceof',
        'in','of','delete','void','yield','from','extends','super','static',
        'get','set','with','debugger','finally',
    ]);

    const BUILTINS = new Set([
        'console','document','window','Math','JSON','Array','Object','Promise',
        'setTimeout','setInterval','fetch','null','undefined','true','false',
        'NaN','Infinity','Map','Set','WeakMap','WeakSet','Symbol','Proxy',
        'Reflect','Error','RegExp','Date','Number','String','Boolean',
        'parseInt','parseFloat','isNaN','isFinite','encodeURI','decodeURI',
        'encodeURIComponent','decodeURIComponent','require','module','exports',
    ]);

    // Order matters — longer patterns first, comments before operators
    const TOKEN_RE = new RegExp([
        '(\\/\\/[^\\n]*)',                          // line comment
        '(\\/\\*[\\s\\S]*?\\*\\/)',                  // block comment
        '(`(?:[^`\\\\]|\\\\.)*`)',                   // template literal
        '("(?:[^"\\\\]|\\\\.)*")',                   // double-quoted string
        "('(?:[^'\\\\]|\\\\.)*')",                   // single-quoted string
        '(\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)', // number
        '(=>|===|!==|==|!=|>=|<=|&&|\\|\\||\\?\\?|\\?\\.|\\.{3})', // multi-char operators
        '([{}\\[\\]();,.:!?+\\-*/%<>=&|^~@#])',     // single-char punctuation/operators
        '(\\b[a-zA-Z_$][a-zA-Z0-9_$]*\\b)',         // identifier
    ].join('|'), 'g');

    function esc(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    class JsHighlighter extends HTMLElement {

        connectedCallback() {
            // No visible rendering — this is a utility component
        }

        /**
         * Highlight JavaScript source code.
         * @param {string} code — raw JS source
         * @returns {string} HTML with <span class="jsh-*"> tokens
         */
        highlight(code) {
            return JsHighlighter.highlight(code);
        }

        /**
         * Static version — can be used without a DOM element.
         * @param {string} code
         * @returns {string} highlighted HTML
         */
        static highlight(code) {
            if (!code) return '';

            let result = '';
            let lastIndex = 0;

            TOKEN_RE.lastIndex = 0;
            let match;

            while ((match = TOKEN_RE.exec(code)) !== null) {
                // Emit any unmatched text before this token
                if (match.index > lastIndex) {
                    result += esc(code.slice(lastIndex, match.index));
                }
                lastIndex = match.index + match[0].length;

                const text = match[0];
                const escaped = esc(text);

                if (match[1] || match[2]) {
                    // Comment (line or block)
                    result += `<span class="jsh-comment">${escaped}</span>`;
                } else if (match[3] || match[4] || match[5]) {
                    // String (template, double, single)
                    result += `<span class="jsh-string">${escaped}</span>`;
                } else if (match[6]) {
                    // Number
                    result += `<span class="jsh-number">${escaped}</span>`;
                } else if (match[7]) {
                    // Multi-char operator
                    result += `<span class="jsh-operator">${escaped}</span>`;
                } else if (match[8]) {
                    // Punctuation / single-char operator
                    result += `<span class="jsh-punctuation">${escaped}</span>`;
                } else if (match[9]) {
                    // Identifier — classify as keyword, builtin, or plain
                    if (KEYWORDS.has(text)) {
                        result += `<span class="jsh-keyword">${escaped}</span>`;
                    } else if (BUILTINS.has(text)) {
                        result += `<span class="jsh-builtin">${escaped}</span>`;
                    } else {
                        result += escaped;
                    }
                } else {
                    result += escaped;
                }
            }

            // Emit any remaining text after the last match
            if (lastIndex < code.length) {
                result += esc(code.slice(lastIndex));
            }

            return result;
        }
    }

    customElements.define('js-highlighter', JsHighlighter);

    // Also expose globally for static use
    window.JsHighlighter = JsHighlighter;
})();
