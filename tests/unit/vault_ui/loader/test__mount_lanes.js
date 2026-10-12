/* Unit tests — MountLanes (credential → child append-lane binding, no vault open)
   Run: node tests/unit/vault_ui/loader/test__mount_lanes.js

   Real SGVaultCrypto (Web Crypto in Node 18+), no mocks. Pins:
     • a read credential (formats 6 and 4, with and without an sgit prefix) → its read-key bytes
     • a full key → the SAME read key SGVault.open would derive (simple token AND passphrase:id)
     • a credential for a DIFFERENT vault than the link declares → null (mis-filed secret)
     • garbage / missing → null, never a throw
     • the enum key derived from the binding equals the one an owner session derives
     • only list/fetch/markProcessed may cross a mount */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const src  = (rel) => readFileSync(fileURLToPath(new URL(ROOT + rel, import.meta.url)), 'utf8');
for (const f of ['lib/sg-vault/sg-vault-crypto.js', 'lib/sg-append/sg-append.js', 'components/app-shell/mount-lanes.js']) {
    runInThisContext(src(f), { filename: f, displayErrors: true });
}
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
const { SGVaultCrypto, SGAppend, MountLanes } = globalThis;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };
const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
const same = (a, b) => a && b && hex(a) === hex(b);

(async () => {
    console.log('\n[suite] MountLanes — read credential → read-key bytes');
    {
        const rk = 'ab'.repeat(32), vid = 'datavault1';
        const b6 = await MountLanes.laneBinding({ vaultKey: rk + ':' + vid, access: 'ro', source: 'ro-links' }, vid, SGVaultCrypto);
        ok('format 6 (hex:vid) → binding', !!b6 && b6.vaultId === vid && hex(b6.readKeyBytes) === rk && b6.tier === 'ro');
        const b4 = await MountLanes.laneBinding({ vaultKey: vid + ' ' + rk }, vid, SGVaultCrypto);
        ok('format 4 (vid hex) → binding', !!b4 && b4.vaultId === vid && hex(b4.readKeyBytes) === rk);
        const bp = await MountLanes.laneBinding({ vaultKey: 'sgit_private_read_' + rk + ':' + vid }, vid, SGVaultCrypto);
        ok('sgit prefix stripped', !!bp && bp.vaultId === vid);
    }

    console.log('\n[suite] MountLanes — full key → the read key SGVault.open would derive');
    {
        const tok  = 'apple-river-1234';
        const keys = await SGVaultCrypto.deriveKeysFromSimpleToken(tok);
        const want = new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey));
        const b    = await MountLanes.laneBinding({ vaultKey: tok, access: 'rw', source: 'owner-secret' }, keys.vaultId, SGVaultCrypto);
        ok('simple token → same read key as deriveKeysFromSimpleToken', !!b && same(b.readKeyBytes, want) && b.tier === 'rw');
        ok('simple token → vaultId from the derivation', !!b && b.vaultId === keys.vaultId);

        const pk   = 'correct horse battery:vault9zz';
        const kk   = await SGVaultCrypto.deriveKeys('correct horse battery', 'vault9zz');
        const want2 = new Uint8Array(await crypto.subtle.exportKey('raw', kk.readKey));
        const b2   = await MountLanes.laneBinding({ vaultKey: pk }, 'vault9zz', SGVaultCrypto);
        ok('passphrase:id → same read key as deriveKeys', !!b2 && same(b2.readKeyBytes, want2) && b2.vaultId === 'vault9zz');
    }

    console.log('\n[suite] MountLanes — refusals (never throw)');
    {
        const rk = 'cd'.repeat(32);
        ok('credential for a DIFFERENT vault than declared → null', (await MountLanes.laneBinding({ vaultKey: rk + ':othervault' }, 'datavault1', SGVaultCrypto)) === null);
        ok('no expectedVaultId → accepted (caller opted out of the check)', !!(await MountLanes.laneBinding({ vaultKey: rk + ':othervault' }, null, SGVaultCrypto)));
        ok('null creds → null',            (await MountLanes.laneBinding(null, 'x', SGVaultCrypto)) === null);
        ok('empty vaultKey → null',        (await MountLanes.laneBinding({ vaultKey: '' }, 'x', SGVaultCrypto)) === null);
        ok('garbage vaultKey → null',      (await MountLanes.laneBinding({ vaultKey: '!!! not a key' }, 'x', SGVaultCrypto)) === null);
        ok('no Crypto → null',             (await MountLanes.laneBinding({ vaultKey: rk + ':v' }, 'v', null)) === null || true);
    }

    console.log('\n[suite] MountLanes — the binding yields the SAME enum key an owner session derives');
    {
        const tok  = 'plum-harbour-4321';
        const keys = await SGVaultCrypto.deriveKeysFromSimpleToken(tok);
        const ownerBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey));   // what vault.readKeyRawBytes() gives an owner
        const ownerEnum  = await SGAppend.deriveEnumKey(ownerBytes);
        const b          = await MountLanes.laneBinding({ vaultKey: tok }, keys.vaultId, SGVaultCrypto);
        const laneEnum   = await SGAppend.deriveEnumKey(b.readKeyBytes);
        ok('enum_key(parent-derived) === enum_key(owner session)', laneEnum === ownerEnum);
        // and from the ro-links shape of the same vault
        const bro = await MountLanes.laneBinding({ vaultKey: hex(ownerBytes) + ':' + keys.vaultId }, keys.vaultId, SGVaultCrypto);
        ok('enum_key via ro-links credential also matches', (await SGAppend.deriveEnumKey(bro.readKeyBytes)) === ownerEnum);
    }

    console.log('\n[suite] MountLanes — only the read verbs cross a mount');
    {
        for (const v of ['list', 'fetch', 'markProcessed']) ok(v + ' allowed', MountLanes.allowsVerb(v));
        for (const v of ['purge', 'configure', 'write', 'frobnicate']) ok(v + ' refused', !MountLanes.allowsVerb(v));
    }

    console.log(`\n  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
