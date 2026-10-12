/* ═══════════════════════════════════════════════════════════════════════════════
   send-browse — tree navigation, iframe preview + tab-bar CSS (DOM)
   Extracted from send-browse--v0.3.3.js (2026-08-03) with NO behaviour change: the
   bodies below are byte-identical to the region they came from.

   Why the split: the original was 1841 lines mixing a UI component with parsers, path
   maths and DOM helpers. The base64 chunk bug (chunk=8192) survived in there for months
   precisely because none of it could be reached by a unit test. These files are plain
   globals loaded before the component — same no-build, load-order contract as the rest
   of the tree — so extracting them costs nothing at runtime and makes them testable.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── BRW-014: Navigate to folder ─────────────────────────────────────────────
function _navigateToFolder(browseInstance, fileList, folderPath) {
    try { folderPath = decodeURIComponent(folderPath); } catch (_) {}

    var folderFiles = fileList.filter(function(e) {
        return !e.dir && e.path.startsWith(folderPath + '/');
    });
    if (folderFiles.length === 0) {
        folderFiles = fileList.filter(function(e) {
            return !e.dir && e.path.includes('/' + folderPath + '/');
        });
    }
    if (folderFiles.length === 0) return;

    // Expand parent folders in the tree
    var treeRoot = browseInstance.querySelector('.sb-tree__controls');
    if (treeRoot) treeRoot = treeRoot.parentElement;
    if (treeRoot) {
        var parts = folderPath.split('/');
        var pathSoFar = '';
        for (var i = 0; i < parts.length; i++) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
            var folderEl = treeRoot.querySelector('.sb-tree__folder[data-path="' + pathSoFar + '"]');
            if (!folderEl) {
                var allFolders = treeRoot.querySelectorAll('.sb-tree__folder');
                for (var f = 0; f < allFolders.length; f++) {
                    var dp = allFolders[f].getAttribute('data-path') || '';
                    if (dp === pathSoFar || dp.endsWith('/' + pathSoFar)) { folderEl = allFolders[f]; break; }
                }
            }
            if (folderEl) {
                var content = folderEl.querySelector('.sb-tree__folder-content');
                var toggle  = folderEl.querySelector('.sb-tree__toggle');
                if (content && content.style.display === 'none') {
                    content.style.display = '';
                    if (toggle) toggle.textContent = '\u25BE';
                }
            }
        }
        // Scroll deepest folder into view
        var deepest = treeRoot.querySelector('.sb-tree__folder[data-path="' + folderPath + '"]');
        if (deepest) deepest.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    folderFiles.sort(function(a, b) {
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });
    browseInstance._openFileTab(folderFiles[0].path);
}

// ─── BRW-017: Reveal file in tree ────────────────────────────────────────────
function _revealInTree(browseInstance, filePath) {
    var treeRoot = browseInstance.querySelector('.sb-tree__controls');
    if (treeRoot) treeRoot = treeRoot.parentElement;
    if (!treeRoot) return;

    // Expand parent folders
    var parts = filePath.split('/');
    var pathSoFar = '';
    for (var i = 0; i < parts.length - 1; i++) {
        pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
        var folderEl = treeRoot.querySelector('.sb-tree__folder[data-path="' + pathSoFar + '"]');
        if (folderEl) {
            var content = folderEl.querySelector('.sb-tree__folder-content');
            var toggle  = folderEl.querySelector('.sb-tree__toggle');
            if (content && content.style.display === 'none') {
                content.style.display = '';
                if (toggle) toggle.textContent = '\u25BE';
            }
        }
    }

    // Find and highlight the file
    var fileEl = treeRoot.querySelector('.sb-tree__file[data-path="' + filePath + '"]');
    if (fileEl) {
        treeRoot.querySelectorAll('.sb-tree__file').forEach(function(f) { f.classList.remove('sb-tree__file--active'); });
        fileEl.classList.add('sb-tree__file--active');
        fileEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// ─── Top-level live-preview entry point used by vault-browse-edit ───────────────
// vault-browse-edit checks `typeof _loadHtmlIntoIframe === 'function'` to decide
// whether to use the rich VFS-aware re-render or fall back to a bare blob. We
// delegate to the per-iframe `__sgReloadHtml` closure stashed during the initial
// render — that closure carries all the closure state (vfsBridgeScript, htmlDir,
// fileList, dataSource) needed to inline assets and re-inject the bridge without
// disturbing the parent-side message listener.
function _loadHtmlIntoIframe(iframe, htmlText, fileName, dataSource, objectUrls, vfsBridges) {
    if (iframe && typeof iframe.__sgReloadHtml === 'function') {
        return iframe.__sgReloadHtml(htmlText);
    }
    // Fallback if the iframe wasn't initialised by the HTML pipeline (defensive —
    // shouldn't fire in practice). No asset inlining, no VFS bridge.
    var blob = new Blob([htmlText], { type: 'text/html' });
    var url  = URL.createObjectURL(blob);
    if (objectUrls) objectUrls.push(url);
    if (iframe) iframe.src = url;
}

// ─── BRW-018: Wrapper fullscreen fallback (when requestFullscreen is unavailable) ─
// Expands the wrapper div to fill the viewport with a fixed overlay.
// Shows the presentBanner (if supplied) so the Exit button is still accessible.
function _iframeFullscreenFallback(wrapper, presentBanner) {
    var origCss = wrapper.style.cssText;
    wrapper.style.cssText =
        'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;' +
        'display:flex;flex-direction:column;overflow:hidden;';
    if (presentBanner) {
        presentBanner.style.display = 'flex';
        var exitHandler = function() {
            wrapper.style.cssText = origCss;
            presentBanner.style.display = 'none';
        };
        // Wire up the Exit button inside the banner
        var exitBtn = presentBanner.querySelector('button');
        if (exitBtn) exitBtn.addEventListener('click', exitHandler);
    }
}

// ─── BRW-015: Inject scrollable tab bar CSS into sg-layout Shadow DOM ────────
var _tabBarCSSInjected = false;
function _injectTabBarScrollCSS(sgLayout) {
    if (_tabBarCSSInjected || !sgLayout || !sgLayout.shadowRoot) return;
    var style = document.createElement('style');
    style.textContent =
        '.sgl-tab-bar { overflow-x: auto !important; overflow-y: hidden !important; flex-wrap: nowrap !important; scrollbar-width: thin; scrollbar-color: rgba(78,205,196,0.3) transparent; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar { height: 2px; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar-track { background: transparent; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.3); border-radius: 2px; }\n' +
        '.sgl-tab { flex-shrink: 0 !important; }';
    sgLayout.shadowRoot.appendChild(style);
    _tabBarCSSInjected = true;
}
