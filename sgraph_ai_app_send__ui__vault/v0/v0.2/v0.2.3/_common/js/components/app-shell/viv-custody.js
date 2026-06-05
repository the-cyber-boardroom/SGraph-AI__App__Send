/* =================================================================================
   VivCustody — credential custody invariants  (gap-doc B10, mandated subset)

   The architect pack (`05-implementation-plan.md` §5: "Custody (product, not
   mechanism)") draws a single hard line:

       Real PHI requires EITHER child-generated keys OR App-A already null.
       Parent-held child keys inside a same-origin App-A is the one combination
       that exposes the child's secrets to any same-origin code — fine for
       synthetic data, never for real data.

   This module encodes that coupling as a fail-closed invariant. It is the only
   custody-mechanism work in scope here; the credential ISSUANCE scheme
   (port-transfer vs. server-minted vs. user-typed) is a product decision and
   stays out of code until you + AppSec pick one.

   globalThis.VivCustody:
     MODES                        — frozen enum
     classifyAppFrameOrigin(spec) — 'null-origin' | 'same-origin' from a sandbox spec
     check({ custodyMode, appFrameOrigin, allowUnsafeSynthetic }) → { ok, reason? }
     gate(...) — throws EUNSAFE_CUSTODY if check fails, otherwise returns the safe row

   No DOM. Pure logic so it unit-tests in Node and the parent kernel uses the
   exact same function the tests assert against.
   ================================================================================= */

;(function () {
    'use strict';

    var MODES = Object.freeze({
        // Parent kernel holds the child vault key + token. Convenient for synthetic
        // trials (today's clinic.json reader). UNSAFE when the parent's App-A is
        // same-origin — any same-origin code in App-A can read what the parent holds.
        PARENT_HELD: 'parent-held',
        // The child generates its own keys; parent never sees a child secret. Safe
        // against same-origin App-A; this is the production posture for real data.
        CHILD_GENERATED: 'child-generated',
        // Scenario 2 in the architect pack: only the child iframe ever sees the
        // credential (a human types it into B). Parent is deliberately blind.
        USER_ENTERED: 'user-entered'
    });

    // The unsafe combination, named so the check can refuse it precisely.
    function isUnsafeCoupling(custodyMode, appFrameOrigin) {
        return custodyMode === MODES.PARENT_HELD && appFrameOrigin === 'same-origin';
    }

    // Classify a sandbox attribute spec from app-shell's iframe.sandbox = '...'.
    // Anything containing `allow-same-origin` is same-origin; anything else (including
    // missing/empty) is treated as null-origin.
    function classifyAppFrameOrigin(sandboxSpec) {
        if (sandboxSpec == null) return 'null-origin';
        var s = String(sandboxSpec).toLowerCase();
        return /(^|\s)allow-same-origin(\s|$)/.test(s) ? 'same-origin' : 'null-origin';
    }

    // The decision function. Returns { ok: true } when safe, { ok: false, reason } when not.
    function check(opts) {
        opts = opts || {};
        var mode  = opts.custodyMode;
        var origin = opts.appFrameOrigin;
        if (!mode || !Object.values(MODES).includes(mode)) {
            return { ok: false, reason: 'unknown custody mode: ' + String(mode) };
        }
        if (origin !== 'null-origin' && origin !== 'same-origin') {
            return { ok: false, reason: 'unknown app-frame origin: ' + String(origin) };
        }
        if (!isUnsafeCoupling(mode, origin)) return { ok: true };
        // The unsafe combination. Default policy: refuse. The synthetic escape hatch
        // is explicit, named, and visible — it never defaults to on.
        if (opts.allowUnsafeSynthetic === true) {
            return { ok: true, synthetic: true, warning:
                'UNSAFE custody (parent-held + same-origin App-A). Allowed only because ' +
                'allowUnsafeSynthetic=true. NEVER ship real data in this configuration.' };
        }
        return { ok: false, reason:
            'unsafe custody coupling: parent-held child credentials inside a same-origin ' +
            "App-A. Pack §05: 'real PHI requires either child-generated keys or App-A already null'. " +
            'Set SG_VIV_ALLOW_UNSAFE_SYNTHETIC=true ONLY for synthetic-data trials.' };
    }

    // The throwing wrapper the parent uses. EUNSAFE_CUSTODY is a new error code in
    // the same family as EPERM/EPROTECTED/EUNREACH — it surfaces in the broker log and
    // through the relay error path.
    function gate(opts) {
        var res = check(opts);
        if (res.ok) return res;
        var e = new Error(res.reason || 'unsafe custody');
        e.code = 'EUNSAFE_CUSTODY';
        throw e;
    }

    globalThis.VivCustody = {
        MODES:                  MODES,
        isUnsafeCoupling:       isUnsafeCoupling,
        classifyAppFrameOrigin: classifyAppFrameOrigin,
        check:                  check,
        gate:                   gate
    };
})();
