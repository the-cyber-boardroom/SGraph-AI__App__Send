/* ═══════════════════════════════════════════════════════════════════════════════
   send-browse — CSV + EML parsers (pure: text in, HTML out)
   Extracted from send-browse--v0.3.3.js (2026-08-03) with NO behaviour change: the
   bodies below are byte-identical to the region they came from.

   Why the split: the original was 1841 lines mixing a UI component with parsers, path
   maths and DOM helpers. The base64 chunk bug (chunk=8192) survived in there for months
   precisely because none of it could be reached by a unit test. These files are plain
   globals loaded before the component — same no-build, load-order contract as the rest
   of the tree — so extracting them costs nothing at runtime and makes them testable.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function _csvToTable(text) {
    var rows = _parseCsv(text);
    if (rows.length === 0) return '<p>Empty CSV</p>';
    var html = '<table><thead><tr>';
    var headers = rows[0];
    for (var h = 0; h < headers.length; h++) html += '<th>' + _escHtml(headers[h]) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 1; r < rows.length; r++) {
        html += '<tr>';
        for (var c = 0; c < headers.length; c++) {
            html += '<td>' + _escHtml((c < rows[r].length) ? rows[r][c] : '') + '</td>';
        }
        html += '</tr>';
    }
    return html + '</tbody></table>';
}

function _parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false, i = 0;
    while (i < text.length) {
        var ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
            else if (ch === '"') { inQuotes = false; i++; }
            else { field += ch; i++; }
        } else {
            if (ch === '"') { inQuotes = true; i++; }
            else if (ch === ',') { row.push(field.trim()); field = ''; i++; }
            else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
                row.push(field.trim());
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = []; field = ''; i += (ch === '\r') ? 2 : 1;
            } else { field += ch; i++; }
        }
    }
    row.push(field.trim());
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
}

function _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── EML parser ──────────────────────────────────────────────────────────────

function _parseEml(raw) {
    var lines     = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var headers   = {};
    var headerEnd = lines.length;
    var lastKey   = null;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') { headerEnd = i + 1; break; }
        if (/^\s/.test(line) && lastKey) {
            headers[lastKey] = (headers[lastKey] || '') + ' ' + line.trim();
        } else {
            var colon = line.indexOf(':');
            if (colon > 0) {
                lastKey = line.slice(0, colon).toLowerCase().trim();
                headers[lastKey] = line.slice(colon + 1).trim();
            }
        }
    }

    var body = lines.slice(headerEnd).join('\n');
    var ct   = (headers['content-type'] || '').toLowerCase();
    var text = '', html = '';

    if (ct.startsWith('text/plain')) {
        text = _emlDecode(body, headers['content-transfer-encoding']);
    } else if (ct.startsWith('text/html')) {
        html = _emlDecode(body, headers['content-transfer-encoding']);
    } else if (ct.startsWith('multipart/')) {
        var bm = ct.match(/boundary\s*=\s*"?([^";\s\r\n]+)"?/);
        if (bm) {
            var parts = _emlSplitMultipart(body, bm[1]);
            for (var p = 0; p < parts.length; p++) {
                var sub = _parseEml(parts[p]);
                if (!html && sub.html) html = sub.html;
                if (!text && sub.text) text = sub.text;
            }
        } else {
            text = body;
        }
    } else {
        text = body;
    }

    return { headers: headers, text: text, html: html };
}

function _emlDecode(body, encoding) {
    var enc = (encoding || '').toLowerCase().trim();
    if (enc === 'quoted-printable') {
        return body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function(_, h) {
            return String.fromCharCode(parseInt(h, 16));
        });
    }
    if (enc === 'base64') {
        try { return atob(body.replace(/[\s]/g, '')); } catch (_) { return body; }
    }
    return body;
}

function _emlSplitMultipart(body, boundary) {
    var parts = [];
    var sep   = '--' + boundary;
    var lines = body.split('\n');
    var cur   = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\r$/, '');
        if (line === sep || line === sep + '--') {
            if (cur !== null) parts.push(cur.join('\n'));
            cur = (line === sep + '--') ? null : [];
        } else if (cur !== null) {
            cur.push(line);
        }
    }
    return parts;
}
