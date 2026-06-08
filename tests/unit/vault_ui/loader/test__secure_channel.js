/* Unit tests — SecureChannel (Phase 1, the live MessageChannel + handshake)
   Run: node tests/unit/vault_ui/loader/test__secure_channel.js
   No deps. Uses real crypto.subtle + Node's built-in MessageChannel. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/';
for (const f of ['secure-channel-envelope.js', 'secure-channel.js']) {
    const p = new URL(ROOT + f, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f, displayErrors: true });
}
const { SecureChannel, Envelope } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? '  — ' + info : '')); }
}
async function tryCatch(fn) { try { await fn(); return null; } catch (err) { return err; } }
function bytesEqual(a, b) {
    if (!a || !b) return false;
    a = Envelope._toU8(a); b = Envelope._toU8(b);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const PNG = Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);

// Wire two channel endpoints via a MessageChannel; return { ini, resp } once both handshakes complete.
async function pair({ sensitive = false } = {}) {
    const { port1, port2 } = new MessageChannel();
    const [ini, resp] = await Promise.all([
        SecureChannel.create(port1, { sensitiveKey: sensitive, cid: 'ch-test' }),
        SecureChannel.accept(port2, { expectSensitive: sensitive,  cid: 'ch-test' })
    ]);
    return { ini, resp };
}

console.log('\n[suite] SecureChannel — round-trip request/response');
{
    const { ini, resp } = await pair();
    resp.handle('echo', async (payload) => ({ ok: true, got: payload }));
    const out = await ini.request('echo', { x: 1 });
    ok('C1.a request/response round-trip', out && out.ok === true);
    ok('C1.b payload correctly received', out && out.got && out.got.x === 1);
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — sensitive (K1) handshake + encrypted secrets');
{
    const { ini, resp } = await pair({ sensitive: true });
    let received = null;
    resp.handle('secrets', async (p) => { received = p; return { ok: true }; });
    const result = await ini.request('secrets', { vaultKey: 'apple-river-1234:abc12345', accessToken: 'tok-789' }, { sensitive: true });
    ok('C2.a sensitive request completes (handshake OK)', result && result.ok === true);
    ok('C2.b secrets payload received in plaintext on the responder',
        received && received.vaultKey === 'apple-river-1234:abc12345' && received.accessToken === 'tok-789');
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — directional rule (review B1)');
{
    const { ini, resp } = await pair();

    // C3a — responder.request throws
    const err = await tryCatch(() => resp.request('echo', {}));
    ok('C3a responder.request throws directional error', err && /responder cannot initiate/.test(err.message));

    // C3b — responder.send('ready') reaches initiator.on('ready')
    let readySaw = null;
    ini.on('ready-test', (p) => { readySaw = p; });
    await resp.send('ready-test', { kernelId: 'k-b' });
    // give the dispatcher a tick
    await new Promise(r => setTimeout(r, 20));
    ok('C3b responder.send(event) → initiator.on(event) fires (the Phase-2 spawn handshake path)',
        readySaw && readySaw.kernelId === 'k-b');

    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — binary round-trip via live channel (review B2 / T13)');
{
    const { ini, resp } = await pair();
    resp.handle('vfs.read', async () => PNG);
    const out = await ini.request('vfs.read', { path: 'p.png' });
    ok('C5 PNG bytes round-trip through MessageChannel byte-exact', bytesEqual(out, PNG));
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — sensitive payload is encrypted on the wire (confidentiality)');
{
    // Sniff the port traffic: bytes of the plaintext must NOT appear in any envelope.
    const { port1, port2 } = new MessageChannel();
    const { port1: tap1, port2: tap2 } = new MessageChannel();
    // Simple sniffer: tee outgoing messages from ini-side port1 to tap1.
    // We can't natively tee MessagePort, so instead bind a sniffer to port2's incoming.
    const sniffed = [];
    port2.addEventListener('message', (e) => sniffed.push(e.data));
    port2.start();
    const [ini, resp] = await Promise.all([
        SecureChannel.create(port1, { sensitiveKey: true, cid: 'ch-secret' }),
        SecureChannel.accept(port2, { expectSensitive: true,  cid: 'ch-secret' })
    ]);
    resp.handle('secrets', async () => ({ ok: true }));
    const secret = 'apple-river-1234:abc12345';
    await ini.request('secrets', { vaultKey: secret }, { sensitive: true });

    // Scan sniffed envelopes for the secret bytes (as UTF-8 ASCII).
    const secretBytes = new TextEncoder().encode(secret);
    let found = false;
    for (const env of sniffed) {
        // serialise the env to a single byte buffer for searching
        if (!env || !env.payload) continue;
        const parts = [];
        if (env.payload.data instanceof Uint8Array) parts.push(env.payload.data);
        if (env.payload.ct instanceof Uint8Array)   parts.push(env.payload.ct);
        if (env.payload.iv instanceof Uint8Array)   parts.push(env.payload.iv);
        const buf = Envelope._concatBytes(...parts);
        // naive search
        outer:
        for (let i = 0; i + secretBytes.length <= buf.length; i++) {
            for (let j = 0; j < secretBytes.length; j++) {
                if (buf[i + j] !== secretBytes[j]) continue outer;
            }
            found = true;
            break;
        }
        if (found) break;
    }
    ok('C2.c plaintext secret does NOT appear in any envelope payload bytes (encrypted)', !found);

    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — concurrent requests (id correlation)');
{
    const { ini, resp } = await pair();
    resp.handle('mul', async ({ a, b }) => ({ product: a * b }));
    const results = await Promise.all([
        ini.request('mul', { a: 2, b: 3 }),
        ini.request('mul', { a: 4, b: 5 }),
        ini.request('mul', { a: 6, b: 7 }),
        ini.request('mul', { a: 8, b: 9 }),
        ini.request('mul', { a: 10, b: 11 }),
    ]);
    ok('C9 5 concurrent requests resolve with their own correct results',
        results.length === 5
            && results[0].product === 6 && results[1].product === 20
            && results[2].product === 42 && results[3].product === 72
            && results[4].product === 110);
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — error propagation');
{
    const { ini, resp } = await pair();
    resp.handle('boom', async () => { const e = new Error('nope'); e.code = 'EPERM'; throw e; });
    const err = await tryCatch(() => ini.request('boom', {}));
    ok('C10 handler throw with .code → initiator rejects with same code', err && err.code === 'EPERM');
    ok('C10 error message preserved', err && err.message === 'nope');
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — events with no listener / multiple listeners');
{
    const { ini, resp } = await pair();
    // C11 — unknown event silently dropped (no throw)
    await resp.send('unknown-event', { a: 1 });
    await new Promise(r => setTimeout(r, 10));
    ok('C11 unknown event silently dropped (no throw)', true);
    // C12 — multiple listeners
    let f1 = 0, f2 = 0;
    ini.on('beep', () => f1++);
    ini.on('beep', () => f2++);
    await resp.send('beep', {});
    await new Promise(r => setTimeout(r, 10));
    ok('C12 multiple listeners both fire', f1 === 1 && f2 === 1);
    ini.close(); resp.close();
}

console.log('\n[suite] SecureChannel — channel.close() lifecycle');
{
    const { ini, resp } = await pair();
    ini.close();
    const err = await tryCatch(() => ini.request('echo', {}));
    ok('C8 request after close → EUNREACH', err && err.code === 'EUNREACH');
    resp.close();
}

console.log(`\n[result] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);    // open MessagePorts keep the loop alive — explicit exit
