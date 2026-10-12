/* =============================================================================
   SgitDiff — pure line-diff (LCS) → unified-diff hunks

   Zero DOM, zero deps. Node-testable (tests/unit/vault_ui/loader/test__sgit_diff.js).
   Used by vault-sgit-view--commit.js to render per-file diffs in the SGit view and
   to assemble a copy-as-patch blob.

   API:
     SgitDiff.lineDiff(oldText, newText, ctx=3)
       → { tooLarge, hunks:[{oldStart,oldCount,newStart,newCount,rows}], stats:{added,removed}, oldLines, newLines }
       each row: { type:' '|'-'|'+', text, oldNo, newNo }  (oldNo/newNo are 0 when N/A)
     SgitDiff.toUnifiedPatch(path, oldText, newText, status, ctx)  → git-style patch string
     SgitDiff.hunkHeader(hunk)  → "@@ -a,b +c,d @@"

   Cap: O(n*m) LCS, so files over MAX_LINES per side return { tooLarge:true } rather
   than allocate a huge table. Typical vault files (config/json/md/code) are well under.
   ============================================================================= */

(function () {
    'use strict';

    var MAX_LINES = 2000;   // per side; beyond this the inline diff is skipped

    function splitLines(s) {
        if (s == null || s === '') return [];
        var lines = String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        // A trailing newline produces a trailing '' element — drop it so "a\n" is one line.
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        return lines;
    }

    // LCS dynamic-programming backtrack → edit script.
    // Returns [{ type:' '|'-'|'+', text, oldNo, newNo }] in old/new order.
    function editScript(a, b) {
        var n = a.length, m = b.length, w = m + 1;
        var dp = new Int32Array((n + 1) * w);
        for (var i = n - 1; i >= 0; i--) {
            for (var j = m - 1; j >= 0; j--) {
                dp[i * w + j] = (a[i] === b[j])
                    ? dp[(i + 1) * w + (j + 1)] + 1
                    : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
            }
        }
        var out = [], oi = 0, oj = 0;
        while (oi < n && oj < m) {
            if (a[oi] === b[oj]) { out.push({ type: ' ', text: a[oi], oldNo: oi + 1, newNo: oj + 1 }); oi++; oj++; }
            else if (dp[(oi + 1) * w + oj] >= dp[oi * w + (oj + 1)]) { out.push({ type: '-', text: a[oi], oldNo: oi + 1, newNo: 0 }); oi++; }
            else { out.push({ type: '+', text: b[oj], oldNo: 0, newNo: oj + 1 }); oj++; }
        }
        while (oi < n) { out.push({ type: '-', text: a[oi], oldNo: oi + 1, newNo: 0 }); oi++; }
        while (oj < m) { out.push({ type: '+', text: b[oj], oldNo: 0, newNo: oj + 1 }); oj++; }
        return out;
    }

    // Group an edit script into unified-diff hunks with `ctx` lines of context,
    // merging adjacent change regions whose gap ≤ 2*ctx (standard diff hunking).
    function toHunks(script, ctx) {
        ctx = (ctx == null) ? 3 : ctx;
        var changed = [];
        for (var k = 0; k < script.length; k++) if (script[k].type !== ' ') changed.push(k);
        if (!changed.length) return [];

        var hunks = [], i = 0;
        while (i < changed.length) {
            var start = changed[i], end = changed[i], j = i + 1;
            while (j < changed.length && changed[j] - end <= 2 * ctx) { end = changed[j]; j++; }
            var from = Math.max(0, start - ctx);
            var to   = Math.min(script.length - 1, end + ctx);
            var rows = script.slice(from, to + 1);

            var oldStart = 0, newStart = 0, oldCount = 0, newCount = 0;
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                if (row.oldNo && !oldStart) oldStart = row.oldNo;
                if (row.newNo && !newStart) newStart = row.newNo;
                if (row.type !== '+') oldCount++;
                if (row.type !== '-') newCount++;
            }
            hunks.push({ oldStart: oldStart, oldCount: oldCount, newStart: newStart, newCount: newCount, rows: rows });
            i = j;
        }
        return hunks;
    }

    function lineDiff(oldText, newText, ctx) {
        var a = splitLines(oldText), b = splitLines(newText);
        if (a.length > MAX_LINES || b.length > MAX_LINES) {
            return { tooLarge: true, hunks: [], stats: { added: 0, removed: 0 }, oldLines: a.length, newLines: b.length };
        }
        var script = editScript(a, b);
        var added = 0, removed = 0;
        for (var k = 0; k < script.length; k++) {
            if (script[k].type === '+') added++;
            else if (script[k].type === '-') removed++;
        }
        return { tooLarge: false, hunks: toHunks(script, ctx), stats: { added: added, removed: removed }, oldLines: a.length, newLines: b.length };
    }

    function hunkHeader(h) {
        return '@@ -' + h.oldStart + ',' + h.oldCount + ' +' + h.newStart + ',' + h.newCount + ' @@';
    }

    // git-style unified patch for one file. status ∈ 'added'|'modified'|'removed'.
    function toUnifiedPatch(path, oldText, newText, status, ctx) {
        var d = lineDiff(oldText, newText, ctx);
        var lines = [];
        lines.push('--- ' + (status === 'added'   ? '/dev/null' : 'a/' + path));
        lines.push('+++ ' + (status === 'removed' ? '/dev/null' : 'b/' + path));
        if (d.tooLarge) {
            lines.push('@@ file too large to diff inline (' + d.oldLines + ' → ' + d.newLines + ' lines) @@');
            return lines.join('\n');
        }
        for (var i = 0; i < d.hunks.length; i++) {
            lines.push(hunkHeader(d.hunks[i]));
            var rows = d.hunks[i].rows;
            for (var r = 0; r < rows.length; r++) lines.push(rows[r].type + rows[r].text);
        }
        return lines.join('\n');
    }

    var SgitDiff = {
        lineDiff:       lineDiff,
        toHunks:        toHunks,
        toUnifiedPatch: toUnifiedPatch,
        hunkHeader:     hunkHeader,
        MAX_LINES:      MAX_LINES
    };

    if (typeof window     !== 'undefined') window.SgitDiff     = SgitDiff;
    if (typeof globalThis !== 'undefined') globalThis.SgitDiff = SgitDiff;
})();
