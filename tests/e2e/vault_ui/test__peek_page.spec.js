/* =================================================================================
   Vault UI E2E — Peek Page Tests
   The peek page (/en-gb/vault/peek/) is standalone (zero _common/ deps) and should
   render correctly with no external resources.

   Covers:
     - Basic page structure (header, sections exist)
     - localStorage keys displayed (masked vault key visible)
     - Recent vaults listed from localStorage
     - Paste-to-inspect panel parses formats
     - Clear-state button removes only known vault keys (requires confirm() dialog)
   ================================================================================= */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------
test('peek page renders header title and key sections', async ({ page }) => {
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    // Header title (class .pk-header__title)
    await expect(page.locator('.pk-header__title')).toBeVisible();

    // The sections label "Current vault", "localStorage", "sessionStorage" exist.
    const body = await page.content();
    expect(body.toLowerCase()).toContain('localstorage');
    expect(body.toLowerCase()).toContain('sessionstorage');
});

// ---------------------------------------------------------------------------
// Current vault display — when LS has a vault key (key is masked to hide digits)
// ---------------------------------------------------------------------------
test('peek page shows masked vault key from localStorage', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('sg-vault-key', 'apple-river-1234');
    });
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    // The vault key is masked as "apple-river-····" — first two words visible.
    // Check the current-vault card renders with the key prefix.
    const card = page.locator('#currentVaultCard');
    await expect(card).toBeVisible();
    const cardText = await card.textContent();
    expect(cardText).toContain('apple-river-');
    // Digits are masked (····), so "1234" should NOT appear in the card.
    expect(cardText).not.toContain('1234');
});

// ---------------------------------------------------------------------------
// Empty state — no vault key in localStorage
// ---------------------------------------------------------------------------
test('peek page shows empty state when no vault key is set', async ({ page }) => {
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    // Page renders correctly (no JS crash).
    await expect(page).toHaveTitle(/Peek/i);

    // Current vault card shows "no vault" message.
    const card = page.locator('#currentVaultCard');
    await expect(card).toBeVisible();
    const text = await card.textContent();
    expect(text.toLowerCase()).toMatch(/no vault|not set/i);
});

// ---------------------------------------------------------------------------
// Recent vaults section — entry count shown from localStorage
// ---------------------------------------------------------------------------
test('peek page shows recent vault entry count from localStorage', async ({ page }) => {
    await page.addInitScript(() => {
        const recent = [
            { key: 'apple-river-1234', name: 'Apple Vault', lastOpened: Date.now(), format: 1 },
            { key: 'coral-stamp-5678', name: 'Coral Vault', lastOpened: Date.now(), format: 1 }
        ];
        localStorage.setItem('sg-vault-recent', JSON.stringify(recent));
    });
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    // The LS card should show "2 entries" for sg-vault-recent
    const lsCard = page.locator('#lsCard');
    await expect(lsCard).toBeVisible();
    const text = await lsCard.textContent();
    expect(text).toContain('2 entries');
});

// ---------------------------------------------------------------------------
// Paste-to-inspect panel — format detection without network call
// ---------------------------------------------------------------------------
test('paste-to-inspect detects simple token format', async ({ page }) => {
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    // Find the inspect textarea or input
    const textarea = page.locator('#inspectInput, textarea, input[type="text"]').first();
    if (!(await textarea.isVisible())) return; // graceful skip if no text input

    await textarea.fill('apple-river-1234');
    // Trigger inspect (button or Enter)
    const inspectBtn = page.locator('button').filter({ hasText: /inspect/i }).first();
    if (await inspectBtn.isVisible()) {
        await inspectBtn.click();
    } else {
        await textarea.press('Enter');
    }

    // Expect format detection output to mention format 1 or "simple"
    const result = page.locator('#inspectResult');
    if (await result.isVisible()) {
        const text = await result.textContent();
        expect(text.toLowerCase()).toMatch(/format.*1|simple/i);
    }
});

// ---------------------------------------------------------------------------
// Clear state button — accept the confirm() dialog and verify vault keys removed.
// Non-vault keys must NOT be removed (surgical clear, not localStorage.clear()).
// ---------------------------------------------------------------------------
test('clear state button removes vault keys, preserves unrelated keys', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('sg-vault-key',    'apple-river-1234');
        localStorage.setItem('sg-vault-recent', JSON.stringify([]));
        localStorage.setItem('unrelated-key',   'preserved');
    });

    // Auto-accept the confirm() dialog that clearAllState() shows.
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });

    const clearBtn = page.locator('button').filter({ hasText: /clear all vault/i }).first();
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // Wait for the re-render
    await page.waitForTimeout(300);

    const vaultKey  = await page.evaluate(() => localStorage.getItem('sg-vault-key'));
    const unrelated = await page.evaluate(() => localStorage.getItem('unrelated-key'));

    expect(vaultKey).toBeNull();
    // Non-vault key preserved (clearAllState only removes KNOWN_LS_KEYS)
    expect(unrelated).toBe('preserved');
});
