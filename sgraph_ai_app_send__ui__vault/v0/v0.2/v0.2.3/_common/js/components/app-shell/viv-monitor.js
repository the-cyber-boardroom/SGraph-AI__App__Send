/* =================================================================================
   VivMonitor — monitored-mode child visibility  (gap-doc B7, pack §4.7 row D)

   The pack: "parent can request a read-only view of child's broker log (only for
   child kernels it spawned)". The "only for child kernels it spawned" half is
   structurally guaranteed — only the parent holds the SecureChannel to that
   child. What this module adds is the *protocol* + *fail-closed default*:

       The child opts into monitoring (or not). If it has not opted in, the
       parent's broker.log request returns ECONSENT — no log leakage by default.

   This matches the B10 pattern: the *mechanism* ships now, *policy* (which
   children opt in, when, surfaced where in the UI) stays a product decision.

   globalThis.VivMonitor:
     MODES                         frozen enum {CLOSED, OPT_IN}
     registerOnChannel(channel, broker, opts)
                                   child side. Registers a 'broker.log' handler that
                                   returns { mode, entries }. Defaults to CLOSED →
                                   handler answers ECONSENT, broker is never read.
     requestLog(channel)           parent side. Returns { mode, entries }. Throws
                                   on ECONSENT so callers can surface "not exposed".
   ================================================================================= */

;(function () {
    'use strict';

    var MODES = Object.freeze({
        CLOSED: 'closed',     // default — broker.log request → ECONSENT
        OPT_IN: 'opt-in'      // child agrees to expose its broker log to its parent
    });

    function codeError(code, msg) { var e = new Error(msg); e.code = code; return e; }

    // Child side. Registers the responder for 'broker.log'. The returned object exposes
    // setMode() so the child app code (or its bootstrap) can flip CLOSED ↔ OPT_IN at
    // runtime — the policy is mutable; the default is not.
    function registerOnChannel(channel, broker, opts) {
        if (!channel || typeof channel.handle !== 'function') {
            throw new Error('VivMonitor.registerOnChannel: channel.handle required');
        }
        if (!broker || typeof broker.log !== 'function') {
            throw new Error('VivMonitor.registerOnChannel: broker.log required');
        }
        opts = opts || {};
        var mode = (opts.mode === MODES.OPT_IN) ? MODES.OPT_IN : MODES.CLOSED;

        channel.handle('broker.log', function (p) {
            if (mode !== MODES.OPT_IN) {
                // Fail-closed: do NOT return [] (which would look like "no activity").
                // ECONSENT is the same code the broker uses for denied relays — a parent
                // showing the result can render it as "child has not opted into monitoring".
                throw codeError('ECONSENT', 'child has not opted into monitoring');
            }
            // Optional mountId filter — same semantics as broker.log({ mountId }) locally.
            var entries = broker.log(p && p.mountId ? { mountId: p.mountId } : undefined);
            // The log is metadata-only by KernelBroker's contract; we still pass through
            // verbatim so the parent sees the same shape as a local log() call.
            return { mode: mode, entries: entries };
        });

        return {
            mode:    function () { return mode; },
            setMode: function (next) {
                if (next !== MODES.CLOSED && next !== MODES.OPT_IN) {
                    throw new Error('VivMonitor.setMode: invalid mode ' + next);
                }
                mode = next;
            }
        };
    }

    // Parent side. Returns { mode, entries } when the child is opted-in; throws
    // ECONSENT when it is not. Callers should catch and render appropriately.
    function requestLog(channel, opts) {
        if (!channel || typeof channel.request !== 'function') {
            throw new Error('VivMonitor.requestLog: channel.request required');
        }
        opts = opts || {};
        var payload = opts.mountId ? { mountId: opts.mountId } : {};
        return channel.request('broker.log', payload);
    }

    globalThis.VivMonitor = {
        MODES:             MODES,
        registerOnChannel: registerOnChannel,
        requestLog:        requestLog
    };
})();
