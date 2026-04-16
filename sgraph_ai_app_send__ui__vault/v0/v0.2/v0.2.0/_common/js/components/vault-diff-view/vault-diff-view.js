/* =================================================================================
   Vault Diff View — side-by-side conflict resolution overlay
   v0.2.1 — adds per-line diff highlighting

   Exposes: window.VaultDiffView.open(browse, origPath, conflictPath, origBytes, conflictBytes)

   browse         — SendBrowse instance (for dataSource.saveFile / deleteFile / getFileList)
   origPath       — vault-relative path of the original file  (no leading slash)
   conflictPath   — vault-relative path of the _conflict copy (no leading slash)
   origBytes      — ArrayBuffer of the original file
   conflictBytes  — ArrayBuffer of the conflict copy
   ================================================================================= */

(function() {
    'use strict';

    // Must match textarea font-size (13px) × line-height.  Integer keeps bars pixel-aligned.
    var LINE_PX = 21;   // 13 × ~1.615 ≈ 21 px
    var PAD_PX  = 16;   // textarea padding-top (1rem = 16px default)

    // --- Diff computation -----------------------------------------------------------
    // Returns the set of line-index positions that differ between A and B.

    function _computeDiff(textA, textB) {
        var lA = textA.split('\n'), lB = textB.split('\n');
        var n  = Math.max(lA.length, lB.length);
        var ds = new Set();
        for (var i = 0; i < n; i++) { if (lA[i] !== lB[i]) ds.add(i); }
        return { diffSet: ds, count: ds.size, nA: lA.length, nB: lB.length };
    }

    // --- Highlight bar layer --------------------------------------------------------
    // Creates an inner <div> with one child bar per line.
    // Changed lines get an amber background; unchanged lines are transparent.

    function _makeBarsInner(lineCount, diffSet) {
        var inner = document.createElement('div');
        inner.style.cssText = 'position:absolute;top:' + PAD_PX + 'px;left:0;right:0;';
        for (var i = 0; i < lineCount; i++) {
            var bar = document.createElement('div');
            bar.style.height = LINE_PX + 'px';
            if (diffSet.has(i)) bar.style.background = 'rgba(255,159,67,0.18)';
            inner.appendChild(bar);
        }
        return inner;
    }

    // Update an existing bars inner element in place (avoids full rebuild on every keystroke).

    function _updateBarsInner(inner, lineCount, diffSet) {
        var bars = inner.children;
        // Grow or shrink bar list to match new line count
        while (bars.length < lineCount) {
            var bar = document.createElement('div');
            bar.style.height = LINE_PX + 'px';
            inner.appendChild(bar);
        }
        while (bars.length > lineCount) { inner.removeChild(inner.lastChild); }
        // Refresh colours
        for (var i = 0; i < bars.length; i++) {
            bars[i].style.background = diffSet.has(i) ? 'rgba(255,159,67,0.18)' : '';
        }
    }

    // --- Pane factory ---------------------------------------------------------------
    // Returns { ta, inner, wrap }
    //   ta    — the textarea (transparent background, sits above the bar layer)
    //   inner — the bars inner element (caller holds reference for updates + scroll sync)
    //   wrap  — the outer container (appended to editorArea)

    function _makePane(text, readOnly, lineCount, diffSet, bgColor) {
        // ── bar layer ──
        var barsBg = document.createElement('div');
        barsBg.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;';
        var inner = _makeBarsInner(lineCount, diffSet);
        barsBg.appendChild(inner);

        // ── textarea ──
        // position:absolute;inset:0 fills the position:relative wrapper fully.
        // (flex:1 alone does nothing here because the wrapper is not a flex container.)
        var ta = document.createElement('textarea');
        ta.value      = text;
        ta.readOnly   = !!readOnly;
        ta.spellcheck = false;
        ta.setAttribute('wrap', 'off');       // no word-wrap → fixed line height
        ta.style.cssText = [
            'position:absolute;inset:0;margin:0;padding:' + PAD_PX + 'px 1rem;resize:none;',
            'font-family:inherit;font-size:13px;line-height:' + LINE_PX + 'px;',
            'background:transparent;border:none;outline:none;tab-size:4;overflow:auto;',
            'white-space:pre;z-index:1;',
            'color:' + (readOnly ? '#ff9f43' : 'var(--color-text,#e2e8f0)') + ';'
        ].join('');

        // ── wrapper ──
        var wrap = document.createElement('div');
        wrap.style.cssText = [
            'position:relative;flex:1;overflow:hidden;min-height:0;',
            'background:' + (bgColor || 'var(--bg-primary,#0a0a18)') + ';',
            'border-right:1px solid var(--border,#2a2a4a);'
        ].join('');
        wrap.appendChild(barsBg);
        wrap.appendChild(ta);

        // Sync bar-layer vertical position with textarea scroll
        ta.addEventListener('scroll', function() {
            inner.style.transform = 'translateY(-' + ta.scrollTop + 'px)';
        });

        return { ta: ta, inner: inner, wrap: wrap };
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

    // --- Build button ---------------------------------------------------------------

    function _btn(label, style) {
        var b = document.createElement('button');
        b.className   = 'sb-action-btn';
        b.textContent = label;
        if (style) b.style.cssText = style;
        return b;
    }

    // --- Main entry point -----------------------------------------------------------

    function open(browse, origPath, conflictPath, origBytes, conflictBytes) {
        var origText     = new TextDecoder('utf-8', { fatal: false }).decode(origBytes);
        var conflictText = new TextDecoder('utf-8', { fatal: false }).decode(conflictBytes);
        var diff         = _computeDiff(origText, conflictText);

        // ── Overlay shell ──
        var overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed;inset:0;z-index:9999;',
            'background:rgba(0,0,0,0.88);',
            'display:flex;flex-direction:column;',
            'font-family:var(--font-mono,monospace);'
        ].join('');

        // ── Header ──
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

        function _updateBadge(count) {
            badge.textContent = count === 0
                ? '\u2713 no differences'
                : count + ' line' + (count !== 1 ? 's' : '') + ' differ';
            badge.style.background = count === 0
                ? 'rgba(78,205,196,0.12)'
                : 'rgba(255,159,67,0.15)';
            badge.style.color = count === 0 ? 'var(--accent,#4ECDC4)' : '#ff9f43';
        }
        _updateBadge(diff.count);

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
        colHdr.appendChild(makeLabel('\u2190 Yours (editable): ' + origPath.split('/').pop()));
        colHdr.appendChild(makeLabel('\u2192 Theirs (read-only): ' + conflictPath.split('/').pop(), '#ff9f43'));

        // ── Editor area ──
        var editorArea = document.createElement('div');
        editorArea.style.cssText = 'display:flex;flex:1;overflow:hidden;min-height:0;';

        var left  = _makePane(origText,     false, diff.nA, diff.diffSet);
        var right = _makePane(conflictText, true,  diff.nB, diff.diffSet, 'rgba(255,159,67,0.03)');

        editorArea.appendChild(left.wrap);
        editorArea.appendChild(right.wrap);

        // ── Synchronized scrolling ──
        var _syncing = false;
        left.ta.addEventListener('scroll', function() {
            if (_syncing) return; _syncing = true;
            right.ta.scrollTop  = left.ta.scrollTop;
            right.ta.scrollLeft = left.ta.scrollLeft;
            right.inner.style.transform = 'translateY(-' + left.ta.scrollTop + 'px)';
            _syncing = false;
        });
        right.ta.addEventListener('scroll', function() {
            if (_syncing) return; _syncing = true;
            left.ta.scrollTop  = right.ta.scrollTop;
            left.ta.scrollLeft = right.ta.scrollLeft;
            left.inner.style.transform = 'translateY(-' + right.ta.scrollTop + 'px)';
            _syncing = false;
        });

        // ── Live diff update when user edits the left pane ──
        left.ta.addEventListener('input', function() {
            var newDiff = _computeDiff(left.ta.value, conflictText);
            _updateBarsInner(left.inner,  newDiff.nA, newDiff.diffSet);
            _updateBarsInner(right.inner, newDiff.nB, newDiff.diffSet);
            _updateBadge(newDiff.count);
        });

        overlay.appendChild(hdr);
        overlay.appendChild(colHdr);
        overlay.appendChild(editorArea);

        // ── Actions ──

        acceptBtn.addEventListener('click', function() {
            left.ta.value = right.ta.value;
            // Recompute diff (now both same → 0 differences)
            var newDiff = _computeDiff(left.ta.value, conflictText);
            _updateBarsInner(left.inner,  newDiff.nA, newDiff.diffSet);
            _updateBarsInner(right.inner, newDiff.nB, newDiff.diffSet);
            _updateBadge(newDiff.count);
        });

        cancelBtn.addEventListener('click', function() { overlay.remove(); });

        saveBtn.addEventListener('click', function() {
            saveBtn.disabled    = true;
            saveBtn.textContent = 'Saving\u2026';

            var newBytes = new TextEncoder().encode(left.ta.value);

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
        left.ta.focus();
    }

    // --- Public API -----------------------------------------------------------------

    window.VaultDiffView = { open: open };

})();
