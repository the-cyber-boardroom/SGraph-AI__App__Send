/* Unit tests — KernelBroker (Phase 2 per-kernel Edge 2 sidecar; entryId-keyed)
   Run: node tests/unit/vault_ui/loader/test__kernel_broker.js  */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'kernel-broker.js', import.meta.url)), 'utf8'),
    { filename: 'kernel-broker.js' }
);
const { KernelBroker } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name+(info?' — '+info:'')); } }

console.log('\n[suite] KernelBroker — default policy + mediate');
{
    // BR1
    const b = new KernelBroker({ kernelId: 'k-a' });
    ok('BR1 fs.read default → auto',   b.getPolicy('m', 'fs.read')   === 'auto');
    ok('BR1 fs.write default → ask',   b.getPolicy('m', 'fs.write')  === 'ask');
    ok('BR1 fs.delete default → ask',  b.getPolicy('m', 'fs.delete') === 'ask');
    ok('BR1 fs.mkdir default → ask',   b.getPolicy('m', 'fs.mkdir')  === 'ask');
    ok('BR1 fs.move default → ask',    b.getPolicy('m', 'fs.move')   === 'ask');

    // BR2 — auto mediate
    const r = await b.mediate('read', 'm', 'data/x.json');
    ok('BR2 mediate(read) → allow + entryId',
        r.decision === 'allow' && typeof r.entryId === 'string' && /^be-/.test(r.entryId));

    // BR3 — entryId uniqueness
    const r2 = await b.mediate('read', 'm', 'data/y.json');
    ok('BR3 distinct entryIds across consecutive mediate', r.entryId !== r2.entryId);
}

console.log('\n[suite] KernelBroker — ask policy + ui prompt');
{
    // BR4.a — ui says allow
    const yes = new KernelBroker({ kernelId: 'k', ui: { prompt: async () => 'allow' } });
    const rY = await yes.mediate('write', 'm', 'data/x');
    ok('BR4.a ui.prompt=allow → decision allow', rY.decision === 'allow');

    // BR4.b — ui says deny
    const no = new KernelBroker({ kernelId: 'k', ui: { prompt: async () => 'deny' } });
    const rN = await no.mediate('write', 'm', 'data/x');
    ok('BR4.b ui.prompt=deny → decision deny', rN.decision === 'deny');

    // BR4.c — no ui, ask policy → fail-closed (deny)
    const none = new KernelBroker({ kernelId: 'k' });
    const rC = await none.mediate('write', 'm', 'data/x');
    ok('BR4.c no ui + ask policy → deny (fail-closed)', rC.decision === 'deny');
}

console.log('\n[suite] KernelBroker — policy overrides');
{
    const b = new KernelBroker({ kernelId: 'k' });
    b.setPolicy('m', 'fs.write', 'auto');
    const r5 = await b.mediate('write', 'm', 'data/x');
    ok('BR5 setPolicy auto → mediate without prompt → allow', r5.decision === 'allow');

    b.setPolicy('m', 'fs.write', 'never');
    const r6 = await b.mediate('write', 'm', 'data/x');
    ok('BR6 setPolicy never → mediate → deny without prompt', r6.decision === 'deny');
}

console.log('\n[suite] KernelBroker — concurrent finalize by opaque entryId (review N3)');
{
    const b = new KernelBroker({ kernelId: 'k' });
    // Two concurrent ops with same (op, mountId, path)
    const a = await b.mediate('read', 'm', 'data/x');
    const c = await b.mediate('read', 'm', 'data/x');
    ok('BR7 prerequisite: two entries created with distinct ids',
        a.entryId !== c.entryId && a.decision === 'allow' && c.decision === 'allow');

    // Finalize the SECOND one first
    b.finalize(c.entryId, 'ok');
    b.finalize(a.entryId, 'EPERM');

    const entries = b.log({ mountId: 'm' });
    const eA = entries.find(e => e.entryId === a.entryId);
    const eC = entries.find(e => e.entryId === c.entryId);
    ok('BR7 entry A finalised to EPERM (closed by id, not by tuple)', eA && eA.result === 'EPERM');
    ok('BR7 entry C finalised to ok', eC && eC.result === 'ok');
}

console.log('\n[suite] KernelBroker — finalize + log resilience');
{
    const b = new KernelBroker({ kernelId: 'k' });
    // BR8 — finalize nonexistent → silent false
    ok('BR8 finalize nonexistent id → returns false, no throw', b.finalize('nope', 'ok') === false);

    // BR9 — filter by mountId
    await b.mediate('read', 'm1', 'x');
    await b.mediate('read', 'm2', 'y');
    ok('BR9 log({mountId:other}) → []', b.log({ mountId: 'other' }).length === 0);
    ok('BR9 log({mountId:m1}) → 1 entry',  b.log({ mountId: 'm1' }).length === 1);

    // BR10 — log() returns insertion order across mounts
    const all = b.log();
    ok('BR10 log() returns 2 entries in insertion order',
        all.length === 2 && all[0].mountId === 'm1' && all[1].mountId === 'm2');
}

console.log('\n[suite] KernelBroker — BrokerEntry shape + audit hygiene');
{
    const b = new KernelBroker({ kernelId: 'k-a' });
    const r = await b.mediate('write', 'm-acme', 'data/reviews.json', 'perRequest-rw');
    const e = b.log()[0];
    const fields = ['entryId', 'ts', 'edge', 'kernelId', 'mountId', 'op', 'path', 'credentialClass', 'policy', 'decision', 'result'];
    let allPresent = true;
    for (const f of fields) if (!(f in e)) { allPresent = false; break; }
    ok('BR11 BrokerEntry has all required fields', allPresent);
    ok('BR12 credentialClass recorded; no credential bytes in log',
        e.credentialClass === 'perRequest-rw' && !('token' in e) && !('credential' in e) && !('bytes' in e) && !('data' in e));
    ok('BR11 edge string format kernel▶mount', e.edge === 'k-a▶m-acme');
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
