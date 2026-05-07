# Code Review — v0.3.2 IFD Implementation

**Date:** 07 May 2026  
**Reviewer:** Explorer Dev (review session)  
**Commits reviewed:** `e3d010c` (Feature 1 — Share a Secret) + `0404827` (Feature 2 — wizard consolidation)  
**Branch:** `claude/explore-sgraph-ui-ybBkS`  
**Verdict:** 3 bugs must be fixed before shipping. All are small (5–10 lines each).

---

## Overall Assessment

Strong work. All 10 gotchas from doc 05 are addressed. IFD pattern is followed correctly — v0.3.0 base files untouched, all changes in `v0.3.2/`. Script load order in `en-gb/index.html` is correct and well-commented. Several good proactive additions not in the brief.

---

## Bugs — Must Fix

### Bug 1 — `UploadEngine.detectLocalePrefix()` does not exist

**File:** `upload-engine-secret.js` line 37  
**Impact:** Upload completes but share URL is never built — done screen never renders in secret mode. `TypeError` on every secret upload.

```javascript
// Current (broken):
var locale = UploadEngine.detectLocalePrefix();

// Fix:
var pathParts = window.location.pathname.split('/').filter(Boolean);
var locale    = pathParts[0] || 'en-gb';
```

---

### Bug 2 — `secretConfig` set after `result` — ephemerality notice always blank

**File:** `send-upload-options.js` lines 111–117  
**Impact:** The "⚠ 1 view · expires …" notice in the secret done state is always blank. `result` setter calls `_render()` synchronously before `secretConfig` has been assigned.

```javascript
// Current (broken — result triggers render before secretConfig is set):
this._els['done-secret'].result       = this.result;
if (this._secretConfig) {
    this._els['done-secret'].secretConfig = this._secretConfig;
}

// Fix — set secretConfig first, then result:
if (key === 'done-secret' && this._els['done-secret'] && this.result) {
    var doneEl = this._els['done-secret'];
    if (this._secretConfig) doneEl.secretConfig = this._secretConfig;
    doneEl.result = this.result;
    return;
}
```

---

### Bug 3 — `self._emit()` not defined on `UploadStepSelect`

**File:** `upload-step-select-secret.js` line 136  
**Impact:** Clicking "Create Secret Link" throws `TypeError: self._emit is not a function`. The secret submit event never fires. Nothing happens.

`UploadStepSelect` extends `SendComponent` which exposes `emit()` (not `_emit()`). The new `UploadStepOptions` component defines `_emit` itself — `UploadStepSelect` does not inherit it.

```javascript
// Current (broken):
self._emit('step-secret-submit', { text: ta.value, config: { ... } });

// Fix:
self.emit('step-secret-submit', { text: ta.value, config: { ... } });
```

---

## Minor Issues — Clean Up When Convenient

### Dead code branch in `_buildEphemeralityNotice`

**File:** `send-secret-view.js` lines 179–183

The final `if (remaining === 0 && maxDl > 0)` block is identical to the D1 check at line 162 and is unreachable. The comment says it handles `!auto_delete` but the condition doesn't test `auto_delete`. Either remove it, or fix the condition to `remaining === 0 && maxDl === 0` (unlimited views — no count shown).

---

### Double event listener on `#mode-file`

**File:** `upload-step-select-secret.js` line 93

`_origSetupListeners.call(this)` wires a click handler on `#mode-file`. The patch then wires a second one. Not a crash — both handlers set the same state — but produces a redundant double-fire on each click. Guard with the `_optionsWired` pattern already used elsewhere, or don't re-wire `#mode-file` in the patch (the original handler still works for it).

---

## Design Deviation — Delete Auth Derivation

**Files:** `send-upload-secret.js` lines 108–124

The brief (doc 01, section 2 "Delete Auth Pattern") specified:
```javascript
delete_auth = sha256(keyHex + ':sgraph-delete-v1')
```
This lets a sender re-derive their kill token from the URL fragment alone.

The implementation generates a **random 32-byte token** instead, communicates it to the engine via `UploadEngine._pendingDeleteAuth`, and embeds it in the kill URL fragment.

**The agent's approach is more secure** — delete capability is fully independent of the encryption key. If an attacker gets the key, they cannot delete the secret. The trade-off: if the sender loses the kill link, they cannot recover it (no re-derivation from the URL). This is consistent with the brief's stated philosophy ("If the sender loses it, they cannot delete. This is a feature, not a bug").

**Verdict:** Accept the deviation — it's the better design. Update doc 01 section 2 to reflect the random token approach (not key-derived).

---

## What the Dev Agent Got Right (Not in the Brief)

| Addition | Why it matters |
|---|---|
| `_extractContent()` — SGMETA envelope stripping | The upload pipeline wraps content in a 6-byte SGMETA magic + length header before encryption. Without stripping it, the decrypted text would be garbled binary. Critical. |
| Kill confirm flow (Screen H) | Fully implemented with "✓ Secret Deleted" and error state. |
| `ApiClient.deleteTransfer()` | Correctly sends `x-sgraph-transfer-delete-auth` header with raw token (not hash). |
| `no-cache` meta on `/en-gb/s/index.html` | Correct — each visit should re-fetch; stale cache would show wrong download count. |
| `data-testid` attributes on all interactive elements | E2E tests can target them without fragile selectors. |
| Backend schema issue documented in two files | Clear comment with exact fix needed for `Schema__Transfer.expires_at: str → Timestamp_Now`. |

---

## Fix Checklist for Dev Agent

- [ ] **Bug 1** — `upload-engine-secret.js:37` — replace `UploadEngine.detectLocalePrefix()` with `window.location.pathname` parsing
- [ ] **Bug 2** — `send-upload-options.js:111–117` — set `secretConfig` before `result` in `_syncComponent('done-secret')`
- [ ] **Bug 3** — `upload-step-select-secret.js:136` — change `self._emit(` to `self.emit(`
- [ ] **Cleanup** — remove dead branch in `send-secret-view.js:179–183`
- [ ] **Confirm** — random delete auth approach accepted (no change needed to code, update doc 01 section 2)
