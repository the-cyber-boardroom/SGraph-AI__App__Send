/* =================================================================================
   SgReplCore — pure parse + format for the thin SG-API REPL  (ViV pack §3.4)

   globalThis.SgReplCore — no DOM, no `this`, no async — fully unit-testable in Node.
   The REPL is a "deliberately small" operator console over the sg.* surface: file ops
   + mount inspection + broker log. NOT a shell (pack §3.4). This module only PARSES a
   command line and FORMATS results into display text; the async execution glue (which
   calls the app-shell data source / KernelParent) lives in <app-debug-repl>.

   Command set (maps 1:1 to the sg.* protocol, with bare aliases for ergonomics):
     vfs.list [path] | ls          vfs.read <path> | cat <path>
     vfs.write <path> <text…>      vfs.delete <path> | rm <path>
     mounts                        broker.log | log
     help | ?                      clear | cls
   ================================================================================= */

;(function () {
    'use strict';

    // alias → canonical command
    var ALIASES = {
        'vfs.list': 'vfs.list', 'list': 'vfs.list', 'ls': 'vfs.list',
        'vfs.read': 'vfs.read', 'read': 'vfs.read', 'cat': 'vfs.read',
        'vfs.write': 'vfs.write', 'write': 'vfs.write',
        'vfs.delete': 'vfs.delete', 'delete': 'vfs.delete', 'rm': 'vfs.delete',
        'mounts': 'mounts',
        'broker.log': 'broker.log', 'log': 'broker.log',
        'help': 'help', '?': 'help',
        'clear': 'clear', 'cls': 'clear'
    };

    // commands that require a path as the first argument
    var NEEDS_PATH = { 'vfs.read': 1, 'vfs.write': 1, 'vfs.delete': 1 };

    function parse(line) {
        var raw = String(line == null ? '' : line);
        var trimmed = raw.trim();
        if (!trimmed) return { empty: true, raw: raw };

        // First whitespace-delimited token is the command; the remainder is args. For
        // vfs.write the remainder after the path is the (space-joined) content verbatim.
        var firstSp = trimmed.search(/\s/);
        var head    = firstSp === -1 ? trimmed : trimmed.slice(0, firstSp);
        var rest    = firstSp === -1 ? ''      : trimmed.slice(firstSp + 1).trim();

        var cmd = ALIASES[head.toLowerCase()];
        if (!cmd) return { cmd: 'unknown', raw: raw, error: "unknown command: '" + head + "'  (try 'help')" };

        var args = [];
        if (cmd === 'vfs.write') {
            // <path> <text…>  — split off the first token as the path, keep the rest as text.
            var sp = rest.search(/\s/);
            if (sp === -1) { args = rest ? [rest, ''] : []; }
            else           { args = [rest.slice(0, sp), rest.slice(sp + 1)]; }
        } else if (rest) {
            args = rest.split(/\s+/);
        }

        if (NEEDS_PATH[cmd] && (!args.length || !args[0])) {
            return { cmd: cmd, raw: raw, error: cmd + ': missing <path>' };
        }
        return { cmd: cmd, args: args, raw: raw };
    }

    // Normalise a vault-relative path: strip leading '/', collapse trailing '/'.
    function normPath(p) {
        var s = String(p == null ? '' : p).trim().replace(/^\/+/, '');
        if (s.length > 1) s = s.replace(/\/+$/, '');
        return s;
    }

    function _fmtSize(n) {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Direct children of `path` from a flat file list ([{path,dir,size}]).
    function formatList(entries, path) {
        var base = normPath(path);
        var prefix = base ? base + '/' : '';
        var seen = {}, rows = [];
        (entries || []).forEach(function (e) {
            var p = normPath(e.path);
            if (prefix && p.indexOf(prefix) !== 0) return;
            var relRest = p.slice(prefix.length);
            if (!relRest) return;
            var seg = relRest.split('/')[0];
            var isDir = relRest.indexOf('/') !== -1 || e.dir;
            var key = seg + (isDir ? '/' : '');
            if (seen[key]) return;
            seen[key] = true;
            rows.push(isDir
                ? { name: seg + '/', size: '', dir: true }
                : { name: seg, size: _fmtSize(e.size), dir: false });
        });
        rows.sort(function (a, b) {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
        });
        if (!rows.length) return base ? '(empty: ' + base + ')' : '(empty)';
        return rows.map(function (r) {
            return r.dir ? r.name : (r.name + '  ' + r.size).replace(/\s+$/, '');
        }).join('\n');
    }

    function formatMounts(mounts) {
        if (!mounts || !mounts.length) return 'no kernel mounts (no child vault mounted via sg.vault.mount)';
        return mounts.map(function (m) {
            return [
                m.label || m.ref || m.mountId,
                '○ ' + (m.isolation || 'isolated'),
                (m.custody || ''),
                (m.prefix || m.mountId || '')
            ].filter(Boolean).join('   ');
        }).join('\n');
    }

    function formatLog(entries) {
        if (!entries || !entries.length) return 'broker log empty (no relayed cross-vault ops yet)';
        return entries.map(function (e) {
            var op   = e.op || e.verb || '?';
            var path = e.path || e.rest || '';
            var dec  = e.decision || '';
            var res  = e.result || (e.pending ? 'pending' : '');
            return [op, path, dec, res].filter(Boolean).join('  ');
        }).join('\n');
    }

    function help() {
        return [
            'sg REPL — small console over the sg.* surface (file ops + inspection; not a shell)',
            '  vfs.list [path]   (ls)     list a folder',
            '  vfs.read <path>   (cat)    print a text file',
            '  vfs.write <path> <text…>   write a text file (writable vaults only)',
            '  vfs.delete <path> (rm)     delete a file (writable vaults only)',
            '  mounts                     list kernel mounts (sg.vault.mount)',
            '  broker.log        (log)    print this kernel’s broker log',
            '  help (?)  ·  clear (cls)'
        ].join('\n');
    }

    globalThis.SgReplCore = {
        parse:        parse,
        normPath:     normPath,
        formatList:   formatList,
        formatMounts: formatMounts,
        formatLog:    formatLog,
        help:         help,
        COMMANDS:     ['vfs.list','vfs.read','vfs.write','vfs.delete','mounts','broker.log','help','clear']
    };
})();
