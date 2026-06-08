/* Unit tests — SGInbox transport client (Phase C1, v0.33.5)
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
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-inbox/sg-inbox.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'sg-inbox.js', displayErrors: true });
const SGInbox = globalThis.SGInbox;

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
    return new SGInbox(Object.assign({
        endpoint   : 'https://send.example/',          // trailing slash must be stripped
        vaultId    : 'vault1234',
        enumKey    : 'a'.repeat(64),
        writeKeyHex: 'b'.repeat(64),
        accessToken: 'tok-xyz',
        fetchImpl  : makeFetch()
    }, overrides));
}

async function main() {
    console.log('\n[suite] SGInbox — enum_key derivation');
    {
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const enumKey = await SGInbox.deriveEnumKey(bytes);
        // Independent cross-check: SHA256("sg-inbox-enum:" || bytes)
        const expected = createHash('sha256')
            .update(Buffer.concat([Buffer.from('sg-inbox-enum:'), Buffer.from(bytes)]))
            .digest('hex');
        ok('enum_key matches SHA256("sg-inbox-enum:"||read_key_bytes)', enumKey === expected);
        ok('enum_key is 64 hex chars', /^[0-9a-f]{64}$/.test(enumKey));

        const again = await SGInbox.deriveEnumKey(bytes);
        ok('enum_key derivation is deterministic', again === enumKey);

        const other = await SGInbox.deriveEnumKey(new Uint8Array([9, 9, 9]));
        ok('different read_key → different enum_key', other !== enumKey);

        await assert.rejects(() => SGInbox.deriveEnumKey(new Uint8Array(0)), /read_key bytes required/)
            .then(() => ok('empty read_key rejects (EINVAL)', true))
            .catch(() => ok('empty read_key rejects (EINVAL)', false));
    }

    console.log('\n[suite] SGInbox — enum_key_hash (what configure stores)');
    {
        const enumKey = 'a'.repeat(64);
        const hash = await SGInbox.deriveEnumKeyHash(enumKey);
        const expected = createHash('sha256').update(enumKey).digest('hex');   // server: _hash(presented_key)
        ok('enum_key_hash = SHA256(enum_key_utf8)', hash === expected);
    }

    console.log('\n[suite] SGInbox — list (enum-key header, metadata-only body)');
    {
        const c = client();
        await c.list({ limit: 25 });
        const call = c._fetch.calls[0];
        ok('list URL is /api/vault/inbox/list/{vault_id}', call.url === 'https://send.example/api/vault/inbox/list/vault1234');
        ok('list sends enum-key header', call.headers['x-sgraph-vault-enum-key'] === 'a'.repeat(64));
        ok('list does NOT send write-key', !call.headers['x-sgraph-vault-write-key']);
        ok('list omits include_content by default', call.body.include_content === undefined);
        ok('list passes through limit', call.body.limit === 25);
    }

    console.log('\n[suite] SGInbox — append (no auth headers, base64 payload)');
    {
        const c = client();
        await c.append({ vault_id: 'remote99', append_token: 'deadbeef', payload: new Uint8Array([65, 66, 67]) });
        const call = c._fetch.calls[0];
        ok('append targets the REMOTE vault_id', call.url === 'https://send.example/api/vault/inbox/append/remote99');
        ok('append sends NO enum-key header', !call.headers['x-sgraph-vault-enum-key']);
        ok('append sends NO write-key header', !call.headers['x-sgraph-vault-write-key']);
        ok('append sends NO access-token header', !call.headers['x-sgraph-access-token']);
        ok('append base64-encodes a Uint8Array payload', call.body.payload === Buffer.from([65, 66, 67]).toString('base64'));
        ok('append passes a string payload through unchanged', true);

        const c2 = client();
        await c2.append({ vault_id: 'r', append_token: 't', payload: 'QUJD' });   // already-b64
        ok('append leaves a string payload as-is', c2._fetch.calls[0].body.payload === 'QUJD');
    }

    console.log('\n[suite] SGInbox — configure (owner headers + enum_key_hash in body)');
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

    console.log('\n[suite] SGInbox — fetch / markProcessed / purge batch guard (≤100)');
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
    }

    console.log('\n[suite] SGInbox — HTTP error → coded error mapping');
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

    console.log('\n[suite] SGInbox — network failure + missing-credential guards');
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

    console.log(`\n  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
