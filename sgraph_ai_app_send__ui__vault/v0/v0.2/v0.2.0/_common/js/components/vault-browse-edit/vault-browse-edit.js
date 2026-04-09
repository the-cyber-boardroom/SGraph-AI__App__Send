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

                textareaEl.addEventListener('keydown', function(e) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); doSave(); }
                    if (e.key === 'Escape') { e.preventDefault(); exitEdit(); }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        var s = textareaEl.selectionStart, end = textareaEl.selectionEnd;
                        textareaEl.value = textareaEl.value.substring(0, s) + '    ' + textareaEl.value.substring(end);
                        textareaEl.selectionStart = textareaEl.selectionEnd = s + 4;
                    }
                });

                if (content) {
                    content.style.display = 'none';
                    container.appendChild(textareaEl);
                }
                textareaEl.focus();
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
                    // Update the pre element with new content
                    if (preEl) preEl.textContent = newText;
                    // Update size display
                    var sizeEl = bar.querySelector('.sb-file__size');
                    if (sizeEl) sizeEl.textContent = SendHelpers.formatBytes(newBytes.byteLength);
                    exitEdit();
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
            bar.appendChild(editBtn);
            bar.appendChild(saveBtn);
            bar.appendChild(cancelBtn);
        }

        // --- Delete button (all file types) ---
        var deleteBtn = _makeBtn('Delete');
        deleteBtn.addEventListener('mouseenter', function() { deleteBtn.style.color = '#ff6b6b'; });
        deleteBtn.addEventListener('mouseleave', function() { deleteBtn.style.color = ''; });
        deleteBtn.addEventListener('click', function() {
            if (!confirm('Delete "' + fileName.split('/').pop() + '"?')) return;
            var parts = fileName.split('/');
            var fName = parts.pop();
            var folder = '/' + parts.join('/');

            self.dataSource.deleteFile(folder === '/' ? '/' : folder, fName).then(function() {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.success('"' + fName + '" deleted');
                }
            }).catch(function(err) {
                if (window.sgraphVault && window.sgraphVault.messages) {
                    window.sgraphVault.messages.error('Delete failed: ' + err.message);
                }
            });
        });
        bar.appendChild(deleteBtn);
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
        var name = prompt('Folder name:');
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

    // --- Helper ---

    function _makeBtn(label) {
        var btn = document.createElement('button');
        btn.className = 'sb-action-btn';
        btn.textContent = label;
        return btn;
    }

})();
