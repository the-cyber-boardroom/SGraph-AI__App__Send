/**
 * vault-credentials.js
 *
 * Shared credential parsing, resolution, and sessionStorage helpers.
 * Phase 2 will move this to _common/js/lib/.
 *
 * All functions are exported as named exports from this ES module.
 * No side effects on import.
 */

const SS_KEY = 'vt-vault-credentials';

/* ── Format patterns ──────────────────────────────────────────────────────── */
const RE_SIMPLE_TOKEN  = /^[a-z]+-[a-z]+-\d{4}$/;
const RE_RO_TOKEN      = /^(?:#?ro-)?([a-z]+-[a-z]+-\d{4})$/;
const RE_RO_PREFIX     = /^#?ro-/;

/**
 * Parse raw input (hash fragment or typed string) into a credential descriptor.
 * Pure parsing — no API calls.
 *
 * Returns one of:
 *   { mode: 'full',     rawInput, vaultKey }
 *   { mode: 'readonly', rawInput, roToken }
 *   null  — unrecognised format
 */
export function parseCredential(input) {
    const s = (input || '').trim().replace(/^#/, '');

    if (!s) return null;

    // Read-only token: ro-word-word-NNNN (with or without # or ro- prefix)
    if (RE_RO_PREFIX.test(s)) {
        const token = s.replace(RE_RO_PREFIX, '');
        if (RE_SIMPLE_TOKEN.test(token)) {
            return { mode: 'readonly', rawInput: input, roToken: token };
        }
    }

    // ro-word-word-NNNN without # prefix (typed directly)
    if (/^ro-[a-z]+-[a-z]+-\d{4}$/.test(s)) {
        const token = s.replace(/^ro-/, '');
        return { mode: 'readonly', rawInput: input, roToken: token };
    }

    // Full vault key: word-word-NNNN
    if (RE_SIMPLE_TOKEN.test(s)) {
        return { mode: 'full', rawInput: input, vaultKey: s };
    }

    // Full vault key: passphrase:vault_id
    const lastColon = s.lastIndexOf(':');
    if (lastColon > 0) {
        const pp = s.slice(0, lastColon);
        const id = s.slice(lastColon + 1);
        if (pp && !/\s/.test(pp) && /^[a-f0-9]{12}$|^[a-z0-9]{4,24}$/.test(id)) {
            return { mode: 'full', rawInput: input, vaultKey: s };
        }
    }

    return null;
}

/**
 * Resolve a parsed credential to { mode, vaultId, readKey?, vaultKey? }.
 * - mode='full': derive vaultId via SHA-256[:12] of the passphrase portion.
 * - mode='readonly': call GET /api/transfers/check-token/{token}, decrypt payload.
 * Returns a Promise<resolved>.
 */
export async function resolveCredential(credential) {
    const endpoint = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
    const accessKey = sessionStorage.getItem('sg-vault-access-key')
        || localStorage.getItem('sg-vault-access-key-saved')
        || '';

    if (credential.mode === 'full') {
        const vaultKey = credential.vaultKey;
        // Derive vaultId: SHA-256 of the passphrase portion, take first 12 hex chars
        const passphrase = vaultKey.includes(':') ? vaultKey.split(':')[0] : vaultKey;
        const vaultId = await _sha256hex12(passphrase);
        return { mode: 'full', vaultId, vaultKey };
    }

    if (credential.mode === 'readonly') {
        const token = credential.roToken;
        const headers = { 'Content-Type': 'application/json' };
        if (accessKey) headers['x-sgraph-access-token'] = accessKey;

        const resp = await fetch(`${endpoint}/api/transfers/check-token/${encodeURIComponent(token)}`, { headers });
        if (!resp.ok) {
            throw new Error(`Token check failed: HTTP ${resp.status}`);
        }
        const data = await resp.json();
        // data is expected to contain vault_id and read_key after server-side verification.
        // The token's encrypted payload { vault_id, read_key } was encrypted with the token as passphrase.
        // We need to decrypt it using the token.
        // The server returns the blob ciphertext — decrypt locally.
        if (data && data.vault_id && data.read_key) {
            // Server already resolved (dev mode or transparent endpoint)
            return { mode: 'readonly', vaultId: data.vault_id, readKey: data.read_key, roToken: token };
        }
        if (data && data.ciphertext) {
            // Decrypt the payload using the token as the passphrase key
            const payload = await _decryptWithPassphrase(token, data.ciphertext);
            const { vault_id, read_key } = JSON.parse(new TextDecoder().decode(payload));
            return { mode: 'readonly', vaultId: vault_id, readKey: read_key, roToken: token };
        }
        // Server returned a valid token response but with neither a plaintext vault_id nor an
        // encrypted ciphertext payload — this is an unexpected server state, not a silent fallback.
        throw new Error('RO token resolved but server returned no vault_id or ciphertext payload');
    }

    throw new Error(`Unknown credential mode: ${credential.mode}`);
}

/**
 * Store resolved credentials in sessionStorage. Clears URL hash.
 */
export function storeCredentials(resolved) {
    sessionStorage.setItem(SS_KEY, JSON.stringify(resolved));
    if (location.hash && location.hash !== '#') {
        history.replaceState(null, '', location.pathname + location.search);
    }
}

/** Retrieve credentials from sessionStorage. Returns null if not set. */
export function getCredentials() {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
}

/** Clear credentials from sessionStorage. */
export function clearCredentials() {
    sessionStorage.removeItem(SS_KEY);
}

/** Per-vault access key (write token) stored in localStorage. */
export function getAccessKey(vaultId) {
    return localStorage.getItem(`accessKey:${vaultId}`);
}
export function setAccessKey(vaultId, value) {
    localStorage.setItem(`accessKey:${vaultId}`, value);
}
export function clearAccessKey(vaultId) {
    localStorage.removeItem(`accessKey:${vaultId}`);
}

/* ── Internal crypto helpers ─────────────────────────────────────────────── */

async function _sha256hex12(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

/**
 * Decrypt AES-256-GCM ciphertext that was encrypted with a passphrase.
 * Expects base64-encoded ciphertext with 12-byte IV prepended.
 * Key is derived from passphrase via PBKDF2-SHA256 (100k iterations).
 */
async function _decryptWithPassphrase(passphrase, ciphertextBase64) {
    const rawKey = new TextEncoder().encode(passphrase);
    const importedKey = await crypto.subtle.importKey('raw', rawKey, { name: 'PBKDF2' }, false, ['deriveKey']);
    const salt = new TextEncoder().encode('sgraph-ro-token-v1');
    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
        importedKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
    const cipherBytes = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const iv = cipherBytes.slice(0, 12);
    const data = cipherBytes.slice(12);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
}
