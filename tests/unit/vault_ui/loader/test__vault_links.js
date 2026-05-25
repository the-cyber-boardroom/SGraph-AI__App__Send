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

console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
