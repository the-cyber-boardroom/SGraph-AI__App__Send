/* Unit tests — DeclaredMounts (pure helpers behind boot-time, owner-declared sub-vault mounts).
   07 Sep architect analysis §5. Run: node tests/unit/vault_ui/loader/test__declared_mounts.js

   Covers: scanning *.link.json into mount specs (bad JSON, missing ref_id and external
   resource types skipped); the credential resolution ORDER that replaces the clinic.json
   trial stub — owner-secret (rw) → ro-links record (ro, as a read credential the child
   opens read-only) → device-saved key → legacy stub → null; and that a throwing source
   falls through instead of failing the mount. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (rel) => runInThisContext(readFileSync(fileURLToPath(new URL(BASE + rel, import.meta.url)), 'utf8'), { filename: rel });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
load('lib/links/vault-links.js');
load('components/app-shell/declared-mounts.js');
runInThisContext('globalThis.VaultLinks = VaultLinks;');
const { DeclaredMounts, SGVaultCrypto } = globalThis;

let pass = 0, fail = 0;
const ok  = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const enc = (o) => new TextEncoder().encode(typeof o === 'string' ? o : JSON.stringify(o));
const RK_HEX = 'ab'.repeat(32);
const RK_B64 = Buffer.from(RK_HEX, 'hex').toString('base64');

(async () => {
    console.log('\n[suite] DeclaredMounts.scan — link files → mount specs');
    {
        const files = [
            { path: 'readme.md',                    dir: false },
            { path: 'data/',                        dir: true  },
            { path: 'data.link.json',               dir: false },   // vault link at root
            { path: 'subvaults/acme.link.json',     dir: false },   // nested vault link
            { path: 'subvaults/broken.link.json',   dir: false },   // bad JSON
            { path: 'subvaults/noref.link.json',    dir: false },   // no ref_id
            { path: 'subvaults/video.link.json',    dir: false },   // external resource — not a mount
            { path: 'notes/data.link.json.bak',     dir: false }    // wrong suffix
        ];
        const bytes = {
            'data.link.json':             enc({ vault_id: 'child01', ref_id: 'lk-data', label: 'Data' }),
            'subvaults/acme.link.json':   enc({ vault_id: 'child02', ref_id: 'lk-acme' }),
            'subvaults/broken.link.json': enc('{ not json'),
            'subvaults/noref.link.json':  enc({ vault_id: 'child03' }),
            'subvaults/video.link.json':  enc({ ref_id: 'r1', type: 'youtube', url: 'https://x' })
        };
        const specs = await DeclaredMounts.scan(files, async (p) => { if (!(p in bytes)) throw new Error('ENOENT'); return bytes[p]; });
        ok('two vault links become two specs',            specs.length === 2);
        ok('root link → prefix "data", ref, label, vaultId', specs[0] && specs[0].prefix === 'data' && specs[0].ref === 'lk-data' && specs[0].label === 'Data' && specs[0].vaultId === 'child01');
        ok('nested link → prefix "subvaults/acme", label from filename', specs[1] && specs[1].prefix === 'subvaults/acme' && specs[1].label === 'acme');
        ok('bad JSON / no ref_id / external type / wrong suffix all skipped', !specs.some(s => /broken|noref|video|bak/.test(s.linkPath)));
        ok('empty or non-array input → []',               (await DeclaredMounts.scan(null, async () => null)).length === 0);
    }

    console.log('\n[suite] DeclaredMounts.resolveCredentials — ordering');
    {
        const owner  = async (ref) => ref === 'lk-rw' ? { vault_id: 'child01', key: 'pass:child01' } : null;
        const ro     = async (ref) => ref === 'lk-ro' ? { vault_id: 'child02', read_key: RK_B64, ref_file_id: 'ref-pid-muw-x' } : null;
        const stored = async (vid) => vid === 'child03' ? 'device-pass:child03' : null;
        const legacy = async (ref) => ref === 'lk-legacy' ? { vaultKey: 'clinic-pass:c4', accessToken: 'tok' } : null;
        const S = { ownerSecret: owner, roRecord: ro, storedKey: stored, legacy };

        const a = await DeclaredMounts.resolveCredentials('lk-rw', 'child01', S);
        ok('1. owner-secret → full key, rw, parent-held', a && a.vaultKey === 'pass:child01' && a.access === 'rw' && a.custody === 'parent-held' && a.source === 'owner-secret');
        const b = await DeclaredMounts.resolveCredentials('lk-ro', 'child02', S);
        ok('2. ro-links → READ credential <64hex>:<vault_id>, ro',   b && b.vaultKey === RK_HEX + ':child02' && b.access === 'ro' && b.source === 'ro-links');
        ok('   …which the child kernel/sgit parse as read-only', !!SGVaultCryptoStub(b.vaultKey));
        const c = await DeclaredMounts.resolveCredentials('lk-dev', 'child03', S);
        ok('3. device-saved key → rw, user-entered custody',       c && c.vaultKey === 'device-pass:child03' && c.custody === 'user-entered' && c.source === 'device-key');
        const d = await DeclaredMounts.resolveCredentials('lk-legacy', null, S);
        ok('4. legacy clinic.json stub is the LAST fallback',      d && d.vaultKey === 'clinic-pass:c4' && d.accessToken === 'tok' && d.source === 'legacy-stub');
        const e = await DeclaredMounts.resolveCredentials('lk-none', 'c9', S);
        ok('nothing → null (mount is skipped, never throws)',      e === null);

        // Precedence: an owner secret beats an ro record for the same ref.
        const both = { ownerSecret: async () => ({ key: 'full:c5' }), roRecord: async () => ({ vault_id: 'c5', read_key: RK_B64 }) };
        const f = await DeclaredMounts.resolveCredentials('x', 'c5', both);
        ok('owner secret wins over ro record for the same ref',   f && f.access === 'rw' && f.vaultKey === 'full:c5');

        // A THROWING source (e.g. owner-secret decrypt in a read-only parent) falls through.
        const roParent = { ownerSecret: async () => { throw new Error('write_key=null: cannot decrypt'); }, roRecord: ro };
        const g = await DeclaredMounts.resolveCredentials('lk-ro', 'child02', roParent);
        ok('read-only parent: owner-secret throws → falls to ro record (never rw, never throws)', g && g.access === 'ro');

        // ro record without a usable key / vault id → skipped, not a garbage credential.
        const badRo = { roRecord: async () => ({ read_key: 'not-base64!!' }) };
        ok('unusable ro record → null',                            (await DeclaredMounts.resolveCredentials('x', 'c6', badRo)) === null);
        ok('b64ToHex rejects non-32-byte input',                   DeclaredMounts.b64ToHex(Buffer.from('short').toString('base64')) === null);
    }

    console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();

// The read-credential shape check, without loading the crypto lib: <64hex>:<4-24 alnum>
function SGVaultCryptoStub(k) { return /^[a-f0-9]{64}:[a-z0-9]{4,24}$/.test(k); }
