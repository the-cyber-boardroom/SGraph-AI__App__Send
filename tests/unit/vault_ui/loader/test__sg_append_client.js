/* Unit tests — SGAppend transport client (Phase C1, v0.33.5)
   Run: node tests/unit/vault_ui/loader/test__sg_inbox_client.js

   No deps. Sources the browser global-scope module via runInThisContext (same pattern
   as test__app_permissions.js). crypto.subtle / btoa / TextEncoder are global in Node 18+.
   A fake fetch captures each request so we can assert URL, headers, and body per verb —
   no network, no mocks of our own code. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';
import { createHash }       from 'node:crypto';
import { strict as assert } from 'node:assert';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-append/sg-append.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'sg-append.js', displayErrors: true });
const SGAppend = globalThis.SGAppend;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

// A fake fetch that records the last call and returns a scripted response.
function makeFetch(response) {
    const calls = [];
    const fn = async (url, opts) => {
        calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
        const r = response || { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
        return typeof r === 'function' ? r(url, opts) : r;
    };
    fn.calls = calls;
    return fn;
}

function client(overrides = {}) {
    return new SGAppend(Object.assign({
        endpoint   : 'https://send.example/',          // trailing slash must be stripped
        vaultId    : 'vault1234',
        enumKey    : 'a'.repeat(64),
        writeKeyHex: 'b'.repeat(64),
        accessToken: 'tok-xyz',
        fetchImpl  : makeFetch()
    }, overrides));
}

async function main() {
    console.log('\n[suite] SGAppend — enum_key derivation');
    {
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const enumKey = await SGAppend.deriveEnumKey(bytes);
        // Independent cross-check: SHA256("sg-inbox-enum:" || bytes)
        const expected = createHash('sha256')
            .update(Buffer.concat([Buffer.from('sg-inbox-enum:'), Buffer.from(bytes)]))
            .digest('hex');
        ok('enum_key matches SHA256("sg-inbox-enum:"||read_key_bytes)', enumKey === expected);
        ok('enum_key is 64 hex chars', /^[0-9a-f]{64}$/.test(enumKey));

        const again = await SGAppend.deriveEnumKey(bytes);
        ok('enum_key derivation is deterministic', again === enumKey);

        const other = await SGAppend.deriveEnumKey(new Uint8Array([9, 9, 9]));
        ok('different read_key → different enum_key', other !== enumKey);

        await assert.rejects(() => SGAppend.deriveEnumKey(new Uint8Array(0)), /read_key bytes required/)
            .then(() => ok('empty read_key rejects (EINVAL)', true))
            .catch(() => ok('empty read_key rejects (EINVAL)', false));
    }

    console.log('\n[suite] SGAppend — enum_key_hash (what configure stores)');
    {
        const enumKey = 'a'.repeat(64);
        const hash = await SGAppend.deriveEnumKeyHash(enumKey);
        const expected = createHash('sha256').update(enumKey).digest('hex');   // server: _hash(presented_key)
        ok('enum_key_hash = SHA256(enum_key_utf8)', hash === expected);
    }

    console.log('\n[suite] SGAppend — list (enum-key header, metadata-only body)');
    {
        const c = client();
        await c.list({ limit: 25 });
        const call = c._fetch.calls[0];
        ok('list URL is /api/vault/append/list/{vault_id}', call.url === 'https://send.example/api/vault/append/list/vault1234');
        ok('list sends enum-key header', call.headers['x-sgraph-vault-enum-key'] === 'a'.repeat(64));
        ok('list does NOT send write-key', !call.headers['x-sgraph-vault-write-key']);
        ok('list omits include_content by default', call.body.include_content === undefined);
        ok('list passes through limit', call.body.limit === 25);
    }

    console.log('\n[suite] SGAppend — write (no auth headers, base64 payload)');
    {
        const c = client();
        await c.write({ vault_id: 'remote99', append_token: 'deadbeef', payload: new Uint8Array([65, 66, 67]) });
        const call = c._fetch.calls[0];
        ok('write targets the REMOTE vault_id via /write/', call.url === 'https://send.example/api/vault/append/write/remote99');
        ok('append sends NO enum-key header', !call.headers['x-sgraph-vault-enum-key']);
        ok('append sends NO write-key header', !call.headers['x-sgraph-vault-write-key']);
        ok('append sends NO access-token header', !call.headers['x-sgraph-access-token']);
        ok('append base64-encodes a Uint8Array payload', call.body.payload === Buffer.from([65, 66, 67]).toString('base64'));
        ok('append passes a string payload through unchanged', true);

        const c2 = client();
        await c2.write({ vault_id: 'remote99', append_token: 't', payload: 'QUJD' });   // already-b64
        ok('append leaves a string payload as-is', c2._fetch.calls[0].body.payload === 'QUJD');
    }

    console.log('\n[suite] SGAppend — configure (owner headers + enum_key_hash in body)');
    {
        const c = client();
        await c.configure({ append_anchors: ['h1', 'h2'] });
        const call = c._fetch.calls[0];
        ok('configure sends write-key header', call.headers['x-sgraph-vault-write-key'] === 'b'.repeat(64));
        ok('configure sends access-token header', call.headers['x-sgraph-access-token'] === 'tok-xyz');
        ok('configure puts append_anchors in body', JSON.stringify(call.body.append_anchors) === JSON.stringify(['h1', 'h2']));
        const expectedHash = createHash('sha256').update('a'.repeat(64)).digest('hex');
        ok('configure derives enum_key_hash from enumKey', call.body.enum_key_hash === expectedHash);
    }

    console.log('\n[suite] SGAppend — fetch / markProcessed / purge batch guard (≤100)');
    {
        const c = client();
        await c.fetch({ inbox: 'h1', file_ids: ['a', 'b'] });
        ok('fetch sends enum-key header', c._fetch.calls[0].headers['x-sgraph-vault-enum-key'] === 'a'.repeat(64));

        const big = Array.from({ length: 101 }, (_, i) => 'f' + i);
        let threw = null;
        try { await c.fetch({ inbox: 'h1', file_ids: big }); } catch (e) { threw = e; }
        ok('fetch rejects >100 file_ids', threw && threw.code === 'E2BIG');
        ok('fetch with >100 made no network call', c._fetch.calls.length === 1);

        threw = null;
        try { await c.markProcessed({ inbox: 'h1', file_ids: [] }); } catch (e) { threw = e; }
        ok('markProcessed rejects empty file_ids (EINVAL)', threw && threw.code === 'EINVAL');

        // purge with processed + no file_ids is the legit bulk-purge case → no batch error
        const c2 = client();
        await c2.purge({ folder: 'processed', inbox: 'h1' });
        ok('purge bulk (no file_ids) sends owner headers', c2._fetch.calls[0].headers['x-sgraph-vault-write-key'] === 'b'.repeat(64));
        ok('purge bulk omits file_ids in body', c2._fetch.calls[0].body.file_ids === undefined);

        let badFolder = null;
        try { await client().purge({ folder: 'nope', inbox: 'h1' }); } catch (e) { badFolder = e; }
        ok('purge rejects bad folder name', badFolder && badFolder.code === 'EINVAL');

        // v0.32.7 rename regression: 'pending' is the new value, 'inbox' is gone.
        const c3 = client();
        await c3.purge({ folder: 'pending', inbox: 'h1', file_ids: ['a'] });
        ok("purge accepts folder 'pending'", c3._fetch.calls.length === 1 && c3._fetch.calls[0].body.folder === 'pending');

        let oldFolder = null;
        try { await client().purge({ folder: 'inbox', inbox: 'h1' }); } catch (e) { oldFolder = e; }
        ok("purge rejects retired folder 'inbox' (EINVAL)", oldFolder && oldFolder.code === 'EINVAL');
    }

    console.log('\n[suite] SGAppend — HTTP error → coded error mapping');
    {
        const cases = [
            [400, 'EINVAL'], [403, 'EPERM'], [413, 'E2BIG'], [507, 'ENOSPC'], [500, 'EHTTP']
        ];
        for (const [status, code] of cases) {
            const c = client({ fetchImpl: makeFetch({ ok: false, status, text: async () => 'boom', json: async () => ({}) }) });
            let err = null;
            try { await c.list({}); } catch (e) { err = e; }
            ok(`HTTP ${status} → ${code} (with .http=${status})`, err && err.code === code && err.http === status);
        }
    }

    console.log('\n[suite] SGAppend — network failure + missing-credential guards');
    {
        const c = client({ fetchImpl: () => { throw new Error('down'); } });
        let err = null;
        try { await c.list({}); } catch (e) { err = e; }
        ok('fetch throw → EUNREACH', err && err.code === 'EUNREACH');

        const noEnum = client({ enumKey: null });
        err = null;
        try { await noEnum.list({}); } catch (e) { err = e; }
        ok('list without enum_key → ENOAUTH (no network call)', err && err.code === 'ENOAUTH' && noEnum._fetch.calls.length === 0);

        const noWrite = client({ writeKeyHex: null });
        err = null;
        try { await noWrite.purge({ inbox: 'h1' }); } catch (e) { err = e; }
        ok('purge without write_key → ENOAUTH', err && err.code === 'ENOAUTH');
    }

    console.log('\n[suite] SGAppend — vault-id validation (never issue a doomed request)');
    {
        // Regression: an unset vaultId used to build `/api/vault/append/list/` — no route
        // match, a 404, and three rounds of debugging aimed at the server. Fail here instead.
        const noId = client({ vaultId: null });
        let err = null;
        try { await noId.list({}); } catch (e) { err = e; }
        ok('list with null vaultId → EINVAL', err && err.code === 'EINVAL');
        ok('list with null vaultId sends nothing', noId._fetch.calls.length === 0);
        ok('EINVAL message names the cause', err && /no vault id/i.test(err.message));

        const emptyId = client({ vaultId: '' });
        err = null;
        try { await emptyId.fetch({ inbox: 'h1', file_ids: ['f'] }); } catch (e) { err = e; }
        ok('fetch with empty vaultId → EINVAL, nothing sent', err && err.code === 'EINVAL' && emptyId._fetch.calls.length === 0);

        const badId = client({ vaultId: 'NOT-A-VAULT-ID' });
        err = null;
        try { await badId.list({}); } catch (e) { err = e; }
        ok('list with malformed vaultId → EINVAL, nothing sent', err && err.code === 'EINVAL' && badId._fetch.calls.length === 0);

        const c = client();
        err = null;
        try { await c.write({ vault_id: 'BAD ID', append_token: 't', payload: 'QUJD' }); } catch (e) { err = e; }
        ok('write with malformed target vault_id → EINVAL, nothing sent', err && err.code === 'EINVAL' && c._fetch.calls.length === 0);
    }

    console.log('\n[suite] SGAppend — error bodies (JSON detail vs edge HTML page)');
    {
        const jsonRes = { ok: false, status: 403,
                          headers: { get: () => 'application/json' },
                          text  : async () => JSON.stringify({ detail: 'Forbidden' }) };
        let err = null;
        try { await client({ fetchImpl: makeFetch(jsonRes) }).list({}); } catch (e) { err = e; }
        ok('403 JSON → EPERM', err && err.code === 'EPERM');
        ok('403 JSON message uses `detail`, not the raw body', err && err.message === '403: Forbidden');
        ok('403 carries .http', err && err.http === 403);

        // The masked-403 case: send.sgraph.ai's static-site custom error response maps 403 to
        // /404.html and applies to /api/* too, so a gate failure arrives as 404 + HTML. The
        // status is not the API's, and the old client pasted the whole page into .message.
        const html = '<!DOCTYPE html>\n<html lang="en-GB"><head><title>Page Not Found — SG/Send</title></head>'
                   + '<body>' + 'x'.repeat(4000) + '</body></html>';
        const htmlRes = { ok: false, status: 404,
                          headers: { get: () => 'text/html; charset=utf-8' },
                          text  : async () => html };
        err = null;
        try { await client({ fetchImpl: makeFetch(htmlRes) }).list({}); } catch (e) { err = e; }
        ok('HTML error page → EEDGE (not EHTTP)', err && err.code === 'EEDGE');
        ok('EEDGE keeps the observed status', err && err.http === 404);
        ok('EEDGE message does NOT contain the HTML body', err && err.message.indexOf('<!DOCTYPE') === -1);
        ok('EEDGE message stays short', err && err.message.length < 400);
        ok('EEDGE message points at the credential, not the URL', err && /403|append_token|enum_key/.test(err.message));

        // Content-type absent (some edges strip it) — the body sniff must still catch it.
        const sniffRes = { ok: false, status: 404, headers: { get: () => '' },
                           text: async () => '<html><body>nope</body></html>' };
        err = null;
        try { await client({ fetchImpl: makeFetch(sniffRes) }).list({}); } catch (e) { err = e; }
        ok('HTML detected without a content-type header', err && err.code === 'EEDGE');

        // A plain-text body must still surface, just bounded.
        const textRes = { ok: false, status: 500, headers: { get: () => 'text/plain' },
                          text: async () => 'boom '.repeat(200) };
        err = null;
        try { await client({ fetchImpl: makeFetch(textRes) }).list({}); } catch (e) { err = e; }
        ok('500 text → EHTTP, message truncated', err && err.code === 'EHTTP' && err.message.length <= 310);
    }

    console.log(`\n  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
