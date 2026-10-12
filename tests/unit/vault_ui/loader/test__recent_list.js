/* =================================================================================
   VaultLoader — Recent Vaults List Unit Tests
   Verifies VaultLoaderRecent: add, list, remove, clear, isCurrent, and migration.
   Run: node tests/unit/vault_ui/loader/test__recent_list.js
   ================================================================================= */

import { suite, assert, clearVaultStorage } from './helpers.js';
import './load-loader.js';

// ---------------------------------------------------------------------------
// Basic CRUD
// ---------------------------------------------------------------------------
suite('VaultLoaderRecent — add and list', ({ test, before }) => {
    before(clearVaultStorage);

    test('list returns empty array initially', () => {
        assert.deepEqual(VaultLoader.recent.list(), []);
    });

    test('add stores an entry', () => {
        VaultLoader.recent.add('apple-river-1234', 'My Vault');
        const entries = VaultLoader.recent.list();
        assert.equal(entries.length, 1);
        assert.equal(entries[0].key,  'apple-river-1234');
        assert.equal(entries[0].name, 'My Vault');
    });

    test('add without name defaults name to key', () => {
        clearVaultStorage();
        VaultLoader.recent.add('coral-stamp-5678');
        const entries = VaultLoader.recent.list();
        assert.equal(entries[0].name, 'coral-stamp-5678');
    });

    test('add records format number', () => {
        clearVaultStorage();
        VaultLoader.recent.add('apple-river-1234');
        assert.equal(VaultLoader.recent.list()[0].format, 1, 'simple token → format 1');
    });

    test('add records a lastOpened timestamp', () => {
        clearVaultStorage();
        const before = Date.now();
        VaultLoader.recent.add('apple-river-1234');
        const after  = Date.now();
        const ts = VaultLoader.recent.list()[0].lastOpened;
        assert.ok(ts >= before && ts <= after, 'lastOpened is within test window');
    });

    test('newer entries appear first', () => {
        clearVaultStorage();
        VaultLoader.recent.add('apple-river-1234', 'First');
        VaultLoader.recent.add('coral-stamp-5678', 'Second');
        const entries = VaultLoader.recent.list();
        assert.equal(entries[0].key, 'coral-stamp-5678', 'most-recent first');
        assert.equal(entries[1].key, 'apple-river-1234');
    });

    test('storage cap keeps many entries (raised from 20 → 200; old vaults not silently dropped)', () => {
        clearVaultStorage();
        for (let i = 0; i < 30; i++) VaultLoader.recent.add('word-vault-' + (1000 + i), 'V' + i);
        assert.equal(VaultLoader.recent.list().length, 30, 'all 30 retained (was capped at 20)');
    });
});

// ---------------------------------------------------------------------------
// Upsert (idempotent add)
// ---------------------------------------------------------------------------
suite('VaultLoaderRecent — upsert behaviour', ({ test, before }) => {
    before(clearVaultStorage);

    test('adding same key twice keeps one entry', () => {
        VaultLoader.recent.add('apple-river-1234', 'Old Name');
        VaultLoader.recent.add('apple-river-1234', 'New Name');
        assert.equal(VaultLoader.recent.list().length, 1);
    });

    test('re-add updates name and moves entry to front', () => {
        VaultLoader.recent.add('apple-river-1234', 'First');
        VaultLoader.recent.add('coral-stamp-5678', 'Second');
        VaultLoader.recent.add('apple-river-1234', 'Updated');
        const entries = VaultLoader.recent.list();
        assert.equal(entries[0].key,  'apple-river-1234', 'moved to front');
        assert.equal(entries[0].name, 'Updated',          'name updated');
    });
});

// ---------------------------------------------------------------------------
// remove and clear
// ---------------------------------------------------------------------------
suite('VaultLoaderRecent — remove and clear', ({ test, before }) => {
    before(clearVaultStorage);

    test('remove deletes the matching entry', () => {
        VaultLoader.recent.add('apple-river-1234');
        VaultLoader.recent.add('coral-stamp-5678');
        VaultLoader.recent.remove('apple-river-1234');
        const entries = VaultLoader.recent.list();
        assert.equal(entries.length, 1);
        assert.equal(entries[0].key, 'coral-stamp-5678');
    });

    test('remove of non-existent key is a no-op', () => {
        VaultLoader.recent.add('apple-river-1234');
        VaultLoader.recent.remove('does-not-exist-0000');
        assert.equal(VaultLoader.recent.list().length, 1);
    });

    test('clear removes all entries', () => {
        VaultLoader.recent.add('apple-river-1234');
        VaultLoader.recent.add('coral-stamp-5678');
        VaultLoader.recent.clear();
        assert.deepEqual(VaultLoader.recent.list(), []);
    });
});

// ---------------------------------------------------------------------------
// isCurrent computed field
// ---------------------------------------------------------------------------
suite('VaultLoaderRecent — isCurrent flag', ({ test, before }) => {
    before(clearVaultStorage);

    test('isCurrent is false when no vault is set', () => {
        VaultLoader.recent.add('apple-river-1234');
        assert.equal(VaultLoader.recent.list()[0].isCurrent, false);
    });

    test('isCurrent is true for the vault matching localStorage key', () => {
        VaultLoader.storage.setCurrentKey('apple-river-1234');
        VaultLoader.recent.add('apple-river-1234');
        VaultLoader.recent.add('coral-stamp-5678');
        const entries = VaultLoader.recent.list();
        const current = entries.find(e => e.key === 'apple-river-1234');
        const other   = entries.find(e => e.key === 'coral-stamp-5678');
        assert.equal(current.isCurrent, true);
        assert.equal(other.isCurrent,   false);
        VaultLoader.storage.clearCurrentKey();
    });
});

// ---------------------------------------------------------------------------
// migrate() — silent one-shot union of legacy lists
// ---------------------------------------------------------------------------
suite('VaultLoaderRecent — migrate()', ({ test, before }) => {
    before(clearVaultStorage);

    test('migrate with no legacy data returns migrated:0', () => {
        const result = VaultLoader.recent.migrate();
        assert.equal(result.migrated, 0);
    });

    test('migrate unions sg-vault-history entries', () => {
        clearVaultStorage();
        const hist = [
            { key: 'apple-river-1234', name: 'Apple Vault', lastOpened: 1000 },
            { key: 'coral-stamp-5678', name: 'Coral Vault', lastOpened: 2000 }
        ];
        localStorage.setItem('sg-vault-history', JSON.stringify(hist));

        VaultLoader.recent.migrate();

        const entries = VaultLoader.recent.list();
        assert.equal(entries.length, 2);
        const apple = entries.find(e => e.key === 'apple-river-1234');
        assert.ok(apple, 'apple-river-1234 migrated');
        assert.equal(apple.name, 'Apple Vault');
    });

    test('migrate unions sg-vault-picker:credentials entries', () => {
        clearVaultStorage();
        const picker = [
            { vaultKey: 'iris-cliff-9012', vaultName: 'Iris Vault', savedAt: 3000 }
        ];
        localStorage.setItem('sg-vault-picker:credentials', JSON.stringify(picker));

        VaultLoader.recent.migrate();

        const entries = VaultLoader.recent.list();
        const iris = entries.find(e => e.key === 'iris-cliff-9012');
        assert.ok(iris, 'iris-cliff-9012 migrated from picker');
        assert.equal(iris.name, 'Iris Vault');
    });

    test('sg-vault-history wins on name conflict', () => {
        clearVaultStorage();
        const hist   = [{ key: 'apple-river-1234', name: 'History Name', lastOpened: 5000 }];
        const picker = [{ vaultKey: 'apple-river-1234', vaultName: 'Picker Name', savedAt: 1000 }];
        localStorage.setItem('sg-vault-history',            JSON.stringify(hist));
        localStorage.setItem('sg-vault-picker:credentials', JSON.stringify(picker));

        VaultLoader.recent.migrate();

        const apple = VaultLoader.recent.list().find(e => e.key === 'apple-river-1234');
        assert.equal(apple.name, 'History Name', 'history wins on conflict');
    });

    test('migrate removes legacy keys from localStorage', () => {
        clearVaultStorage();
        localStorage.setItem('sg-vault-history',            JSON.stringify([{ key: 'apple-river-1234', name: 'x', lastOpened: 1 }]));
        localStorage.setItem('sg-vault-picker:credentials', JSON.stringify([{ vaultKey: 'apple-river-1234', vaultName: 'y', savedAt: 1 }]));

        VaultLoader.recent.migrate();

        assert.equal(localStorage.getItem('sg-vault-history'),            null, 'legacy history removed');
        assert.equal(localStorage.getItem('sg-vault-picker:credentials'), null, 'legacy picker removed');
    });

    test('second call to migrate is a no-op (idempotent)', () => {
        clearVaultStorage();
        localStorage.setItem('sg-vault-history', JSON.stringify([{ key: 'apple-river-1234', name: 'x', lastOpened: 1 }]));
        VaultLoader.recent.migrate();            // first call — migrates
        const count1 = VaultLoader.recent.list().length;

        // Put data back — second migrate should NOT read it because guard is set
        localStorage.setItem('sg-vault-history', JSON.stringify([{ key: 'coral-stamp-5678', name: 'y', lastOpened: 1 }]));
        VaultLoader.recent.migrate();            // second call — should no-op
        const count2 = VaultLoader.recent.list().length;

        assert.equal(count2, count1, 'second migrate does not add entries');
    });

    test('migrate event emitted after successful migration', () => {
        clearVaultStorage();
        sgraphVault.events.clearLog();
        localStorage.setItem('sg-vault-history', JSON.stringify([{ key: 'apple-river-1234', name: 'x', lastOpened: 1 }]));

        VaultLoader.recent.migrate();

        const ev = sgraphVault.events._log.find(e => e.name === 'vault-recent-changed');
        assert.ok(ev, 'vault-recent-changed emitted after migration');
    });
});
