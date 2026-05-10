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

   Phase 1 note: open(), create(), openReadOnly() are implemented but NOT yet wired to
   callers. Callers still use their original code paths. VaultLoader.open() etc. become
   the canonical paths in Phase 2. The scaffold is additive and cannot break the live UI.
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
    // Format 4 open path. SGVault.openWithReadKey is not yet implemented; this
    // placeholder surfaces a clear error message until the crypto layer adds support.

    async function openReadOnly(vaultId, readKeyHex, opts) {
        var err = new Error(
            'Read-only vault open (format 4) is not yet supported by this build. ' +
            'Open with a passphrase-based key instead.'
        );
        _emit(VaultLoaderEvents.VAULT_OPEN_FAILED, { error: err, vaultKey: vaultId });
        throw err;
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
        lock:          lock,
        storage:       VaultLoaderStorage,
        recent:        VaultLoaderRecent,
        routing:       VaultLoaderRouting,
        events:        VaultLoaderEvents
    };
}());
