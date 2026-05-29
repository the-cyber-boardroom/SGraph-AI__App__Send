/* Unit tests — VivCredentialTiers (gap-doc B5 + B6, mandated invariants only)
   Run: node tests/unit/vault_ui/loader/test__viv_credential_tiers.js

   Architect pack §4.7 + §5: destructive verbs require per-request elevation.
   Standing credentials cannot delete. This module is the mechanism gate; the
   full credential model (issuance + revocation + UI) stays Phase 5. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
const p = new URL(ROOT + 'viv-credential-tiers.js', import.meta.url);
runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'viv-credential-tiers.js', displayErrors: true });
const VCT = globalThis.VivCredentialTiers;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
function tryCatch(fn) { try { fn(); return null; } catch (e) { return e; } }

console.log('\n[suite] VivCredentialTiers — TIERS + ordinal compare');
{
    ok('TIERS frozen + named',
        Object.isFrozen(VCT.TIERS) &&
        VCT.TIERS.NONE === 'none' && VCT.TIERS.STANDING === 'standing' && VCT.TIERS.PER_REQUEST_RW === 'perRequest-rw');

    ok('meets: NONE     ≥ NONE',                VCT.meets('none', 'none'));
    ok('meets: STANDING ≥ NONE',                VCT.meets('standing', 'none'));
    ok('meets: STANDING ≥ STANDING',            VCT.meets('standing', 'standing'));
    ok('meets: STANDING ≱ PER_REQUEST_RW',     !VCT.meets('standing', 'perRequest-rw'));
    ok('meets: PER_REQUEST_RW ≥ STANDING',      VCT.meets('perRequest-rw', 'standing'));
    ok('meets: NONE ≱ STANDING',               !VCT.meets('none', 'standing'));
    ok('meets: unknown tier → false',          !VCT.meets('???', 'standing'));
}

console.log('\n[suite] VivCredentialTiers — requiredTierFor (verb table)');
{
    ok('fs.read       → none',              VCT.requiredTierFor('fs.read')   === 'none');
    ok('fs.list       → none',              VCT.requiredTierFor('fs.list')   === 'none');
    ok('fs.write      → standing',          VCT.requiredTierFor('fs.write')  === 'standing');
    ok('fs.mkdir      → standing',          VCT.requiredTierFor('fs.mkdir')  === 'standing');
    ok('fs.move       → standing',          VCT.requiredTierFor('fs.move')   === 'standing');
    ok('fs.delete     → perRequest-rw',     VCT.requiredTierFor('fs.delete') === 'perRequest-rw');
    ok('vault.delete  → perRequest-rw',     VCT.requiredTierFor('vault.delete') === 'perRequest-rw');
    ok('unknown verb  → perRequest-rw (fail-closed)', VCT.requiredTierFor('made-up') === 'perRequest-rw');
}

console.log('\n[suite] VivCredentialTiers — gate enforces the verb table');
{
    // Reads always pass (no tier needed).
    ok('fs.read at standing → ok',          VCT.gate({ verb: 'fs.read', providedTier: 'standing' }).ok === true);
    ok('fs.read at none → ok',              VCT.gate({ verb: 'fs.read', providedTier: 'none' }).ok === true);
    // Writes pass at standing, fail at none.
    ok('fs.write at standing → ok',         VCT.gate({ verb: 'fs.write', providedTier: 'standing' }).ok === true);
    const e1 = tryCatch(() => VCT.gate({ verb: 'fs.write', providedTier: 'none' }));
    ok('fs.write at none → EUNDERPRIVILEGED', e1 && e1.code === 'EUNDERPRIVILEGED');
    ok('error carries .required + .provided', e1.required === 'standing' && e1.provided === 'none');

    // Deletes require per-request — STANDING IS NOT ENOUGH (the core B5/B6 invariant).
    const e2 = tryCatch(() => VCT.gate({ verb: 'fs.delete', providedTier: 'standing' }));
    ok('fs.delete at standing → EUNDERPRIVILEGED (the B5/B6 invariant)',
        e2 && e2.code === 'EUNDERPRIVILEGED' && e2.required === 'perRequest-rw');
    ok('fs.delete at perRequest-rw → ok',
        VCT.gate({ verb: 'fs.delete', providedTier: 'perRequest-rw' }).ok === true);
    const e3 = tryCatch(() => VCT.gate({ verb: 'vault.delete', providedTier: 'standing' }));
    ok('vault.delete at standing → EUNDERPRIVILEGED (B6)',
        e3 && e3.code === 'EUNDERPRIVILEGED' && e3.required === 'perRequest-rw');

    // Unknown verb defaults to highest tier (cannot be smuggled past at standing).
    const e4 = tryCatch(() => VCT.gate({ verb: 'fs.exfiltrate', providedTier: 'standing' }));
    ok('unknown verb at standing → EUNDERPRIVILEGED (fail-closed default)',
        e4 && e4.code === 'EUNDERPRIVILEGED');

    // Missing providedTier defaults to NONE (least privilege).
    const e5 = tryCatch(() => VCT.gate({ verb: 'fs.write' }));
    ok('missing providedTier → treated as none → EUNDERPRIVILEGED on fs.write',
        e5 && e5.code === 'EUNDERPRIVILEGED' && e5.provided === 'none');
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
