/* =================================================================================
   SecureChannel — Envelope module  (Phase 1, no DOM, no bridge, no `this`)

   Pure WebCrypto + bytes. globalThis.Envelope:

     pack(opts) → envelope object (structured-cloneable; payload may be bytes or json)
     unpack(env, { peerSignKey, decKey? }) → { v,cid,dir,id,type,nonce,ts,enc,payload }
     ReplayGuard                    — per-(cid,dir) nonce set + ts window
     generateSignKeypair()          — ECDSA P-256 (sign)
     generateEphemeralBootKey()     — K1: one-use ECDSA P-256, private extractable
     generateEcdhKeypair()          — ECDH P-256 (key agreement)
     deriveEncKey(priv, pub)        — ECDH → AES-GCM-256, NON-EXTRACTABLE
     encryptBytes/decryptBytes      — AES-GCM, bytes-in / bytes-out
     signBytes/verifyBytes          — ECDSA P-256 / SHA-256
     jsonToBytes/bytesToJson        — convenience for non-byte payloads

   Wire format = the envelope OBJECT (not JSON.stringify) — `port.postMessage(env)`
   clones it natively, so Uint8Array/ArrayBuffer payloads round-trip byte-exact.
   ================================================================================= */

;(function () {
    'use strict';

    function codeError(code, msg) {
        const e = new Error(msg);
        e.code = code;
        return e;
    }

    // ─── Bytes helpers ──────────────────────────────────────────────────────────────

    function isBytes(v) {
        return v instanceof Uint8Array || v instanceof ArrayBuffer;
    }
    function toU8(v) {
        if (v instanceof Uint8Array)   return v;
        if (v instanceof ArrayBuffer)  return new Uint8Array(v);
        throw codeError('EPROTO', 'expected bytes');
    }
    function concatBytes() {
        let total = 0;
        for (let i = 0; i < arguments.length; i++) total += arguments[i].length;
        const out = new Uint8Array(total);
        let off = 0;
        for (let i = 0; i < arguments.length; i++) {
            const p = arguments[i];
            out.set(p, off);
            off += p.length;
        }
        return out;
    }

    // Deterministic JSON for the metadata fields that get signed. Fixed key order
    // (alphabetical), explicit type coercion so e.g. ts always serialises as Number.
    function canonicalMetaJSON({ v, cid, dir, id, type, nonce, ts, enc }) {
        return JSON.stringify({
            cid:   String(cid),
            dir:   String(dir),
            enc:   !!enc,
            id:    id == null ? null : String(id),
            nonce: String(nonce),
            ts:    Number(ts),
            type:  String(type),
            v:     v | 0
        });
    }

    // ─── Key generation ─────────────────────────────────────────────────────────────

    async function generateSignKeypair() {
        // ECDSA P-256. Private key extractable=false so it can't leak via exportKey.
        // Public extractable=true so we can ship the pub over the wire.
        return crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign', 'verify']
        ).then(async (pair) => {
            // WebCrypto generateKey with extractable:false applies to BOTH; we need pub
            // extractable. Re-generate with extractable:true and re-import private as
            // non-extractable to enforce the asymmetry.
            return pair;
        }).catch(async () => {
            // Fallback path used universally below — generate with extractable=true and
            // accept that the pub side is what we export, never the priv.
            return crypto.subtle.generateKey(
                { name: 'ECDSA', namedCurve: 'P-256' },
                true,
                ['sign', 'verify']
            );
        });
    }

    // One-use bootstrap key: private MUST be extractable (we ship it to the child),
    // so caller is responsible for treating it as one-use and retiring after the handshake.
    async function generateEphemeralBootKey() {
        return crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );
    }

    async function generateEcdhKeypair() {
        return crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey', 'deriveBits']
        );
    }

    async function exportSpki(pubKey) {
        const buf = await crypto.subtle.exportKey('spki', pubKey);
        return new Uint8Array(buf);
    }
    async function importSpkiEcdsa(spkiBytes) {
        return crypto.subtle.importKey(
            'spki',
            toU8(spkiBytes),
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
        );
    }
    async function importSpkiEcdh(spkiBytes) {
        return crypto.subtle.importKey(
            'spki',
            toU8(spkiBytes),
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            []
        );
    }
    async function exportPkcs8(privKey) {
        const buf = await crypto.subtle.exportKey('pkcs8', privKey);
        return new Uint8Array(buf);
    }
    async function importPkcs8Ecdsa(pkcs8Bytes) {
        return crypto.subtle.importKey(
            'pkcs8',
            toU8(pkcs8Bytes),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,                      // imported private = non-extractable
            ['sign']
        );
    }

    // ─── ECDH → AES-GCM ────────────────────────────────────────────────────────────

    async function deriveEncKey(ownEcdhPriv, peerEcdhPub) {
        // Direct AES-GCM deriveKey from the ECDH shared secret. Non-extractable.
        return crypto.subtle.deriveKey(
            { name: 'ECDH', public: peerEcdhPub },
            ownEcdhPriv,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptBytes(bytes, key, iv) {
        const u8    = toU8(bytes);
        const ivArr = iv ? toU8(iv) : crypto.getRandomValues(new Uint8Array(12));
        const ct    = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivArr }, key, u8);
        return { iv: ivArr, ct: new Uint8Array(ct) };
    }

    async function decryptBytes({ iv, ct }, key) {
        try {
            const pt = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: toU8(iv) },
                key,
                toU8(ct)
            );
            return new Uint8Array(pt);
        } catch (err) {
            throw codeError('EPROTO', 'decrypt failed: ' + err.message);
        }
    }

    // ─── ECDSA sign / verify ────────────────────────────────────────────────────────

    async function signBytes(bytes, privKey) {
        const sig = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            privKey,
            toU8(bytes)
        );
        return new Uint8Array(sig);
    }

    async function verifyBytes(sig, bytes, pubKey) {
        return crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            pubKey,
            toU8(sig),
            toU8(bytes)
        );
    }

    // ─── Pack / Unpack ──────────────────────────────────────────────────────────────
    //
    // Envelope shape (structured-cloneable; carried by port.postMessage):
    //   {
    //     v, cid, dir, id|null, type, nonce, ts, enc,
    //     payload: {
    //       kind: 'bytes' | 'json',           // how to interpret the bytes after decrypt
    //       data:  Uint8Array,                // when enc:false  — bytes (json is jsonToBytes)
    //       iv:    Uint8Array,                // when enc:true
    //       ct:    Uint8Array,                // when enc:true
    //     },
    //     sig: Uint8Array                     // ECDSA over canonicalMeta || payloadSigBytes
    //   }
    //
    // Signed bytes = canonicalMetaJSON(meta) || payloadSigBytes
    //   payloadSigBytes = (enc:true)  → ct
    //                   = (enc:false) → data

    async function pack(opts) {
        const { v = 1, cid, dir, id = null, type, nonce, ts = Date.now(),
                payload, enc = false, signKey, encKey } = opts;

        if (!signKey) throw codeError('EPROTO', 'signKey required');
        if (enc && !encKey) throw codeError('EPROTO', 'encKey required when enc:true');

        // 1. Determine the payload bytes + kind
        let payloadBytes, kind;
        if (payload === undefined) {
            payloadBytes = new Uint8Array(0);
            kind = 'json';
        } else if (isBytes(payload)) {
            payloadBytes = toU8(payload);
            kind = 'bytes';
        } else {
            payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
            kind = 'json';
        }

        // 2. Encrypt if requested
        let envPayload, payloadSigBytes;
        if (enc) {
            const { iv, ct } = await encryptBytes(payloadBytes, encKey);
            envPayload     = { kind, iv, ct };
            payloadSigBytes = ct;          // sign over ciphertext (a.k.a. encrypt-then-MAC pattern)
        } else {
            envPayload     = { kind, data: payloadBytes };
            payloadSigBytes = payloadBytes;
        }

        // 3. Sign meta || payload
        const metaBytes = new TextEncoder().encode(canonicalMetaJSON({ v, cid, dir, id, type, nonce, ts, enc }));
        const toSign    = concatBytes(metaBytes, payloadSigBytes);
        const sig       = await signBytes(toSign, signKey);

        return { v, cid, dir, id, type, nonce, ts, enc, payload: envPayload, sig };
    }

    async function unpack(env, opts) {
        const { peerSignKey, decKey } = opts || {};
        if (!peerSignKey) throw codeError('EPROTO', 'peerSignKey required');
        if (env == null || typeof env !== 'object') throw codeError('EPROTO', 'envelope not an object');
        if (!env.payload || !env.sig)               throw codeError('EPROTO', 'envelope missing payload/sig');
        if (env.enc && !decKey)                     throw codeError('EPROTO', 'decKey required for enc:true');

        // 1. Recompute signed bytes
        const payloadSigBytes = env.enc ? toU8(env.payload.ct) : toU8(env.payload.data);
        const metaBytes = new TextEncoder().encode(canonicalMetaJSON(env));
        const toVerify  = concatBytes(metaBytes, payloadSigBytes);

        // 2. Verify signature — fail closed on any error
        let valid;
        try {
            valid = await verifyBytes(env.sig, toVerify, peerSignKey);
        } catch (err) {
            throw codeError('EPROTO', 'verify error: ' + err.message);
        }
        if (!valid) throw codeError('EPROTO', 'bad signature');

        // 3. Decrypt if needed
        let payloadBytes;
        if (env.enc) {
            payloadBytes = await decryptBytes({ iv: env.payload.iv, ct: env.payload.ct }, decKey);
        } else {
            payloadBytes = toU8(env.payload.data);
        }

        // 4. Interpret
        const kind = env.payload.kind;
        let payload;
        if (kind === 'bytes') {
            payload = payloadBytes;
        } else if (kind === 'json') {
            if (payloadBytes.length === 0) {
                payload = undefined;
            } else {
                try {
                    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
                } catch (err) {
                    throw codeError('EPROTO', 'bad json payload: ' + err.message);
                }
            }
        } else {
            throw codeError('EPROTO', 'unknown payload kind: ' + kind);
        }

        return {
            v:     env.v,
            cid:   env.cid,
            dir:   env.dir,
            id:    env.id,
            type:  env.type,
            nonce: env.nonce,
            ts:    env.ts,
            enc:   env.enc,
            payload
        };
    }

    // ─── ReplayGuard ────────────────────────────────────────────────────────────────

    class ReplayGuard {
        constructor(windowMs) {
            this._window = windowMs == null ? 60000 : windowMs;
            this._seen   = new Map();
        }
        check({ cid, dir, nonce, ts }) {
            const now = Date.now();
            if (Math.abs(now - Number(ts)) > this._window) {
                throw codeError('EPROTO', 'ts out of window');
            }
            const key = String(cid) + '|' + String(dir) + '|' + String(nonce);
            if (this._seen.has(key)) {
                throw codeError('EPROTO', 'nonce reuse');
            }
            this._seen.set(key, now);
            // Cheap GC: drop entries older than 2× the window
            if (this._seen.size > 64) {
                for (const [k, t] of this._seen) {
                    if (now - t > 2 * this._window) this._seen.delete(k);
                }
            }
        }
    }

    // ─── JSON convenience ──────────────────────────────────────────────────────────

    function jsonToBytes(obj) { return new TextEncoder().encode(JSON.stringify(obj)); }
    function bytesToJson(buf) { return JSON.parse(new TextDecoder().decode(toU8(buf))); }

    // ─── Nonce / id helpers ────────────────────────────────────────────────────────

    function randNonce() {
        const u8 = crypto.getRandomValues(new Uint8Array(16));
        let s = '';
        for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
        return s;
    }
    function randId(prefix) {
        return (prefix || 'req') + '-' + randNonce().slice(0, 16);
    }

    // ─── Exports ────────────────────────────────────────────────────────────────────

    globalThis.Envelope = {
        pack, unpack,
        generateSignKeypair, generateEphemeralBootKey, generateEcdhKeypair,
        deriveEncKey,
        encryptBytes, decryptBytes,
        signBytes, verifyBytes,
        exportSpki, importSpkiEcdsa, importSpkiEcdh, exportPkcs8, importPkcs8Ecdsa,
        jsonToBytes, bytesToJson,
        randNonce, randId,
        ReplayGuard,
        codeError,
        // Internal helpers exposed for testing
        _canonicalMetaJSON: canonicalMetaJSON,
        _concatBytes:       concatBytes,
        _toU8:              toU8,
        _isBytes:           isBytes
    };
})();
