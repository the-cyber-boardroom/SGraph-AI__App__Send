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

    // --- Patch _renderFileContent: add Edit/Save/Delete to action bar ---

    var _origRender = SendBrowse.prototype._renderFileContent;

    SendBrowse.prototype._renderFileContent = function(container, bytes, fileName, type) {
        // Call original render first
        _origRender.call(this, container, bytes, fileName, type);

        // Only add edit controls if dataSource is writable
        if (!this.dataSource || !this.dataSource.writable) return;

        var bar = container.querySelector('.sb-file__actions');
        if (!bar) return;

        var self = this;
        var isEditable = (type === 'text' || type === 'code' || type === 'markdown');

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
            var preEl     = content ? content.querySelector('pre') : null;
            var textareaEl = null;
            var isEditing  = false;

            editBtn.addEventListener('click', function() {
                if (isEditing) return;
                isEditing = true;
                var currentText = preEl ? preEl.textContent : new TextDecoder().decode(bytes);

                textareaEl = document.createElement('textarea');
                textareaEl.value = currentText;
                textareaEl.style.cssText = 'width:100%;height:100%;margin:0;padding:1rem;resize:none;' +
                    'font-family:var(--font-mono,monospace);font-size:13px;color:var(--color-text,#e2e8f0);' +
                    'line-height:1.5;background:var(--bg-primary,#0a0a18);border:1px solid var(--accent,#4ECDC4);' +
                    'border-radius:4px;outline:none;box-sizing:border-box;tab-size:4;flex:1;';

                // No keyboard shortcuts — use Save / Cancel buttons

                if (content) {
                    content.style.display = 'none';
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
                if (textareaEl) { textareaEl.remove(); textareaEl = null; }
                if (content) content.style.display = '';
                editBtn.style.display   = '';
                saveBtn.style.display   = 'none';
                cancelBtn.style.display = 'none';
            }

            function doSave() {
                if (!textareaEl || !self.dataSource) return;
                var newText = textareaEl.value;
                var newBytes = new TextEncoder().encode(newText);
                var parts = fileName.split('/');
                var fName = parts.pop();
                var folder = '/' + parts.join('/');

                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                self.dataSource.saveFile(folder === '/' ? '/' : folder, fName, newBytes.buffer).then(function() {
                    // Re-render container fully with new bytes (handles markdown, code, text)
                    // _renderFileContent calls _origRender then re-attaches edit/delete buttons
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
            var copyBtn = _makeBtn('Copy');
            copyBtn.addEventListener('click', function() {
                var text = (isEditing && textareaEl)
                    ? textareaEl.value
                    : new TextDecoder('utf-8', { fatal: false }).decode(bytes);
                var reset = function() {
                    setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.style.color = ''; }, 1500);
                };
                var flash = function() {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.color = 'var(--accent,#4ECDC4)';
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

        // --- Present button (HTML files: fullscreen the sandboxed iframe) ---
        var _ext = (fileName || '').split('.').pop().toLowerCase();
        if (_ext === 'html' || _ext === 'htm') {
            var presentBtn = _makeBtn('\u26f6 Present');
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

        // --- Rename button (all file types) ---
        var renameBtn = _makeBtn('Rename');
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
        var deleteBtn = _makeBtn('Delete');
        deleteBtn.addEventListener('mouseenter', function() { deleteBtn.style.color = '#ff6b6b'; });
        deleteBtn.addEventListener('mouseleave', function() { deleteBtn.style.color = ''; });
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
        if (!isEditable && type !== 'image' && type !== 'pdf') {
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

    // --- Patch header: add Upload Files button ---

    var _origBuild = SendBrowse.prototype._build;

    SendBrowse.prototype._build = function() {
        _origBuild.call(this);

        if (!this.dataSource || !this.dataSource.writable) return;

        var headerRight = this.querySelector('.sb-header__right');
        if (!headerRight) return;

        var self = this;
        var uploadBtn = document.createElement('button');
        uploadBtn.className = 'sb-action-btn';
        uploadBtn.innerHTML = '&#8683; Upload Files';
        uploadBtn.style.cssText = 'font-weight:600;';
        uploadBtn.addEventListener('click', function() { _showUploadPicker(self); });
        headerRight.prepend(uploadBtn);

        // New Folder button
        var folderBtn = document.createElement('button');
        folderBtn.className = 'sb-action-btn';
        folderBtn.innerHTML = '&#128193; New Folder';
        folderBtn.addEventListener('click', function() { _showNewFolder(self); });
        headerRight.prepend(folderBtn);
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
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', path: folderEl.dataset.path }));
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
