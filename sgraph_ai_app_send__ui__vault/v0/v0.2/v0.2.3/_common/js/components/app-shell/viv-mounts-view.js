/* =================================================================================
   VivMountsView — pure view-model logic for the ViV mounts + broker-log panel  (B4)

   globalThis.VivMountsView — no DOM, no `this`, fully unit-testable in Node. The
   app-debug-mounts component handles only rendering; all shaping/aggregation of the
   KernelParent's mount table + KernelBroker log lives here so it can be tested
   without a browser.

   Inputs are the shapes KernelParent.list() and KernelBroker.log() return:
     mount  : { mountId, ref, prefix, label, isolation }
     entry  : { ts, edge, mountId, op, path, credentialClass, policy, decision, result }
   ================================================================================= */

;(function () {
    'use strict';

    // A relay is "settled ok" when the child accepted and persisted; everything else
    // (pending, EPERM, ECONSENT, EPROTECTED, EUNREACH, EPROTO) is a non-ok outcome we
    // surface distinctly so an operator can see refusals vs. transport failures.
    function outcomeClass(result) {
        if (result === 'ok')      return 'ok';
        if (result === 'pending') return 'pending';
        return 'err';
    }

    function opIcon(op) {
        switch (op) {
            case 'read':   return '📖';
            case 'write':  return '✏️';
            case 'list':   return '📂';
            case 'delete': return '🗑';
            case 'mkdir':  return '📁';
            case 'move':   return '↪';
            default:       return '•';
        }
    }

    // Short, human credential tag for the log column.
    function credTag(credentialClass) {
        switch (credentialClass) {
            case 'perRequest-rw': return 'req-rw';
            case 'standing-ro':   return 'std-ro';
            case 'standing':      return 'std';
            case 'none':          return '—';
            default:              return credentialClass || '—';
        }
    }

    // Short, human-readable custody tag for the Mounts row. The full enum lives in
    // VivCustody.MODES; this is just the display fold.
    function custodyTag(c) {
        switch (c) {
            case 'parent-held':     return 'parent-held';
            case 'child-generated': return 'child-gen';
            case 'user-entered':    return 'user-typed';
            default:                return c || 'parent-held';
        }
    }

    function mountRows(mounts) {
        return (mounts || []).map(function (m) {
            var custody = m.custody || 'parent-held';
            return {
                mountId:   m.mountId,
                ref:       m.ref,
                prefix:    m.prefix,
                label:     m.label || m.ref || m.mountId,
                isolation: m.isolation || 'isolated',
                custody:   custody,
                custodyTag: custodyTag(custody)
            };
        });
    }

    // Newest-first log rows with display-ready fields.
    function logRows(entries) {
        return (entries || []).slice().sort(function (a, b) {
            return (b.ts || 0) - (a.ts || 0);
        }).map(function (e) {
            return {
                ts:        e.ts || 0,
                edge:      e.edge || '',
                mountId:   e.mountId || '',
                op:        e.op || '?',
                icon:      opIcon(e.op),
                path:      e.path || '',
                cred:      credTag(e.credentialClass),
                policy:    e.policy || '',
                decision:  e.decision || '',
                result:    e.result || '',
                cls:       outcomeClass(e.result)
            };
        });
    }

    // Operator-facing tallies over the (optionally mount-filtered) log.
    function summary(entries) {
        var s = { total: 0, ok: 0, denied: 0, errors: 0, pending: 0 };
        (entries || []).forEach(function (e) {
            s.total++;
            if (e.result === 'ok') s.ok++;
            else if (e.result === 'pending') s.pending++;
            else if (e.decision === 'deny' || e.result === 'ECONSENT') s.denied++;
            else s.errors++;
        });
        return s;
    }

    // The whole view model the component renders from.
    function build(data) {
        data = data || {};
        return {
            mounts:  mountRows(data.mounts),
            log:     logRows(data.entries),
            summary: summary(data.entries)
        };
    }

    globalThis.VivMountsView = {
        outcomeClass: outcomeClass,
        opIcon:       opIcon,
        credTag:      credTag,
        custodyTag:   custodyTag,
        mountRows:    mountRows,
        logRows:      logRows,
        summary:      summary,
        build:        build
    };
})();
