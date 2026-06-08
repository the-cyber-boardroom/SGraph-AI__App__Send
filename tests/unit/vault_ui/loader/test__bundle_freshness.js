/* L3 — kernel-shell-bundle.js freshness check.
   Run: node tests/unit/vault_ui/loader/test__bundle_freshness.js

   Ensures the committed kernel-shell-bundle.js is byte-identical to what the build
   script would produce RIGHT NOW. If someone edits a source listed in SCRIPTS
   without re-running build-kernel-shell-bundle.py, this test fails — preventing
   the silent "tests pass but the bundle in the browser is stale" pattern flagged
   by review L3.

   The build script supports --stdout for this test so we don't mutate the file. */

import { readFileSync }     from 'node:fs';
import { execFileSync }     from 'node:child_process';
import { fileURLToPath }    from 'node:url';

const REPO_ROOT = new URL('../../../../', import.meta.url);
const BUNDLE = fileURLToPath(new URL('sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/kernel-shell-bundle.js', REPO_ROOT));
const BUILD  = fileURLToPath(new URL('scripts/build-kernel-shell-bundle.py', REPO_ROOT));

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

console.log('\n[suite] L3 — bundle freshness vs build script');
{
    const onDisk = readFileSync(BUNDLE, 'utf8');
    const fresh  = execFileSync('python3', [BUILD, '--stdout'], { cwd: fileURLToPath(REPO_ROOT), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    ok('committed kernel-shell-bundle.js matches build output (run build-kernel-shell-bundle.py)', onDisk === fresh,
        `lengths: on-disk=${onDisk.length}, fresh=${fresh.length}`);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
