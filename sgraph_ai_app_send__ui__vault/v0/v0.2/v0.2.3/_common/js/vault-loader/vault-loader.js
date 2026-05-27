/* =================================================================================
   VaultLoader — Public API (main entry point)
   Composes the five sub-modules into a single window.VaultLoader object.

   Load order (all must be loaded before this file):
     vault-loader-events.js   → VaultLoaderEvents
     vault-loader-storage.js  → VaultLoaderStorage
     vault-loader-format.js   → VaultLoaderFormat
     vault-loader-recent.js   → VaultLoaderRecent
     vault-loader-routing.js  → VaultLoaderRouting

   Runtime dependencies (present on every vault page):
     SGSend              — HTTP transport (from SG/Send CDN)
     SGVault             — core vault object  (from _common/js/lib/sg-vault/sg-vault.js)
     SGVault.createFromToken  — patched in index.html (Phase 2: moves here permanently)
     window.sgraphVault.events — EventBus

   Phase 2: open() now dispatches format 5 (ro-token) to openROToken(), which resolves
   the token via the transfers API and calls SGVault.openReadOnly(). Formats 1–3 continue
   to use the existing SGVault.open() path.
   ================================================================================= */

;(function () {
    'use strict';

    function _makeSGSend(opts) {
        opts = opts || {};
        var endpoint = opts.endpoint || VaultLoaderStorage.getEndpoint();
        var token    = opts.accessKey || VaultLoaderStorage.getAccessKey() || '';
        return new SGSend({ endpoint: endpoint, token: token });
    }

    function _emit(name, detail) {
        if (globalThis.sgraphVault && globalThis.sgraphVault.events) {
            globalThis.sgraphVault.events.emit(name, detail);
        }
    }

    // --- open(input, opts) → Promise<{ vault, format, vaultKey }> ------------------
    // Accepts any of formats 1–4. Format 4 delegates to openReadOnly().

    async function open(input, opts) {
        opts = opts || {};
        var detected;
        try {
            detected = VaultLoaderFormat.detectFormat(input);
        } catch (err) {
            _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err, vaultKey: input });
            throw err;
        }

        if (detected.format === 4) {
            return openReadOnly(detected.parts.vaultId, detected.parts.readKeyHex, opts);
        }

        if (detected.format === 5) {
            return openROToken(detected.parts.roToken, opts);
        }

        var vaultKey = input.trim();
        var sgSend   = _makeSGSend(opts);
        var vault;
        try {
            vault = await SGVault.open(sgSend, vaultKey);
        } catch (err) {
            _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err, vaultKey: vaultKey });
            throw err;
        }

        VaultLoaderStorage.setCurrentKey(vaultKey);
        VaultLoaderRecent.add(vaultKey, vault.name || vaultKey);

        _emit(VaultLoaderEvents.VAULT_OPENED, {
            vault: vault, format: detected.format, vaultKey: vaultKey,
            accessKey: opts.accessKey || VaultLoaderStorage.getAccessKey() || ''
        });
        return { vault: vault, format: detected.format, vaultKey: vaultKey };
    }

    // --- create(simpleToken, opts) → Promise<{ vault, vaultKey }> ------------------
    // Creates a brand-new vault from a simple token (format 1).
    // SGVault.createFromToken is currently patched in index.html; moves here in Phase 3.

    async function create(simpleToken, opts) {
        opts = opts || {};
        var name   = opts.name || simpleToken;
        var sgSend = _makeSGSend(opts);
        var vault;
        try {
            vault = await SGVault.createFromToken(sgSend, simpleToken, { name: name });
        } catch (err) {
            _emit(VaultLoaderEvents.VAULT_CREATE_FAILED, { error: err, vaultKey: simpleToken });
            throw err;
        }

        VaultLoaderStorage.setCurrentKey(simpleToken);
        VaultLoaderRecent.add(simpleToken, name);

        _emit(VaultLoaderEvents.VAULT_CREATED, { vault: vault, vaultKey: simpleToken });
        return { vault: vault, vaultKey: simpleToken };
    }

    // --- openReadOnly(vaultId, readKeyHex, opts) → Promise<{ vault, vaultKey }> ----
    // Format 4 open path (vaultId + 64-hex readKey string).
    // Placeholder: format 4 requires further investigation for ref discovery.

    async function openReadOnly(vaultId, readKeyHex, opts) {
        var err = new Error(
            'Read-only vault open (format 4) is not yet supported. ' +
            'Use a ro-token (ro-word-word-NNNN) for read-only access.'
        );
        _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err, vaultKey: vaultId });
        throw err;
    }

    // --- openROToken(roToken, opts) → Promise<{ vault, vaultKey }> -----------------
    // Format 5 open path. Resolves ro-word-word-NNNN via the transfers API:
    //   1. Derive a deterministic transfer-id from the token, GET /download/{id} → bytes
    //   2. Decrypt with token as PBKDF2 passphrase → { vault_id, read_key, ref_file_id }
    //   3. SGVault.openReadOnly(sgSend, vault_id, read_key, ref_file_id)

    async function openROToken(roToken, opts) {
        opts = opts || {};
        var endpoint  = opts.endpoint  || VaultLoaderStorage.getEndpoint();

        var transferId = await SGVaultCrypto.deriveRoTokenTransferId(roToken);
        var resp = await fetch(endpoint + '/api/transfers/download/' + encodeURIComponent(transferId));
        if (!resp.ok) {
            var err = new Error('RO token not found or expired (HTTP ' + resp.status + ')');
            _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err, vaultKey: 'ro-' + roToken });
            throw err;
        }
        var cipherBytes  = new Uint8Array(await resp.arrayBuffer());
        var cipherBase64 = btoa(String.fromCharCode.apply(null, cipherBytes));
        var payloadBytes = await _decryptROPayload(roToken, cipherBase64);
        var payload = JSON.parse(new TextDecoder().decode(payloadBytes));

        var vaultId   = payload.vault_id;
        var readKeyB64 = payload.read_key;
        var refFileId  = payload.ref_file_id;

        if (!vaultId || !readKeyB64 || !refFileId) {
            var err3 = new Error('RO token payload missing required fields (vault_id, read_key, ref_file_id)');
            _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err3, vaultKey: 'ro-' + roToken });
            throw err3;
        }

        var sgSend = _makeSGSend(opts);
        var vault  = await SGVault.openReadOnly(sgSend, vaultId, readKeyB64, refFileId);

        VaultLoaderStorage.setCurrentKey('ro-' + roToken);
        VaultLoaderRecent.add('ro-' + roToken, vault.name || ('ro-' + roToken));

        _emit(VaultLoaderEvents.VAULT_OPENED, {
            vault: vault, format: 5, vaultKey: 'ro-' + roToken,
            accessKey: '', readOnly: true
        });
        return { vault: vault, format: 5, vaultKey: 'ro-' + roToken };
    }

    // AES-256-GCM decrypt with PBKDF2-derived key — mirrors vault-credentials.js
    // Salt and iterations must match the encrypt side in vault-token-manager.js.
    async function _decryptROPayload(passphrase, ciphertextBase64) {
        var rawKey     = new TextEncoder().encode(passphrase);
        var imported   = await crypto.subtle.importKey('raw', rawKey, { name: 'PBKDF2' }, false, ['deriveKey']);
        var salt       = new TextEncoder().encode('sgraph-ro-token-v1');
        var aesKey     = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: 100000 },
            imported,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        var cipherBytes = Uint8Array.from(atob(ciphertextBase64), function(c) { return c.charCodeAt(0); });
        var iv   = cipherBytes.slice(0, 12);
        var data = cipherBytes.slice(12);
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, data));
    }

    // --- lock() → void -------------------------------------------------------------
    // Clears all vault-related state and emits vault-locked.

    function lock() {
        VaultLoaderStorage.clearCurrentKey();
        VaultLoaderStorage.clearAccessKey();
        VaultLoaderStorage.clearCreatingFlag();
        _emit(VaultLoaderEvents.VAULT_LOCKED, {});
    }

    // --- Public API ----------------------------------------------------------------

    globalThis.VaultLoader = {
        detectFormat:  VaultLoaderFormat.detectFormat,
        open:          open,
        create:        create,
        openReadOnly:  openReadOnly,
        openROToken:   openROToken,
        lock:          lock,
        storage:       VaultLoaderStorage,
        recent:        VaultLoaderRecent,
        routing:       VaultLoaderRouting,
        events:        VaultLoaderEvents
    };
}());
