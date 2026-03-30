/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — v0.3.1 surgical overlay for markdown-parser.js

   Fixes:
     BRW-007: Images render as <img> tags (not "[image: alt]" placeholder text)
     BRW-008: Relative file links (bare filenames) are allowed by URL sanitizer
     BRW-018: Discourse-style image dimensions in alt text
              ![alt|400](img.png)     → width: 400px
              ![alt|50%](img.png)     → width: 50%
              ![alt|400x300](img.png) → width: 400px; height: 300px
              ![alt](img.png)         → unchanged (max-width: 100%)
              Degrades gracefully in other parsers — image still renders,
              alt text shows "alt|400x300" (slightly verbose, not broken).
   ═══════════════════════════════════════════════════════════════════════════════ */


// ─── BRW-007: Render images as <img> tags ────────────────────────────────────
//
// v0.3.0: ![alt](url) rendered as <em>[image: alt]</em> — a security decision
// to block arbitrary image loading. But for the browse view, images are resolved
// from the zip by send-browse-v031.js (BRW-005), so external URLs are never
// loaded. The <img> tag is safe because the src gets replaced with a blob URL.
//
// v0.3.1: Render as <img> with the original src. External images are blocked
// by the browser's CSP in production; in the browse view, BRW-005 replaces
// relative src attributes with blob URLs from the zip before they load.

// ─── BRW-008: Allow bare filename links ──────────────────────────────────────
//
// v0.3.0: _sanitizeUrl() rejects bare filenames like "file.png" or
// "folder/doc.md" — only allows /, #, ./, ../, http, https, mailto prefixes.
// This means markdown links like [text](file.md) render as plain text.
//
// v0.3.1: Allow any URL that looks like a relative file path (no protocol,
// no javascript:, no data:). The browse view's link interceptor (BRW-004)
// handles these by opening the matching zip entry as a tab.


(function() {
    // Save reference to original _renderInline
    var originalRenderInline = MarkdownParser._renderInline.bind(MarkdownParser);
    var originalSanitizeUrl  = MarkdownParser._sanitizeUrl.bind(MarkdownParser);
    var escapeHtml           = MarkdownParser._escape.bind(MarkdownParser);

    // Override _sanitizeUrl to allow relative file paths
    MarkdownParser._sanitizeUrl = function(url) {
        var trimmed = url.trim();

        // Block dangerous protocols
        var lower = trimmed.toLowerCase();
        if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
            return null;
        }

        // Allow everything the original allows
        var original = originalSanitizeUrl(trimmed);
        if (original) return original;

        // NEW: Allow bare relative paths (filenames, folder/file paths)
        // These are safe because the browse view intercepts clicks (BRW-004)
        if (/^[a-zA-Z0-9_\-\/\.\(\)\[\] %]+$/.test(trimmed)) {
            return trimmed;
        }

        return null;
    };

    // Override _renderInline to render images as <img> instead of [image: ...]
    var origRenderInline = MarkdownParser._renderInline;
    MarkdownParser._renderInline = function(text) {
        if (!text) return '';
        var result = '';
        var i = 0;

        while (i < text.length) {
            // Image: ![alt](url) — render as <img> tag
            if (text[i] === '!' && text[i + 1] === '[') {
                var cb = text.indexOf(']', i + 2);
                if (cb > i && text[cb + 1] === '(') {
                    var cp = text.indexOf(')', cb + 2);
                    if (cp > cb) {
                        var altText = text.slice(i + 2, cb);
                        var imgUrl  = text.slice(cb + 2, cp);
                        var safeUrl = this._sanitizeUrl(imgUrl);
                        if (safeUrl) {
                            // BRW-018: Discourse-style dimensions in alt text
                            // Split on first pipe: "caption|400x300" → alt="caption", size spec
                            var pipeIdx    = altText.indexOf('|');
                            var displayAlt = pipeIdx === -1 ? altText : altText.slice(0, pipeIdx);
                            var imgStyle   = 'max-width: 100%; border-radius: 6px; margin: 0.5em 0;';
                            if (pipeIdx !== -1) {
                                var dim      = altText.slice(pipeIdx + 1).trim();
                                var pctMatch = dim.match(/^(\d+)%$/);
                                var pxhMatch = dim.match(/^(\d+)x(\d+)$/);
                                var wMatch   = dim.match(/^(\d+)$/);
                                if (pctMatch)
                                    imgStyle = 'width:' + pctMatch[1] + '%; border-radius: 6px; margin: 0.5em 0;';
                                else if (pxhMatch)
                                    imgStyle = 'width:' + pxhMatch[1] + 'px; height:' + pxhMatch[2] + 'px; border-radius: 6px; margin: 0.5em 0;';
                                else if (wMatch)
                                    imgStyle = 'width:' + wMatch[1] + 'px; border-radius: 6px; margin: 0.5em 0;';
                                // unrecognised dim spec → fall back to default style, use full altText as alt
                                else displayAlt = altText;
                            }
                            result += '<img src="' + escapeHtml(safeUrl) + '" alt="' + escapeHtml(displayAlt) + '" style="' + imgStyle + '">';
                        } else {
                            result += '<em>[image: ' + escapeHtml(altText) + ']</em>';
                        }
                        i = cp + 1;
                        continue;
                    }
                }
            }

            // For everything else, delegate to the original character-by-character parser
            // We need to extract one "token" at a time and let original handle it
            // Simplest: find the next `!` and process the chunk before it with original
            var nextImg = text.indexOf('![', i + 1);
            if (nextImg === -1) nextImg = text.length;

            // Process the non-image chunk with original _renderInline
            if (nextImg > i) {
                result += origRenderInline.call(this, text.slice(i, nextImg));
                i = nextImg;
            } else {
                result += escapeHtml(text[i]);
                i++;
            }
        }

        return result;
    };
})();
