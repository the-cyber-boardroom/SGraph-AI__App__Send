/* =================================================================================
   VivAuditView — pure cross-kernel aggregation for the Vaults audit page  (Phase 5.1)

   globalThis.VivAuditView — no DOM, no `this`, fully unit-testable in Node. Builds on
   VivMountsView (the B4 single-kernel view-model) and aggregates the mount tables +
   broker logs of MULTIPLE kernels in the session into one operator view.

   Reach is bounded by the kernel topology: the top kernel exposes its own log directly
   (window._appDebug.vivProvider), and each DIRECT child can be polled via
   KernelParent.monitorChild(mountId) — but ONLY if the child opted into monitored mode
   (VivMonitor: default 'closed' → ECONSENT). Children that declined contribute their
   mount rows (visible from the parent's mount table) but NO log entries; they surface as
   explicit "monitoring closed" placeholders rather than empty/misleading rows. Grandchild
   kernels are NOT reachable (no central collector) — also surfaced honestly.

   Source descriptor (one per kernel the page could see):
     { kernelId, label, mounts:[…], entries:[…]|null, monitor:'top'|'opt-in'|'closed'|'unreachable' }
   ================================================================================= */

;(function () {
    'use strict';

    var V = globalThis.VivMountsView;   // sibling module — loaded before this one

    // Why a source's log is / isn't available, as an operator-facing line.
    function placeholderFor(monitor) {
        switch (monitor) {
            case 'top':         return null;   // own log — always available
            case 'opt-in':      return null;   // child opted into monitored mode
            case 'closed':      return 'monitoring closed — child has not opted in (ECONSENT)';
            case 'unreachable': return 'child unreachable — channel down or not yet handshaked';
            default:            return 'monitoring state unknown';
        }
    }

    function isAvailable(monitor) { return monitor === 'top' || monitor === 'opt-in'; }

    // Per-source summary line (mount count + whether its log is readable).
    function sourceRows(sources) {
        return (sources || []).map(function (s) {
            var monitor   = s.monitor || 'unknown';
            var available = isAvailable(monitor);
            var entries   = available ? (s.entries || []) : [];
            return {
                kernelId:   s.kernelId || '',
                label:      s.label || s.kernelId || '',
                monitor:    monitor,
                available:  available,
                placeholder: placeholderFor(monitor),
                mountCount: (s.mounts || []).length,
                entryCount: entries.length
            };
        });
    }

    // All mount rows across all sources, each tagged with its owning kernel.
    function allMounts(sources) {
        var out = [];
        (sources || []).forEach(function (s) {
            V.mountRows(s.mounts).forEach(function (row) {
                row.kernelId    = s.kernelId || '';
                row.kernelLabel = s.label || s.kernelId || '';
                out.push(row);
            });
        });
        return out;
    }

    // Merged broker log across every AVAILABLE source, newest-first, each row tagged
    // with the kernel it came from. Closed/unreachable sources contribute nothing here
    // (they show as placeholders in sourceRows instead).
    function allLog(sources) {
        var merged = [];
        (sources || []).forEach(function (s) {
            if (!isAvailable(s.monitor)) return;
            V.logRows(s.entries).forEach(function (row) {
                row.kernelId    = s.kernelId || '';
                row.kernelLabel = s.label || s.kernelId || '';
                merged.push(row);
            });
        });
        return merged.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    }

    // Filter a merged log by any subset of criteria. Missing/empty criteria are ignored.
    function filterLog(log, criteria) {
        criteria = criteria || {};
        return (log || []).filter(function (r) {
            if (criteria.kernelId        && r.kernelId        !== criteria.kernelId)        return false;
            if (criteria.mountId         && r.mountId         !== criteria.mountId)         return false;
            if (criteria.op              && r.op              !== criteria.op)              return false;
            if (criteria.decision        && r.decision        !== criteria.decision)        return false;
            if (criteria.result          && r.result          !== criteria.result)          return false;
            // cred is the display fold (req-rw/std/…) produced by VivMountsView.credTag.
            if (criteria.cred            && r.cred            !== criteria.cred)            return false;
            return true;
        });
    }

    var GROUP_KEYS = {
        mount:    function (r) { return r.mountId || '—'; },
        kernel:   function (r) { return r.kernelId || '—'; },
        op:       function (r) { return r.op || '?'; },
        decision: function (r) { return r.decision || '—'; },
        result:   function (r) { return r.result || '—'; },
        cred:     function (r) { return r.cred || '—'; }
    };

    // Group a (display-shaped) log into [{ key, rows }] buckets, newest-activity first.
    function groupLog(log, dimension) {
        var keyFn = GROUP_KEYS[dimension];
        if (!keyFn) throw new Error('VivAuditView.groupLog: unknown dimension ' + JSON.stringify(dimension));
        var buckets = {}, order = [];
        (log || []).forEach(function (r) {
            var k = keyFn(r);
            if (!buckets[k]) { buckets[k] = { key: k, rows: [], latest: 0 }; order.push(k); }
            buckets[k].rows.push(r);
            if ((r.ts || 0) > buckets[k].latest) buckets[k].latest = r.ts || 0;
        });
        return order.map(function (k) { return buckets[k]; })
            .sort(function (a, b) { return b.latest - a.latest; });
    }

    // Aggregate summary over the merged log + a roll-up of source availability.
    function summary(sources, mergedLog) {
        var entries = [];
        (mergedLog || []).forEach(function (r) {
            // reconstruct the minimal shape summary() reads (decision/result)
            entries.push({ decision: r.decision, result: r.result });
        });
        var s = V.summary(entries);
        var srcs = sources || [];
        s.kernels   = srcs.length;
        s.available = srcs.filter(function (x) { return isAvailable(x.monitor); }).length;
        s.closed    = srcs.filter(function (x) { return x.monitor === 'closed'; }).length;
        return s;
    }

    // The whole audit view model the page renders from.
    function aggregate(sources) {
        sources = sources || [];
        var mounts = allMounts(sources);
        var log    = allLog(sources);
        return {
            sources: sourceRows(sources),
            mounts:  mounts,
            log:     log,
            summary: summary(sources, log)
        };
    }

    // Distinct values for each filter dimension present in the merged log — drives the
    // filter dropdowns without the renderer needing to know the vocabularies.
    function facets(log) {
        var f = { kernelId: {}, mountId: {}, op: {}, decision: {}, result: {}, cred: {} };
        (log || []).forEach(function (r) {
            Object.keys(f).forEach(function (k) { if (r[k]) f[k][r[k]] = true; });
        });
        var out = {};
        Object.keys(f).forEach(function (k) { out[k] = Object.keys(f[k]).sort(); });
        return out;
    }

    globalThis.VivAuditView = {
        placeholderFor: placeholderFor,
        isAvailable:    isAvailable,
        sourceRows:     sourceRows,
        allMounts:      allMounts,
        allLog:         allLog,
        filterLog:      filterLog,
        groupLog:       groupLog,
        summary:        summary,
        facets:         facets,
        aggregate:      aggregate
    };
})();
