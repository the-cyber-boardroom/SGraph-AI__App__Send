/* =============================================================================
   SGraph Workspace — JS Executor
   v0.1.0 — Sandboxed JavaScript execution against HTML

   Executes user-provided JavaScript against source HTML in a sandboxed iframe.
   The iframe uses sandbox="allow-scripts" (no allow-same-origin) so the
   script cannot access the parent's DOM, localStorage, or cookies.

   Communication is via postMessage only.

   Usage:
     const result = await window.sgraphWorkspace.executeJS(sourceHtml, userScript);
     // result = { data: '...', resultType: 'html'|'json', error: null }
   ============================================================================= */

(function() {
    'use strict';

    const DEFAULT_TIMEOUT = 10000;

    /**
     * Execute JavaScript against HTML source in a sandboxed iframe.
     *
     * The user script has access to `document` (the parsed source HTML DOM).
     * It can either:
     *   - Modify the DOM in place (return nothing) → result is document.documentElement.outerHTML
     *   - Return a value (string, object, array) → result is that value (stringified if needed)
     *
     * @param {string} sourceHtml  - The HTML to load into the iframe
     * @param {string} userScript  - The JavaScript to execute
     * @param {number} [timeoutMs] - Timeout in ms (default 10000)
     * @returns {Promise<{data: string, resultType: string, error: string|null}>}
     */
    function executeJS(sourceHtml, userScript, timeoutMs) {
        const timeout = timeoutMs || DEFAULT_TIMEOUT;

        return new Promise((resolve) => {
            let iframe  = null;
            let blobUrl = null;
            let timer   = null;
            let settled = false;

            function cleanup() {
                if (timer) clearTimeout(timer);
                if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                window.removeEventListener('message', onMessage);
            }

            function settle(result) {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            }

            function onMessage(e) {
                // Only accept messages from our iframe
                if (!iframe || !iframe.contentWindow) return;
                // In sandbox="allow-scripts" (no same-origin), e.source may not match
                // so we check by message type instead
                const msg = e.data;
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'js-exec-result') {
                    settle({
                        data:       msg.data       || '',
                        resultType: msg.resultType || 'html',
                        error:      null,
                    });
                } else if (msg.type === 'js-exec-error') {
                    settle({
                        data:       null,
                        resultType: null,
                        error:      msg.error || 'Unknown execution error',
                    });
                }
            }

            window.addEventListener('message', onMessage);

            // Timeout
            timer = setTimeout(() => {
                settle({
                    data:       null,
                    resultType: null,
                    error:      `Execution timed out after ${timeout}ms`,
                });
            }, timeout);

            // Build the iframe document
            // We inject the source HTML body content and wrap the user script
            const iframeDoc = buildIframeDocument(sourceHtml, userScript);

            // Create blob URL
            const blob = new Blob([iframeDoc], { type: 'text/html' });
            blobUrl = URL.createObjectURL(blob);

            // Create hidden iframe
            iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none;';
            iframe.sandbox = 'allow-scripts';
            iframe.src = blobUrl;

            document.body.appendChild(iframe);
        });
    }

    /**
     * Build the HTML document to load into the iframe.
     * The user script runs after the DOM is ready.
     */
    function buildIframeDocument(sourceHtml, userScript) {
        // Escape closing script tags in user code to prevent breaking out
        const safeScript = userScript.replace(/<\/script>/gi, '<\\/script>');

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
${sourceHtml}
<script>
(function() {
    try {
        var __result = (function() { ${safeScript} })();

        if (__result !== undefined && __result !== null) {
            var data, resultType;
            if (typeof __result === 'string') {
                data = __result;
                resultType = __result.trim().charAt(0) === '<' ? 'html' : 'text';
            } else {
                data = JSON.stringify(__result, null, 2);
                resultType = 'json';
            }
            parent.postMessage({ type: 'js-exec-result', data: data, resultType: resultType }, '*');
        } else {
            parent.postMessage({
                type: 'js-exec-result',
                data: document.documentElement.outerHTML,
                resultType: 'html'
            }, '*');
        }
    } catch (e) {
        parent.postMessage({ type: 'js-exec-error', error: e.message, stack: (e.stack || '') }, '*');
    }
})();
<\/script>
</body>
</html>`;
    }

    // Register on global namespace
    window.sgraphWorkspace = window.sgraphWorkspace || {};
    window.sgraphWorkspace.executeJS = executeJS;

})();
