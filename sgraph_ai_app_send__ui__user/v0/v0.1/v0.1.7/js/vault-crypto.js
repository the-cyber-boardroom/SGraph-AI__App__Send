/* =============================================================================
   SGraph Send — Vault Crypto Utilities
   v0.1.7 — PKI key management + hybrid encryption for user vault

   Self-contained crypto module for the user vault page:
   - RSA-OAEP 4096-bit key pair generation and persistence (IndexedDB)
   - AES-256-GCM symmetric encryption with RSA key wrapping
   - Binary packing format: [4B wrapLen][wrappedKey][12B IV][ciphertext]
   - Key fingerprint derivation (SHA-256 of SPKI export)
   ============================================================================= */

const VaultCrypto = {

    DB_NAME:    'sgraph-send-vault-keys',
    STORE_NAME: 'keypairs',
    KEY_ID:     'vault-primary',

    // ─── Secure context check ───────────────────────────────────────────────

    isSecureContext() {
        return window.isSecureContext && !!crypto.subtle;
    },

    _requireSecureContext() {
        if (!this.isSecureContext()) {
            throw new Error(
                'Web Crypto API requires a secure context (HTTPS or localhost). ' +
                'Current origin: ' + location.origin
            );
        }
    },

    // ─── IndexedDB helpers ─────────────────────────────────────────────────

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
            req.onsuccess       = () => resolve(req.result);
            req.onerror         = () => reject(req.error);
        });
    },

    async _dbGet(id) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
    },

    async _dbPut(record) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(this.STORE_NAME, 'readwrite');
            const req = tx.objectStore(this.STORE_NAME).put(record);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    },

    // ─── Key pair lifecycle ────────────────────────────────────────────────

    async generateKeyPair() {
        this._requireSecureContext();
        const keyPair = await crypto.subtle.generateKey(
            { name: 'RSA-OAEP', modulusLength: 4096,
              publicExponent: new Uint8Array([1, 0, 1]),
              hash: 'SHA-256' },
            false, ['encrypt', 'decrypt']
        );
        await this._dbPut({
            id:         this.KEY_ID,
            publicKey:  keyPair.publicKey,
            privateKey: keyPair.privateKey,
            created:    new Date().toISOString()
        });
        return keyPair;
    },

    async getKeyPair() {
        const record = await this._dbGet(this.KEY_ID);
        if (!record) return null;
        return { publicKey: record.publicKey, privateKey: record.privateKey };
    },

    async hasKeyPair() {
        const record = await this._dbGet(this.KEY_ID);
        return record !== null;
    },

    // ─── Fingerprinting ───────────────────────────────────────────────────

    async getFingerprint(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const hash     = await crypto.subtle.digest('SHA-256', exported);
        const hex      = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        return 'sha256:' + hex.substring(0, 16);
    },

    // ─── Vault cache key derivation ───────────────────────────────────────

    async deriveVaultCacheKey(publicKey) {
        const exported   = await crypto.subtle.exportKey('spki', publicKey);
        const hash       = await crypto.subtle.digest('SHA-256', exported);
        const hex        = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        const keyHash    = hex.substring(0, 32);
        const combined   = new TextEncoder().encode(keyHash + '/filesystem');
        const derived    = await crypto.subtle.digest('SHA-256', combined);
        const derivedHex = [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('');
        return derivedHex.substring(0, 32);
    },

    // ─── Hybrid encryption (AES-256-GCM + RSA-OAEP wrapping) ─────────────

    async encrypt(publicKey, data) {
        const aesKey     = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv         = crypto.getRandomValues(new Uint8Array(12));
        const encrypted  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
        const rawAesKey  = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
        // Pack: [4 bytes wrappedKey length][wrappedKey][12 bytes IV][ciphertext]
        const wkLen  = new Uint32Array([wrappedKey.byteLength]);
        const packed = new Uint8Array(4 + wrappedKey.byteLength + 12 + encrypted.byteLength);
        packed.set(new Uint8Array(wkLen.buffer), 0);
        packed.set(new Uint8Array(wrappedKey), 4);
        packed.set(iv, 4 + wrappedKey.byteLength);
        packed.set(new Uint8Array(encrypted), 4 + wrappedKey.byteLength + 12);
        return packed;
    },

    async decrypt(privateKey, packed) {
        const view   = new DataView(packed.buffer || packed);
        const wkLen  = view.getUint32(0, true);
        const wk     = packed.slice(4, 4 + wkLen);
        const iv     = packed.slice(4 + wkLen, 4 + wkLen + 12);
        const ct     = packed.slice(4 + wkLen + 12);
        const rawKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wk);
        const aesKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
        const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
        return new Uint8Array(plain);
    },

    // ─── Base64 codec ──────────────────────────────────────────────────────

    arrayBufToB64(buf) {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    },

    b64ToArrayBuf(b64) {
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
};
