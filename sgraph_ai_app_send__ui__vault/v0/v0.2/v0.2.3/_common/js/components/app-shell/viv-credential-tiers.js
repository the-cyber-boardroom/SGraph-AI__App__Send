/* =================================================================================
   VivCredentialTiers — minimum tier invariant for the relay edge  (gap-doc B5 + B6)

   Pack 05-implementation-plan.md §4.7 + §5 describe a Phase 5 credential model
   (none / standing-ro / perRequest-rw). The full model needs a schema + issuance
   flow + token revocation + UI — large, deferred. What ships now is the
   *mechanism* piece, same shape as B10's custody gate:

       Destructive verbs across a mount boundary REQUIRE perRequest-rw.
       Standing credentials cannot delete. The relay refuses with
       EUNDERPRIVILEGED before mediation; no broker entry, no bring-up.

   Today's relay (kernel-parent.js) classifies an inbound request as 'standing'
   (no credential field) or 'perRequest-rw' (credential present). This module
   turns that classification into a hard gate for delete-class operations.

   globalThis.VivCredentialTiers:
     TIERS                              frozen enum NONE/STANDING/PER_REQUEST_RW
     requiredTierFor(verb)              tier required for the verb
     meets(provided, required)          ordinal compare (NONE<STANDING<PER_REQUEST_RW)
     gate({ verb, providedTier })       throws EUNDERPRIVILEGED on underprivilege
   ================================================================================= */

;(function () {
    'use strict';

    var TIERS = Object.freeze({
        NONE:           'none',
        STANDING:       'standing',
        PER_REQUEST_RW: 'perRequest-rw'
    });

    // Ordinal value — keep in sync with TIERS. The gate uses this for ≥ comparison.
    var ORDER = { 'none': 0, 'standing': 1, 'perRequest-rw': 2 };

    // Default tier required per verb. Reads/lists are free; writes need a standing
    // credential; deletes require per-request elevation. vault.delete is the most
    // destructive verb in the system (architect pack §4.4) — same tier as fs.delete.
    function requiredTierFor(verb) {
        switch (verb) {
            case 'fs.read':
            case 'fs.list':       return TIERS.NONE;
            case 'fs.write':
            case 'fs.mkdir':
            case 'fs.move':       return TIERS.STANDING;
            case 'fs.delete':
            case 'vault.delete':  return TIERS.PER_REQUEST_RW;
            // Unknown verb: refuse by defaulting to the highest tier. Same fail-closed
            // posture as VivCustody.check on unknown inputs.
            default:              return TIERS.PER_REQUEST_RW;
        }
    }

    function meets(provided, required) {
        var p = ORDER[provided], r = ORDER[required];
        if (p == null || r == null) return false;
        return p >= r;
    }

    function gate(opts) {
        opts = opts || {};
        var verb     = opts.verb;
        var provided = opts.providedTier || TIERS.NONE;
        var required = requiredTierFor(verb);
        if (meets(provided, required)) return { ok: true, required: required };
        var e = new Error('verb ' + String(verb) + ' requires tier ' + required + ' but caller provided ' + provided);
        e.code = 'EUNDERPRIVILEGED';
        e.required = required;
        e.provided = provided;
        throw e;
    }

    globalThis.VivCredentialTiers = {
        TIERS:           TIERS,
        requiredTierFor: requiredTierFor,
        meets:           meets,
        gate:            gate
    };
})();
