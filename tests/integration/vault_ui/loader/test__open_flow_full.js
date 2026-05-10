/* =================================================================================
   VaultLoader — Integration: open() end-to-end across all supported formats.
   Uses in-memory SGVault stub — no network, no Web Crypto.

   Run: node tests/integration/vault_ui/loader/test__open_flow_full.js
   ================================================================================= */

import { suite, assert, clearIntegrationStorage } from './helpers.js';
import './load-integration.js';

// ---------------------------------------------------------------------------
// Format 1 — simple token (word-word-NNNN)
// ---------------------------------------------------------------------------
await suite('VaultLoader.open() — format 1: simple token', ({ test, before }) => {
    before(() => {
        clearIntegrationStorage();
        SGVault._seed('apple-river-1234', 'Apple Vault');
    });

    test('resolves with vault, format, and vaultKey', async () => {
        const r = await VaultLoader.open('apple-river-1234');
        assert.ok(r.vault,                    'vault object returned');
        assert.equal(r.format,    1,           'format 1 detected');
        assert.equal(r.vaultKey, 'apple-river-1234');
    });

    test('sets current key in localStorage', async () => {
        await VaultLoader.open('apple-river-1234');
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234');
    });

    test('adds vault to recent list', async () => {
        await VaultLoader.open('apple-river-1234');
        const entries = VaultLoader.recent.list();
        const entry   = entries.find(e => e.key === 'apple-river-1234');
        assert.ok(entry, 'entry appears in recent list');
        assert.equal(entry.name, 'Apple Vault', 'name taken from vault.name');
    });

    test('emits vault-opened event', async () => {
        sgraphVault.events.clearLog();
        await VaultLoader.open('apple-river-1234');
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-opened');
        assert.ok(ev, 'vault-opened event emitted');
        assert.equal(ev.detail.vaultKey, 'apple-river-1234');
        assert.equal(ev.detail.format,   1);
    });

    test('trimming: leading/trailing whitespace is stripped', async () => {
        const r = await VaultLoader.open('  apple-river-1234  ');
        assert.equal(r.vaultKey, 'apple-river-1234');
    });
});

// ---------------------------------------------------------------------------
// Format 2 — passphrase:hex_id (12-char lowercase hex)
// ---------------------------------------------------------------------------
await suite('VaultLoader.open() — format 2: passphrase:hex_id', ({ test, before }) => {
    const KEY = 'mysecret:abcdef012345';
    before(() => {
        clearIntegrationStorage();
        SGVault._seed(KEY, 'Hex ID Vault');
    });

    test('resolves with format 2', async () => {
        const r = await VaultLoader.open(KEY);
        assert.equal(r.format,    2);
        assert.equal(r.vaultKey, KEY);
    });

    test('vault name from store becomes recent entry name', async () => {
        await VaultLoader.open(KEY);
        const e = VaultLoader.recent.list().find(e => e.key === KEY);
        assert.equal(e.name, 'Hex ID Vault');
    });
});

// ---------------------------------------------------------------------------
// Format 3 — passphrase:alnum_id (4–24 lowercase alnum chars)
// ---------------------------------------------------------------------------
await suite('VaultLoader.open() — format 3: passphrase:alnum_id', ({ test, before }) => {
    const KEY = 'mypassphrase:myvaultid01';
    before(() => {
        clearIntegrationStorage();
        SGVault._seed(KEY, 'Alnum ID Vault');
    });

    test('resolves with format 3', async () => {
        const r = await VaultLoader.open(KEY);
        assert.equal(r.format, 3);
        assert.equal(r.vaultKey, KEY);
    });
});

// ---------------------------------------------------------------------------
// Format 4 — read-only (not yet supported)
// ---------------------------------------------------------------------------
await suite('VaultLoader.open() — format 4: read-only throws', ({ test, before }) => {
    before(clearIntegrationStorage);

    const READ_ONLY_KEY = 'abcdef012345 ' + '0'.repeat(64);

    test('throws with "not yet supported" message', async () => {
        await assert.rejects(
            () => VaultLoader.open(READ_ONLY_KEY),
            /not yet supported/i
        );
    });

    test('emits vault-open-failed event', async () => {
        sgraphVault.events.clearLog();
        await VaultLoader.open(READ_ONLY_KEY).catch(() => {});
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-open-failed');
        assert.ok(ev, 'vault-open-failed emitted');
    });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------
await suite('VaultLoader.open() — error paths', ({ test, before }) => {
    before(clearIntegrationStorage);

    test('empty input throws format error', async () => {
        await assert.rejects(() => VaultLoader.open(''), /empty/i);
    });

    test('unrecognised format throws and emits open-failed', async () => {
        sgraphVault.events.clearLog();
        await VaultLoader.open('notavalidkey').catch(() => {});
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-open-failed');
        assert.ok(ev, 'vault-open-failed emitted for bad format');
    });

    test('vault not found (404) rejects with descriptive error', async () => {
        await assert.rejects(
            () => VaultLoader.open('apple-river-9999'),
            /not found/i
        );
    });

    test('vault not found emits vault-open-failed', async () => {
        sgraphVault.events.clearLog();
        await VaultLoader.open('apple-river-9999').catch(() => {});
        const ev = sgraphVault.events._log.find(e => e.name === 'vault-open-failed');
        assert.ok(ev, 'vault-open-failed emitted when vault missing');
    });
});
