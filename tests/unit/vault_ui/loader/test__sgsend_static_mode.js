/* SGSend static mode — reads via GET, no /batch POST, writes reject cleanly.
   Run: node tests/unit/vault_ui/loader/test__sgsend_static_mode.js

   Static mode lets a vault app run against a plain static file host (GitHub Pages / S3):
   batchLoad fans out to individual GET reads (same result shape so callers are unchanged),
   and writes throw EREADONLY instead of an opaque 405. Default OFF → behaviour unchanged. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-send/sg-send.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-send.js', displayErrors: true });
runInThisContext('globalThis.SGSend = SGSend;');
const { SGSend } = globalThis;

// btoa/atob for node (the static fan-out base64-encodes bytes to match the API shape).
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (b) => Buffer.from(b, 'base64').toString('binary');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// Fake fetch: records calls; serves GETs for a few known paths, 404s the rest.
function makeFetch(store) {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
        const method = (opts && opts.method) || 'GET';
        calls.push({ url: String(url), method });
        const m = String(url).match(/\/api\/vault\/read\/([^/]+)\/(.+)$/);
        if (method === 'GET' && m) {
            const key = m[2];
            if (key in store) {
                const bytes = store[key];
                return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
            }
            return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), text: async () => 'nf' };
        }
        // any non-GET (POST /batch, PUT write) — pretend a static host 405s
        return { ok: false, status: 405, text: async () => 'Method Not Allowed', json: async () => ({}) };
    };
    return calls;
}
const bytesOf = (s) => new TextEncoder().encode(s);

console.log('\n[suite] SGSend — static mode flag');
{
    ok('default (no opts, no global) → staticMode false', new SGSend({ endpoint: 'x' }).staticMode === false);
    ok('explicit {staticMode:true} → true', new SGSend({ endpoint: 'x', staticMode: true }).staticMode === true);
    globalThis.window = { SG_STATIC: true };
    ok('inherits window.SG_STATIC=true', new SGSend({ endpoint: 'x' }).staticMode === true);
    ok('explicit false overrides global', new SGSend({ endpoint: 'x', staticMode: false }).staticMode === false);
    delete globalThis.window;
}

console.log('\n[suite] SGSend — static batch fans out to GETs (same result shape)');
{
    const store = { 'bare/data/obj-cas-imm-aaa': bytesOf('ALPHA'), 'bare/data/obj-cas-imm-bbb': bytesOf('BETA') };
    const calls = makeFetch(store);
    const sg = new SGSend({ endpoint: 'https://pages.example', staticMode: true });
    const ops = [
        { op: 'read', file_id: 'bare/data/obj-cas-imm-aaa' },
        { op: 'read', file_id: 'bare/data/obj-cas-imm-bbb' },
        { op: 'read', file_id: 'bare/data/obj-cas-imm-missing' },
    ];
    const res = await sg.vaultBatch('vault1', null, ops);
    ok('all calls were GET (no POST /batch)', calls.every(c => c.method === 'GET'));
    ok('result is array of 3, in order', Array.isArray(res) && res.length === 3);
    ok('present objects → status ok + base64 data', res[0].status === 'ok' && atob(res[0].data) === 'ALPHA' && atob(res[1].data) === 'BETA');
    ok('missing object → status not_found (omitted by caller)', res[2].status === 'not_found');
    // The decode round-trips through the SAME path SGVaultObjectStore.batchLoad uses (_b64ToAb).
}

console.log('\n[suite] SGSend — static writes reject cleanly (no opaque 405)');
{
    makeFetch({});
    const sg = new SGSend({ endpoint: 'https://pages.example', staticMode: true });
    let e1; try { await sg.vaultWrite('v', 'bare/data/x', 'wk', new Uint8Array([1])); } catch (e) { e1 = e; }
    ok('vaultWrite rejects with EREADONLY', e1 && e1.code === 'EREADONLY');
    let e2; try { await sg.vaultDelete('v', 'bare/data/x', 'wk'); } catch (e) { e2 = e; }
    ok('vaultDelete rejects with EREADONLY', e2 && e2.code === 'EREADONLY');
    let e3; try { await sg.vaultBatch('v', 'wk', [{ op: 'write', file_id: 'x', data: 'y' }]); } catch (e) { e3 = e; }
    ok('batch with a write op rejects with EREADONLY', e3 && e3.code === 'EREADONLY');
}

console.log('\n[suite] SGSend — non-static unchanged (regression guard)');
{
    const calls = makeFetch({});
    const sg = new SGSend({ endpoint: 'https://api.example' });   // default: NOT static
    try { await sg.vaultBatch('v', null, [{ op: 'read', file_id: 'bare/data/z' }]); } catch (_) {}
    ok('non-static batch still POSTs /api/vault/batch', calls.some(c => c.method === 'POST' && /\/api\/vault\/batch\//.test(c.url)));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
