/* =============================================================================
   SG/Send — SSH Crypto Library
   v0.1.0 — Ed25519 + RSA 4096 key generation with OpenSSH format output

   Pure functions. No DOM. No side effects. No external dependencies.
   Uses Web Crypto API exclusively.

   API:
     SSHCrypto.supportsEd25519()        → boolean
     SSHCrypto.supportsRSA()            → boolean
     SSHCrypto.generateEd25519(comment) → { publicKey, privateKey }
     SSHCrypto.generateRSA4096(comment) → { publicKey, privateKey }
   ============================================================================= */

const SSHCrypto = (function () {
    'use strict'

    // ── Constants ────────────────────────────────────────────────────────────

    const OPENSSH_MAGIC = 'openssh-key-v1\0'

    // ── Binary Helpers ───────────────────────────────────────────────────────

    function encodeUint32(n) {
        const buf = new ArrayBuffer(4)
        new DataView(buf).setUint32(0, n, false)      // big-endian
        return new Uint8Array(buf)
    }

    function encodeString(str) {
        const bytes = new TextEncoder().encode(str)
        return concatBytes(encodeUint32(bytes.length), bytes)
    }

    function encodeBytes(data) {
        return concatBytes(encodeUint32(data.length), data)
    }

    function encodeMPInt(bytes) {
        // SSH mpint: if high bit set, prepend 0x00
        if (bytes.length > 0 && (bytes[0] & 0x80) !== 0) {
            const padded = new Uint8Array(bytes.length + 1)
            padded[0] = 0
            padded.set(bytes, 1)
            return encodeBytes(padded)
        }
        return encodeBytes(bytes)
    }

    function concatBytes(...arrays) {
        let totalLen = 0
        for (const a of arrays) totalLen += a.length
        const result = new Uint8Array(totalLen)
        let offset = 0
        for (const a of arrays) {
            result.set(a, offset)
            offset += a.length
        }
        return result
    }

    function wrapPEM(base64) {
        const lines = []
        for (let i = 0; i < base64.length; i += 70) {
            lines.push(base64.slice(i, i + 70))
        }
        return '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
               lines.join('\n') + '\n' +
               '-----END OPENSSH PRIVATE KEY-----\n'
    }

    function base64Encode(bytes) {
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
        }
        return btoa(binary)
    }

    function base64UrlDecode(str) {
        // JWK uses base64url — convert to base64 then decode
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
        while (b64.length % 4 !== 0) b64 += '='
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }
        return bytes
    }

    // ── Feature Detection ────────────────────────────────────────────────────

    async function supportsEd25519() {
        try {
            await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
            return true
        } catch {
            return false
        }
    }

    async function supportsRSA() {
        try {
            await crypto.subtle.generateKey(
                { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
                false, ['sign', 'verify']
            )
            return true
        } catch {
            return false
        }
    }

    // ── Ed25519 ──────────────────────────────────────────────────────────────

    function extractEd25519Seed(pkcs8) {
        const der = new Uint8Array(pkcs8)
        // PKCS8 DER for Ed25519 is always 48 bytes:
        //   30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 {32 bytes seed}
        if (der.length !== 48 || der[0] !== 0x30 || der[14] !== 0x04 || der[16] !== 0x04) {
            throw new Error('Unexpected PKCS8 format for Ed25519')
        }
        return der.slice(16, 48)
    }

    function formatPublicKeyEd25519(rawPub, comment) {
        const wireFormat = concatBytes(encodeString('ssh-ed25519'), encodeBytes(rawPub))
        const b64 = base64Encode(wireFormat)
        return comment ? `ssh-ed25519 ${b64} ${comment}` : `ssh-ed25519 ${b64}`
    }

    function formatPrivateKeyEd25519(seed, rawPub, comment) {
        const commentStr = comment || ''

        // The "private key" in OpenSSH Ed25519 format is seed (32 bytes) + public (32 bytes) = 64 bytes
        const privKeyData = concatBytes(seed, rawPub)

        // Check bytes — two identical random uint32s
        const checkBytes = crypto.getRandomValues(new Uint8Array(4))
        const check = concatBytes(checkBytes, checkBytes)

        // Build the encrypted section (unencrypted when cipher is "none")
        let inner = concatBytes(
            check,
            encodeString('ssh-ed25519'),
            encodeBytes(rawPub),
            encodeBytes(privKeyData),
            encodeString(commentStr)
        )

        // Add padding (1, 2, 3, 4, ... repeating) to align to 8 bytes (cipher block size for "none")
        const blockSize = 8
        const padLen = blockSize - (inner.length % blockSize)
        if (padLen < blockSize) {
            const padding = new Uint8Array(padLen)
            for (let i = 0; i < padLen; i++) padding[i] = (i + 1) & 0xff
            inner = concatBytes(inner, padding)
        }

        // Public key wire format (same as in the public key line)
        const pubWire = concatBytes(encodeString('ssh-ed25519'), encodeBytes(rawPub))

        // Build full private key blob
        const magic = new TextEncoder().encode(OPENSSH_MAGIC)
        const blob = concatBytes(
            magic,
            encodeString('none'),          // cipher
            encodeString('none'),          // kdf
            encodeString(''),              // kdf options (empty)
            encodeUint32(1),               // number of keys
            encodeBytes(pubWire),          // public key
            encodeBytes(inner)             // encrypted section
        )

        return wrapPEM(base64Encode(blob))
    }

    async function generateEd25519(comment) {
        const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])

        const rawPub  = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
        const pkcs8   = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
        const seed    = extractEd25519Seed(pkcs8)

        return {
            publicKey  : formatPublicKeyEd25519(rawPub, comment),
            privateKey : formatPrivateKeyEd25519(seed, rawPub, comment)
        }
    }

    // ── RSA 4096 ─────────────────────────────────────────────────────────────

    function formatPublicKeyRSA(e, n, comment) {
        const wireFormat = concatBytes(
            encodeString('ssh-rsa'),
            encodeMPInt(e),
            encodeMPInt(n)
        )
        const b64 = base64Encode(wireFormat)
        return comment ? `ssh-rsa ${b64} ${comment}` : `ssh-rsa ${b64}`
    }

    function formatPrivateKeyRSA(jwk, comment) {
        const commentStr = comment || ''

        // Decode JWK fields from base64url
        const n    = base64UrlDecode(jwk.n)      // modulus
        const e    = base64UrlDecode(jwk.e)      // public exponent
        const d    = base64UrlDecode(jwk.d)      // private exponent
        const p    = base64UrlDecode(jwk.p)      // prime1
        const q    = base64UrlDecode(jwk.q)      // prime2
        const dp   = base64UrlDecode(jwk.dp)     // exponent1 (d mod p-1)
        const dq   = base64UrlDecode(jwk.dq)     // exponent2 (d mod q-1)
        const qi   = base64UrlDecode(jwk.qi)     // coefficient (q^-1 mod p)

        // Check bytes
        const checkBytes = crypto.getRandomValues(new Uint8Array(4))
        const check = concatBytes(checkBytes, checkBytes)

        // OpenSSH RSA private key fields: n, e, d, iqmp (qi), p, q
        let inner = concatBytes(
            check,
            encodeString('ssh-rsa'),
            encodeMPInt(n),
            encodeMPInt(e),
            encodeMPInt(d),
            encodeMPInt(qi),                // iqmp = q^-1 mod p
            encodeMPInt(p),
            encodeMPInt(q),
            encodeString(commentStr)
        )

        // Padding to 8-byte boundary
        const blockSize = 8
        const padLen = blockSize - (inner.length % blockSize)
        if (padLen < blockSize) {
            const padding = new Uint8Array(padLen)
            for (let i = 0; i < padLen; i++) padding[i] = (i + 1) & 0xff
            inner = concatBytes(inner, padding)
        }

        // Public key wire format
        const pubWire = concatBytes(
            encodeString('ssh-rsa'),
            encodeMPInt(e),
            encodeMPInt(n)
        )

        // Full blob
        const magic = new TextEncoder().encode(OPENSSH_MAGIC)
        const blob = concatBytes(
            magic,
            encodeString('none'),
            encodeString('none'),
            encodeString(''),
            encodeUint32(1),
            encodeBytes(pubWire),
            encodeBytes(inner)
        )

        return wrapPEM(base64Encode(blob))
    }

    async function generateRSA4096(comment) {
        const keyPair = await crypto.subtle.generateKey(
            {
                name           : 'RSASSA-PKCS1-v1_5',
                modulusLength  : 4096,
                publicExponent : new Uint8Array([1, 0, 1]),
                hash           : 'SHA-256'
            },
            true,
            ['sign', 'verify']
        )

        const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)

        const e = base64UrlDecode(jwk.e)
        const n = base64UrlDecode(jwk.n)

        return {
            publicKey  : formatPublicKeyRSA(e, n, comment),
            privateKey : formatPrivateKeyRSA(jwk, comment)
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    return {
        supportsEd25519,
        supportsRSA,
        generateEd25519,
        generateRSA4096
    }

})()
