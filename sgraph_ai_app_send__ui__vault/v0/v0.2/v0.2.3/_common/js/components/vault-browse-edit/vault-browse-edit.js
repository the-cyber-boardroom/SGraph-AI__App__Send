/* =================================================================================
   SGraph Vault -- Browse Edit Overlay
   v0.2.0 -- Adds Edit/Save/Delete buttons to send-browse file tabs for writable vaults

   Patches SendBrowse.prototype._renderFileContent to add vault write operations
   when dataSource.writable === true. Also patches the header to add an
   Upload button that creates new files in the vault.

   Loaded AFTER send-browse--v0.3.2.js. Only activates when dataSource.writable.
   ================================================================================= */

(function() {
    'use strict';

    if (typeof SendBrowse === 'undefined') return;

    // --- Helper: sniff ArrayBuffer for text vs binary ---

    function _isLikelyText(buffer) {
        if (buffer.byteLength > 2 * 1024 * 1024) return false;
        var bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096));
        for (var i = 0; i < bytes.length; i++) {
            if (bytes[i] === 0) return false;
        }
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            return true;
        } catch (_) {
            return false;
        }
    }

    // --- Patch _renderFileContent: add Edit/Save/Delete to action bar ---

    var _origRender = SendBrowse.prototype._renderFileContent;

    SendBrowse.prototype._renderFileContent = function(container, bytes, fileName, type) {
        // Upgrade unknown-extension files to 'text' when content is decodable UTF-8.
        // This makes .issues, Makefile, dotfiles, etc. render as text and be editable.
        if (type === null && _isLikelyText(bytes)) {
            type = 'text';
        }

        // Call original render first
        _origRender.call(this, container, bytes, fileName, type);

        var _ext0 = (fileName || '').split('.').pop().toLowerCase();

        // App Mode: available for all file types on all vaults (writable or not).
        // Opens the file via /en-gb/app#path in a NEW TAB.
        // Hash = file path (NOT vault key — key comes from localStorage set by /#vault-key).
        // Rendered as a real <a> link so the browser exposes Copy Link, middle-click,
        // and Ctrl+click natively. The URL is safe to navigate in the current window too
        // (app-shell re-opens the vault from localStorage then redirects to /en-gb/vault/).
        var bar = container.querySelector('.sb-file__actions');
        if (bar) {
            // Separator between send-browse's buttons (Save/Locate/Source/Print) and ours
            bar.appendChild(_makeSep());

            var path = (fileName || '').replace(/^\//, '');
            // Prefer a self-contained link that carries BOTH the vault key and the file path
            // through the root hash inbox: /#<key>|app:<path>. runRoot() (vault-loader-routing.js)
            // saves the key to localStorage, stores the app: deep-link, and redirects to
            // /en-gb/app — where app-shell opens THIS file as an app (over any default app.json).
            // Falls back to the legacy /en-gb/app#path (key taken from localStorage) when the
            // current key is unavailable. encodeURIComponent the path only; runRoot decodes once.
            var _vk = '';
            try { _vk = (globalThis.VaultLoaderStorage && VaultLoaderStorage.getCurrentKey()) || ''; } catch (_) {}
            var _appHref = _vk
                ? (window.location.origin + '/#' + _vk + '|app:' + encodeURIComponent(path))
                : (window.location.origin + '/en-gb/app#' + encodeURIComponent(path));
            var openAsAppLink = _makeAppLink('↗ Open as App', _appHref);
            _addTip(openAsAppLink, 'Open as App — right-click to Copy Link\nor Ctrl+click to open in new tab');
            bar.appendChild(openAsAppLink);

            // Ask AI — opens the native chat panel with THIS file as context. The button
            // is always rendered; the panel itself reports when no key is configured
            // (better than a mystery-missing button).
            var askBtn = _makeBtn('✨ Ask AI');
            _addTip(askBtn, 'Ask about this file using the vault\'s configured AI model');
            askBtn.addEventListener('click', function () {
                document.dispatchEvent(new CustomEvent('vault-llm-open', { bubbles: true }));
            });
            bar.appendChild(askBtn);
        }

        // Announce what is on screen so the chat panel can use it as context. Text-ish
        // content is decoded here (the bytes are already in hand); binaries announce a
        // null body so the panel can say "binary, not sent" instead of shipping noise.
        try {
            var _isText = (type === 'text' || type === 'markdown' || type === 'code' || type === 'csv' ||
                           type === 'html' || type === 'json' || _isLikelyText(bytes));
            document.dispatchEvent(new CustomEvent('vault-file-viewing', {
                bubbles: true,
                detail: {
                    path: (fileName || '').replace(/^\//, ''),
                    type: type,
                    text: _isText ? new TextDecoder('utf-8', { fatal: false }).decode(bytes) : null
                }
            }));
        } catch (_) { /* context is a nicety — never break rendering for it */ }

        // Only add edit/write controls if dataSource is writable
        if (!this.dataSource || !this.dataSource.writable) return;

        if (!bar) return;

        var self = this;
        // HTML files get their own split-view editor below; exclude from simple textarea edit.
        var isEditable = (type === 'text' || type === 'code' || type === 'markdown') && _ext0 !== 'html' && _ext0 !== 'htm';

        // --- Set as App: create / update app.json with this file as the vault entry point ---
        // Places this file in App Mode on next vault open (and updates the App Mode URL for sharing).
        var setAppBtn = _makeIconBtn('⚡', 'Set as App — make this file the vault App Mode entry (creates/updates app.json)');
        setAppBtn.addEventListener('click', function() {
            if (!self.dataSource) return;
            var fileList = self.dataSource.getFileList();
            var hasAppJson = fileList.some(function(f) {
                return f.path === 'app.json' || f.path === '/app.json';
            });
            var msg = hasAppJson
                ? 'app.json already exists. Overwrite it so "' + fileName + '" becomes the App Mode entry?'
                : 'Create app.json so "' + fileName + '" opens in App Mode automatically?';
            if (!confirm(msg)) return;

            var appJson = JSON.stringify({ entry: fileName, auto_open: true, present: true }, null, 2);
            var bytes   = new TextEncoder().encode(appJson);
            self.dataSource.saveFile('/', 'app.json', bytes.buffer)
                .then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success(
                            '"' + fileName + '" is now the App Mode entry — ' +
                            'share your vault link to open it directly in App Mode'
                        );
                    }
                })
                .catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.error('Could not save app.json: ' + err.message);
                    }
                });
        });
        bar.appendChild(setAppBtn);

        // --- Refresh button: re-fetch and re-render from vault (all file types) ---
        var refreshBtn = _makeIconBtn('↺', 'Refresh — re-fetch this file from the vault');
        refreshBtn.addEventListener('click', function() {
            if (!self.dataSource) return;
            var origOpacity = refreshBtn.style.opacity;
            refreshBtn.disabled = true;
            refreshBtn.style.opacity = '0.35';
            self.dataSource.getFileBytes(fileName).then(function(freshBytes) {
                self._renderFileContent(container, freshBytes, fileName, type);
            }).catch(function(err) {
                refreshBtn.disabled = false;
                refreshBtn.style.opacity = origOpacity || '0.75';
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Refresh failed: ' + err.message);
                }
            });
        });
        bar.appendChild(refreshBtn);

        // --- Edit / Save / Cancel buttons (text-editable files only) ---
        if (isEditable) {
            var editBtn   = _makeBtn('Edit');
            var saveBtn   = _makeBtn('Save');
            var cancelBtn = _makeBtn('Cancel');

            saveBtn.style.display   = 'none';
            saveBtn.style.color     = 'var(--accent, #4ECDC4)';
            saveBtn.style.fontWeight = '700';
            cancelBtn.style.display = 'none';

            var content   = container.querySelector('.sb-file__content');
            var textareaEl = null;
            var isEditing  = false;

            var _mdPrevTimer      = null;   // live-preview debounce handle (markdown only)
            var _mdSplitActive    = false;  // true while markdown split-view is live
            var _mdPrevObjUrls    = [];     // blob URLs created for preview images (revoked on re-render/exit)

            // Resolve img[data-md-src] in the preview pane using vault dataSource.
            // Mirrors the resolution that send-browse does for the normal rendered view.
            // currentDir is the directory prefix for the file being edited (e.g. 'wardley-maps/').
            function _resolvePrevImages(mdEl, currentDir) {
                if (!self.dataSource || !mdEl) return;
                mdEl.querySelectorAll('img[data-md-src]').forEach(function(img) {
                    var src = img.getAttribute('data-md-src');
                    if (!src) return;
                    // Build full path: absolute src is used as-is (strip leading /), relative
                    // src is resolved against the current file's directory.
                    var fullPath = src.startsWith('/') ? src.slice(1) : currentDir + src;
                    self.dataSource.getFileBytes(fullPath).then(function(imgBytes) {
                        if (!imgBytes) return;
                        var ext  = fullPath.split('.').pop().toLowerCase();
                        var mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
                                     gif:'image/gif', svg:'image/svg+xml', webp:'image/webp',
                                     bmp:'image/bmp', ico:'image/x-icon' }[ext] || 'image/png';
                        var blob = new Blob([imgBytes], { type: mime });
                        var url  = URL.createObjectURL(blob);
                        _mdPrevObjUrls.push(url);
                        img.src = url;
                    }).catch(function() { /* image not found — leave broken icon */ });
                });
            }

            function _revokePrevUrls() {
                _mdPrevObjUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (_) {} });
                _mdPrevObjUrls = [];
            }

            editBtn.addEventListener('click', function() {
                if (isEditing) return;
                isEditing = true;
                // Always decode the original bytes — never read from the rendered DOM.
                var currentText = new TextDecoder().decode(bytes);

                textareaEl = document.createElement('textarea');
                textareaEl.value = currentText;

                if (type === 'markdown' && content) {
                    // ── Markdown split view: textarea (left) + live preview (right) ──
                    _mdSplitActive = true;

                    // Current file's directory — needed to resolve relative image paths.
                    var _currentDir = fileName.includes('/')
                        ? fileName.substring(0, fileName.lastIndexOf('/') + 1) : '';

                    textareaEl.style.cssText = [
                        'flex:1','min-width:0','min-height:0','margin:0','padding:1rem','resize:none',
                        'font-family:var(--font-mono,monospace)','font-size:13px',
                        'color:var(--color-text,#e2e8f0)','line-height:1.5',
                        'background:var(--bg-primary,#0a0a18)',
                        'border:none','border-right:2px solid rgba(78,205,196,0.18)',
                        'outline:none','box-sizing:border-box','tab-size:4','overflow-y:auto'
                    ].join(';');

                    // Preview pane — right side, reuses the same CSS class as the
                    // normal rendered view so all markdown styles apply identically.
                    var prevPane = document.createElement('div');
                    prevPane.style.cssText = [
                        'flex:1','min-width:0','min-height:0','overflow-y:auto',
                        'padding:1rem 1.5rem','background:var(--bg-primary,#0a0a18)'
                    ].join(';');
                    var prevMd = document.createElement('div');
                    prevMd.className = 'sb-file__markdown';
                    // Initial render (includes front-matter badge and page-break markers)
                    if (typeof MarkdownParser !== 'undefined') {
                        prevMd.innerHTML = MarkdownParser.parse(currentText);
                    } else {
                        prevMd.textContent = currentText;
                    }
                    prevPane.appendChild(prevMd);

                    // Convert content area to flex-row split layout
                    content.style.display = 'flex';
                    content.style.flexDirection = 'row';
                    content.style.overflow = 'hidden';
                    content.innerHTML = '';   // clear old rendered view
                    content.appendChild(textareaEl);
                    content.appendChild(prevPane);

                    // Resolve images for initial render
                    _resolvePrevImages(prevMd, _currentDir);

                    // Live update (debounced 400 ms)
                    textareaEl.addEventListener('input', function() {
                        clearTimeout(_mdPrevTimer);
                        _mdPrevTimer = setTimeout(function() {
                            _revokePrevUrls();   // release old blob URLs before re-render
                            prevMd.innerHTML = typeof MarkdownParser !== 'undefined'
                                ? MarkdownParser.parse(textareaEl.value)
                                : textareaEl.value;
                            _resolvePrevImages(prevMd, _currentDir);
                        }, 400);
                    });

                } else {
                    // ── Generic text / code edit: full-width textarea ──
                    textareaEl.style.cssText = 'width:100%;height:100%;margin:0;padding:1rem;resize:none;' +
                        'font-family:var(--font-mono,monospace);font-size:13px;color:var(--color-text,#e2e8f0);' +
                        'line-height:1.5;background:var(--bg-primary,#0a0a18);border:1px solid var(--accent,#4ECDC4);' +
                        'border-radius:4px;outline:none;box-sizing:border-box;tab-size:4;flex:1;';

                    if (content) { content.style.display = 'none'; }
                    container.appendChild(textareaEl);
                }

                textareaEl.focus();
                textareaEl.selectionStart = textareaEl.selectionEnd = 0;
                textareaEl.scrollTop = 0;
                editBtn.style.display   = 'none';
                saveBtn.style.display   = '';
                cancelBtn.style.display = '';
            });

            cancelBtn.addEventListener('click', exitEdit);

            function exitEdit() {
                if (!isEditing) return;
                isEditing = false;
                clearTimeout(_mdPrevTimer);
                _mdSplitActive = false;
                _revokePrevUrls();
                if (textareaEl) { textareaEl.remove(); textareaEl = null; }
                // Re-render from original bytes — restores content and resets button state
                self._renderFileContent(container, bytes, fileName, type);
            }

            function doSave() {
                if (!textareaEl || !self.dataSource) return;
                var newText = textareaEl.value;

                // Reject malformed JSON before hitting the vault
                var ext = fileName.split('.').pop().toLowerCase();
                if (ext === 'json') {
                    try { JSON.parse(newText); }
                    catch (e) {
                        if (window.sgraphVault && window.sgraphVault.messages) {
                            window.sgraphVault.messages.error('Invalid JSON: ' + e.message);
                        }
                        return;
                    }
                }

                var newBytes = new TextEncoder().encode(newText);
                var parts = fileName.split('/');
                var fName = parts.pop();
                var folder = '/' + parts.join('/');

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                self.dataSource.saveFile(folder === '/' ? '/' : folder, fName, newBytes.buffer).then(function() {
                    // Re-render container fully with new bytes (handles markdown, code, text)
                    clearTimeout(_mdPrevTimer);
                    _mdSplitActive = false;
                    _revokePrevUrls();
                    if (textareaEl) { textareaEl.remove(); textareaEl = null; }
                    isEditing = false;
                    self._renderFileContent(container, newBytes.buffer, fileName, type);
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success('"' + fName + '" saved');
                    }
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.error('Save failed: ' + err.message);
                    }
                }).finally(function() {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                });
            }

            saveBtn.addEventListener('click', doSave);

            // --- Copy to clipboard ---
            var copyBtn = _makeIconBtn('⧉', 'Copy file content to clipboard');
            copyBtn.addEventListener('click', function() {
                var text = (isEditing && textareaEl)
                    ? textareaEl.value
                    : new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                var reset = function() {
                    setTimeout(function() { copyBtn.innerHTML = '⧉'; copyBtn.style.color = ''; copyBtn.style.opacity = '0.75'; }, 1500);
                };
                var flash = function() {
                    copyBtn.innerHTML = '✓';
                    copyBtn.style.color = 'var(--accent,#4ECDC4)';
                    copyBtn.style.opacity = '1';
                    reset();
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(flash).catch(function() {
                        _clipboardFallback(text);
                        flash();
                    });
                } else {
                    _clipboardFallback(text);
                    flash();
                }
            });

            bar.appendChild(editBtn);
            bar.appendChild(saveBtn);
            bar.appendChild(cancelBtn);
            bar.appendChild(copyBtn);
        }

        // --- HTML split-view editor: textarea on the left, the EXISTING render iframe
        //     on the right. We reuse `.sb-file__html-frame` (created by send-browse) so
        //     the preview is bit-identical to the main viewer — same iframe element,
        //     same sandbox, same background, same dimensions. No second iframe, no
        //     drift between the two views.
        if (_ext0 === 'html' || _ext0 === 'htm') {
            var htmlEditBtn   = _makeBtn('Edit');
            var htmlSaveBtn   = _makeBtn('Save');
            var htmlCancelBtn = _makeBtn('Cancel');
            htmlSaveBtn.style.display    = 'none';
            htmlSaveBtn.style.color      = 'var(--accent,#4ECDC4)';
            htmlSaveBtn.style.fontWeight = '700';
            htmlCancelBtn.style.display  = 'none';

            var _htmlTextarea            = null;
            var _htmlEdPane              = null;   // textarea pane prepended on edit, removed on exit
            var _htmlSplitHost           = null;   // the iframe's parent at edit-time (we flex-row it)
            var _htmlOrigSplitHostStyle  = null;   // original cssText of the split host
            var _htmlEdIframe            = null;   // the iframe whose height/min-height we override during edit
            var _htmlOrigIframeHeight    = null;   // original inline `height` value (restored on exit)
            var _htmlOrigIframeMinHeight = null;   // original inline `min-height` value (restored on exit)
            var _htmlPrevTimer           = null;
            var _htmlEditing             = false;

            function _cleanupBridges() {
                if (self._vfsBridges) {
                    self._vfsBridges.forEach(function(b) { window.removeEventListener('message', b); });
                    self._vfsBridges.length = 0;
                }
                if (self._objectUrls) {
                    self._objectUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch (_) {} });
                    self._objectUrls.length = 0;
                }
            }

            function _exitHtmlEdit() {
                clearTimeout(_htmlPrevTimer);
                if (_htmlEdPane) { _htmlEdPane.remove(); _htmlEdPane = null; }
                _htmlTextarea = null;
                if (_htmlSplitHost) {
                    // Restore cssText so flex-direction, display, etc. revert to whatever
                    // the split host (often `.sb-file__content`) was using before edit.
                    _htmlSplitHost.style.cssText = _htmlOrigSplitHostStyle || '';
                }
                if (_htmlEdIframe) {
                    // Restore the iframe's inline height/min-height that we overrode for
                    // flex-row layout. cssText carries the original `height:0;min-height:0`
                    // (needed by the column-flex layout the wrapper reverts to).
                    _htmlEdIframe.style.height    = _htmlOrigIframeHeight    || '';
                    _htmlEdIframe.style.minHeight = _htmlOrigIframeMinHeight || '';
                }
                _htmlSplitHost          = null;
                _htmlOrigSplitHostStyle = null;
                _htmlEdIframe           = null;
                _htmlOrigIframeHeight   = null;
                _htmlOrigIframeMinHeight = null;
                htmlEditBtn.style.display   = '';
                htmlSaveBtn.style.display   = 'none';
                htmlCancelBtn.style.display = 'none';
                _htmlEditing = false;
            }

            htmlEditBtn.addEventListener('click', function() {
                if (_htmlEditing) return;
                var content = container.querySelector('.sb-file__content');
                var iframe  = content && content.querySelector('.sb-file__html-frame');
                if (!content || !iframe) return;   // cannot edit without the live iframe
                _htmlEditing = true;

                _htmlEdPane = document.createElement('div');
                _htmlEdPane.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0;'
                    + 'border-right:1px solid rgba(78,205,196,0.2);';
                _htmlTextarea = document.createElement('textarea');
                _htmlTextarea.value = new TextDecoder().decode(bytes);
                _htmlTextarea.style.cssText = [
                    'flex:1','margin:0','padding:1rem','resize:none',
                    'font-family:var(--font-mono,monospace)','font-size:12px',
                    'color:var(--color-text,#e2e8f0)','line-height:1.5',
                    'background:var(--bg-primary,#0a0a18)','border:none','outline:none',
                    'box-sizing:border-box','tab-size:2','overflow-y:auto','min-height:0'
                ].join(';');
                _htmlEdPane.appendChild(_htmlTextarea);

                // Insert textarea pane BEFORE the iframe (which stays in place — moving an
                // iframe in the DOM forces it to reload). We insert into the iframe's actual
                // parent, not `content`, because overlays (App-Mode lift, page-layout wrapping,
                // etc.) can wrap the iframe in an intermediate element. We flex-row that host
                // so the textarea sits to the iframe's left.
                _htmlSplitHost = iframe.parentNode || content;
                _htmlOrigSplitHostStyle = _htmlSplitHost.style.cssText;
                _htmlSplitHost.style.display = 'flex';
                _htmlSplitHost.style.flexDirection = 'row';
                _htmlSplitHost.insertBefore(_htmlEdPane, iframe);
                iframe.style.flex = '1';
                iframe.style.minWidth = '0';
                // The iframe was sized for column-flex (`height:0;min-height:0` + `flex:1`
                // expanded it vertically). In a row-flex container the cross-axis is now
                // vertical, and explicit `height:0` overrides the default `align-items:stretch`
                // — collapsing the iframe to 0 px tall, hiding the live preview. Override
                // height to fill the cross-axis; restore on exit.
                _htmlEdIframe            = iframe;
                _htmlOrigIframeHeight    = iframe.style.height;
                _htmlOrigIframeMinHeight = iframe.style.minHeight;
                iframe.style.height      = '100%';
                iframe.style.minHeight   = '0';

                function _updatePv() {
                    var live = container.querySelector('.sb-file__html-frame');
                    if (!live) return;
                    // Do NOT call _cleanupBridges() here — the parent-side VFS bridge listener
                    // is keyed to this iframe element and survives a `src` reload (contentWindow
                    // is re-evaluated each message). Wiping it on every keystroke would break
                    // VFS reads/writes for the live preview.
                    if (typeof _loadHtmlIntoIframe === 'function') {
                        _loadHtmlIntoIframe(live, _htmlTextarea.value, fileName,
                            self.dataSource, self._objectUrls, self._vfsBridges);
                    } else {
                        live.src = URL.createObjectURL(new Blob([_htmlTextarea.value], { type: 'text/html' }));
                    }
                }
                _htmlTextarea.addEventListener('input', function() {
                    clearTimeout(_htmlPrevTimer);
                    _htmlPrevTimer = setTimeout(_updatePv, 600);
                });
                // No initial _updatePv call — the iframe already shows the rendered file.
                _htmlTextarea.focus();
                htmlEditBtn.style.display   = 'none';
                htmlSaveBtn.style.display   = '';
                htmlCancelBtn.style.display = '';
            });

            htmlCancelBtn.addEventListener('click', function() {
                if (!_htmlEditing) return;
                clearTimeout(_htmlPrevTimer);
                // Reload the iframe with the original bytes (in case live edits had updated it).
                var iframe = container.querySelector('.sb-file__html-frame');
                if (iframe && typeof _loadHtmlIntoIframe === 'function') {
                    _cleanupBridges();
                    _loadHtmlIntoIframe(iframe, new TextDecoder().decode(bytes), fileName,
                        self.dataSource, self._objectUrls, self._vfsBridges);
                }
                _exitHtmlEdit();
            });

            htmlSaveBtn.addEventListener('click', function() {
                if (!_htmlTextarea || !self.dataSource) return;
                var newText  = _htmlTextarea.value;
                var newBytes = new TextEncoder().encode(newText);
                var parts    = fileName.split('/');
                var fName    = parts.pop();
                var folder   = parts.length ? '/' + parts.join('/') : '/';
                htmlSaveBtn.disabled    = true;
                htmlSaveBtn.textContent = 'Saving...';
                self.dataSource.saveFile(folder, fName, newBytes.buffer).then(function() {
                    clearTimeout(_htmlPrevTimer);
                    _cleanupBridges();
                    // Full re-render rebuilds toolbar + iframe with persisted bytes.
                    self._renderFileContent(container, newBytes.buffer, fileName, type);
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success('"' + fName + '" saved');
                    }
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.error('Save failed: ' + err.message);
                    }
                    htmlSaveBtn.disabled    = false;
                    htmlSaveBtn.textContent = 'Save';
                });
            });

            bar.appendChild(htmlEditBtn);
            bar.appendChild(htmlSaveBtn);
            bar.appendChild(htmlCancelBtn);
        }

        // --- Full Screen button (HTML only) ---
        // App Mode is added unconditionally earlier in this function (covers writable
        // and read-only vaults); do not re-add it here.
        if (_ext0 === 'html' || _ext0 === 'htm') {
            var presentBtn = _makeBtn('\u26f6 Full Screen');
            presentBtn.title = 'Open in full screen — press Esc to exit';
            presentBtn.style.fontWeight = '600';
            presentBtn.addEventListener('click', function() {
                var iframe = container.querySelector('.sb-file__html-frame');
                var el = iframe || container;
                var req = el.requestFullscreen || el.webkitRequestFullscreen ||
                          el.mozRequestFullScreen || el.msRequestFullscreen;
                if (req) req.call(el);
            });
            bar.appendChild(presentBtn);
        }

        // --- SGit Data button: shows vault blob metadata for the current file view ---
        bar.appendChild(_makeSep());
        var sgitDataBtn = _makeIconBtn('⎇', 'SGit Data — vault object metadata for this file version');
        sgitDataBtn.addEventListener('click', function() {
            var vault = self.dataSource && self.dataSource._vault;
            var normPath = (fileName || '').replace(/^\//, '');
            var parts    = normPath.split('/');
            var fName    = parts.pop();
            var folder   = parts.length ? '/' + parts.join('/') : '/';
            var entry    = null;
            if (vault) {
                var node = vault._findNode(folder);
                if (node && node.children) entry = node.children[fName] || null;
            }
            var lines = [
                'File:          ' + normPath,
                'Folder:        ' + folder,
                '',
                'blob_id:       ' + (entry ? entry.blob_id || '—' : '(not found in tree)'),
                'content_hash:  ' + (entry ? (entry.content_hash || '—') : '—'),
                'stored_size:   ' + (entry ? (entry.size || 0) + ' B' : '—'),
                '',
                'Working HEAD:  ' + (vault ? (vault._headCommitId || '—') : '—'),
                'Named HEAD:    ' + (vault ? (vault._namedHeadId  || '—') : '—'),
                'vault_id:      ' + (vault ? (vault._vaultId      || '—') : '—'),
            ];
            _showTextOverlay('SGit Data — ' + fName, lines.join('\n'));
        });
        bar.appendChild(sgitDataBtn);

        // --- Rename button (all file types) ---
        bar.appendChild(_makeSep());
        var renameBtn = _makeIconBtn('✏', 'Rename this file');
        renameBtn.addEventListener('click', function() {
            var fName = fileName.split('/').pop();
            var parts = fileName.split('/');
            parts.pop();
            var folder = '/' + parts.join('/');
            _prompt('Rename to:', function(newName) {
                if (!newName || !newName.trim() || newName.trim() === fName) return;
                self.dataSource.renameFile(folder === '/' ? '/' : folder, fName, newName.trim()).then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success('"' + fName + '" renamed to "' + newName.trim() + '"');
                    }
                    _refreshBrowseTree(self);
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.error('Rename failed: ' + err.message);
                    }
                });
            }, { defaultValue: fName, okLabel: 'Rename' });
        });
        bar.appendChild(renameBtn);

        // --- Delete button (all file types) ---
        var deleteBtn = _makeIconBtn('🗑', 'Delete this file');
        deleteBtn.addEventListener('mouseenter', function() { deleteBtn.style.opacity = '1'; deleteBtn.style.color = '#ff6b6b'; });
        deleteBtn.addEventListener('mouseleave', function() { deleteBtn.style.opacity = '0.75'; deleteBtn.style.color = ''; });
        deleteBtn.addEventListener('click', function() {
            var fName = fileName.split('/').pop();
            var parts = fileName.split('/');
            parts.pop();
            var folder = '/' + parts.join('/');

            _confirm('Delete "' + fName + '"?', function() {
                self.dataSource.deleteFile(folder === '/' ? '/' : folder, fName).then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success('"' + fName + '" deleted');
                    }
                    _refreshBrowseTree(self);
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.error('Delete failed: ' + err.message);
                    }
                });
            });
        });
        bar.appendChild(deleteBtn);

        // --- View Source button (unrecognised file types only) ---
        // send-browse already renders a native source toggle (.sb-file__view-source)
        // for csv/html/markdown — don't add a second one for those types.
        if (!isEditable && type !== 'image' && type !== 'pdf' && !bar.querySelector('.sb-file__view-source')) {
            var sourceBtn = _makeBtn('View Source');
            var sourceShowing = false;
            var sourceEl = null;
            sourceBtn.addEventListener('click', function() {
                var content = container.querySelector('.sb-file__content');
                if (!content) return;
                if (sourceShowing) {
                    if (sourceEl) { sourceEl.remove(); sourceEl = null; }
                    content.style.display = '';
                    sourceBtn.textContent = 'View Source';
                    sourceShowing = false;
                    return;
                }
                var text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                sourceEl = document.createElement('pre');
                sourceEl.style.cssText = 'margin:0;padding:1rem;overflow:auto;flex:1;font-family:var(--font-mono,monospace);' +
                    'font-size:12px;line-height:1.5;color:var(--color-text,#e2e8f0);white-space:pre-wrap;word-break:break-all;';
                sourceEl.textContent = text;
                content.style.display = 'none';
                container.appendChild(sourceEl);
                sourceBtn.textContent = 'Hide Source';
                sourceShowing = true;
            });
            bar.appendChild(sourceBtn);
        }

        // --- Conflict resolution: "Resolve Conflict" button ---
        // Shows on the _conflict copy and on the original file when a conflict copy exists.
        if (self.dataSource && typeof self.dataSource.getFileList === 'function') {
            var _normPath       = (fileName || '').replace(/^\//, '');
            var _conflictBtnEl  = null;

            if (_isConflictFile(_normPath)) {
                // Opened file IS the conflict copy — resolve from here
                var _origNorm = _originalFromConflict(_normPath);
                _conflictBtnEl = _makeBtn('\u26a1 Resolve Conflict');
                _conflictBtnEl.style.color = '#ff9f43';
                _conflictBtnEl.style.fontWeight = '700';
                _conflictBtnEl.addEventListener('click', function() {
                    var fl2 = self.dataSource.getFileList();
                    var origEntry = fl2.find(function(e) {
                        return (e.path || '').replace(/^\//, '') === _origNorm;
                    });
                    var origPromise = origEntry
                        ? self.dataSource.getFileBytes(origEntry.path)
                        : Promise.resolve(new ArrayBuffer(0));
                    origPromise.then(function(origBytes) {
                        VaultDiffView.open(self, _origNorm, _normPath, origBytes, bytes);
                    });
                });
            } else {
                // Opened file is the original — check if a conflict copy exists
                var _conflictNorm  = _conflictFromOriginal(_normPath);
                var _conflictEntry = self.dataSource.getFileList().find(function(e) {
                    return (e.path || '').replace(/^\//, '') === _conflictNorm;
                });
                if (_conflictEntry) {
                    _conflictBtnEl = _makeBtn('\u26a1 Resolve Conflict');
                    _conflictBtnEl.style.color = '#ff9f43';
                    _conflictBtnEl.style.fontWeight = '700';
                    _conflictBtnEl.addEventListener('click', function() {
                        self.dataSource.getFileBytes(_conflictEntry.path).then(function(conflictBytes) {
                            VaultDiffView.open(self, _normPath, _conflictNorm, bytes, conflictBytes);
                        });
                    });
                }
            }

            if (_conflictBtnEl) bar.prepend(_conflictBtnEl);
        }
    };

    // --- Patch _openFolderPage: App Mode support for _page.json tabs ---
    // _page.json renders into sg-layout's shadow DOM (not via _renderFileContent), so
    // the generic App Mode button / frame-lift can't find it via document.querySelector.
    // This patch:
    //   1. Intercepts addTabToStack to capture the new panel ID.
    //   2. After one rAF (original's rAF sets el.style.cssText; ours runs next in same
    //      frame and overwrites with lift styles), gets the panel element.
    //   3. Dispatches sg-page-layout-ready so _waitForIframeAndLift can lift it.
    //   4. Adds an App Mode button to the page layout action bar once it appears.

    if (typeof SendBrowse.prototype._openFolderPage === 'function') {
        var _origOpenFolderPage = SendBrowse.prototype._openFolderPage;

        SendBrowse.prototype._openFolderPage = async function(folderPath, pageJsonPath) {
            var sgLayout = this._sgLayout;
            var capturedId = null;

            if (sgLayout && typeof sgLayout.addTabToStack === 'function') {
                var _origAddTab = sgLayout.addTabToStack;
                sgLayout.addTabToStack = function() {
                    var id = _origAddTab.apply(this, arguments);
                    capturedId = id;
                    sgLayout.addTabToStack = _origAddTab;
                    return id;
                };
            }

            await _origOpenFolderPage.call(this, folderPath, pageJsonPath);

            if (!capturedId || !sgLayout) return;

            // One rAF so the original's rAF (which sets el.style.cssText) runs first.
            // Then watch for .plr-content-frame to appear and walk up to its direct
            // child-of-el parent (= renderedView). This is the inner content without
            // the .plr-source-bar action buttons, which is what App Mode should lift.
            requestAnimationFrame(function() {
                var el = sgLayout.getPanelElement(capturedId);
                if (!el) return;

                var observer = new MutationObserver(function() {
                    var frame = el.querySelector('.plr-content-frame');
                    if (!frame) return;

                    // Traverse up to the direct child of el (= renderedView).
                    var renderedView = frame;
                    while (renderedView.parentElement && renderedView.parentElement !== el) {
                        renderedView = renderedView.parentElement;
                    }
                    if (renderedView.parentElement !== el) return;

                    observer.disconnect();

                    // Signal sg-app-banner with the inner content element (no action bar).
                    window.dispatchEvent(new CustomEvent('sg-page-layout-ready', {
                        detail: { el: renderedView }
                    }));

                    // Add App Mode button to the page-layout action bar.
                    var bar = el.querySelector('.plr-source-bar');
                    if (bar && !bar.dataset.sgAppModeBtn) {
                        bar.dataset.sgAppModeBtn = '1';
                        var pagePath = (folderPath || '').replace(/^\//, '');
                        // Self-contained link via the root inbox (/#key|app:path); see the file-tab
                        // link above. Falls back to legacy /en-gb/app#path when no current key.
                        var _pvk = '';
                        try { _pvk = (globalThis.VaultLoaderStorage && VaultLoaderStorage.getCurrentKey()) || ''; } catch (_) {}
                        var _pageHref = _pvk
                            ? (window.location.origin + '/#' + _pvk + '|app:' + encodeURIComponent(pagePath))
                            : (window.location.origin + '/en-gb/app#' + encodeURIComponent(pagePath));
                        var btn = _makeAppLink('↗ Open as App', _pageHref);
                        _addTip(btn, 'Open as App — right-click to Copy Link\nor Ctrl+click to open in new tab');
                        bar.appendChild(btn);
                    }
                });
                observer.observe(el, { childList: true, subtree: true });
                setTimeout(function() { observer.disconnect(); }, 5000);
            });
        };
    }

    // --- Patch tree controls: add New file / New folder / Upload (writable vaults) ---
    // The send-browse action-bar row is hidden in the vault (vault-shell CSS), so the
    // file-create actions live with the folder tree instead. send-browse builds
    // .sb-tree__controls (the +/− expand-collapse row) inside _populateTree, which also
    // re-runs on every tree refresh — so we inject here to survive refreshes.

    var _origPopulateTree = SendBrowse.prototype._populateTree;

    SendBrowse.prototype._populateTree = function() {
        _origPopulateTree.call(this);

        if (!this.dataSource || !this.dataSource.writable) return;
        var controls = this.querySelector('.sb-tree__controls');
        if (!controls || controls.querySelector('.sb-tree-create-btn')) return;

        var self = this;
        var spacer = document.createElement('span');
        spacer.style.cssText = 'flex:1;';
        controls.appendChild(spacer);

        function _treeBtn(icon, titleText, onClick) {
            var b = document.createElement('button');
            b.className = 'sb-tree__ctrl-btn sb-tree-create-btn';
            b.innerHTML = icon;
            b.title = titleText;
            b.addEventListener('click', function(e) { e.stopPropagation(); onClick(); });
            return b;
        }

        controls.appendChild(_treeBtn('&#128196;', 'New file',     function() { _showNewFile(self); }));
        controls.appendChild(_treeBtn('&#128193;', 'New folder',   function() { _showNewFolder(self); }));
        controls.appendChild(_treeBtn('&#8683;',   'Upload files', function() { _showUploadPicker(self); }));
        // Add link (sub-vaults + external resources) — only when the convention reader is loaded.
        // Creates a *.link.json that the composite renders inline.
        if (typeof VaultLinks !== 'undefined') {
            controls.appendChild(_treeBtn('&#128279;', 'Add link (another vault, or an external resource)', function() { _showAddLink(self); }));
        }
    };

    // --- Upload file picker ---

    function _showUploadPicker(browse) {
        var input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.addEventListener('change', function() {
            if (!input.files || !input.files.length) return;
            _uploadFiles(browse, input.files);
        });
        input.click();
    }

    async function _uploadFiles(browse, files) {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            try {
                var buffer = await file.arrayBuffer();
                await browse.dataSource.saveFile('/', file.name, buffer);
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('Uploaded "' + file.name + '"');
                }
            } catch (err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Upload failed: ' + err.message);
                }
            }
        }
        // Refresh tree
        _refreshBrowseTree(browse);
    }

    // --- New folder ---

    function _showNewFolder(browse) {
        _prompt('New folder name:', function(name) {
            if (!name || !name.trim()) return;
            browse.dataSource.createFolder('/' + name.trim()).then(function() {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('Folder "' + name.trim() + '" created');
                }
                _refreshBrowseTree(browse);
            }).catch(function(err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Create folder failed: ' + err.message);
                }
            });
        });
    }

    // --- New file ---

    function _showNewFile(browse) {
        _prompt('New file name:', function(name) {
            if (!name || !name.trim()) return;
            var trimmed = name.trim();
            // Sensible default content per extension
            var defaultContent = trimmed.endsWith('.json') ? '{}' : '';
            var buf = new TextEncoder().encode(defaultContent).buffer;
            browse.dataSource.saveFile('/', trimmed, buf).then(function() {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('"' + trimmed + '" created');
                }
                _refreshBrowseTree(browse);
                if (browse._openFileTab) browse._openFileTab(trimmed);
            }).catch(function(err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Create failed: ' + err.message);
                }
            });
        });
    }

    // --- Add link (sub-vault or external resource) ---

    function _slugify(label) {
        var s = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return s || ('link-' + Math.random().toString(36).slice(2, 8));
    }
    function _genRefId() {
        var b = (crypto.getRandomValues(new Uint8Array(6)));
        var hex = ''; for (var i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
        return 'lk-' + hex;
    }
    function _sgSendOf(ds) {
        if (!ds) return null;
        if (ds._vault && ds._vault._sgSend) return ds._vault._sgSend;            // plain data source
        if (ds._root && ds._root._vault && ds._root._vault._sgSend) return ds._root._vault._sgSend;  // composite
        return null;
    }
    function _vaultOf(ds) {
        if (!ds) return null;
        if (ds._vault) return ds._vault;                       // plain data source
        if (ds._root && ds._root._vault) return ds._root._vault;  // composite → the parent (root) vault
        return null;
    }

    function _showAddLink(browse) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-secondary,#12122a);border:1px solid var(--border,#2a2a4a);border-radius:8px;padding:1.5rem 1.75rem;min-width:340px;max-width:440px;color:var(--color-text,#e2e8f0);font-size:14px;';
        var inS = 'width:100%;padding:0.5rem 0.7rem;background:var(--bg-primary,#0a0a18);border:1px solid var(--border,#2a2a4a);border-radius:4px;color:var(--color-text,#e2e8f0);font-size:14px;box-sizing:border-box;outline:none;margin:0.15rem 0 0.75rem;';
        box.innerHTML =
            '<p style="margin:0 0 0.9rem;font-weight:700;">Add a link</p>' +
            '<label style="font-size:12px;color:#8892a4;">Type</label>' +
            '<select id="al-type" style="' + inS + '">' +
                '<option value="vault">Linked vault (opens read-only inline)</option>' +
                '<option value="link">Web page</option>' +
                '<option value="video">Video (YouTube / file)</option>' +
                '<option value="image">Image</option>' +
                '<option value="app">External app</option>' +
            '</select>' +
            '<label style="font-size:12px;color:#8892a4;">Label</label>' +
            '<input id="al-label" type="text" placeholder="e.g. Patient: Alice" style="' + inS + '">' +
            '<div id="al-vault-row">' +
                '<label style="font-size:12px;color:#8892a4;">Vault key or read-only token</label>' +
                '<input id="al-key" type="password" placeholder="apple-river-1234  or  ro-coral-stamp-5678" autocomplete="off" style="' + inS + '">' +
                '<div style="font-size:12px;color:#4a5568;margin:-0.4rem 0 0.6rem;">Validated + saved on this device. Opens read-only.</div>' +
            '</div>' +
            '<div id="al-url-row" style="display:none;">' +
                '<label style="font-size:12px;color:#8892a4;">URL</label>' +
                '<input id="al-url" type="url" placeholder="https://…" autocomplete="off" style="' + inS + '">' +
                '<div style="font-size:12px;color:#4a5568;margin:-0.4rem 0 0.6rem;">Loads in a controlled embed that cannot read this vault.</div>' +
            '</div>' +
            '<div id="al-err" style="color:#ff6b6b;font-size:12px;min-height:1rem;"></div>' +
            '<div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:0.6rem;">' +
                '<button id="al-cancel" class="sb-action-btn">Cancel</button>' +
                '<button id="al-add" class="sb-action-btn" style="font-weight:700;color:var(--accent,#4ECDC4);">Add</button>' +
            '</div>';
        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        var typeEl  = box.querySelector('#al-type');
        var labelEl = box.querySelector('#al-label');
        var keyEl   = box.querySelector('#al-key');
        var urlEl   = box.querySelector('#al-url');
        var errEl   = box.querySelector('#al-err');
        var vaultRow = box.querySelector('#al-vault-row');
        var urlRow   = box.querySelector('#al-url-row');

        function syncRows() {
            var isVault = typeEl.value === 'vault';
            vaultRow.style.display = isVault ? '' : 'none';
            urlRow.style.display   = isVault ? 'none' : '';
        }
        typeEl.addEventListener('change', syncRows);
        syncRows();
        labelEl.focus();

        box.querySelector('#al-cancel').addEventListener('click', function() { overlay.remove(); });

        box.querySelector('#al-add').addEventListener('click', async function() {
            errEl.textContent = '';
            var type  = typeEl.value;
            var label = (labelEl.value || '').trim();
            if (!label) { errEl.textContent = 'Please enter a label.'; return; }
            var fileName = _slugify(label) + '.link.json';
            var refId = _genRefId();

            try {
                if (type === 'vault') {
                    var key = (keyEl.value || '').trim();
                    if (!key) { errEl.textContent = 'Please enter the vault key or token.'; return; }
                    var sgSend = _sgSendOf(browse.dataSource);
                    var parentVault = _vaultOf(browse.dataSource);
                    if (!sgSend || !parentVault || typeof SGVault === 'undefined') { errEl.textContent = 'Cannot open vaults from here.'; return; }
                    errEl.style.color = '#8892a4'; errEl.textContent = 'Validating…';
                    var child;
                    try {
                        child = await SGVault.open(sgSend, key);      // validate + get the real vault_id + read key
                    } catch (eOpen) {
                        if (/^ro-/i.test(key)) { errEl.style.color = '#ff6b6b'; errEl.textContent = "Paste the vault's full key or simple token (read-only tokens aren't supported here yet)."; return; }
                        throw eOpen;
                    }
                    var vaultId = child.vaultId;
                    // Write the pointer file first…
                    var linkObj = { vault_id: vaultId, ref_id: refId, label: label };
                    await browse.dataSource.saveFile('/', fileName, new TextEncoder().encode(JSON.stringify(linkObj, null, 2)).buffer);
                    // …then write a PORTABLE owner record (read-only triplet) into .vault/owner/ro-links.json,
                    // so the sub-vault opens silently on ANY device that has the parent vault (not just this one).
                    var portable = false;
                    try {
                        var rawRk = new Uint8Array(await crypto.subtle.exportKey('raw', child._readKey));
                        var record = { type: 'vault', label: label, pin: { mode: 'latest' },
                                       vault_id: vaultId, read_key: btoa(String.fromCharCode.apply(null, rawRk)),
                                       ref_file_id: child._refFileId };
                        await VaultLinks.saveRoRecord(parentVault, refId, record);   // commits + pushes (portable)
                        portable = true;
                    } catch (eRec) {
                        console.warn('[add-link] portable ro-record failed, falling back to device key:', eRec && eRec.message);
                        try { VaultLinks.setStoredChildKey(vaultId, key); } catch (_) {}   // this-device fallback
                    }
                    if (window.sgraphVault && window.sgraphVault.messages) {
                        window.sgraphVault.messages.success('Linked vault "' + label + '"' + (portable ? ' (opens on any device)' : ' (saved on this device)'));
                    }
                    if (browse.dataSource.scan) { try { await browse.dataSource.scan(); } catch (_) {} }
                    overlay.remove();
                    _refreshBrowseTree(browse);
                    return;
                } else {
                    var url = (urlEl.value || '').trim();
                    if (!url || !/^https?:\/\//i.test(url)) { errEl.textContent = 'Please enter an http(s) URL.'; return; }
                    var det = VaultLinks.detectResourceType(url);
                    var resObj = { ref_id: refId, type: type, url: url, label: label };
                    if (det.provider) resObj.provider = det.provider;
                    await browse.dataSource.saveFile('/', fileName, new TextEncoder().encode(JSON.stringify(resObj, null, 2)).buffer);
                }
                if (browse.dataSource.scan) { try { await browse.dataSource.scan(); } catch (_) {} }
                overlay.remove();
                if (window.sgraphVault && window.sgraphVault.messages) window.sgraphVault.messages.success('Added "' + label + '"');
                _refreshBrowseTree(browse);
            } catch (err) {
                errEl.style.color = '#ff6b6b';
                errEl.textContent = (type === 'vault' ? 'Could not open that vault: ' : 'Add failed: ') + (err && err.message ? err.message : err);
            }
        });
    }

    // --- Refresh Browse tree after mutations ---

    function _refreshBrowseTree(browse) {
        if (!browse.dataSource || !browse._sgLayout) return;
        // Rebuild the zipTree shim and repopulate tree
        browse.zipTree = browse.dataSource.getFileList().map(function(e) {
            return {
                path: e.path, name: e.name, dir: e.dir, size: e.size,
                entry: { async: function() { return browse.dataSource.getFileBytes(e.path); } }
            };
        });
        browse._populateTree();
    }

    // --- Inline confirm dialog (no browser confirm()) ---

    function _confirm(message, onOk) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-secondary,#12122a);border:1px solid var(--border,#2a2a4a);border-radius:8px;padding:1.5rem 2rem;min-width:280px;max-width:400px;';
        box.innerHTML = '<p style="margin:0 0 1.2rem;color:var(--color-text,#e2e8f0);font-size:14px;">' + message + '</p>';
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;';
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'sb-action-btn';
        cancelBtn.textContent = 'Cancel';
        var okBtn = document.createElement('button');
        okBtn.className = 'sb-action-btn';
        okBtn.textContent = 'Delete';
        okBtn.style.cssText = 'color:#ff6b6b;font-weight:700;';
        cancelBtn.addEventListener('click', function() { overlay.remove(); });
        okBtn.addEventListener('click', function() { overlay.remove(); onOk(); });
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        okBtn.focus();
    }

    // --- Inline prompt dialog (no browser prompt()) ---
    // opts: { defaultValue, okLabel }

    function _prompt(message, onOk, opts) {
        opts = opts || {};
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-secondary,#12122a);border:1px solid var(--border,#2a2a4a);border-radius:8px;padding:1.5rem 2rem;min-width:300px;max-width:400px;';
        box.innerHTML = '<p style="margin:0 0 0.75rem;color:var(--color-text,#e2e8f0);font-size:14px;">' + message + '</p>';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = opts.defaultValue || '';
        input.style.cssText = 'width:100%;padding:0.5rem 0.75rem;background:var(--bg-primary,#0a0a18);border:1px solid var(--accent,#4ECDC4);border-radius:4px;color:var(--color-text,#e2e8f0);font-size:14px;box-sizing:border-box;outline:none;margin-bottom:1rem;';
        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;';
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'sb-action-btn';
        cancelBtn.textContent = 'Cancel';
        var okBtn = document.createElement('button');
        okBtn.className = 'sb-action-btn';
        okBtn.textContent = opts.okLabel || 'Create';
        okBtn.style.cssText = 'color:var(--accent,#4ECDC4);font-weight:700;';
        var submit = function() { overlay.remove(); onOk(input.value); };
        cancelBtn.addEventListener('click', function() { overlay.remove(); });
        okBtn.addEventListener('click', submit);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') overlay.remove();
        });
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        box.appendChild(input);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        input.focus();
        if (opts.defaultValue) { input.select(); }
    }

    // --- Patch _setupTreeListeners: inject refresh button + drag-and-drop ---

    var _origSetupTree = SendBrowse.prototype._setupTreeListeners;

    SendBrowse.prototype._setupTreeListeners = function(treeEl) {
        _origSetupTree.call(this, treeEl);
        _injectRefreshButton(treeEl);
        _attachFolderInteractions(this, treeEl);
        if (!this.dataSource || !this.dataSource.writable) return;
        _attachDragDrop(this, treeEl);
    };

    // --- Inject refresh button into sb-tree__controls (next to + / −) ----------

    function _injectRefreshButton(treeEl) {
        var controls = treeEl.querySelector('.sb-tree__controls');
        if (!controls || controls.querySelector('.sb-vault-refresh')) return;

        var btn = document.createElement('button');
        btn.className = 'sb-tree__ctrl-btn sb-vault-refresh';
        btn.title     = 'Refresh vault (fetch latest from server)';
        btn.textContent = '↺';
        btn.style.cssText = 'font-size: 1rem; line-height: 1;';

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            treeEl.dispatchEvent(new CustomEvent('vault-header-refresh', {
                bubbles: true, composed: true
            }));
        });

        controls.appendChild(btn);
    }

    // --- Folder interactions: selection, double-click expand, rename/delete actions ---

    function _attachFolderInteractions(browse, treeEl) {
        var writable = browse.dataSource && browse.dataSource.writable;

        treeEl.querySelectorAll('.sb-tree__folder-header').forEach(function(header) {
            var folderEl = header.closest('.sb-tree__folder');
            if (!folderEl) return;
            var folderPath = folderEl.dataset.path || '';

            // Click on header → also mark folder as selected
            header.addEventListener('click', function() {
                treeEl.querySelectorAll('.sb-tree__folder--selected')
                    .forEach(function(el) { el.classList.remove('sb-tree__folder--selected'); });
                folderEl.classList.add('sb-tree__folder--selected');
                browse._selectedFolderPath = '/' + folderPath;
            });

            // Double-click on folder name → toggle expand (same as clicking toggle icon)
            var nameEl = header.querySelector('.sb-tree__folder-name');
            if (nameEl) {
                nameEl.addEventListener('dblclick', function(e) {
                    e.stopPropagation();
                    var content = folderEl.querySelector('.sb-tree__folder-content');
                    var toggle  = header.querySelector('.sb-tree__toggle');
                    if (content) {
                        var open = content.style.display !== 'none';
                        content.style.display = open ? 'none' : '';
                        if (toggle) toggle.textContent = open ? '\u25b8' : '\u25be';
                    }
                });
            }

            // Rename / delete action buttons (writable only)
            if (writable) _injectFolderActions(browse, header, treeEl, folderPath);
        });

        _injectFolderStyles();
    }

    function _injectFolderActions(browse, header, treeEl, folderPath) {
        if (header.querySelector('.sb-folder-actions')) return;
        var actions = document.createElement('div');
        actions.className = 'sb-folder-actions';

        var renameBtn = document.createElement('button');
        renameBtn.className = 'sb-folder-action-btn';
        renameBtn.textContent = 'rename';
        renameBtn.title = 'Rename folder';
        renameBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var parts = folderPath.split('/');
            var currentName = parts[parts.length - 1];
            _prompt('Rename folder:', function(newName) {
                if (!newName || !newName.trim() || newName.trim() === currentName) return;
                browse.dataSource.renameFolder('/' + folderPath, newName.trim()).then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.success('Folder renamed to "' + newName.trim() + '"');
                    _refreshBrowseTree(browse);
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.error('Rename failed: ' + err.message);
                });
            }, { defaultValue: currentName, okLabel: 'Rename' });
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'sb-folder-action-btn sb-folder-action-btn--del';
        delBtn.textContent = 'del';
        delBtn.title = 'Delete folder and all its contents';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var name = folderPath.split('/').pop();
            _confirm('Delete folder "' + name + '" and all its contents?', function() {
                browse.dataSource.deleteFolder('/' + folderPath).then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.success('Folder "' + name + '" deleted');
                    _refreshBrowseTree(browse);
                }).catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.error('Delete failed: ' + err.message);
                });
            });
        });

        actions.appendChild(renameBtn);
        actions.appendChild(delBtn);
        header.appendChild(actions);
    }

    function _injectFolderStyles() {
        if (document.getElementById('sb-folder-interaction-styles')) return;
        var s = document.createElement('style');
        s.id = 'sb-folder-interaction-styles';
        s.textContent = [
            '.sb-tree__folder--selected > .sb-tree__folder-header {',
            '  background: rgba(78,205,196,0.12); border-radius: 3px; }',
            '.sb-folder-actions { display:none; margin-left:auto; gap:2px; flex-shrink:0; }',
            '.sb-tree__folder-header:hover .sb-folder-actions { display:flex; }',
            '.sb-folder-action-btn {',
            '  font-size:10px; padding:1px 6px; cursor:pointer; border-radius:3px;',
            '  border:1px solid var(--color-border,#2a2a4a); background:transparent;',
            '  color:var(--color-text-secondary,#8892a4); font-family:inherit; line-height:1.4; }',
            '.sb-folder-action-btn:hover { color:var(--color-text,#e2e8f0); background:var(--bg-secondary,#12122a); }',
            '.sb-folder-action-btn--del:hover { color:#ff6b6b; }'
        ].join('\n');
        document.head.appendChild(s);
    }

    function _attachDragDrop(browse, treeEl) {
        // ── drag sources ──────────────────────────────────────────────────
        treeEl.querySelectorAll('.sb-tree__file').forEach(function(el) {
            el.setAttribute('draggable', 'true');
            el.style.cursor = 'grab';
            el.addEventListener('dragstart', function(e) {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'file', path: el.dataset.path }));
                el.classList.add('sb-dnd--dragging');
            });
            el.addEventListener('dragend', function() {
                el.classList.remove('sb-dnd--dragging');
            });
        });

        treeEl.querySelectorAll('.sb-tree__folder-header').forEach(function(header) {
            var folderEl = header.closest('.sb-tree__folder');
            if (!folderEl) return;
            header.setAttribute('draggable', 'true');
            header.style.cursor = 'grab';
            header.addEventListener('dragstart', function(e) {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                // A sub-vault folder moves by relocating its underlying *.link.json (a file),
                // not the virtual folder itself.
                var linkPath = folderEl.dataset.linkPath;
                if (linkPath) {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'file', path: linkPath }));
                } else {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', path: folderEl.dataset.path }));
                }
                folderEl.classList.add('sb-dnd--dragging');
            });
            header.addEventListener('dragend', function() {
                folderEl.classList.remove('sb-dnd--dragging');
            });
        });

        // ── drop zones: folder headers + tree root (root = drop to /) ────
        var dropZones = Array.from(treeEl.querySelectorAll('.sb-tree__folder-header'));

        // Make the tree panel itself a drop zone for the root folder
        dropZones.push(treeEl);

        dropZones.forEach(function(zone) {
            var enterCount = 0; // track nested dragenter/dragleave pairs

            zone.addEventListener('dragenter', function(e) {
                e.preventDefault();
                e.stopPropagation();
                enterCount++;
                zone.classList.add('sb-dnd--over');
            });

            zone.addEventListener('dragleave', function(e) {
                e.stopPropagation();
                enterCount--;
                if (enterCount <= 0) {
                    enterCount = 0;
                    zone.classList.remove('sb-dnd--over');
                }
            });

            zone.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                // 'copy' for OS files, 'move' for internal vault items
                e.dataTransfer.dropEffect = e.dataTransfer.files?.length > 0 ? 'copy' : 'move';
            });

            zone.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                enterCount = 0;
                zone.classList.remove('sb-dnd--over');

                // Determine destination folder path
                var destFolderPath;
                if (zone === treeEl) {
                    destFolderPath = '/';
                } else {
                    var folderEl = zone.closest('.sb-tree__folder');
                    destFolderPath = folderEl ? '/' + folderEl.dataset.path : '/';
                }

                // OS file drop (files from the filesystem)
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    _uploadFilesToFolder(browse, e.dataTransfer.files, destFolderPath);
                    return;
                }

                // Internal vault item move
                var raw = e.dataTransfer.getData('text/plain');
                if (!raw) return;
                var drag;
                try { drag = JSON.parse(raw); } catch (_) { return; }
                _executeDrop(browse, drag, destFolderPath);
            });
        });

        // Inject DnD styles once
        if (!document.getElementById('sb-dnd-styles')) {
            var style = document.createElement('style');
            style.id = 'sb-dnd-styles';
            style.textContent = [
                '.sb-dnd--dragging { opacity: 0.4; }',
                '.sb-dnd--over { background: rgba(78,205,196,0.15) !important;',
                '  outline: 1px dashed var(--accent,#4ECDC4); border-radius: 3px; }'
            ].join('\n');
            document.head.appendChild(style);
        }
    }

    function _uploadFilesToFolder(browse, fileList, destFolderPath) {
        var files = Array.from(fileList);
        var done = 0, errors = 0;

        function processNext(i) {
            if (i >= files.length) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    var msg = done + ' file' + (done !== 1 ? 's' : '') + ' added to ' + destFolderPath;
                    errors ? window.sgraphVault.messages.error(msg + ' (' + errors + ' failed)')
                           : window.sgraphVault.messages.success(msg);
                }
                _refreshBrowseTree(browse);
                return;
            }
            var file = files[i];
            var reader = new FileReader();
            reader.onload = function(ev) {
                browse.dataSource.saveFile(destFolderPath, file.name, new Uint8Array(ev.target.result))
                    .then(function() { done++; processNext(i + 1); })
                    .catch(function(err) {
                        errors++;
                        console.error('Upload failed:', file.name, err);
                        processNext(i + 1);
                    });
            };
            reader.onerror = function() { errors++; processNext(i + 1); };
            reader.readAsArrayBuffer(file);
        }
        processNext(0);
    }

    function _executeDrop(browse, drag, destFolderPath) {
        if (!drag || !drag.path) return;   // guard: resource/sub-vault nodes without a real path → no-op (no crash)
        if (drag.type === 'file') {
            // drag.path = e.g. "images/photo.jpg" or "photo.jpg"
            var parts      = drag.path.split('/');
            var fileName   = parts.pop();
            var srcFolder  = parts.length ? '/' + parts.join('/') : '/';

            if (srcFolder === destFolderPath) return; // no-op

            browse.dataSource.moveFile(srcFolder, fileName, destFolderPath).then(function() {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('Moved "' + fileName + '" to ' + destFolderPath);
                }
                _refreshBrowseTree(browse);
            }).catch(function(err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Move failed: ' + err.message);
                }
            });

        } else if (drag.type === 'folder') {
            // drag.path = e.g. "images" or "images/subfolder" (no leading slash)
            var srcPath = '/' + drag.path;

            // Prevent drop into self or own descendant
            if (destFolderPath === srcPath || destFolderPath.startsWith(srcPath + '/')) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Cannot move a folder into itself');
                }
                return;
            }

            // Check same parent
            var srcParts       = drag.path.split('/');
            var folderName     = srcParts.pop();
            var srcParentPath  = srcParts.length ? '/' + srcParts.join('/') : '/';
            if (srcParentPath === destFolderPath) return; // no-op

            browse.dataSource.moveFolder(srcPath, destFolderPath).then(function() {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('Moved folder "' + folderName + '" to ' + destFolderPath);
                }
                _refreshBrowseTree(browse);
            }).catch(function(err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Move failed: ' + err.message);
                }
            });
        }
    }

    // --- Conflict file detection helpers (used by _renderFileContent) ----------------

    function _isConflictFile(path) {
        var name = (path || '').split('/').pop();
        return /_conflict(\.[^.]*)?$/.test(name);
    }

    function _originalFromConflict(conflictPath) {
        return conflictPath
            .replace(/_conflict(\.[^./]*)$/, '$1')
            .replace(/_conflict$/, '');
    }

    function _conflictFromOriginal(origPath) {
        var dot   = origPath.lastIndexOf('.');
        var slash = origPath.lastIndexOf('/');
        return (dot > slash && dot > 0)
            ? origPath.slice(0, dot) + '_conflict' + origPath.slice(dot)
            : origPath + '_conflict';
    }

    // --- Helpers ---

    function _makeBtn(label) {
        var btn = document.createElement('button');
        btn.className = 'sb-action-btn';
        btn.textContent = label;
        return btn;
    }

    // A real <a> link styled as sb-action-btn.
    // Opens in a new tab (target=_blank); also supports Ctrl+click, middle-click,
    // and right-click → Copy Link natively — unlike a <button> with window.open().
    // Explicit inline styles ensure it renders identically to a <button> even if
    // the sb-action-btn CSS selector only targets <button> elements.
    function _makeAppLink(label, href) {
        var a = document.createElement('a');
        a.className = 'sb-action-btn';
        a.textContent = label;
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        // Mirror button defaults that <a> doesn't inherit automatically
        a.style.cssText = 'font-weight:600;text-decoration:none;' +
            'display:inline-flex;align-items:center;cursor:pointer;';
        return a;
    }

    // ── Fast tooltip ─────────────────────────────────────────────────────────────
    // Native title= tooltips have a ~500 ms OS delay we cannot override with CSS.
    // Instead, we use a floating div positioned via fixed coordinates so it works
    // inside shadow DOM (getBoundingClientRect crosses shadow boundaries).
    var _tip = null;
    var _tipTimer = null;

    function _ensureTip() {
        if (_tip) return;
        _tip = document.createElement('div');
        _tip.id = 'sg-vault-tip';
        _tip.style.cssText =
            'position:fixed;z-index:99999;pointer-events:none;' +
            'background:#1a1a2e;color:#e0e0e0;border:1px solid rgba(78,205,196,0.3);' +
            'border-radius:5px;padding:4px 9px;font-size:11.5px;line-height:1.4;' +
            'font-family:system-ui,sans-serif;white-space:pre;' +
            'box-shadow:0 2px 8px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.08s;';
        document.body.appendChild(_tip);
    }

    // Attach a fast custom tooltip to any element.
    // Replaces the native title= (removes it so the slow OS tooltip never fires).
    function _addTip(el, text) {
        _ensureTip();
        el.removeAttribute('title');          // prevent native slow tooltip
        el.setAttribute('data-tip', text);
        el.addEventListener('mouseenter', function(e) {
            clearTimeout(_tipTimer);
            _tipTimer = setTimeout(function() {
                if (!_tip) return;
                _tip.textContent = text;
                var r = el.getBoundingClientRect();
                // Position above the element, centred, clamped to viewport
                var tw = Math.min(text.length * 7.5 + 20, 340);
                var left = Math.max(6, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 6));
                var top  = r.top - 32;
                if (top < 6) top = r.bottom + 6;
                _tip.style.left = left + 'px';
                _tip.style.top  = top  + 'px';
                _tip.style.opacity = '1';
            }, 90);   // 90 ms — fast but avoids flicker on mouse-through
        });
        el.addEventListener('mouseleave', function() {
            clearTimeout(_tipTimer);
            if (_tip) _tip.style.opacity = '0';
        });
        el.addEventListener('click', function() {
            clearTimeout(_tipTimer);
            if (_tip) _tip.style.opacity = '0';
        });
        return el;
    }

    // Icon-only button: compact, faded until hover.
    // Uses _addTip for instant tooltip instead of native title=.
    function _makeIconBtn(icon, titleText) {
        var btn = document.createElement('button');
        btn.className = 'sb-action-btn';
        btn.innerHTML = icon;
        btn.style.cssText = 'padding:0 6px;min-width:26px;font-size:14px;opacity:0.7;line-height:1;';
        btn.addEventListener('mouseenter', function() { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', function() { btn.style.opacity = '0.7'; });
        _addTip(btn, titleText);
        return btn;
    }

    // Thin vertical separator between button groups.
    function _makeSep() {
        var sep = document.createElement('span');
        sep.setAttribute('aria-hidden', 'true');
        sep.style.cssText = 'display:inline-flex;align-self:center;width:1px;height:14px;' +
            'background:rgba(255,255,255,0.12);margin:0 3px;flex-shrink:0;';
        return sep;
    }

    function _showTextOverlay(title, text) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--bg-secondary,#12122a);border:1px solid var(--border,#2a2a4a);border-radius:8px;padding:1.5rem;min-width:420px;max-width:680px;max-height:80vh;display:flex;flex-direction:column;gap:1rem;';
        var hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
        var titleEl = document.createElement('span');
        titleEl.style.cssText = 'font-size:13px;font-weight:700;color:var(--color-text,#e2e8f0);';
        titleEl.textContent = title;
        var closeBtn = _makeBtn('\u00d7');
        closeBtn.addEventListener('click', function() { overlay.remove(); });
        hdr.appendChild(titleEl);
        hdr.appendChild(closeBtn);
        var pre = document.createElement('pre');
        pre.style.cssText = 'margin:0;padding:0.75rem 1rem;background:var(--bg-primary,#0a0a18);border:1px solid var(--border,#2a2a4a);border-radius:4px;font-size:12px;line-height:1.6;color:var(--accent,#4ECDC4);overflow:auto;white-space:pre;font-family:var(--font-mono,monospace);';
        pre.textContent = text;
        box.appendChild(hdr);
        box.appendChild(pre);
        overlay.appendChild(box);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function _clipboardFallback(text) {
        var tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(tmp);
        tmp.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(tmp);
    }

})();
