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

    // ─── Mixed-payload canonicalisation (review B2 at the request layer) ───────────
    // For payloads like { path: 'data/x', data: <Uint8Array> } — i.e. a JSON-shaped
    // object that EMBEDS bytes — we need a deterministic byte representation for the
    // signature. The wire still carries the object via structured clone (so Uint8Array
    // round-trips natively). For signing we serialise to JSON with embedded bytes
    // represented as `{ __u8: <base64> }`.

    function _bytesToB64(u8) {
        // Chunked to avoid `apply` arg-count limits and string-concat blowups.
        let s = '';
        const CH = 8192;
        for (let i = 0; i < u8.length; i += CH) {
            s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)));
        }
        return btoa(s);
    }
    function _b64ToBytes(s) {
        const bin = atob(s);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
    }

    function _hasEmbeddedBytes(v) {
        if (v == null) return false;
        if (v instanceof Uint8Array || v instanceof ArrayBuffer) return true;
        if (Array.isArray(v)) {
            for (let i = 0; i < v.length; i++) if (_hasEmbeddedBytes(v[i])) return true;
            return false;
        }
        if (typeof v === 'object') {
            for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) {
                if (_hasEmbeddedBytes(v[k])) return true;
            }
        }
        return false;
    }

    function _canonicalSerialise(v) {
        if (v === null || v === undefined) return null;
        if (v instanceof Uint8Array)  return { __u8: _bytesToB64(v) };
        if (v instanceof ArrayBuffer) return { __u8: _bytesToB64(new Uint8Array(v)) };
        if (Array.isArray(v))         return v.map(_canonicalSerialise);
        if (typeof v === 'object') {
            const keys = Object.keys(v).sort();
            const out = {};
            for (let i = 0; i < keys.length; i++) out[keys[i]] = _canonicalSerialise(v[keys[i]]);
            return out;
        }
        return v;
    }
    function _canonicalParse(s) {
        if (s === null || s === undefined) return s;
        if (typeof s === 'object' && !Array.isArray(s)
            && typeof s.__u8 === 'string' && Object.keys(s).length === 1) {
            return _b64ToBytes(s.__u8);
        }
        if (Array.isArray(s)) return s.map(_canonicalParse);
        if (typeof s === 'object') {
            const out = {};
            for (const k of Object.keys(s)) out[k] = _canonicalParse(s[k]);
            return out;
        }
        return s;
    }
    function _mixedCanonicalBytes(v) {
        return new TextEncoder().encode(JSON.stringify(_canonicalSerialise(v)));
    }

    // ─── Key generation ─────────────────────────────────────────────────────────────

    async function generateSignKeypair() {
        // ECDSA P-256. extractable=true because we exportKey('spki', pub) over the wire;
        // we never export the private key (no exportKey(... priv) call exists). L1 cleanup:
        // the prior then/catch pair tried to split extractability per-side, but WebCrypto's
        // generateKey applies the flag to both halves of the pair, so the fallback was the
        // only reachable branch. Use the direct call.
        return crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );
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

        // 1. Determine kind + the signed bytes
        //    'bytes'  : payload is a Uint8Array/ArrayBuffer (fast path, byte-exact).
        //    'json'   : payload is a plain JSON value with NO embedded bytes.
        //    'mixed'  : payload is an object/array that contains embedded bytes
        //               (e.g. vfs.write { path, data:<Uint8Array> }). Wire carries
        //               the value via structured clone; sig over canonical form.
        let kind, envPayload, payloadSigBytes;

        if (payload === undefined) {
            kind = 'json';
            const zero = new Uint8Array(0);
            if (enc) {
                const { iv, ct } = await encryptBytes(zero, encKey);
                envPayload = { kind, iv, ct };
                payloadSigBytes = ct;
            } else {
                envPayload = { kind, data: zero };
                payloadSigBytes = zero;
            }
        } else if (isBytes(payload)) {
            kind = 'bytes';
            const bytes = toU8(payload);
            if (enc) {
                const { iv, ct } = await encryptBytes(bytes, encKey);
                envPayload = { kind, iv, ct };
                payloadSigBytes = ct;
            } else {
                envPayload = { kind, data: bytes };
                payloadSigBytes = bytes;
            }
        } else if (_hasEmbeddedBytes(payload)) {
            kind = 'mixed';
            const canon = _mixedCanonicalBytes(payload);
            if (enc) {
                const { iv, ct } = await encryptBytes(canon, encKey);
                envPayload = { kind, iv, ct };
                payloadSigBytes = ct;
            } else {
                // Wire carries the original object via structured clone — Uint8Array
                // fields round-trip natively over MessageChannel.postMessage. The sig
                // is over the canonical form so both sides compute the same bytes.
                envPayload = { kind, value: payload };
                payloadSigBytes = canon;
            }
        } else {
            kind = 'json';
            const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
            if (enc) {
                const { iv, ct } = await encryptBytes(jsonBytes, encKey);
                envPayload = { kind, iv, ct };
                payloadSigBytes = ct;
            } else {
                envPayload = { kind, data: jsonBytes };
                payloadSigBytes = jsonBytes;
            }
        }

        // 2. Sign meta || payload
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

        const kind = env.payload.kind;

        // 1. Recompute the bytes that were signed.
        //    - enc:true                → ct (encrypt-then-MAC)
        //    - kind:'bytes' or 'json'  → env.payload.data
        //    - kind:'mixed' enc:false  → canonical-serialise(env.payload.value)
        let payloadSigBytes;
        if (env.enc) {
            payloadSigBytes = toU8(env.payload.ct);
        } else if (kind === 'mixed') {
            payloadSigBytes = _mixedCanonicalBytes(env.payload.value);
        } else {
            payloadSigBytes = toU8(env.payload.data);
        }

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

        // 3. Interpret payload per kind
        let payload;
        if (kind === 'bytes') {
            if (env.enc) {
                payload = await decryptBytes({ iv: env.payload.iv, ct: env.payload.ct }, decKey);
            } else {
                payload = toU8(env.payload.data);
            }
        } else if (kind === 'json') {
            let bytes;
            if (env.enc) bytes = await decryptBytes({ iv: env.payload.iv, ct: env.payload.ct }, decKey);
            else         bytes = toU8(env.payload.data);
            if (bytes.length === 0) {
                payload = undefined;
            } else {
                try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
                catch (err) { throw codeError('EPROTO', 'bad json payload: ' + err.message); }
            }
        } else if (kind === 'mixed') {
            if (env.enc) {
                const plain = await decryptBytes({ iv: env.payload.iv, ct: env.payload.ct }, decKey);
                let serialised;
                try { serialised = JSON.parse(new TextDecoder().decode(plain)); }
                catch (err) { throw codeError('EPROTO', 'bad mixed payload: ' + err.message); }
                payload = _canonicalParse(serialised);
            } else {
                // Wire carried the original value via structured clone (Uint8Arrays intact).
                payload = env.payload.value;
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
