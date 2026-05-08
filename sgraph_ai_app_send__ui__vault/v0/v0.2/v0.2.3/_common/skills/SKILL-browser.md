# SG/Vault — Browser / Playwright Skill Guide

**Version:** v0.2.3  
**Audience:** Playwright agents, browser-console automation, documentation screenshot bots

---

## Registry Access

```js
// Single-tool page (standard case)
const tool = window.__tool;

// Multi-tool page or explicit lookup
const tool = window.__tool_registry.find('vault');

// All registered instances
const all = Object.values(window.__tools);
```

---

## Open a Vault and Wait Until Ready

```js
// Navigate to the vault URL with the token in the hash, then:
await window.__tool.waitForReady();

// With custom timeout (ms)
await window.__tool.waitForReady({ timeout: 60000 });

// Read current state once ready
const state = window.__tool.getState();
console.log(state.title);      // 'Private Health Score'
console.log(state.decrypted);  // true
console.log(state.activeView); // 'files'
console.log(state.openTabs);   // []
```

---

## Get Vault State (synchronous)

```js
const state = window.__tool.getState();
// Returns:
// {
//   vaultId:    'abc123def456',
//   title:      'Private Health Score',
//   decrypted:  true,
//   syncState:  { ahead: 0, behind: 0, diverged: false },
//   activeView: 'files',
//   openTabs:   ['README.md', 'data.json']
// }
```

`getState()` is synchronous and never throws. Returns nulls when vault is not open.

---

## Navigate to a File (await render-complete)

```js
// Open a file and wait until it has rendered before proceeding
await window.__tool.navigateTo({ tab: 'README.md' });

// Now safe to screenshot — render is complete
// await page.screenshot({ path: 'readme.png' });

// Navigate through page layout sections
await window.__tool.navigateTo({ tab: 'overview.md' });
await window.__tool.navigateTo({ tab: 'patient-flow.html' });
await window.__tool.navigateTo({ tab: 'data.json' });
```

`navigateTo` resolves only after the panel content has rendered — not just when the click fires. Safe to screenshot immediately after.

---

## Take Repeatable Screenshots of All Page Sections

```js
// Full Playwright example: open vault, screenshot every section
await page.goto('https://vault.sgraph.ai/en-gb/vault#apple-river-1234');

await page.evaluate(() => window.__tool.waitForReady());
const state = await page.evaluate(() => window.__tool.getState());
console.log('Vault:', state.title);

// Screenshot each open tab
for (const tabPath of ['README.md', 'overview.md', 'patient-flow.html']) {
    await page.evaluate((tab) => window.__tool.navigateTo({ tab }), tabPath);
    const name = tabPath.replace(/[^a-z0-9]/gi, '-');
    await page.screenshot({ path: `screenshots/${name}.png` });
}
```

---

## Discover Skills at Runtime

```js
const skills = window.__tool.getSkills();
// {
//   human:   '/_common/skills/SKILL-human.md',
//   browser: '/_common/skills/SKILL-browser.md',
//   api:     '/_common/skills/SKILL-api.md'
// }

// meta.getSkills() does the same via the SgToolApi meta surface
const meta = window.__tool.meta.getSkills();
```

---

## Discover All Registered Methods

```js
const methods = window.__tool.meta.getMethods();
// ['getState', 'waitForReady', 'navigateTo', 'getSkills', ...]

// See recent call log
const log = window.__tool.meta.getLog();
```

---

## Listen for Events

```js
// Vault lifecycle events
window.addEventListener('tool:ready', e => {
    console.log('Tool ready:', e.detail.instanceId, e.detail.tool);
});

window.addEventListener('vault:opened', e => {
    console.log('Vault opened:', e.detail.vaultName, e.detail.vaultId);
});

window.addEventListener('vault:locked', e => {
    console.log('Vault locked');
});

window.addEventListener('vault:navigation-complete', e => {
    console.log('Navigated to:', e.detail.tab);
});

// General state changes (activeView, openTabs, syncState)
window.addEventListener('tool:state-changed', e => {
    console.log('State changed:', e.detail.change);
});
```

---

## Dev Panel (sg-tool-api-explorer)

When the vault loads, the following components auto-bind on `tool:ready`:

```html
<sg-tool-api-explorer></sg-tool-api-explorer>
<sg-tool-api-console></sg-tool-api-console>
<sg-tool-api-manifest></sg-tool-api-manifest>
```

These are mounted in the vault's debug sidebar (click **Debug** in the vault header). Use them to explore registered methods, call them interactively, and read the manifest.
