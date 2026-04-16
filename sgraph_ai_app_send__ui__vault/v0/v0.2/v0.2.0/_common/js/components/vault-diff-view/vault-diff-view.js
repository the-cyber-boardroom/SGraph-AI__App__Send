/* =================================================================================
   Vault Diff View — side-by-side conflict resolution overlay
   v0.2.0

   Exposes: window.VaultDiffView.open(browse, origPath, conflictPath, origBytes, conflictBytes)

   browse         — SendBrowse instance (for dataSource.saveFile / deleteFile / getFileList)
   origPath       — vault-relative path of the original file  (no leading slash)
   conflictPath   — vault-relative path of the _conflict copy (no leading slash)
   origBytes      — ArrayBuffer of the original file
   conflictBytes  — ArrayBuffer of the conflict copy
   ================================================================================= */

(function() {
    'use strict';

    // --- Simple line-diff: count lines that differ when the two files are zipped ------

    function _lineDiffCount(textA, textB) {
        var lA = textA.split('\n'), lB = textB.split('\n');
        var n   = Math.max(lA.length, lB.length);
        var cnt = 0;
        for (var i = 0; i < n; i++) { if (lA[i] !== lB[i]) cnt++; }
        return cnt;
    }

    // --- Refresh tree helper (mirrors vault-browse-edit) ----------------------------

    function _refreshTree(browse) {
        if (!browse.dataSource || !browse._sgLayout) return;
        browse.zipTree = browse.dataSource.getFileList().map(function(e) {
            return {
                path: e.path, name: e.name, dir: e.dir, size: e.size,
                entry: { async: function() { return browse.dataSource.getFileBytes(e.path); } }
            };
        });
        browse._populateTree();
    }

    // --- Build button ----------------------------------------------------------------

    function _btn(label, style) {
        var b = document.createElement('button');
        b.className   = 'sb-action-btn';
        b.textContent = label;
        if (style) b.style.cssText = style;
        return b;
    }

    // --- Main overlay ---------------------------------------------------------------

    function open(browse, origPath, conflictPath, origBytes, conflictBytes) {
        var origText     = new TextDecoder('utf-8', { fatal: false }).decode(origBytes);
        var conflictText = new TextDecoder('utf-8', { fatal: false }).decode(conflictBytes);
        var diffCount    = _lineDiffCount(origText, conflictText);

        // ── Overlay shell ──
        var overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;inset:0;z-index:9999;',
            'background:rgba(0,0,0,0.88);',
            'display:flex;flex-direction:column;',
            'font-family:var(--font-mono,monospace);'
        ].join('');

        // ── Header bar ──
        var hdr = document.createElement('div');
        hdr.style.cssText = [
            'display:flex;align-items:center;gap:0.6rem;padding:0.55rem 1rem;flex-shrink:0;flex-wrap:wrap;',
            'background:var(--bg-secondary,#12122a);',
            'border-bottom:1px solid var(--border,#2a2a4a);'
        ].join('');

        var titleEl = document.createElement('span');
        titleEl.style.cssText = 'flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text,#e2e8f0);';
        titleEl.textContent = 'Resolve conflict: ' + origPath;

        var badge = document.createElement('span');
        badge.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:3px;flex-shrink:0;background:rgba(255,159,67,0.15);color:#ff9f43;';
        badge.textContent = diffCount + ' line' + (diffCount !== 1 ? 's' : '') + ' differ';

        var acceptBtn = _btn('\u2190 Accept Theirs', 'color:#ff9f43;font-weight:700;flex-shrink:0;');
        var saveBtn   = _btn('\u2714 Save \u0026 Resolve', 'color:var(--accent,#4ECDC4);font-weight:700;flex-shrink:0;');
        var cancelBtn = _btn('Cancel', 'flex-shrink:0;');

        hdr.appendChild(titleEl);
        hdr.appendChild(badge);
        hdr.appendChild(acceptBtn);
        hdr.appendChild(saveBtn);
        hdr.appendChild(cancelBtn);

        // ── Column labels ──
        var colHdr = document.createElement('div');
        colHdr.style.cssText = [
            'display:flex;flex-shrink:0;',
            'background:var(--bg-secondary,#12122a);',
            'border-bottom:1px solid var(--border,#2a2a4a);'
        ].join('');

        function makeLabel(text, color) {
            var d = document.createElement('div');
            d.style.cssText = [
                'flex:1;padding:3px 1rem;font-size:11px;',
                'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
                'border-right:1px solid var(--border,#2a2a4a);'
            ].join('');
            d.style.color = color || 'var(--color-text-secondary,#8892a4)';
            d.textContent = text;
            return d;
        }

        colHdr.appendChild(makeLabel(
            '\u2190 Yours (editable): ' + origPath.split('/').pop()
        ));
        colHdr.appendChild(makeLabel(
            '\u2192 Theirs (read-only): ' + conflictPath.split('/').pop(),
            '#ff9f43'
        ));

        // ── Editor area ──
        var editorArea = document.createElement('div');
        editorArea.style.cssText = 'display:flex;flex:1;overflow:hidden;min-height:0;';

        function makePane(text, readOnly) {
            var ta = document.createElement('textarea');
            ta.value     = text;
            ta.readOnly  = !!readOnly;
            ta.spellcheck = false;
            ta.style.cssText = [
                'flex:1;margin:0;padding:1rem;resize:none;',
                'font-family:inherit;font-size:13px;line-height:1.6;',
                'background:var(--bg-primary,#0a0a18);border:none;outline:none;',
                'border-right:1px solid var(--border,#2a2a4a);tab-size:4;overflow:auto;',
                'color:' + (readOnly ? '#ff9f43' : 'var(--color-text,#e2e8f0)') + ';'
            ].join('');
            if (readOnly) ta.style.background = 'rgba(255,159,67,0.03)';
            return ta;
        }

        var leftTA  = makePane(origText, false);
        var rightTA = makePane(conflictText, true);
        editorArea.appendChild(leftTA);
        editorArea.appendChild(rightTA);

        // Synchronized scrolling
        var _syncing = false;
        leftTA.addEventListener('scroll', function() {
            if (_syncing) return; _syncing = true;
            rightTA.scrollTop = leftTA.scrollTop; rightTA.scrollLeft = leftTA.scrollLeft;
            _syncing = false;
        });
        rightTA.addEventListener('scroll', function() {
            if (_syncing) return; _syncing = true;
            leftTA.scrollTop = rightTA.scrollTop; leftTA.scrollLeft = rightTA.scrollLeft;
            _syncing = false;
        });

        overlay.appendChild(hdr);
        overlay.appendChild(colHdr);
        overlay.appendChild(editorArea);

        // ── Actions ──

        acceptBtn.addEventListener('click', function() {
            leftTA.value        = rightTA.value;
            badge.textContent   = '0 lines differ';
        });

        cancelBtn.addEventListener('click', function() { overlay.remove(); });

        saveBtn.addEventListener('click', function() {
            saveBtn.disabled    = true;
            saveBtn.textContent = 'Saving\u2026';

            var newBytes = new TextEncoder().encode(leftTA.value);

            var oParts  = origPath.split('/');
            var oName   = oParts.pop();
            var oFolder = oParts.length ? '/' + oParts.join('/') : '/';

            var cParts  = conflictPath.split('/');
            var cName   = cParts.pop();
            var cFolder = cParts.length ? '/' + cParts.join('/') : '/';

            browse.dataSource.saveFile(oFolder, oName, newBytes.buffer)
                .then(function() { return browse.dataSource.deleteFile(cFolder, cName); })
                .then(function() {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.success('Conflict resolved: "' + oName + '" saved');
                    overlay.remove();
                    _refreshTree(browse);
                })
                .catch(function(err) {
                    if (window.sgraphVault && window.sgraphVault.messages)
                        window.sgraphVault.messages.error('Resolve failed: ' + err.message);
                    saveBtn.disabled    = false;
                    saveBtn.textContent = '\u2714 Save \u0026 Resolve';
                });
        });

        document.body.appendChild(overlay);
        leftTA.focus();
    }

    // --- Public API -----------------------------------------------------------------

    window.VaultDiffView = { open: open };

})();
