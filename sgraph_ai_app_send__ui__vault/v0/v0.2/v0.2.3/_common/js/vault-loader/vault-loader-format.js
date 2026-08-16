/* =================================================================================
   VaultLoader — Format Detection + Key Parsing
   Recognises the five vault credential formats and returns a normalised descriptor.

   Format catalogue:
     1  simple token        word-word-NNNN               (rw) derivation: PBKDF2 + HKDF
     2  passphrase:hex_id   <pass>:<12 lowercase hex>    (rw) derivation: PBKDF2
     3  passphrase:alnum_id <pass>:<4–24 a-z0-9>         (rw) derivation: PBKDF2
     4  read-only cred      <vault_id> <64-hex read_key>  (ro) no derivation needed
     5  ro-token            ro-word-word-NNNN             (ro) resolve via transfers API
     6  read-key cred       <64-hex read_key>:<vault_id>  (ro) sgit CLI clone parity
     —  server access token opaque string — orthogonal axis, not handled here

   Detection order matters: #2 is a strict subset of #3, so it must be checked first.
   Format 6 must be checked BEFORE #2/#3 — a 64-hex head would otherwise parse as a
   passphrase, PBKDF2 into garbage keys, and fail late as "HEAD ref missing". The
   sgit CLI made the same call (a 64-hex head always routes to read-only clone), so
   the one edge case — a passphrase that IS 64 lowercase hex — resolves identically
   in both tools.
   The passphrase may itself contain colons (e.g. "pass:with:colons:vault_id") — the
   vault_id is always the segment after the LAST colon, matching SGVaultCrypto.parseVaultKey.

   Prefixed keys: the sgit CLI's canonical prefixes (sgit_vk1_ / sgit_rk1_) are
   stripped before detection — the value after the prefix is byte-identical to the
   legacy key, so `sgit_rk1_{64hex}:{id}` detects as format 6 and
   `sgit_vk1_{pass}:{id}` as format 2/3.

   Load order: no dependencies (pure regex, no globalThis reads).
   ================================================================================= */

;(function () {
    'use strict';

    var RE_SIMPLE_TOKEN = /^[a-z]+-[a-z]+-\d{4}$/;
    var RE_HEX_ID_PART  = /^[a-f0-9]{12}$/;
    var RE_ALNUM_PART   = /^[a-z0-9]{4,24}$/;
    var RE_READ_ONLY    = /^([a-z0-9]{4,24})\s+([a-f0-9]{64})$/;
    var RE_RO_TOKEN     = /^ro-([a-z]+-[a-z]+-\d{4})$/;
    var RE_READ_KEY     = /^([a-f0-9]{64}):([a-z0-9]{4,24})$/;

    // Inline twin of SGVaultCrypto.stripKeyPrefix — this module is pure/dep-free by
    // contract (loaded before the crypto lib on some pages), so it cannot call it.
    // Guarded against drift by test__format_detection.js.
    function _stripKeyPrefix(s) {
        if (s.indexOf('sgit_vk1_') === 0) return s.slice(9);
        if (s.indexOf('sgit_rk1_') === 0) return s.slice(9);
        return s;
    }

    function detectFormat(input) {
        var s = (input || '').trim();
        if (!s) throw new Error('Vault key cannot be empty');
        s = _stripKeyPrefix(s);

        // Format 5 — ro-token: ro-word-word-NNNN (must be checked before Format 1)
        var m5 = RE_RO_TOKEN.exec(s);
        if (m5) {
            return {
                format: 5,
                kind:   'ro-token',
                parts:  { roToken: m5[1], raw: s }
            };
        }

        // Format 1 — simple token: word-word-NNNN (no colon)
        if (RE_SIMPLE_TOKEN.test(s)) {
            return {
                format: 1,
                kind:   'simple-token',
                parts:  { passphrase: s, vaultId: null, raw: s }
            };
        }

        // Format 6 — read-key credential: <64-hex read_key>:<vault_id>. MUST be
        // checked before formats 2/3 (see header). Same shape the sgit CLI clones
        // read-only from; same {vault_id, read_key} pair as format 4, colon-joined.
        var m6 = RE_READ_KEY.exec(s);
        if (m6) {
            return {
                format: 6,
                kind:   'read-key',
                parts:  { vaultId: m6[2], readKeyHex: m6[1], passphrase: null, raw: s }
            };
        }

        // Formats 2 & 3 — split at last colon; passphrase must be non-empty and
        // contain no whitespace (whitespace belongs to format 4 only).
        var lastColon = s.lastIndexOf(':');
        if (lastColon > 0) {
            var maybePp = s.slice(0, lastColon);
            var maybeId = s.slice(lastColon + 1);
            if (maybePp && !/\s/.test(maybePp)) {
                // Format 2 — vault_id is exactly 12 lowercase hex chars
                if (RE_HEX_ID_PART.test(maybeId)) {
                    return {
                        format: 2,
                        kind:   'passphrase-hex-id',
                        parts:  { passphrase: maybePp, vaultId: maybeId, raw: s }
                    };
                }
                // Format 3 — vault_id is 4–24 lowercase alnum chars
                if (RE_ALNUM_PART.test(maybeId)) {
                    return {
                        format: 3,
                        kind:   'passphrase-alnum-id',
                        parts:  { passphrase: maybePp, vaultId: maybeId, raw: s }
                    };
                }
            }
        }

        // Format 4 — read-only credential: <vault_id> <64-hex read_key>
        var m = RE_READ_ONLY.exec(s);
        if (m) {
            return {
                format: 4,
                kind:   'read-only',
                parts:  { vaultId: m[1], readKeyHex: m[2], passphrase: null, raw: s }
            };
        }

        throw new Error(
            'Unrecognised vault key format. Expected: word-word-NNNN, passphrase:vault_id, ' +
            'read_key_hex:vault_id, or "vault_id read_key_hex". Got: ' + s.slice(0, 60)
        );
    }

    globalThis.VaultLoaderFormat = { detectFormat: detectFormat };
}());
