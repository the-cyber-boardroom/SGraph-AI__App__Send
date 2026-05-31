/* Unit tests — VaultLinks (sub-vault link-file convention reader, Phase 0)
   Run: node tests/unit/vault_ui/loader/test__vault_links.js
   No deps. Sources the browser global-scope module via runInThisContext (the same
   pattern as test__public_preview_crypto.js). Provides a localStorage stub. */

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

// localStorage stub (used by the key-store tests)
globalThis.localStorage = (function () {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
})();

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b)); }
const enc = s => new TextEncoder().encode(s);

console.log('\n[suite] VaultLinks — link-file convention reader');

// 1. suffix recognition (rename-off-suffix disables)
ok('isLinkFile: a.link.json',              VaultLinks.isLinkFile('demos/acme.link.json') === true);
ok('isLinkFile: rename off → plain json',  VaultLinks.isLinkFile('demos/acme.link-2.json') === false);
ok('isLinkFile: plain json is not a link', VaultLinks.isLinkFile('notes.json') === false);
ok('isLinkFile: non-string safe',          VaultLinks.isLinkFile(null) === false);

// 2. mount path + label
eq('mountPathFor strips suffix', VaultLinks.mountPathFor('subvaults/demos/acme-demo.link.json'), 'subvaults/demos/acme-demo');
eq('mountLabel uses label',      VaultLinks.mountLabel('x/acme.link.json', { label: 'Patient: Alice' }), 'Patient: Alice');
eq('mountLabel falls back to filename prefix', VaultLinks.mountLabel('x/acme-demo.link.json', null), 'acme-demo');

// 3. parseLinkFile — valid vault link (string + bytes)
const valid = VaultLinks.parseLinkFile('{"vault_id":"abcd1234","ref_id":"lk-1"}');
eq('parse: ref_id',   valid && valid.ref_id, 'lk-1');
eq('parse: vault_id', valid && valid.vault_id, 'abcd1234');
eq('parse: type defaults to vault when vault_id present', valid && valid.type, 'vault');
eq('parse: pin defaults to latest', valid && valid.pin, { mode: 'latest' });
ok('parse: accepts Uint8Array', (() => { const o = VaultLinks.parseLinkFile(enc('{"ref_id":"lk-2","vault_id":"v2"}')); return o && o.ref_id === 'lk-2'; })());
ok('parse: accepts ArrayBuffer', (() => { const o = VaultLinks.parseLinkFile(enc('{"ref_id":"lk-3","vault_id":"v3"}').buffer); return o && o.ref_id === 'lk-3'; })());

// 4. overrides + external resource
const ov = VaultLinks.parseLinkFile('{"vault_id":"v","ref_id":"lk-4","label":"L","pin":{"mode":"commit","commit":"c1"}}');
eq('parse: label override', ov && ov.label, 'L');
eq('parse: pin override',   ov && ov.pin, { mode: 'commit', commit: 'c1' });
const ext = VaultLinks.parseLinkFile('{"ref_id":"lk-5","type":"video","url":"https://youtu.be/x"}');
eq('parse: external type kept', ext && ext.type, 'video');
eq('parse: external url kept',  ext && ext.url, 'https://youtu.be/x');
ok('isVaultLink: vault yes', VaultLinks.isVaultLink(valid) === true);
ok('isVaultLink: video no',  VaultLinks.isVaultLink(ext) === false);

// 5. malformed → null (never throws)
ok('parse: bad JSON → null',       VaultLinks.parseLinkFile('{not json') === null);
ok('parse: missing ref_id → null', VaultLinks.parseLinkFile('{"vault_id":"x"}') === null);
ok('parse: array → null',          VaultLinks.parseLinkFile('[]') === null);
ok('parse: empty string → null',   VaultLinks.parseLinkFile('') === null);

// 6. localStorage child-key store ("save on this device")
VaultLinks.setStoredChildKey('abcd1234', 'apple-river-1234:abcd1234');
eq('child key round-trips', VaultLinks.getStoredChildKey('abcd1234'), 'apple-river-1234:abcd1234');
VaultLinks.setStoredChildKey('abcd1234', null);
ok('child key cleared',          VaultLinks.getStoredChildKey('abcd1234') === null);
ok('child key: unknown → null',  VaultLinks.getStoredChildKey('nope') === null);

// 7. owner records — .vault/owner/ro-links.json (read_key tier), via a fake vault
function makeFakeVault(writable) {
    const files = {}, folders = new Set();
    const norm = p => String(p).replace(/^\//, '').replace(/\/$/, '');
    return {
        writable, pushed: 0,
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

(async () => {
    const v = makeFakeVault(true);
    eq('loadRoLinks: empty → {}', await VaultLinks.loadRoLinks(v), {});
    await VaultLinks.saveRoRecord(v, 'lk-1', { type: 'vault', label: 'Alice', pin: { mode: 'latest' }, read_key: 'rk', ref_file_id: 'rf', vault_id: 'cv' });
    ok('saveRoRecord: pushed to server', v.pushed === 1);
    const ro = await VaultLinks.loadRoLinks(v);
    ok('record round-trips (read_key)', !!ro['lk-1'] && ro['lk-1'].read_key === 'rk');
    const rec = await VaultLinks.resolveRef(v, 'lk-1');
    ok('resolveRef finds record', !!rec && rec.ref_file_id === 'rf');
    ok('resolveRef unknown → null', (await VaultLinks.resolveRef(v, 'nope')) === null);
    await VaultLinks.saveRoRecord(v, 'lk-2', { type: 'vault', read_key: 'rk2', ref_file_id: 'rf2' });
    const ro2 = await VaultLinks.loadRoLinks(v);
    ok('second record merged (both present)', !!ro2['lk-1'] && !!ro2['lk-2']);

    const vRO = makeFakeVault(false);
    let threw = false; try { await VaultLinks.saveRoRecord(vRO, 'lk', {}); } catch (_) { threw = true; }
    ok('saveRoRecord on read-only vault throws', threw);

    // effectiveLink: override ?? record (key material only from the record)
    const eff = VaultLinks.effectiveLink(
        { vault_id: 'v', ref_id: 'lk', label: 'OVERRIDE' },
        { label: 'REC', pin: { mode: 'commit', commit: 'c' }, read_key: 'rk', ref_file_id: 'rf' });
    eq('effectiveLink: link label overrides record', eff.label, 'OVERRIDE');
    eq('effectiveLink: pin from record (no link override)', eff.pin, { mode: 'commit', commit: 'c' });
    eq('effectiveLink: read_key from record only', eff.read_key, 'rk');
    eq('effectiveLink: type resolves to vault', eff.type, 'vault');

    // 7b. owner records — .vault/owner/rw-links.json (owner-secret tier, key-blind)
    const vRw = makeFakeVault(true);
    eq('loadRwLinks: empty → {}', await VaultLinks.loadRwLinks(vRw), {});
    await VaultLinks.saveRwRecord(vRw, 'lk-1', { vault_id: 'cv', label: 'Alice', sealed_key: 'SEALED-BLOB-1', ref_file_id: 'rf' });
    ok('saveRwRecord: pushed to server', vRw.pushed === 1);
    const rw = await VaultLinks.loadRwLinks(vRw);
    ok('rw record round-trips (sealed_key)', !!rw['lk-1'] && rw['lk-1'].sealed_key === 'SEALED-BLOB-1');
    const rwRec = await VaultLinks.resolveRwRef(vRw, 'lk-1');
    ok('resolveRwRef finds record', !!rwRec && rwRec.vault_id === 'cv');
    ok('resolveRwRef unknown → null', (await VaultLinks.resolveRwRef(vRw, 'nope')) === null);
    await VaultLinks.saveRwRecord(vRw, 'lk-2', { vault_id: 'cv2', sealed_key: 'SEALED-BLOB-2' });
    const rw2 = await VaultLinks.loadRwLinks(vRw);
    ok('second rw record merged (both present)', !!rw2['lk-1'] && !!rw2['lk-2']);

    // rw is key-blind: a record with no sealed_key, or with a plaintext key field, is refused
    let rwThrew1 = false; try { await VaultLinks.saveRwRecord(vRw, 'lk', { vault_id: 'c' }); } catch (_) { rwThrew1 = true; }
    ok('saveRwRecord without sealed_key throws', rwThrew1);
    let rwThrew2 = false; try { await VaultLinks.saveRwRecord(vRw, 'lk', { sealed_key: 'ok', key: 'apple-river-1234:cv' }); } catch (_) { rwThrew2 = true; }
    ok('saveRwRecord with plaintext key field refused', rwThrew2);
    let rwThrew3 = false; try { await VaultLinks.saveRwRecord(vRw, 'lk', { sealed_key: 'ok', full_key: 'x' }); } catch (_) { rwThrew3 = true; }
    ok('saveRwRecord with plaintext full_key refused', rwThrew3);

    // delete (revoke parent's writable custody) — idempotent
    await VaultLinks.deleteRwRecord(vRw, 'lk-1');
    const rw3 = await VaultLinks.loadRwLinks(vRw);
    ok('deleteRwRecord removes only the target', !rw3['lk-1'] && !!rw3['lk-2']);
    const rw4 = await VaultLinks.deleteRwRecord(vRw, 'lk-1');  // already gone
    ok('deleteRwRecord idempotent (unknown ref ok)', !rw4['lk-1']);

    const vRwRO = makeFakeVault(false);
    let rwThrew4 = false; try { await VaultLinks.saveRwRecord(vRwRO, 'lk', { sealed_key: 'x' }); } catch (_) { rwThrew4 = true; }
    ok('saveRwRecord on read-only vault throws', rwThrew4);

    // ro and rw owner records are independent files (no cross-contamination)
    const vBoth = makeFakeVault(true);
    await VaultLinks.saveRoRecord(vBoth, 'shared', { type: 'vault', read_key: 'RK', ref_file_id: 'rf', vault_id: 'cv' });
    await VaultLinks.saveRwRecord(vBoth, 'shared', { vault_id: 'cv', sealed_key: 'SEALED' });
    const roSide = await VaultLinks.loadRoLinks(vBoth);
    const rwSide = await VaultLinks.loadRwLinks(vBoth);
    ok('ro file holds read_key, not sealed_key', roSide['shared'] && roSide['shared'].read_key === 'RK' && !roSide['shared'].sealed_key);
    ok('rw file holds sealed_key, not read_key', rwSide['shared'] && rwSide['shared'].sealed_key === 'SEALED' && !rwSide['shared'].read_key);

    // 8. external resources — type detection + isResourceLink
    eq('detect: youtube → video/youtube', VaultLinks.detectResourceType('https://youtu.be/abc123'), { type: 'video', provider: 'youtube' });
    eq('detect: youtube.com/watch', VaultLinks.detectResourceType('https://www.youtube.com/watch?v=abc'), { type: 'video', provider: 'youtube' });
    eq('detect: .png → image', VaultLinks.detectResourceType('https://x.example/logo.PNG'), { type: 'image', provider: null });
    eq('detect: .mp4 → video file', VaultLinks.detectResourceType('https://x.example/clip.mp4'), { type: 'video', provider: null });
    eq('detect: web page → link', VaultLinks.detectResourceType('https://clinic.example.com/info'), { type: 'link', provider: null });
    ok('isResourceLink: video link', VaultLinks.isResourceLink({ ref_id: 'r', type: 'video', url: 'https://youtu.be/x' }) === true);
    ok('isResourceLink: url-only link', VaultLinks.isResourceLink({ ref_id: 'r', url: 'https://x' }) === true);
    ok('isResourceLink: a vault is NOT a resource', VaultLinks.isResourceLink({ ref_id: 'r', vault_id: 'v' }) === false);

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
