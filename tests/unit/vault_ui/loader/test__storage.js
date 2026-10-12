/* =================================================================================
   VaultLoader — Storage Unit Tests
   Verifies VaultLoaderStorage getters, setters, clears, and event emission.
   Run: node tests/unit/vault_ui/loader/test__storage.js
   ================================================================================= */

import { suite, assert, clearVaultStorage } from './helpers.js';
import './load-loader.js';

// ---------------------------------------------------------------------------
// sg-vault-key (current vault key — localStorage)
// ---------------------------------------------------------------------------
suite('VaultLoaderStorage — current vault key', ({ test, before }) => {
    before(clearVaultStorage);

    test('getCurrentKey returns null when not set', () => {
        assert.equal(VaultLoader.storage.getCurrentKey(), null);
    });

    test('setCurrentKey stores the value', () => {
        VaultLoader.storage.setCurrentKey('apple-river-1234');
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234');
    });

    test('setCurrentKey overwrites previous value', () => {
        VaultLoader.storage.setCurrentKey('coral-stamp-5678');
        assert.equal(VaultLoader.storage.getCurrentKey(), 'coral-stamp-5678');
    });

    test('clearCurrentKey removes the value', () => {
        VaultLoader.storage.setCurrentKey('apple-river-1234');
        VaultLoader.storage.clearCurrentKey();
        assert.equal(VaultLoader.storage.getCurrentKey(), null);
    });
});

// ---------------------------------------------------------------------------
// sg-vault-key — event emission
// ---------------------------------------------------------------------------
suite('VaultLoaderStorage — current key events', ({ test, before }) => {
    before(() => {
        clearVaultStorage();
        sgraphVault.events.clearLog();
    });

    test('setCurrentKey emits vault-key-set with key', () => {
        VaultLoader.storage.setCurrentKey('apple-river-1234');
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-key-set');
        assert.ok(ev, 'vault-key-set event emitted');
        assert.equal(ev.detail.key, 'apple-river-1234');
    });

    test('clearCurrentKey emits vault-key-cleared', () => {
        sgraphVault.events.clearLog();
        VaultLoader.storage.clearCurrentKey();
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-key-cleared');
        assert.ok(ev, 'vault-key-cleared event emitted');
    });
});

// ---------------------------------------------------------------------------
// sg-vault-access-key (server access token — sessionStorage)
// ---------------------------------------------------------------------------
suite('VaultLoaderStorage — access key', ({ test, before }) => {
    before(clearVaultStorage);

    test('getAccessKey returns null when not set', () => {
        assert.equal(VaultLoader.storage.getAccessKey(), null);
    });

    test('setAccessKey stores value', () => {
        VaultLoader.storage.setAccessKey('my-access-token-xyz');
        assert.equal(VaultLoader.storage.getAccessKey(), 'my-access-token-xyz');
    });

    test('setAccessKey with empty string clears the value', () => {
        VaultLoader.storage.setAccessKey('my-access-token-xyz');
        VaultLoader.storage.setAccessKey('');
        assert.equal(VaultLoader.storage.getAccessKey(), null);
    });

    test('clearAccessKey removes the value', () => {
        VaultLoader.storage.setAccessKey('my-access-token-xyz');
        VaultLoader.storage.clearAccessKey();
        assert.equal(VaultLoader.storage.getAccessKey(), null);
    });
});

// ---------------------------------------------------------------------------
// sg-vault-endpoint (API endpoint — sessionStorage)
// ---------------------------------------------------------------------------
suite('VaultLoaderStorage — endpoint', ({ test, before }) => {
    before(clearVaultStorage);

    test('getEndpoint returns default when not set', () => {
        assert.equal(VaultLoader.storage.getEndpoint(), 'https://dev.send.sgraph.ai');
    });

    test('setEndpoint stores override', () => {
        VaultLoader.storage.setEndpoint('https://custom.example.com');
        assert.equal(VaultLoader.storage.getEndpoint(), 'https://custom.example.com');
    });

    test('setEndpoint with empty string reverts to default', () => {
        VaultLoader.storage.setEndpoint('https://custom.example.com');
        VaultLoader.storage.setEndpoint('');
        assert.equal(VaultLoader.storage.getEndpoint(), 'https://dev.send.sgraph.ai');
    });
});

// ---------------------------------------------------------------------------
// sg-vault-creating (create-new-vault flag — sessionStorage)
// ---------------------------------------------------------------------------
suite('VaultLoaderStorage — creating flag', ({ test, before }) => {
    before(clearVaultStorage);

    test('getCreatingFlag returns null when not set', () => {
        assert.equal(VaultLoader.storage.getCreatingFlag(), null);
    });

    test('setCreatingFlag stores token', () => {
        VaultLoader.storage.setCreatingFlag('apple-river-1234');
        assert.equal(VaultLoader.storage.getCreatingFlag(), 'apple-river-1234');
    });

    test('clearCreatingFlag removes token', () => {
        VaultLoader.storage.setCreatingFlag('apple-river-1234');
        VaultLoader.storage.clearCreatingFlag();
        assert.equal(VaultLoader.storage.getCreatingFlag(), null);
    });
});

// ---------------------------------------------------------------------------
// lock() clears key, access key, and creating flag together
// ---------------------------------------------------------------------------
suite('VaultLoader.lock() clears all vault session state', ({ test, before }) => {
    before(clearVaultStorage);

    test('lock clears currentKey, accessKey, creatingFlag and emits vault-locked', () => {
        VaultLoader.storage.setCurrentKey('apple-river-1234');
        VaultLoader.storage.setAccessKey('tok');
        VaultLoader.storage.setCreatingFlag('apple-river-1234');
        sgraphVault.events.clearLog();

        VaultLoader.lock();

        assert.equal(VaultLoader.storage.getCurrentKey(),   null, 'currentKey cleared');
        assert.equal(VaultLoader.storage.getAccessKey(),    null, 'accessKey cleared');
        assert.equal(VaultLoader.storage.getCreatingFlag(), null, 'creatingFlag cleared');

        const ev = sgraphVault.events._log.find(e => e.name === 'vault-locked');
        assert.ok(ev, 'vault-locked event emitted');
    });
});

// ---------------------------------------------------------------------------
// Null-origin / sandboxed-iframe survival
// ---------------------------------------------------------------------------
// When this vault loads inside a sandboxed iframe without `allow-same-origin`
// (parent vault embedding another vault as an "app"), the browser throws on
// every storage access. None of the getters/setters may propagate that throw —
// they must return null / silently no-op. Verifies the contract that lets the
// vault entry page survive in that context so the parent's postMessage
// handshake can auto-open without the user typing the key.
suite('VaultLoaderStorage — survives null-origin (storage throws)', ({ test, before }) => {
    before(clearVaultStorage);

    function withThrowingStorage(fn) {
        const origLS = globalThis.localStorage;
        const origSS = globalThis.sessionStorage;
        // Define synthetic throwing objects on the global scope, mirroring how
        // a sandboxed iframe surfaces the failure: getItem/setItem/removeItem
        // all throw a DOMException-like error.
        const throwImpl = () => { throw new Error('Sandboxed: lacks allow-same-origin'); };
        const throwing  = { getItem: throwImpl, setItem: throwImpl, removeItem: throwImpl };
        try {
            Object.defineProperty(globalThis, 'localStorage',   { value: throwing, configurable: true });
            Object.defineProperty(globalThis, 'sessionStorage', { value: throwing, configurable: true });
            fn();
        } finally {
            Object.defineProperty(globalThis, 'localStorage',   { value: origLS, configurable: true });
            Object.defineProperty(globalThis, 'sessionStorage', { value: origSS, configurable: true });
        }
    }

    test('all getters return null instead of throwing', () => {
        withThrowingStorage(() => {
            assert.equal(VaultLoader.storage.getCurrentKey(),   null);
            assert.equal(VaultLoader.storage.getAccessKey(),    null);
            assert.equal(VaultLoader.storage.getCreatingFlag(), null);
        });
    });

    test('all setters silently no-op instead of throwing', () => {
        withThrowingStorage(() => {
            VaultLoader.storage.setCurrentKey('apple-river-1234');
            VaultLoader.storage.setAccessKey('tok');
            VaultLoader.storage.setCreatingFlag('apple-river-1234');
            VaultLoader.storage.clearCurrentKey();
            VaultLoader.storage.clearAccessKey();
            VaultLoader.storage.clearCreatingFlag();
        });
    });
});
