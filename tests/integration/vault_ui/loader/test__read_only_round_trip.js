/* =================================================================================
   Integration: Format-4 (64-hex vault_id) read-only round-trip.

   A format-4 key is a 64-character hex string (256-bit vault ID).  It is treated
   as read-only — the vault is identified by server-side lookup of the ID; no
   passphrase derivation is needed on the client.  The VaultLoader wraps this in
   VaultLoaderFormat.detectFormat(), returning { format: 4 }.

   STATUS: SKIPPED — awaiting crypto/server plumbing.
   VaultLoader.open() with format-4 currently requires:
     1. A real (or stubbed) server-side vault lookup by 64-hex ID.
     2. The SGVault in-memory stub does not yet support format-4 open semantics
        (it maps keys via Map<string,object>, not 64-hex IDs).
   Enable these tests once the integration stub exposes a format-4 open path.
   ================================================================================= */

import { suite, assert, clearIntegrationStorage } from './helpers.js';

// ---------------------------------------------------------------------------
// Placeholder suite — all tests skipped until format-4 stub exists
// ---------------------------------------------------------------------------
await suite('Format 4 round-trip (skipped — awaiting crypto layer)', async (test, skip) => {

    await test('detectFormat returns 4 for a 64-hex string', async () => {
        skip('format-4 stub not yet available');
        clearIntegrationStorage();

        const hex64 = 'a'.repeat(64);
        const result = globalThis.VaultLoaderFormat.detectFormat(hex64);
        assert(result.format === 4, `Expected format 4, got ${result.format}`);
    });

    await test('open() with format-4 key resolves without passphrase derivation', async () => {
        skip('format-4 stub not yet available');
        clearIntegrationStorage();

        const hex64 = 'b'.repeat(64);
        globalThis.SGVault._seed(hex64, 'Hex Vault');
        const result = await globalThis.VaultLoader.open(hex64);
        assert(result && result.vault, 'Expected vault to open');
        assert(result.readOnly === true, 'Format-4 vaults must be read-only');
    });

    await test('open() with format-4 key does not write key to localStorage', async () => {
        skip('format-4 stub not yet available');
        clearIntegrationStorage();

        const hex64 = 'c'.repeat(64);
        globalThis.SGVault._seed(hex64, 'Read-Only Hex Vault');
        await globalThis.VaultLoader.open(hex64);
        const stored = globalThis.localStorage.getItem('sg-vault-key');
        assert(stored === null, 'Format-4 open must not persist the key in localStorage');
    });

});
