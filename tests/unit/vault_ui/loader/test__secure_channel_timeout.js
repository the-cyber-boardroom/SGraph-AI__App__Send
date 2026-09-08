/* Unit tests — SecureChannel.create({ timeoutMs })
   Run: node tests/unit/vault_ui/loader/test__secure_channel_timeout.js

   A port whose peer never answers used to park create() forever — in the App UI that
   was a child kernel whose init message was posted before its srcdoc ran, so the mount
   relay stayed 'pending' with no error (found by the declared-mounts browser e2e).
   With timeoutMs the initiator gives up with EUNREACH and closes the port. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
for (const f of ['secure-channel-envelope.js', 'secure-channel.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { SecureChannel } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? ' — ' + info : '')); } }

console.log('\n[suite] create() with a silent peer');
{
    const { port1 } = new MessageChannel();            // port2 never accepted → nobody answers
    const t0 = Date.now();
    let err = null;
    try { await SecureChannel.create(port1, { timeoutMs: 300 }); } catch (e) { err = e; }
    const dt = Date.now() - t0;
    ok('rejects with EUNREACH', err && err.code === 'EUNREACH', err && (err.code || err.message));
    ok('…around the timeout, not forever', dt >= 250 && dt < 5000, dt + 'ms');
    ok('message names the timeout', /handshake timeout/.test(err && err.message || ''), err && err.message);
    port1.close();
}

console.log('\n[suite] create() with a real responder still completes (timeout armed)');
{
    const { port1, port2 } = new MessageChannel();
    const accepted = SecureChannel.accept(port2, { expectSensitive: true, cid: 'ch-t' });
    let err = null, ch = null;
    try { ch = await SecureChannel.create(port1, { sensitiveKey: true, timeoutMs: 5000, cid: 'ch-t' }); } catch (e) { err = e; }
    ok('handshake completes', !err && ch && ch._handshakeDone === true, err && err.message);
    const resp = await accepted;
    resp.handle('ping', async () => 'pong');
    ok('channel usable after the timed handshake', (await ch.request('ping', {})) === 'pong');
    ch.close(); resp.close();
}

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
