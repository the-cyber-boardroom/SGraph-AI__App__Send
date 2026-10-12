/* =================================================================================
   MountLanes — a declared mount's credential → the child's append-lane binding
   (07 Sep, follows DeclaredMounts)

   The monitoring pattern: a parent vault declares data vaults as `*.link.json` mounts; each
   data vault RECEIVES append messages from elsewhere; the parent's app wants to list, fetch
   and mark-processed those lanes. Three facts make that a top-kernel job:

     • the parent already holds each child's credential (DeclaredMounts.resolveCredentials);
     • the enum_key that gates list/fetch/mark-processed is a pure function of the child's
       READ key — SHA256("sg-inbox-enum:" || read_key_bytes) — so deriving it grants the
       parent nothing it could not already compute;
     • the child kernel opens read credentials non-extractable and carries no append
       transport at all, so it cannot do this for us.

   This module is the pure part: credential → { vaultId, readKeyBytes, tier }. It never opens
   a vault and never touches the network — a full key is derived exactly as SGVault.open does
   (parseVaultKey / deriveKeys / deriveKeysFromSimpleToken) and the read key exported; a read
   credential (formats 4/6) is decoded. app-shell wires the result to SGAppend.deriveEnumKey.

   Owner verbs (purge / configure) need the child's WRITE key and stay parent-only by design;
   this binding deliberately carries no write key.

   Depends on globalThis.SGVaultCrypto. Exposed as globalThis.MountLanes. Node-testable.
   ================================================================================= */

;(function () {
    'use strict';

    const SIMPLE_TOKEN = /^[a-z]+-[a-z]+-\d{4}$/;

    function hexToBytes(hex) {
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }

    const MountLanes = {

        // laneBinding(creds, expectedVaultId, Crypto) → Promise<{ vaultId, readKeyBytes, tier } | null>
        //   creds           — { vaultKey, access, source } as DeclaredMounts.resolveCredentials returns
        //   expectedVaultId — the link file's vault_id; a credential for a DIFFERENT vault is refused
        //                     (a mis-filed owner secret must not silently drain the wrong lane)
        //   Crypto          — SGVaultCrypto (injected for tests)
        // Returns null (never throws) when the credential cannot yield a read key.
        async laneBinding(creds, expectedVaultId, Crypto) {
            Crypto = Crypto || globalThis.SGVaultCrypto;
            if (!Crypto || !creds || !creds.vaultKey) return null;
            const key = String(creds.vaultKey);
            let vaultId = null, readKeyBytes = null, tier = null;
            try {
                const ro = Crypto.parseReadOnlyCredential ? Crypto.parseReadOnlyCredential(key) : null;
                if (ro) {
                    vaultId = ro.vaultId; readKeyBytes = hexToBytes(ro.readKeyHex); tier = 'ro';
                } else {
                    const stripped = Crypto.stripKeyPrefix ? Crypto.stripKeyPrefix(key) : key;
                    let keys;
                    if (SIMPLE_TOKEN.test(stripped)) {
                        keys = await Crypto.deriveKeysFromSimpleToken(stripped); vaultId = keys.vaultId;
                    } else {
                        const p = Crypto.parseVaultKey(stripped);
                        vaultId = p.vaultId;
                        keys = SIMPLE_TOKEN.test(p.passphrase) ? await Crypto.deriveKeysFromSimpleToken(p.passphrase)
                                                               : await Crypto.deriveKeys(p.passphrase, vaultId);
                    }
                    readKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keys.readKey)); tier = 'rw';
                }
            } catch (_) { return null; }
            if (!vaultId || !readKeyBytes || !readKeyBytes.length) return null;
            if (expectedVaultId && String(expectedVaultId) !== vaultId) return null;   // wrong vault's key
            return { vaultId, readKeyBytes, tier };
        },

        // Which append verbs may cross into a mount. Owner verbs need the child's write key,
        // which the lane binding never carries — and must not: a monitoring app draining a
        // lane has no business purging it or rewriting its anchors.
        LANE_VERBS: Object.freeze(['list', 'fetch', 'markProcessed']),

        allowsVerb(action) { return MountLanes.LANE_VERBS.indexOf(action) > -1; },

        hexToBytes
    };

    globalThis.MountLanes = MountLanes;
})();
