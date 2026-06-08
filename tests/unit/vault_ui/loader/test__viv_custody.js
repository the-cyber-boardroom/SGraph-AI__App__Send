/* Unit tests — VivCustody (gap-doc B10, mandated invariants)
   Run: node tests/unit/vault_ui/loader/test__viv_custody.js

   Architect pack 05-implementation-plan.md §5: real PHI requires EITHER
   child-generated keys OR App-A already null. Parent-held creds in a same-origin
   App-A is the ONE combination that exposes child secrets to any same-origin
   code. This module encodes that as a fail-closed gate; the test pins the
   coupling rule. No mocks. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
{
    const p = new URL(ROOT + 'viv-custody.js', import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'viv-custody.js', displayErrors: true });
}
const VC = globalThis.VivCustody;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
function tryCatch(fn) { try { fn(); return null; } catch (err) { return err; } }

console.log('\n[suite] VivCustody — modes + origin classifier');
{
    ok('MODES is the frozen enum the pack names',
        VC.MODES.PARENT_HELD === 'parent-held' &&
        VC.MODES.CHILD_GENERATED === 'child-generated' &&
        VC.MODES.USER_ENTERED === 'user-entered');
    ok('MODES is frozen', Object.isFrozen(VC.MODES));

    ok('allow-scripts → null-origin',                VC.classifyAppFrameOrigin('allow-scripts') === 'null-origin');
    ok('allow-scripts allow-forms → null-origin',    VC.classifyAppFrameOrigin('allow-scripts allow-forms') === 'null-origin');
    ok('allow-same-origin token → same-origin',      VC.classifyAppFrameOrigin('allow-scripts allow-forms allow-same-origin') === 'same-origin');
    ok('case-insensitive',                            VC.classifyAppFrameOrigin('ALLOW-SCRIPTS ALLOW-SAME-ORIGIN') === 'same-origin');
    ok('missing spec → null-origin',                  VC.classifyAppFrameOrigin(undefined) === 'null-origin' && VC.classifyAppFrameOrigin(null) === 'null-origin');
    ok('substring not enough to match (allow-same-origin-foo invented token)',
        VC.classifyAppFrameOrigin('allow-scripts allow-same-origin-foo') === 'null-origin');
}

console.log('\n[suite] VivCustody — safe combinations pass');
{
    ok('child-generated + null-origin → ok',
        VC.check({ custodyMode: 'child-generated', appFrameOrigin: 'null-origin' }).ok === true);
    ok('child-generated + same-origin → ok (child secret never reaches parent App)',
        VC.check({ custodyMode: 'child-generated', appFrameOrigin: 'same-origin' }).ok === true);
    ok('user-entered + same-origin → ok (parent is blind to the credential)',
        VC.check({ custodyMode: 'user-entered',   appFrameOrigin: 'same-origin' }).ok === true);
    ok('parent-held + null-origin → ok (same-origin App-A is the danger, not parent-held alone)',
        VC.check({ custodyMode: 'parent-held',    appFrameOrigin: 'null-origin' }).ok === true);
}

console.log('\n[suite] VivCustody — the unsafe combination is refused by default');
{
    const res = VC.check({ custodyMode: 'parent-held', appFrameOrigin: 'same-origin' });
    ok('parent-held + same-origin → ok:false',           res.ok === false);
    ok('reason names the pack §5 invariant',             /pack §05/i.test(res.reason || ''));
    ok('reason names the SG_VIV_ALLOW_UNSAFE_SYNTHETIC escape hatch', /SG_VIV_ALLOW_UNSAFE_SYNTHETIC/.test(res.reason || ''));

    const err = tryCatch(() => VC.gate({ custodyMode: 'parent-held', appFrameOrigin: 'same-origin' }));
    ok('gate() throws EUNSAFE_CUSTODY for the unsafe combination', err && err.code === 'EUNSAFE_CUSTODY');
}

console.log('\n[suite] VivCustody — synthetic escape hatch is explicit + visible');
{
    const res = VC.check({ custodyMode: 'parent-held', appFrameOrigin: 'same-origin', allowUnsafeSynthetic: true });
    ok('explicit allowUnsafeSynthetic=true → ok',     res.ok === true);
    ok('escape hatch returns synthetic:true marker',  res.synthetic === true);
    ok('escape hatch returns the NEVER-real-data warning', /NEVER ship real data/i.test(res.warning || ''));
    // Truthy-but-not-true must NOT enable the hatch — it's a security gate, equality is the contract.
    const notTrue = VC.check({ custodyMode: 'parent-held', appFrameOrigin: 'same-origin', allowUnsafeSynthetic: 'yes' });
    ok('non-strict-true does not enable hatch (string "yes")', notTrue.ok === false);
    const numTrue = VC.check({ custodyMode: 'parent-held', appFrameOrigin: 'same-origin', allowUnsafeSynthetic: 1 });
    ok('non-strict-true does not enable hatch (number 1)', numTrue.ok === false);
}

console.log('\n[suite] VivCustody — bad inputs fail closed');
{
    ok('unknown custody mode → ok:false',
        VC.check({ custodyMode: 'made-up', appFrameOrigin: 'null-origin' }).ok === false);
    ok('unknown origin → ok:false',
        VC.check({ custodyMode: 'child-generated', appFrameOrigin: 'maybe' }).ok === false);
    ok('missing inputs → ok:false',
        VC.check({}).ok === false);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
