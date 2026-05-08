/* SGraph Vault — JS API (SgToolApi adoption)
   v0.2.3 — Phase 1: getState, waitForReady, navigateTo, getSkills

   Follows the sg-tool-api adoption pattern. Loaded as type="module" so it can
   import SgToolApi from the tools CDN without touching vault-shell.js (non-module IIFE).

   Wires up after shell-ready event fires in VaultShell.connectedCallback(). */

import { VAULT_EVENTS } from './vault-events.js';

const SG_TOOL_API_URL = 'https://dev.tools.sgraph.ai/core/sg-tool-api/v0/v0.1/v0.1.0/sg-tool-api.js';

const SKILLS_BASE = '/_common/skills';

async function initVaultToolApi() {
    let SgToolApi;
    try {
        ({ SgToolApi } = await import(SG_TOOL_API_URL));
    } catch (err) {
        console.warn('[vault-tool-api] SgToolApi unavailable:', err.message);
        return;
    }

    const api = new SgToolApi({
        name:     'vault',
        slug:     'vault',
        version:  { api: '0.1.0', ui: '0.2.3', content: '0.1.0' },
        manifest: '/_common/manifest.json',
        skills: {
            human:   SKILLS_BASE + '/SKILL-human.md',
            browser: SKILLS_BASE + '/SKILL-browser.md',
            api:     SKILLS_BASE + '/SKILL-api.md',
        },
    });

    // ── Phase 1 methods ────────────────────────────────────────────────────

    api.register('getState', () => {
        const s = window.sgraphVault?.shell;
        return {
            vaultId:    s?._vault?._vaultId ?? null,
            title:      s?._vault?._settings?.vault_name ?? s?._vault?.name ?? null,
            decrypted:  !!(s?._vault),
            syncState:  s?._syncState ?? { ahead: 0, behind: 0, diverged: false },
            activeView: s?._activeView ?? 'files',
            openTabs:   s?._browse?._openTabs ? Array.from(s._browse._openTabs.keys()) : [],
        };
    }, { async: false });

    api.register('waitForReady', (opts = {}) => {
        return _waitForReady(opts.timeout ?? 30000);
    }, { async: true });

    api.register('navigateTo', (opts = {}) => {
        return _navigateTo(opts.tab, opts.timeout ?? 10000);
    }, { async: true, events: [VAULT_EVENTS.NAVIGATION_COMPLETE] });

    api.register('getSkills', () => ({
        human:   SKILLS_BASE + '/SKILL-human.md',
        browser: SKILLS_BASE + '/SKILL-browser.md',
        api:     SKILLS_BASE + '/SKILL-api.md',
    }), { async: false });

    // ── Activate ──────────────────────────────────────────────────────────
    // publishes window.__tool, fires tool:ready on window

    api.activate();
    window.sgraphVault.shell._toolApi = api;

    // ── Bridge existing vault events to window CustomEvents ───────────────
    // Keeps window.sgraphVault.events listeners working (backward compat).

    window.sgraphVault.events.on('vault-opened', ({ vaultName } = {}) => {
        _dispatchVaultEvent(VAULT_EVENTS.OPENED, {
            vaultName,
            vaultId: window.sgraphVault.shell?._vault?._vaultId ?? null,
        });
        // Notify tool:state-changed so api-explorer reflects new state
        _dispatchStateChanged({ change: 'vault-opened' });
    });

    window.sgraphVault.events.on('vault-locked', () => {
        _dispatchVaultEvent(VAULT_EVENTS.LOCKED, {});
        _dispatchStateChanged({ change: 'vault-locked' });
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _waitForReady(timeout) {
    const shell = window.sgraphVault?.shell;
    if (shell?._vault && shell?._dataSource) {
        return Promise.resolve({ ready: true });
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Vault ready timeout after ${timeout}ms`)),
            timeout
        );
        const handler = () => {
            clearTimeout(timer);
            window.sgraphVault.events.off('vault-opened', handler);
            resolve({ ready: true });
        };
        window.sgraphVault.events.on('vault-opened', handler);
    });
}

async function _navigateTo(tab, timeout) {
    if (!tab) throw new Error('navigateTo: tab parameter required');

    const shell = window.sgraphVault?.shell;
    if (!shell?._browse) throw new Error('navigateTo: browse not mounted — call waitForReady() first');

    shell._browse._openFileTab(tab);
    await _awaitTabRender(shell._browse, tab, timeout);

    _dispatchVaultEvent(VAULT_EVENTS.NAVIGATION_COMPLETE, { tab });
    _dispatchStateChanged({ change: 'navigation', tab });

    return { rendered: true, tab };
}

// Poll until the panel element has fully rendered — handles both text and iframe panels.
// HTML files are rendered in a same-origin iframe (BRW-013); their content is not visible
// in the parent's textContent, so we wait for iframe.contentDocument.readyState === 'complete'
// and for the body to have children before resolving.
function _awaitTabRender(browse, path, timeout) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeout;

        function check() {
            const tabId = browse._openTabs?.get(path);
            if (!tabId) {
                if (Date.now() > deadline) { reject(new Error(`Tab "${path}" not opened (timeout)`)); return; }
                setTimeout(check, 50);
                return;
            }

            const el = browse._sgLayout?.getPanelElement?.(tabId);
            if (!el) {
                if (Date.now() > deadline) { reject(new Error(`Panel for "${path}" not found (timeout)`)); return; }
                setTimeout(check, 50);
                return;
            }

            // Check for iframe first (HTML files rendered via BRW-013 srcdoc iframe)
            const iframe = el.querySelector('iframe');
            if (iframe) {
                const doc = iframe.contentDocument;
                if (!doc || doc.readyState !== 'complete') {
                    if (Date.now() > deadline) { reject(new Error(`Iframe load timeout for "${path}"`)); return; }
                    setTimeout(check, 50);
                    return;
                }
                // Also wait for body to have children — readyState can be 'complete' before JS runs
                const body = doc.body;
                if (!body || body.children.length === 0) {
                    if (Date.now() > deadline) { reject(new Error(`Iframe body empty (timeout) for "${path}"`)); return; }
                    setTimeout(check, 50);
                    return;
                }
                resolve({ rendered: true });
                return;
            }

            // Non-iframe path — wait for loading indicator to clear and content to appear.
            // Use innerHTML length rather than textContent to avoid false-resolve on tiny JSON.
            const text = el.textContent ?? '';
            if (text.includes('Loading...') || el.innerHTML.length < 100) {
                if (Date.now() > deadline) { reject(new Error(`Render timeout for "${path}"`)); return; }
                setTimeout(check, 50);
                return;
            }

            resolve({ rendered: true });
        }

        // Give requestAnimationFrame time to fire before first check
        setTimeout(check, 120);
    });
}

function _dispatchVaultEvent(name, detail) {
    const shell = window.sgraphVault?.shell;
    const instanceId = shell?._toolApi?.instanceId ?? 'vault';
    window.dispatchEvent(new CustomEvent(name, { detail: { instanceId, ...detail } }));
}

function _dispatchStateChanged(change) {
    const shell = window.sgraphVault?.shell;
    const instanceId = shell?._toolApi?.instanceId ?? 'vault';
    window.dispatchEvent(new CustomEvent('tool:state-changed', { detail: { instanceId, change } }));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
// shell-ready fires synchronously in VaultShell.connectedCallback() so the
// module import is the only async boundary before initVaultToolApi() runs.

if (window.sgraphVault?.shell) {
    initVaultToolApi();
} else {
    // shell-ready has already fired by module-load time in normal operation (vault-shell.js
    // is a synchronous classic script that runs before deferred modules). If we reach here
    // the shell failed to initialise — warn clearly rather than waiting silently.
    console.warn('[vault-tool-api] vault shell not initialised at module load — JS API will not be available');
    window.sgraphVault?.events?.on?.('shell-ready', initVaultToolApi);
}
