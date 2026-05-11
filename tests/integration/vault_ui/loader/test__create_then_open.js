/* =================================================================================
   VaultLoader — Integration: create() → open() round-trip.
   Verifies that a freshly created vault can be reopened immediately.

   Run: node tests/integration/vault_ui/loader/test__create_then_open.js
   ================================================================================= */

import { suite, assert, clearIntegrationStorage } from './helpers.js';
import './load-integration.js';

// ---------------------------------------------------------------------------
// VaultLoader.create() — basic contract
// ---------------------------------------------------------------------------
await suite('VaultLoader.create() — basic contract', ({ test, before }) => {
    before(clearIntegrationStorage);

    test('resolves with vault and vaultKey', async () => {
        const r = await VaultLoader.create('apple-river-1234', { name: 'Test Vault' });
        assert.ok(r.vault,                     'vault object returned');
        assert.equal(r.vaultKey, 'apple-river-1234');
    });

    test('sets current key in localStorage', async () => {
        await VaultLoader.create('apple-river-1234', { name: 'Test Vault' });
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234');
    });

    test('adds vault to recent list with supplied name', async () => {
        await VaultLoader.create('apple-river-1234', { name: 'Named Vault' });
        const entries = VaultLoader.recent.list();
        const e = entries.find(e => e.key === 'apple-river-1234');
        assert.ok(e, 'entry in recent list');
        assert.equal(e.name, 'Named Vault');
    });

    test('emits vault-created event', async () => {
        sgraphVault.events.clearLog();
        await VaultLoader.create('apple-river-1234', { name: 'Test' });
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-created');
        assert.ok(ev, 'vault-created event emitted');
        assert.equal(ev.detail.vaultKey, 'apple-river-1234');
    });

    test('defaults name to token when none supplied', async () => {
        clearIntegrationStorage();
        await VaultLoader.create('coral-stamp-5678');
        const e = VaultLoader.recent.list().find(e => e.key === 'coral-stamp-5678');
        assert.equal(e.name, 'coral-stamp-5678', 'name falls back to token');
    });
});

// ---------------------------------------------------------------------------
// create() → open() round-trip — vault stays accessible after creation
// ---------------------------------------------------------------------------
await suite('VaultLoader.create() → open() round-trip', ({ test, before }) => {
    before(clearIntegrationStorage);

    test('vault opened immediately after creation returns same key', async () => {
        await VaultLoader.create('apple-river-1234', { name: 'Round-trip' });
        const r = await VaultLoader.open('apple-river-1234');
        assert.equal(r.vaultKey, 'apple-river-1234');
        assert.equal(r.format,   1);
    });

    test('recent list has exactly one entry after create + open (no duplicate)', async () => {
        clearIntegrationStorage();
        await VaultLoader.create('apple-river-1234', { name: 'No Dup' });
        await VaultLoader.open('apple-river-1234');
        const entries = VaultLoader.recent.list().filter(e => e.key === 'apple-river-1234');
        assert.equal(entries.length, 1, 'no duplicate recent entry');
    });

    test('create + open emits both vault-created and vault-opened', async () => {
        clearIntegrationStorage();
        sgraphVault.events.clearLog();
        await VaultLoader.create('apple-river-1234', { name: 'Events' });
        await VaultLoader.open('apple-river-1234');
        const names = sgraphVault.events._log.map(e => e.name);
        assert.ok(names.includes('vault-created'), 'vault-created fired');
        assert.ok(names.includes('vault-opened'),  'vault-opened fired');
    });

    test('isCurrent is true for opened vault', async () => {
        clearIntegrationStorage();
        await VaultLoader.create('apple-river-1234', { name: 'Current' });
        await VaultLoader.open('apple-river-1234');
        VaultLoader.recent.add('coral-stamp-5678', 'Other');
        const entries = VaultLoader.recent.list();
        const current = entries.find(e => e.key === 'apple-river-1234');
        const other   = entries.find(e => e.key === 'coral-stamp-5678');
        assert.equal(current.isCurrent, true);
        assert.equal(other.isCurrent,   false);
    });
});

// ---------------------------------------------------------------------------
// VaultLoader.lock() — clears state after create/open
// ---------------------------------------------------------------------------
await suite('VaultLoader.lock() — clears vault state', ({ test, before }) => {
    before(clearIntegrationStorage);

    test('lock clears current key from localStorage', async () => {
        await VaultLoader.create('apple-river-1234', { name: 'Lockable' });
        assert.ok(VaultLoader.storage.getCurrentKey(), 'key set before lock');
        VaultLoader.lock();
        assert.equal(VaultLoader.storage.getCurrentKey(), null, 'key cleared after lock');
    });

    test('lock clears access key from sessionStorage', async () => {
        VaultLoader.storage.setAccessKey('my-access-token');
        VaultLoader.lock();
        assert.equal(VaultLoader.storage.getAccessKey(), null);
    });

    test('lock clears creating flag from sessionStorage', async () => {
        VaultLoader.storage.setCreatingFlag('apple-river-1234');
        VaultLoader.lock();
        assert.equal(VaultLoader.storage.getCreatingFlag(), null);
    });

    test('lock emits vault-locked event', async () => {
        sgraphVault.events.clearLog();
        VaultLoader.lock();
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-locked');
        assert.ok(ev, 'vault-locked emitted');
    });

    test('vault still in recent list after lock (history preserved)', async () => {
        clearIntegrationStorage();
        await VaultLoader.create('apple-river-1234', { name: 'History' });
        VaultLoader.lock();
        const entries = VaultLoader.recent.list();
        assert.equal(entries.length, 1, 'recent list unchanged');
        assert.equal(entries[0].isCurrent, false, 'isCurrent is false after lock');
    });
});
