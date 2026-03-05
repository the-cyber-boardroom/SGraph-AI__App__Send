/* =============================================================================
   SGraph Workspace — JS Executor
   v0.2.0 — Sandboxed JavaScript execution with console capture

   Executes user-provided JavaScript against source HTML in a sandboxed iframe.
   The iframe uses sandbox="allow-scripts" (no allow-same-origin) so the
   script cannot access the parent's DOM, localStorage, or cookies.

   Console.log/warn/error calls inside the script are intercepted and sent
   back alongside the result via postMessage.

   Usage:
     const result = await window.sgraphWorkspace.executeJS(sourceHtml, userScript);
     // result = { data, resultType, error, consoleLogs: [{level, args}] }
   ============================================================================= */

(function() {
    'use strict';

    const DEFAULT_TIMEOUT = 10000;

    function executeJS(sourceHtml, userScript, timeoutMs) {
        const timeout = timeoutMs || DEFAULT_TIMEOUT;

        return new Promise((resolve) => {
            let iframe  = null;
            let blobUrl = null;
            let timer   = null;
            let settled = false;
            const consoleLogs = [];

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
                result.consoleLogs = consoleLogs;
                resolve(result);
            }

            function onMessage(e) {
                if (!iframe || !iframe.contentWindow) return;
                const msg = e.data;
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'js-exec-console') {
                    consoleLogs.push({ level: msg.level || 'log', args: msg.args || '' });
                } else if (msg.type === 'js-exec-result') {
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

            timer = setTimeout(() => {
                settle({
                    data:       null,
                    resultType: null,
                    error:      `Execution timed out after ${timeout}ms`,
                });
            }, timeout);

            const iframeDoc = buildIframeDocument(sourceHtml, userScript);
            const blob = new Blob([iframeDoc], { type: 'text/html' });
            blobUrl = URL.createObjectURL(blob);

            iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none;';
            iframe.sandbox = 'allow-scripts';
            iframe.src = blobUrl;

            document.body.appendChild(iframe);
        });
    }

    function buildIframeDocument(sourceHtml, userScript) {
        const safeScript = userScript.replace(/<\/script>/gi, '<\\/script>');

        return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
${sourceHtml}
<script>
(function() {
    // Intercept console methods and send to parent with structured data
    var __logs = [];
    function __safeClone(val, depth) {
        if (depth > 2) return String(val);
        if (val === null || val === undefined) return val;
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
        if (Array.isArray(val)) {
            return val.slice(0, 50).map(function(v) { return __safeClone(v, depth + 1); });
        }
        if (typeof val === 'object') {
            var out = {};
            var keys = Object.keys(val).slice(0, 50);
            for (var i = 0; i < keys.length; i++) {
                try { out[keys[i]] = __safeClone(val[keys[i]], depth + 1); } catch(_) { out[keys[i]] = '[Error]'; }
            }
            return out;
        }
        return String(val);
    }
    function __capture(level, args) {
        var arr = Array.prototype.slice.call(args);
        var msg = arr.map(function(a) {
            if (typeof a === 'object' && a !== null) try { return JSON.stringify(a); } catch(_) {}
            return String(a);
        }).join(' ');
        // Send structured data for object browser (first object arg)
        var data = null;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] && typeof arr[i] === 'object') {
                try { data = __safeClone(arr[i], 0); } catch(_) {}
                break;
            }
        }
        __logs.push({ level: level, args: msg, data: data });
        parent.postMessage({ type: 'js-exec-console', level: level, args: msg, data: data }, '*');
    }
    var _origLog   = console.log;
    var _origWarn  = console.warn;
    var _origError = console.error;
    console.log   = function() { __capture('log',   arguments); _origLog.apply(console, arguments); };
    console.warn  = function() { __capture('warn',  arguments); _origWarn.apply(console, arguments); };
    console.error = function() { __capture('error', arguments); _origError.apply(console, arguments); };

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

    window.sgraphWorkspace = window.sgraphWorkspace || {};
    window.sgraphWorkspace.executeJS = executeJS;

})();
