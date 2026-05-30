/* =================================================================================
   VaultSubvaultsView — pure view-model for the /vault debug "Sub-vaults" pane

   globalThis.VaultSubvaultsView — no DOM, no `this`, unit-testable in Node. Shapes the
   CompositeDataSource mount table (read-through `*.link.json` sub-vaults) into display
   rows for the vault-shell debug pane. This is the /vault analogue of the /app ViV
   "Mounts" pane: in /vault there is no kernel/broker, so we surface the *read-through*
   sub-vaults (the only "mounts" that exist here) rather than ViV cross-vault relays.

   Input is the value set of CompositeDataSource._mounts:
     { linkPath, mountPath, nodeName, link, status, access, child, vault, error }
   where status ∈ 'collapsed' | 'mounted' | 'locked' | 'error'.
   ================================================================================= */

;(function () {
    'use strict';

    function statusLabel(status) {
        switch (status) {
            case 'mounted':   return 'open';
            case 'collapsed': return 'not opened';
            case 'locked':    return 'locked';
            case 'error':     return 'error';
            default:          return status || 'unknown';
        }
    }

    // Maps to the same ok/pending/err vocabulary VivMountsView uses, so the renderer
    // can reuse the existing status colours.
    function statusClass(status) {
        if (status === 'mounted')   return 'ok';
        if (status === 'collapsed') return 'pending';
        return 'err';   // locked | error
    }

    function accessLabel(access) {
        if (access === 'rw') return 'read-write';
        if (access === 'ro') return 'read-only';
        return access || 'read-only';
    }

    // Count files a mounted child currently exposes (best-effort; null when not open).
    function _fileCount(m) {
        try {
            if (m.status === 'mounted' && m.child && typeof m.child.getFileList === 'function') {
                return m.child.getFileList().filter(function (f) { return !f.dir; }).length;
            }
        } catch (_) {}
        return null;
    }

    function rows(mounts) {
        return (mounts || []).map(function (m) {
            var st = m.status || 'collapsed';
            return {
                nodeName:    m.nodeName || (m.mountPath ? String(m.mountPath).split('/').pop() : ''),
                mountPath:   m.mountPath || '',
                linkPath:    m.linkPath || '',
                status:      st,
                statusLabel: statusLabel(st),
                statusClass: statusClass(st),
                access:      m.access || 'ro',
                accessLabel: accessLabel(m.access),
                fileCount:   _fileCount(m),
                error:       (m.error && (m.error.message || String(m.error))) || null
            };
        }).sort(function (a, b) { return a.mountPath < b.mountPath ? -1 : (a.mountPath > b.mountPath ? 1 : 0); });
    }

    function summary(mounts) {
        var s = { total: 0, open: 0, collapsed: 0, locked: 0, errors: 0 };
        (mounts || []).forEach(function (m) {
            s.total++;
            if (m.status === 'mounted')        s.open++;
            else if (m.status === 'collapsed') s.collapsed++;
            else if (m.status === 'locked')    s.locked++;
            else                               s.errors++;
        });
        return s;
    }

    function build(mounts) {
        return { rows: rows(mounts), summary: summary(mounts) };
    }

    globalThis.VaultSubvaultsView = {
        statusLabel: statusLabel,
        statusClass: statusClass,
        accessLabel: accessLabel,
        rows:        rows,
        summary:     summary,
        build:       build
    };
})();
