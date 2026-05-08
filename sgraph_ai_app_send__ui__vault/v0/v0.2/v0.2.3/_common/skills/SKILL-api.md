# SG/Vault — API Specification

**Version:** v0.2.3  
**Audience:** LLM agents, machine consumers  
**Registry slug:** `vault`

---

## Registry

```
window.__tool                        — convenience alias (single-tool page)
window.__tool_registry.find('vault') — explicit lookup (always works)
window.__tools[instanceId]           — all instances by ID
```

---

## Phase 1 Methods

### `getState()`

- **params:** none
- **returns:** `{ vaultId: string|null, title: string|null, decrypted: boolean, syncState: { ahead: number, behind: number, diverged: boolean }, activeView: 'files'|'sgit'|'settings', openTabs: string[] }`
- **async:** false
- **throws:** never
- **events emitted:** none
- **notes:** Returns nulls when vault is not decrypted. `openTabs` contains file paths currently open in the tab panel.

---

### `waitForReady(opts?)`

- **params:** `opts.timeout` — number, milliseconds, default `30000`
- **returns:** `Promise<{ ready: true }>`
- **async:** true
- **throws:** `Error('Vault ready timeout after Nms')` after `opts.timeout` ms
- **events emitted:** none (listens for `vault:opened` internally)
- **notes:** Resolves immediately if vault is already decrypted and dataSource is mounted. Safe to call multiple times.

---

### `navigateTo(opts)`

- **params:** `opts.tab` — string, required, file path within the vault (e.g. `'README.md'`, `'data/report.html'`)
- **params:** `opts.timeout` — number, milliseconds, default `10000`
- **returns:** `Promise<{ rendered: true, tab: string }>`
- **async:** true
- **throws:** `Error('navigateTo: tab parameter required')` if `opts.tab` missing
- **throws:** `Error('navigateTo: browse not mounted')` if vault is not open
- **throws:** `Error('Render timeout for "path"')` if panel does not render within `opts.timeout`
- **events emitted:** `vault:navigation-complete` with `{ instanceId, tab }`
- **notes:** Resolves **after** the panel has rendered, not just after the tab opens. Safe to screenshot immediately after resolution.

---

### `getSkills()`

- **params:** none
- **returns:** `{ human: string, browser: string, api: string }` — server-root-relative paths to SKILL files
- **async:** false
- **throws:** never
- **events emitted:** none

---

## Standard Events (SGA_TOOL)

### `tool:ready`

Fired on `window` when `api.activate()` is called.

```
detail: { instanceId: string, tool: 'vault', version: { api, ui, content } }
```

### `tool:state-changed`

Fired on `window` when vault state changes (vault opened/locked, navigation, sync).

```
detail: { instanceId: string, change: string | object }
```

---

## Vault Domain Events

### `vault:opened`

Fired when a vault is successfully decrypted and the file browser is mounted.

```
detail: { instanceId: string, vaultName: string, vaultId: string|null }
```

### `vault:locked`

Fired when the vault is locked (user clicks Lock / navigates away).

```
detail: { instanceId: string }
```

### `vault:navigation-complete`

Fired when `navigateTo()` resolves (panel has rendered).

```
detail: { instanceId: string, tab: string }
```

---

## Meta Surface

```js
window.__tool.meta.getMethods()   // string[] — registered method names
window.__tool.meta.getSkills()    // { human, browser, api } — SKILL file paths
window.__tool.meta.getLog()       // recent call log entries
window.__tool.instanceId          // string — unique instance identifier
```

---

## Backward-Compatible Events

These events continue to fire on `window.sgraphVault.events` (internal bus) for existing listeners:

- `shell-ready` — shell component connected
- `vault-opened` — vault decrypted  
- `vault-locked` — vault locked

Do not replace internal event listeners with the `window` CustomEvent pattern — both channels are active.

---

## Phase 2 (Planned — not yet shipped)

File read operations to be added: `getTree`, `getFileList`, `readFile`, `getFileMeta`.

## Phase 3 (Planned — not yet shipped)

Mutation operations to be added: `writeFile`, `renameFile`, `deleteFile`, `createFolder`, `push`, `pull`.
