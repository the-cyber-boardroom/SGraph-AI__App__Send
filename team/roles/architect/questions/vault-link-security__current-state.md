# Vault URL Bootstrap — Security Audit: Current State

**Date:** 2026-05-08
**Scope:** `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/index.html`
**Status:** Audit complete — two findings, one fixed in v0.2.2, one deferred to v0.2.3

---

## 1. URL Bootstrap Logic (inline `<script>` at top of index.html)

The page is served at two paths: `/` (root, local dev) and `/en-gb/vault` (canonical production path, via `en-gb/vault/index.html`).

```
Conditions on load:
  noHash && onVaultPath → restore from sessionStorage('sg-vault-session') or redirect to /en-gb/
  noHash && !onVaultPath → redirect to /en-gb/
  hash present (any path) → page loads normally, vault-entry processes hash
```

All redirects use `window.location.replace()` — no race-condition from `location.href =`. ✓

---

## 2. Session Restore Flow

1. User opens vault with token T → sessionStorage('sg-vault-session') set on line 717 (auto-open) or line 672 (create)
2. User refreshes page → bootstrap reads sessionStorage, calls `location.replace('/en-gb/vault#' + T)`
3. Vault-entry processes the hash token and auto-opens
4. After opening: hash is removed via `history.replaceState(null, '', '/en-gb/vault')`

This means the vault token is never exposed in the browser history after opening. ✓

---

## 3. Storage Inventory

| Key | Storage | Written by | Read by | Purpose |
|-----|---------|-----------|--------|---------|
| `sg-vault-session` | sessionStorage | v0.2.2 index.html | bootstrap script | Session restore on refresh |
| `sg-vault-creating` | sessionStorage | vault-entry (landing redirect) | v0.2.2 index.html | Signal to create instead of open |
| `sg-vault-key` | **localStorage** | vault-entry.js (base), v0.2.2 index.html | vault-entry.js:78 | Pre-populate entry form for "last vault" |
| `sg-vault-history` | localStorage | vault-entry.js | vault-entry.js | Recent vaults list (shows in entry form) |
| `sg-vault-picker:credentials` | localStorage | v0.2.2 index.html | vault-entry picker | Vault picker with stored credentials |
| `sg-vault-autosync` | localStorage | vault-shell.js | vault-shell.js | Auto-sync toggle preference |
| `sg-vault-openrouter-key` | localStorage | vault-generate.js | vault-generate.js | LLM API key preference |

---

## 4. Findings

### Finding 1 — Vault write key in localStorage (MEDIUM risk)

**Location:** `index.html` line 671; `vault-entry.js` line 202  
**Issue:** The vault token (write key) is stored in `localStorage` under `sg-vault-key`. LocalStorage persists across browser restarts and is readable by any script on the same origin. A vault token is equivalent to a private key — if an attacker gains XSS on the vault origin, they can exfiltrate all vault keys.  
**Current mitigations:** The vault origin (`vault.sgraph.ai`) serves no user-uploaded content, so same-origin XSS is low probability. The write key is separately required for mutations.

**Recommendation:** Migrate `sg-vault-key` from `localStorage` → `sessionStorage`.  
- Pre-population in vault-entry.js line 78 uses `localStorage.getItem('sg-vault-key')` — this would stop working for cross-session pre-population, which is the intentional trade-off.
- The recent vaults history (`sg-vault-history`) serves the "last vault" UI better anyway. Consider removing the single-key `sg-vault-key` entirely.

**Affected files for fix (v0.2.3):**
- `vault-entry.js` line 78: `localStorage.getItem` → `sessionStorage.getItem`
- `vault-entry.js` line 202: `localStorage.setItem` → `sessionStorage.setItem`
- `vault-shell.js` line 216: `localStorage.removeItem` → `sessionStorage.removeItem` (already has sessionStorage.removeItem at v0.2.2 index.html line 489)
- `v0.2.2/index.html` line 671: remove duplicate localStorage write (sessionStorage already set on line 672)

### Finding 2 — No legacy `/en-gb/vault#{key}` format detector (LOW risk)

**Context:** The vault canonical URL is `/en-gb/vault#token`. The `downloadUrl` built for share links uses `origin + '/#' + token` (root path, not `/en-gb/vault`). This inconsistency means some generated links land on `/` rather than `/en-gb/vault`.

On the root `/` path, the vault shell IS loaded (it's the same index.html). The bootstrap `if (noHash && !onVaultPath)` only redirects when there is no hash. If there is a hash (e.g., `/#token`), the page loads normally and the vault auto-opens. So functionally both paths work.

**Recommendation:** Normalise `downloadUrl` to always use `/en-gb/vault#token` format:
```javascript
// In v0.2.2 index.html _mountBrowse patch (line 465):
browse.downloadUrl = window.location.origin + '/en-gb/vault#' + token;
```

**Affected files for fix (v0.2.2 patch, safe to apply now):**  
- `v0.2.2/index.html` line 465: update downloadUrl base path

---

## 5. Fixes Applied in This Audit

### Fix A — Normalise downloadUrl base path (Finding 2, SAFE)

Applied immediately in `v0.2.2/index.html`:

```javascript
// Before:
browse.downloadUrl = window.location.origin + '/#' + token;
// After:
browse.downloadUrl = window.location.origin + '/en-gb/vault#' + token;
```

### Fix B — localStorage → sessionStorage for vault key (Finding 1, v0.2.3)

**Not applied in v0.2.2** — requires coordinated change across base layer (`vault-entry.js`). Tracked as follow-up ticket `VLT-SEC-001`.

---

## 6. Conclusion

The URL bootstrap is sound: all redirects use `location.replace`, the vault token is removed from the address bar after opening, and session restore works correctly via `sessionStorage`. The one architectural concern — vault key in `localStorage` — is a known trade-off for "remember my vault" UX and is mitigated by the low XSS risk at the vault origin. Migrating to `sessionStorage` is recommended for v0.2.3.
