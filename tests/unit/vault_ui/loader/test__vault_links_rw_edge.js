/* Edge-case tests — VaultLinks rw-records (persistence, corruption, isolation, concurrency)
   Run: node tests/unit/vault_ui/loader/test__vault_links_rw_edge.js
   No mocks beyond an in-memory fake vault (same shape as the main vault-links test). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const LIB = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/links/vault-links.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(LIB), 'utf8'), { filename: 'vault-links.js', displayErrors: true });
runInThisContext('globalThis.VaultLinks = VaultLinks;');
const { VaultLinks } = globalThis;

globalThis.localStorage = (function () { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
async function throws(fn) { try { await fn(); return false; } catch (_) { return true; } }

function makeFakeVault(writable) {
    const files = {}, folders = new Set();
    const norm = p => String(p).replace(/^\//, '').replace(/\/$/, '');
    return {
        writable, pushed: 0, _files: files, _folders: folders,
        needsLoading() { return false; },
        async loadSubTreeOnDemand() {},
        listFolder(p) { const k = norm(p); return folders.has(k) ? Object.keys(files[k] || {}).map(n => ({ name: n })) : null; },
        async createFolder(p) { folders.add(norm(p)); },
        async getFile(folder, name) { const k = norm(folder); if (!files[k] || !(name in files[k])) throw new Error('ENOENT'); return files[k][name]; },
        async addFile(folder, name, bytes) { const k = norm(folder); if (!folders.has(k)) throw new Error('Folder not found: ' + folder); (files[k] = files[k] || {})[name] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); },
        async updateFile(folder, name, bytes) { const k = norm(folder); (files[k] = files[k] || {})[name] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); },
        async push() { this.pushed++; }
    };
}
function setRaw(vault, folder, name, text) {
    const k = String(folder).replace(/^\//, '').replace(/\/$/, '');
    vault._folders.add(k);
    (vault._files[k] = vault._files[k] || {})[name] = new TextEncoder().encode(text);
}

console.log('\n[suite] VaultLinks rw-records — edge cases');

(async () => {
    // ── corrupt rw-links.json → loadRwLinks returns {} (never throws) ──
    {
        const v = makeFakeVault(true);
        setRaw(v, '.vault/owner', 'rw-links.json', '{ this is not json');
        ok('corrupt rw-links.json → {} (no throw)', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}');
        setRaw(v, '.vault/owner', 'rw-links.json', '[1,2,3]');
        ok('array rw-links.json → {} (rejected, not crash)', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}');
        setRaw(v, '.vault/owner', 'rw-links.json', 'null');
        ok('null rw-links.json → {}', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}');
        setRaw(v, '.vault/owner', 'rw-links.json', '"a string"');
        ok('string rw-links.json → {}', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}');
    }

    // ── absent file → {} and resolveRwRef → null ──
    {
        const v = makeFakeVault(true);
        ok('absent rw-links → {}', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}');
        ok('resolveRwRef on absent file → null', (await VaultLinks.resolveRwRef(v, 'x')) === null);
        ok('loadRwLinks(null vault) → {}', JSON.stringify(await VaultLinks.loadRwLinks(null)) === '{}');
        ok('resolveRwRef(null vault) → null', (await VaultLinks.resolveRwRef(null, 'x')) === null);
        ok('resolveRwRef(no refId) → null', (await VaultLinks.resolveRwRef(v, '')) === null);
    }

    // ── every plaintext-key field variant is refused ──
    {
        const v = makeFakeVault(true);
        for (const bad of ['key', 'full_key', 'vault_key']) {
            const rec = { sealed_key: 'ok', vault_id: 'cv' }; rec[bad] = 'apple-river-1234:cv';
            ok('saveRwRecord refuses plaintext field "' + bad + '"', await throws(() => VaultLinks.saveRwRecord(v, 'r', rec)));
        }
        ok('saveRwRecord refuses missing sealed_key', await throws(() => VaultLinks.saveRwRecord(v, 'r', { vault_id: 'cv' })));
        ok('saveRwRecord refuses empty sealed_key', await throws(() => VaultLinks.saveRwRecord(v, 'r', { sealed_key: '' })));
        ok('saveRwRecord refuses missing refId', await throws(() => VaultLinks.saveRwRecord(v, '', { sealed_key: 'x' })));
        ok('nothing was written after refusals', JSON.stringify(await VaultLinks.loadRwLinks(v)) === '{}' && v.pushed === 0);
    }

    // ── merge semantics: many records coexist; update in place; unaffected siblings preserved ──
    {
        const v = makeFakeVault(true);
        for (let i = 0; i < 10; i++) await VaultLinks.saveRwRecord(v, 'r' + i, { vault_id: 'v' + i, sealed_key: 'S' + i });
        let rw = await VaultLinks.loadRwLinks(v);
        ok('10 records all present', Object.keys(rw).length === 10 && rw.r7.sealed_key === 'S7');
        // update r5 in place
        await VaultLinks.saveRwRecord(v, 'r5', { vault_id: 'v5', sealed_key: 'S5-updated' });
        rw = await VaultLinks.loadRwLinks(v);
        ok('update in place keeps count at 10', Object.keys(rw).length === 10);
        ok('updated record has new sealed_key', rw.r5.sealed_key === 'S5-updated');
        ok('sibling untouched by update', rw.r6.sealed_key === 'S6');
    }

    // ── delete semantics ──
    {
        const v = makeFakeVault(true);
        await VaultLinks.saveRwRecord(v, 'a', { vault_id: 'va', sealed_key: 'SA' });
        await VaultLinks.saveRwRecord(v, 'b', { vault_id: 'vb', sealed_key: 'SB' });
        await VaultLinks.deleteRwRecord(v, 'a');
        let rw = await VaultLinks.loadRwLinks(v);
        ok('delete removes target only', !rw.a && !!rw.b);
        const before = v.pushed;
        await VaultLinks.deleteRwRecord(v, 'a');                 // already gone
        ok('delete of absent ref is idempotent (still pushes a no-op-safe write or returns)', !(await VaultLinks.loadRwLinks(v)).a);
        ok('delete read-only vault throws', await throws(() => VaultLinks.deleteRwRecord(makeFakeVault(false), 'b')));
        ok('delete with no refId throws', await throws(() => VaultLinks.deleteRwRecord(v, '')));
    }

    // ── ro/rw isolation: writing rw never disturbs ro and vice-versa ──
    {
        const v = makeFakeVault(true);
        await VaultLinks.saveRoRecord(v, 'shared', { type: 'vault', read_key: 'RK', ref_file_id: 'rf', vault_id: 'cv' });
        await VaultLinks.saveRwRecord(v, 'shared', { vault_id: 'cv', sealed_key: 'SEALED' });
        await VaultLinks.saveRoRecord(v, 'ro-only', { type: 'vault', read_key: 'RK2', ref_file_id: 'rf2', vault_id: 'cv2' });
        const ro = await VaultLinks.loadRoLinks(v), rw = await VaultLinks.loadRwLinks(v);
        ok('ro store unaffected by rw writes', ro['shared'].read_key === 'RK' && ro['ro-only'].read_key === 'RK2');
        ok('rw store has only its own ref', !!rw['shared'] && !rw['ro-only']);
        ok('ro record carries no sealed_key', !ro['shared'].sealed_key);
        ok('rw record carries no read_key', !rw['shared'].read_key);
        // they are separate files on disk
        ok('two distinct owner files exist', !!v._files['.vault/owner']['ro-links.json'] && !!v._files['.vault/owner']['rw-links.json']);
    }

    // ── sequential writes serialize correctly (load-modify-save chain) ──
    {
        const v = makeFakeVault(true);
        // interleave saves; each must read the latest and merge
        await VaultLinks.saveRwRecord(v, 'x', { vault_id: 'vx', sealed_key: 'X1' });
        await VaultLinks.saveRwRecord(v, 'y', { vault_id: 'vy', sealed_key: 'Y1' });
        await VaultLinks.saveRwRecord(v, 'x', { vault_id: 'vx', sealed_key: 'X2' });
        const rw = await VaultLinks.loadRwLinks(v);
        ok('serialized writes: x updated, y preserved', rw.x.sealed_key === 'X2' && rw.y.sealed_key === 'Y1');
        ok('one push per save', v.pushed === 3);
    }

    // ── owner folder is auto-created when missing ──
    {
        const v = makeFakeVault(true);   // no folders pre-created
        await VaultLinks.saveRwRecord(v, 'z', { vault_id: 'vz', sealed_key: 'Z' });
        ok('saveRwRecord creates .vault/owner and writes', !!(await VaultLinks.resolveRwRef(v, 'z')));
    }

    // ── label/extra fields round-trip but are optional ──
    {
        const v = makeFakeVault(true);
        await VaultLinks.saveRwRecord(v, 'lbl', { vault_id: 'vl', label: 'Patient: Açme 🏥', sealed_key: 'L' });
        const rec = await VaultLinks.resolveRwRef(v, 'lbl');
        ok('label (unicode) round-trips', rec.label === 'Patient: Açme 🏥');
        await VaultLinks.saveRwRecord(v, 'nolbl', { sealed_key: 'N' });   // minimal record
        ok('minimal record (sealed_key only) accepted', !!(await VaultLinks.resolveRwRef(v, 'nolbl')));
    }

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
