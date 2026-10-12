/* =================================================================================
   Owner-Secret Store — pure crypto (no DOM, no bridge, no `this`)

   Loaded on /en-gb/app BEFORE app-shell.js. Unit-tested in Node via runInThisContext
   (tests/unit/vault_ui/loader/test__owner_secrets.js).

   The OWNER tier: secrets only a parent-vault WRITE-key holder can read. Distinct from
   the read tier (ro-links.json), which any parent reader (incl. RO-token holders) can read.

   Property: the encryption key is derived from the parent vault's write_key (a hex string,
   present only in writable sessions — `null` for RO-token sessions per SGVault.openReadOnly).
   So an RO session cannot derive this key and cannot open owner secrets. The sealed blob is
   ALSO stored inside a read_key-encrypted vault file, but that outer layer is incidental —
   the inner seal here is what provides the owner tier.

   Exposes globalThis.SGVaultOwnerSecrets:
     deriveKey(writeKeyHex) → AES-GCM CryptoKey   (HKDF over the write_key hex)
     seal(key, obj)         → { iv, ct }          (base64; AES-256-GCM over JSON)
     open(key, rec)         → obj                  (throws on tamper / wrong key)
   ================================================================================= */

(function () {
    'use strict';

    var INFO = 'sg-vault-v1:owner-secret-key';

    function _b64encode(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    function _b64decode(b64) {
        var s = atob(b64), out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    // Derive the AES-GCM secret-store key from the parent vault's write_key (hex string).
    // HKDF-SHA256, empty salt, fixed info. Deterministic per write_key — the same owner
    // re-derives it on every open of the vault, so secrets survive clone.
    async function deriveKey(writeKeyHex) {
        if (!writeKeyHex || typeof writeKeyHex !== 'string') {
            throw Object.assign(new Error('owner-secret store needs a writable vault'), { code: 'EREADONLY' });
        }
        var material = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(writeKeyHex), 'HKDF', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(INFO) },
            material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }

    // Seal a JSON-able object → { iv, ct } (both base64). Fresh 96-bit IV per seal.
    async function seal(key, obj) {
        var iv  = crypto.getRandomValues(new Uint8Array(12));
        var pt  = new TextEncoder().encode(JSON.stringify(obj));
        var ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, pt);
        return { iv: _b64encode(iv), ct: _b64encode(new Uint8Array(ct)) };
    }

    // Open a { iv, ct } record → object. Throws (AES-GCM auth failure) on tamper or wrong key.
    async function open(key, rec) {
        if (!rec || !rec.iv || !rec.ct) throw new Error('owner-secret: malformed record');
        var iv = _b64decode(rec.iv), ct = _b64decode(rec.ct);
        var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
        return JSON.parse(new TextDecoder().decode(pt));
    }

    globalThis.SGVaultOwnerSecrets = { deriveKey: deriveKey, seal: seal, open: open };
})();
