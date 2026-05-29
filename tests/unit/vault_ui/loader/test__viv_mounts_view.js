/* Unit tests — VivMountsView (gap-doc B4, pure view-model logic)
   Run: node tests/unit/vault_ui/loader/test__viv_mounts_view.js

   The app-debug-mounts component renders the ViV mount table + broker log. All the
   shaping/aggregation is in VivMountsView so it can be tested without a browser.
   No mocks — feeds the exact shapes KernelParent.list() / KernelBroker.log() emit. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
{
    const p = new URL(ROOT + 'viv-mounts-view.js', import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'viv-mounts-view.js', displayErrors: true });
}
const V = globalThis.VivMountsView;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

console.log('\n[suite] VivMountsView — mountRows');
{
    const rows = V.mountRows([
        { mountId: 'm-acme', ref: 'acme', prefix: 'mounts/acme/', label: 'Acme', isolation: 'isolated', custody: 'child-generated' },
        { mountId: 'm-b', ref: 'b', prefix: 'mounts/b/' }   // no label/isolation/custody → defaults
    ]);
    ok('maps mountId/ref/prefix', rows[0].mountId === 'm-acme' && rows[0].prefix === 'mounts/acme/');
    ok('label falls back to ref when absent', rows[1].label === 'b');
    ok('isolation defaults to isolated', rows[1].isolation === 'isolated');
    ok('custody surfaces on the row', rows[0].custody === 'child-generated' && rows[0].custodyTag === 'child-gen');
    ok('custody defaults to parent-held when absent (matches the unsafe-by-default coupling)', rows[1].custody === 'parent-held' && rows[1].custodyTag === 'parent-held');
    ok('empty input → empty array', V.mountRows().length === 0 && V.mountRows(null).length === 0);
}

console.log('\n[suite] VivMountsView — logRows (newest-first + display fields)');
{
    const entries = [
        { ts: 100, edge: 'A▶m-b', mountId: 'm-b', op: 'read',  path: 'notes.md',     credentialClass: 'standing',      policy: 'auto', decision: 'allow', result: 'ok' },
        { ts: 300, edge: 'A▶m-b', mountId: 'm-b', op: 'write', path: 'data/r.json',  credentialClass: 'perRequest-rw', policy: 'ask',  decision: 'allow', result: 'ok' },
        { ts: 200, edge: 'A▶m-b', mountId: 'm-b', op: 'write', path: 'outside/x',    credentialClass: 'none',          policy: 'auto', decision: 'allow', result: 'EPERM' }
    ];
    const rows = V.logRows(entries);
    ok('sorted newest-first by ts', rows[0].ts === 300 && rows[1].ts === 200 && rows[2].ts === 100);
    ok('write icon mapped', rows[0].icon === '✏️');
    ok('read icon mapped', rows[2].icon === '📖');
    ok('credTag perRequest-rw → req-rw', rows[0].cred === 'req-rw');
    ok('credTag none → dash', rows[1].cred === '—');
    ok('ok result → cls ok', rows[0].cls === 'ok');
    ok('EPERM result → cls err', rows[1].cls === 'err');
    ok('preserves path + policy + result', rows[1].path === 'outside/x' && rows[1].policy === 'auto' && rows[1].result === 'EPERM');
}

console.log('\n[suite] VivMountsView — outcomeClass');
{
    ok("'ok' → ok",            V.outcomeClass('ok') === 'ok');
    ok("'pending' → pending",  V.outcomeClass('pending') === 'pending');
    ok("'EPERM' → err",        V.outcomeClass('EPERM') === 'err');
    ok("'ECONSENT' → err",     V.outcomeClass('ECONSENT') === 'err');
    ok("'EUNREACH' → err",     V.outcomeClass('EUNREACH') === 'err');
}

console.log('\n[suite] VivMountsView — summary tallies');
{
    const entries = [
        { decision: 'allow', result: 'ok' },
        { decision: 'allow', result: 'ok' },
        { decision: 'allow', result: 'EPERM' },        // child refusal → error bucket
        { decision: 'deny',  result: 'ECONSENT' },     // broker denial → denied bucket
        { decision: 'allow', result: 'pending' }        // in-flight
    ];
    const s = V.summary(entries);
    ok('total counts all', s.total === 5);
    ok('ok counts settled-ok', s.ok === 2);
    ok('denied counts broker denials', s.denied === 1);
    ok('errors counts child refusals/transport errors', s.errors === 1);
    ok('pending counts in-flight', s.pending === 1);
    ok('empty → all zero', V.summary([]).total === 0 && V.summary().total === 0);
}

console.log('\n[suite] VivMountsView — build (whole view model)');
{
    const vm = V.build({
        mounts:  [{ mountId: 'm-b', ref: 'b', prefix: 'mounts/b/' }],
        entries: [{ ts: 1, op: 'read', path: 'x', result: 'ok', decision: 'allow' }]
    });
    ok('build returns mounts + log + summary', Array.isArray(vm.mounts) && Array.isArray(vm.log) && vm.summary.total === 1);
    ok('build tolerates empty/undefined', V.build().mounts.length === 0 && V.build({}).log.length === 0);
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
