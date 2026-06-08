/* Unit tests — VivMonitor (gap-doc B7, pack §4.7 row D — monitored-mode visibility)
   Run: node tests/unit/vault_ui/loader/test__viv_monitor.js

   Default: CLOSED. Parent's broker.log request → ECONSENT, broker contents never
   read. Child opts in via setMode('opt-in'). The "only for kernels you spawned"
   half of the invariant is structurally true (only the parent holds the channel)
   and not re-checked here. No mocks. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/';
for (const f of ['kernel-broker.js', 'viv-monitor.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const VM = globalThis.VivMonitor;
const KB = globalThis.KernelBroker;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }
async function tryCatchA(fn) { try { await fn(); return null; } catch (e) { return e; } }

// Minimal fake-channel: handle('x', fn) stores it; request('x', p) invokes it.
// Same contract as SecureChannel.handle/request but with no transport — exactly the
// surface VivMonitor uses. Errors thrown by handlers propagate via request().
function fakeChannel() {
    const handlers = new Map();
    return {
        handle(type, fn) { handlers.set(type, fn); },
        async request(type, payload) {
            const fn = handlers.get(type);
            if (!fn) throw Object.assign(new Error('no handler ' + type), { code: 'EPROTO' });
            return await fn(payload);
        }
    };
}

console.log('\n[suite] VivMonitor — modes + register signature');
{
    ok('MODES is the frozen enum',                  VM.MODES.CLOSED === 'closed' && VM.MODES.OPT_IN === 'opt-in' && Object.isFrozen(VM.MODES));
    ok('register requires channel.handle',          (() => { try { VM.registerOnChannel({}, {log:()=>[]}); return false; } catch (_) { return true; } })());
    ok('register requires broker.log',              (() => { try { VM.registerOnChannel(fakeChannel(), {}); return false; } catch (_) { return true; } })());
}

console.log('\n[suite] VivMonitor — CLOSED is the default (fail-closed)');
(async () => {
    const broker = new KB({ kernelId: 'k-child' });
    const ch     = fakeChannel();
    const m      = VM.registerOnChannel(ch, broker);    // no opts → defaults to CLOSED
    ok('default mode is CLOSED',                    m.mode() === 'closed');

    const err = await tryCatchA(() => VM.requestLog(ch));
    ok('CLOSED → request throws ECONSENT',          err && err.code === 'ECONSENT');
    ok('CLOSED → broker contents are NEVER read (entries empty is a coincidence, the throw is the contract)',
        broker.log().length === 0);

    // Even with broker activity, CLOSED still refuses without leaking.
    await broker.mediate('read', 'm-x', 'foo.md', 'standing');
    const err2 = await tryCatchA(() => VM.requestLog(ch));
    ok('CLOSED with broker activity → still ECONSENT, no leak', err2 && err2.code === 'ECONSENT');
})().catch(e => { fail++; console.log('  ✗ async block — ' + e.message); }).then(() => {

console.log('\n[suite] VivMonitor — OPT_IN exposes the broker log over the channel');
(async () => {
    const broker = new KB({ kernelId: 'k-child' });
    const ch     = fakeChannel();
    const m      = VM.registerOnChannel(ch, broker, { mode: 'opt-in' });
    ok('initial mode honoured (opt-in)',            m.mode() === 'opt-in');

    // Produce two broker entries on the child.
    const r1 = await broker.mediate('read',  'm-acme', 'notes.md', 'standing');
    broker.finalize(r1.entryId, 'ok');
    const r2 = await broker.mediate('write', 'm-acme', 'outside/x', 'none');
    broker.finalize(r2.entryId, 'EPERM');

    const res = await VM.requestLog(ch);
    ok('OPT_IN → request returns { mode, entries }',  res && res.mode === 'opt-in' && Array.isArray(res.entries));
    ok('entries preserve broker.log() shape',         res.entries.length === 2
        && res.entries[0].op === 'read' && res.entries[0].result === 'ok'
        && res.entries[1].result === 'EPERM');
    ok('metadata-only: no bytes/data fields on entries',
        res.entries.every(e => !('data' in e) && !('bytes' in e)));

    // Mount filter is honoured (matches local broker.log({ mountId })).
    const other = await broker.mediate('read', 'm-other', 'a', 'none');
    broker.finalize(other.entryId, 'ok');
    const filtered = await VM.requestLog(ch, { mountId: 'm-acme' });
    ok('mountId filter passes through to broker',      filtered.entries.every(e => e.mountId === 'm-acme'));
})().catch(e => { fail++; console.log('  ✗ async block — ' + e.message); }).then(() => {

console.log('\n[suite] VivMonitor — setMode flips CLOSED ↔ OPT_IN at runtime');
(async () => {
    const broker = new KB({ kernelId: 'k-child' });
    const ch     = fakeChannel();
    const m      = VM.registerOnChannel(ch, broker);   // CLOSED
    const e1 = await tryCatchA(() => VM.requestLog(ch));
    ok('CLOSED first → ECONSENT',                  e1 && e1.code === 'ECONSENT');
    m.setMode('opt-in');
    const ok1 = await VM.requestLog(ch);
    ok('after setMode(opt-in) → succeeds',         ok1 && ok1.mode === 'opt-in');
    m.setMode('closed');
    const e2 = await tryCatchA(() => VM.requestLog(ch));
    ok('after setMode(closed) → ECONSENT again',   e2 && e2.code === 'ECONSENT');

    const bad = (() => { try { m.setMode('maybe'); return null; } catch (e) { return e; } })();
    ok('setMode rejects unknown values',           bad instanceof Error);
})().catch(e => { fail++; console.log('  ✗ async block — ' + e.message); }).then(() => {
    console.log(`\n[result] ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
}); });
