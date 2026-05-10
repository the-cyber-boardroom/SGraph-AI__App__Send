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
