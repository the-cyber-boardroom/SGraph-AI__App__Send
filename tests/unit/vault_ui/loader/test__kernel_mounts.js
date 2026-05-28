/* Unit tests — KernelMounts (Phase 2 path resolution)
   Run: node tests/unit/vault_ui/loader/test__kernel_mounts.js  */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of ['app-permissions.js', 'kernel-mounts.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { KernelMounts } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name+(info?' — '+info:'')); } }

console.log('\n[suite] KernelMounts — resolve');
{
    const m = new KernelMounts();
    m.add({ mountId: 'm-p', prefix: 'mounts/p/', ref: 'p' });

    // M1
    const r1 = m.resolve('mounts/p/data/x.json');
    ok('M1 resolve mounts/p/data/x.json → rest=data/x.json',
        r1 && r1.mount.mountId === 'm-p' && r1.rest === 'data/x.json');

    // M2 — mount root (review N1: rest === '')
    const r2 = m.resolve('mounts/p');
    ok('M2 resolve mounts/p (root) → rest=""',
        r2 && r2.mount.mountId === 'm-p' && r2.rest === '');

    // M3 — trailing slash on input
    const r3 = m.resolve('mounts/p/');
    ok('M3 resolve mounts/p/ → rest=""', r3 && r3.rest === '');

    // M4 — non-mount path → null
    ok('M4 resolve local/file.json → null', m.resolve('local/file.json') === null);

    // M5 — longest prefix wins
    m.add({ mountId: 'm-deep', prefix: 'mounts/p/deep/', ref: 'pdeep' });
    const r5 = m.resolve('mounts/p/deep/x');
    ok('M5 longest-prefix: mounts/p/deep/x → m-deep, rest=x',
        r5 && r5.mount.mountId === 'm-deep' && r5.rest === 'x');

    // M6 — generic descent into outer mount
    const r6 = m.resolve('mounts/p/other');
    ok('M6 mounts/p/other → m-p, rest=other',
        r6 && r6.mount.mountId === 'm-p' && r6.rest === 'other');

    // M7 — absolute path normalisation
    const r7 = m.resolve('/mounts/p/data');
    ok('M7 absolute /mounts/p/data → rest=data',
        r7 && r7.mount.mountId === 'm-p' && r7.rest === 'data');

    // M8 — traversal collapse: '..' must not escape
    const r8 = m.resolve('mounts/p/../local/x');                       // collapses to 'local/x' (no mount)
    ok('M8 traversal collapse: mounts/p/../local/x → null', r8 === null);

    // M9 — add prefix without trailing slash → normalised
    const m9 = new KernelMounts();
    m9.add({ mountId: 'q', prefix: 'mounts/q' });
    ok('M9 prefix normalised to mounts/q/', m9.get('q').prefix === 'mounts/q/');

    // M10 — remove
    const m10 = new KernelMounts();
    m10.add({ mountId: 'x', prefix: 'mounts/x/' });
    m10.remove('x');
    ok('M10 remove → subsequent resolve returns null', m10.resolve('mounts/x/file') === null);

    // M11 — list / size
    const m11 = new KernelMounts();
    m11.add({ mountId: 'a', prefix: 'a/' });
    m11.add({ mountId: 'b', prefix: 'b/' });
    ok('M11 list returns 2 entries; size === 2', m11.list().length === 2 && m11.size() === 2);

    // M12 — empty / null path
    ok('M12 resolve("") → null',   m.resolve('')   === null);
    ok('M12 resolve(null) → null', m.resolve(null) === null);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
