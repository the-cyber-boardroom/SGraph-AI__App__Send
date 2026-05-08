# Consolidate Delivery + Share Mode — Implementation Plan

**Date:** 07 May 2026  
**Role:** Explorer Dev  
**IFD Target:** v0.3.2 surgical overlay (same sprint as Share-a-Secret)  
**Effort:** ~1 Explorer session  
**Dependency:** Can be built in parallel with Share-a-Secret changes — no overlap in touched files

---

## 1. The Change

Reduce the upload wizard from **6 steps to 5 steps** by merging "Delivery" (step 2) and "Share mode" (step 3) into a single "Options" step (step 2).

| Before | After |
|--------|-------|
| Upload → **Delivery** → **Share mode** → Confirm → Encrypt & Upload → Done | Upload → **Options** → Confirm → Encrypt & Upload → Done |

The Options step shows:
- **Primary:** Delivery mode cards (File viewer / Gallery / Download) — same 3 cards, same visual weight
- **Secondary:** Share mode selector (Token / Combined link / Separate) — smaller, inline, below the cards

Most users never touch share mode. Making it secondary (but visible) is better than a forced full-screen step.

---

## 2. Files That Change

| File | Change type | What |
|------|-------------|------|
| `upload-constants.js` | Patch | `TOTAL_STEPS` 6→5, `STEP_LABELS`, `STATE_TO_STEP` |
| `send-upload.js` | Patch | State machine, `_activeComponent`, `_wireEvents`, `_wireNextButton`, `_syncComponent` |
| `upload-step-confirm.js` | Patch | Both "change" links now go to the single combined step |
| `upload-step-options.js` | **New file** | Combined delivery + share mode component |
| `upload-step-options.css` | **New file** | Styles for the secondary share mode selector |

`upload-step-delivery.js` and `upload-step-share.js` are **not modified** — they remain in v0.3.0 and simply go unused in this flow. No deletion, no breakage.

---

## 3. Gotchas — Full Map

### Gotcha 1 — `TOTAL_STEPS` and `STEP_LABELS` in `upload-constants.js`

**Location:** `upload-constants.js` lines 12–13

```javascript
// Current:
var STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];
var TOTAL_STEPS = 6;

// Required:
var STEP_LABELS = ['Upload', 'Options', 'Confirm', 'Encrypt & Upload', 'Done'];
var TOTAL_STEPS = 5;
```

`TOTAL_STEPS` is passed into `<send-step-indicator>` which renders the progress bar and breadcrumbs. Changing it cascades automatically everywhere the indicator renders.

**IFD approach:** Patch `UploadConstants` in v0.3.2 overlay:
```javascript
// v0.3.2/upload-constants-patch.js
UploadConstants.STEP_LABELS = ['Upload', 'Options', 'Confirm', 'Encrypt & Upload', 'Done'];
UploadConstants.TOTAL_STEPS = 5;
```

---

### Gotcha 2 — `STATE_TO_STEP` mapping

**Location:** `upload-constants.js` lines 15–24

```javascript
// Current:
var STATE_TO_STEP = {
    'idle': 1, 'folder-options': 1, 'file-ready': 1,
    'choosing-delivery': 2,
    'choosing-share': 3,      // ← this step is going away
    'confirming': 4,          // ← becomes 3
    'zipping': 5, ...         // ← becomes 4
    'complete': 6,            // ← becomes 5
};

// Required:
UploadConstants.STATE_TO_STEP = {
    'idle': 1, 'folder-options': 1, 'file-ready': 1,
    'choosing-options': 2,    // NEW combined state
    'confirming': 3,
    'zipping': 4, 'reading': 4, 'encrypting': 4,
    'creating': 4, 'uploading': 4, 'completing': 4,
    'complete': 5,
    'error': 1
};
```

Note: `choosing-delivery` and `choosing-share` are removed from the map. They won't appear as active states any more but leaving them unmapped is harmless (they fall through to `undefined`, which `stepForState()` should handle gracefully — check that function).

---

### Gotcha 3 — `_activeComponent()` in `send-upload.js`

**Location:** `send-upload.js` lines 173–185

```javascript
// Current:
_activeComponent() {
    switch (this._state) {
        case 'choosing-delivery': return 'delivery';
        case 'choosing-share':    return 'share';
        ...
    }
}

// Patch adds:
case 'choosing-options':  return 'options';   // new combined component
// Remove: 'choosing-delivery' and 'choosing-share' cases (or leave — they just won't be reached)
```

The `'options'` key must also be added to the element map in `_render()`:
```javascript
// _render() — shell construction block
var names = ['select','delivery','share','confirm','progress','done'];
var tags  = ['upload-step-select','upload-step-delivery','upload-step-share', ...];

// Patch: add 'options' / 'upload-step-options' to both arrays
// Keep 'delivery' and 'share' in the arrays — they stay in the DOM, just hidden
```

---

### Gotcha 4 — `_advanceToDelivery()` must become `_advanceToOptions()`

**Location:** `send-upload.js` line 450

```javascript
// Current — called from _setFile, _onMultiFile, _onFolderInput, _onFolderDrop, _onFolderUpload
_advanceToDelivery() {
    this._deliveryOptions     = UploadFileUtils.detectDeliveryOptions(...);
    this._recommendedDelivery = UploadFileUtils.getSmartDefault(...);
    this._selectedDelivery    = this._recommendedDelivery;
    this.state = 'choosing-delivery';   // ← change to 'choosing-options'
}
```

Patch changes the final line to `this.state = 'choosing-options'`. All call sites stay the same.

---

### Gotcha 5 — `_wireNextButton()` transition logic

**Location:** `send-upload.js` lines 332–349

```javascript
// Current:
if (self._state === 'choosing-delivery') {
    self._selectedDelivery = self._selectedDelivery || self._recommendedDelivery || 'download';
    self.state = 'choosing-share';
} else if (self._state === 'choosing-share') {
    self._shareMode = self._shareMode || 'token';
    self.state = 'confirming';
}

// Required:
if (self._state === 'choosing-options') {
    self._selectedDelivery = self._selectedDelivery || self._recommendedDelivery || 'download';
    self._shareMode        = self._shareMode        || 'token';
    self.state = 'confirming';
}
```

Also: the inline Next button is shown when `this._state === 'choosing-delivery' || this._state === 'choosing-share'`. Change to `this._state === 'choosing-options'`.

---

### Gotcha 6 — `_wireEvents()` event listeners

**Location:** `send-upload.js` lines 294–295

```javascript
// Current:
c.addEventListener('step-delivery-selected', function(e) {
    self._selectedDelivery = e.detail.deliveryId;
    self.state = 'choosing-share';   // auto-advance to share step
});
c.addEventListener('step-share-selected', function(e) {
    self._shareMode = e.detail.mode;
    self.state = 'confirming';
});

// Required (new combined event from upload-step-options):
c.addEventListener('step-options-selected', function(e) {
    self._selectedDelivery = e.detail.deliveryId;
    self._shareMode        = e.detail.shareMode;
    self.state = 'confirming';
});
```

Keep the old `step-delivery-selected` and `step-share-selected` listeners — they are still emitted by the v0.3.0 components which remain registered, just hidden. Removing them is safe but not necessary.

---

### Gotcha 7 — `step-back` handler

**Location:** `send-upload.js` lines 319–325

```javascript
// Current:
case 'choosing-delivery': self._resetSelection(); self.state = 'idle'; break;
case 'choosing-share':    self.state = 'choosing-delivery'; break;
case 'confirming':        self.state = 'choosing-share'; break;

// Required:
case 'choosing-options':  self._resetSelection(); self.state = 'idle'; break;
case 'confirming':        self.state = 'choosing-options'; break;
```

---

### Gotcha 8 — `step-nav` click navigation (breadcrumb)

**Location:** `send-upload.js` lines 264–283

```javascript
// Current:
if (step === 2) self.state = 'choosing-delivery';
if (step === 3) self.state = 'choosing-share';
if (step === 4) self.state = 'confirming';
// Friendly key cleared when step <= 3

// Required:
if (step === 2) self.state = 'choosing-options';
if (step === 3) self.state = 'confirming';
// Friendly key cleared when step <= 2
```

---

### Gotcha 9 — `_syncComponent('options')` in `_syncComponent()`

**Location:** `send-upload.js` lines 200–208

The new `upload-step-options` element needs all delivery props AND the current share mode:

```javascript
// Add to _syncComponent():
if (key === 'options' && e.options) {
    e.options.deliveryOptions     = this._deliveryOptions;
    e.options.recommendedDelivery = this._recommendedDelivery;
    e.options.selectedDelivery    = this._selectedDelivery;
    e.options.fileSummary         = this._fileSummary();
    e.options.shareMode           = this._shareMode;
}
```

---

### Gotcha 10 — `upload-step-confirm.js` change links

**Location:** `upload-step-confirm.js` line 236–238

Both "change delivery" and "change share mode" links currently emit different events. They must now both navigate to the same combined step:

```javascript
// Current:
self.dispatchEvent(new CustomEvent('step-change-delivery', { bubbles: true, composed: true }));
// and:
self.dispatchEvent(new CustomEvent('step-change-share', { bubbles: true, composed: true }));
```

**Option A (minimal):** The `send-upload.js` patch handles both old events identically:
```javascript
c.addEventListener('step-change-delivery', function() { self.state = 'choosing-options'; });
c.addEventListener('step-change-share',    function() { self.state = 'choosing-options'; });
```
No change to `upload-step-confirm.js`. Both old events just route to the same new state. Clean IFD approach.

---

### Gotcha 11 — Delivery card click vs. Next button behaviour change

**Current behaviour:** Clicking a delivery card in `upload-step-delivery` immediately emits `step-delivery-selected` and the orchestrator auto-advances to `choosing-share`. Card click = page navigation.

**New behaviour:** Clicking a delivery card in `upload-step-options` selects it (highlights it) but does NOT advance. The user presses "Next →" to proceed. This is the correct pattern for a combined step — otherwise clicking delivery would bypass the share mode selector.

**Implementation:** `upload-step-options` handles card clicks internally (update selection state), does NOT emit `step-options-selected` on card click. Emits `step-options-selected` only when the Next button is clicked (or the Next button in the header, which triggers via `_wireNextButton`).

Actually: the Next button lives in the orchestrator header (not inside the component). So the component just needs to expose its current selections as properties that the orchestrator can read when Next is clicked. Or the component emits the event when Next is clicked inside it. See the wireframe for the combined step — the "Next →" button stays in the header.

---

## 4. New Component: `upload-step-options.js`

The combined component renders delivery cards (primary) and share mode as a compact secondary row.

```javascript
// v0.3.2/upload-step-options.js  (new combined delivery + share component)

class UploadStepOptions extends SendComponent {
    static useShadow = false;   // No external template — inline render

    constructor() {
        super();
        this._deliveryOptions     = [];
        this._recommendedDelivery = 'download';
        this._selectedDelivery    = null;
        this._fileSummary         = null;
        this._shareMode           = 'token';
    }

    set deliveryOptions(v)     { this._deliveryOptions = v || [];     this._render(); }
    set recommendedDelivery(v) { this._recommendedDelivery = v;       this._render(); }
    set selectedDelivery(v)    { this._selectedDelivery = v;          this._render(); }
    set fileSummary(v)         { this._fileSummary = v;               this._render(); }
    set shareMode(v)           { this._shareMode = v || 'token';      this._render(); }

    onReady() { this._render(); }

    _render() {
        // ── File summary (compact) ──────────────────────────────────────
        var summaryHtml = '';
        if (this._fileSummary) {
            summaryHtml = '<div class="file-summary file-summary--compact">...</div>';
        }

        // ── Delivery cards (primary — same layout as upload-step-delivery) ──
        var sel = this._selectedDelivery || this._recommendedDelivery;
        var cardsHtml = (this._deliveryOptions || []).map(function(opt) {
            var active = opt.id === sel ? ' delivery-card--recommended default-selected' : '';
            return '<div class="delivery-card' + active + '" data-delivery="' + opt.id + '">' +
                '<div class="delivery-card__icon">' + opt.icon + '</div>' +
                '<div class="delivery-card__body">' +
                    '<div class="delivery-card__title">' + opt.title + '</div>' +
                    '<div class="delivery-card__desc">' + opt.desc + '</div>' +
                    '<div class="delivery-card__hint">' + opt.hint + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        // ── Share mode (secondary — compact inline selector) ────────────
        var modes = (typeof UploadCrypto !== 'undefined') ? UploadCrypto.SHARE_MODES : [];
        var sm    = this._shareMode;
        var shareHtml = modes.map(function(m) {
            var active = m.id === sm ? ' share-pill--active' : '';
            return '<button class="share-pill' + active + '" data-mode="' + m.id + '">' +
                m.icon + ' ' + m.title +
            '</button>';
        }).join('');

        this.innerHTML =
            summaryHtml +
            '<h3 class="step-title">How should the recipient get this?</h3>' +
            '<div class="delivery-cards">' + cardsHtml + '</div>' +
            '<div class="share-mode-row">' +
                '<span class="share-mode-row__label">Share via:</span>' +
                '<div class="share-pills">' + shareHtml + '</div>' +
            '</div>' +
            '<button class="back-link">&larr; Back</button>';

        this._setupListeners();
    }

    _setupListeners() {
        var self = this;

        // Delivery card click — update selection only (no navigation)
        this.querySelectorAll('.delivery-card[data-delivery]').forEach(function(card) {
            card.addEventListener('click', function() {
                self._selectedDelivery = card.getAttribute('data-delivery');
                self._render();
            });
        });

        // Share pill click — update selection only
        this.querySelectorAll('.share-pill[data-mode]').forEach(function(pill) {
            pill.addEventListener('click', function() {
                self._shareMode = pill.getAttribute('data-mode');
                self._render();
            });
        });

        // Back
        var backBtn = this.querySelector('.back-link');
        if (backBtn) backBtn.addEventListener('click', function() { self.emit('step-back'); });
    }
}

customElements.define('upload-step-options', UploadStepOptions);
```

The orchestrator's Next button reads `self._selectedDelivery` and `self._shareMode` directly from its own state (which gets updated each time `_syncComponent('options')` runs after a re-render). When the user clicks a delivery card, `step-options-selected` is NOT emitted — the component just re-renders itself with the new selection. The orchestrator picks up the current selection from the component's props when Next is clicked via `_wireNextButton`.

Actually simpler: the component emits lightweight internal events (`step-delivery-chosen`, `step-sharemode-chosen`) that the orchestrator uses to update `_selectedDelivery` and `_shareMode` without advancing state. Then Next button reads those and transitions to `confirming`.

```javascript
// Lighter event pattern:
card.addEventListener('click', function() {
    self.emit('step-delivery-chosen', { deliveryId: card.getAttribute('data-delivery') });
});
pill.addEventListener('click', function() {
    self.emit('step-sharemode-chosen', { mode: pill.getAttribute('data-mode') });
});
```

Orchestrator handles these without state change:
```javascript
c.addEventListener('step-delivery-chosen',  function(e) { self._selectedDelivery = e.detail.deliveryId; });
c.addEventListener('step-sharemode-chosen', function(e) { self._shareMode = e.detail.mode; });
```

This avoids a full `_syncComponent` cycle on every card click — lighter and cleaner.

---

## 5. CSS — Share Mode Pills

The secondary selector needs a compact visual style distinct from the full delivery cards:

```css
/* v0.3.2/upload-step-options.css */

.share-mode-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.share-mode-row__label {
    font-size: 13px;
    color: var(--color-text-secondary);
    white-space: nowrap;
}

.share-pills {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.share-pill {
    padding: 6px 14px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}

.share-pill--active {
    border-color: var(--color-accent);   /* teal #4ECDC4 */
    color: var(--color-accent);
}

.share-pill:hover:not(.share-pill--active) {
    border-color: rgba(255, 255, 255, 0.3);
    color: var(--color-text);
}
```

---

## 6. Wireframe — Combined Options Step

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Header]                                   [Next →]                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ● Upload ────── ● Options ─────── ○ Confirm ─── ○ Encrypt & Upload ─── ○ Done  │
│  Step 2 of 5                                                                    │
│                                                                                 │
│  📄 report.pdf  ·  PDF · 2.4 MB                                                │
│                                                                                 │
│  How should the recipient get this?                                             │
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐             │
│  │  📄               │  │  🖼               │  │  📥               │             │
│  │  File viewer     │  │  Gallery mode    │  │  Download mode   │             │
│  │  Read/view       │  │  Gallery layout  │  │  Save to device  │             │
│  │  inline          │  │  with metadata   │  │                  │             │
│  │  ★ DEFAULT       │  │                  │  │                  │             │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘             │
│                                                                                 │
│  ──────────────────────────────────────────────────────────────────────────    │
│                                                                                 │
│  Share via:  [ 🏷 Simple token ]  [ 🔗 Combined link ]  [ 🔒 Link + key sep. ]  │
│                                                                                 │
│  ← Back                                                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The share pills default to "Simple token" (matching current default `_shareMode = 'token'`).

---

## 7. Confirm Step — Both "Change" Links Route to Same Step

The confirm step currently shows:
- "Delivery: File viewer mode [change]" → `step-change-delivery`
- "Share: Combined link [change]" → `step-change-share`

After consolidation, both "change" links should take the user back to the combined Options step. No change to `upload-step-confirm.js` needed — the orchestrator patch (Gotcha 10) intercepts both old events and routes both to `state = 'choosing-options'`.

---

## 8. Summary of All Patches for v0.3.2

| File | Lines affected | Change |
|------|---------------|--------|
| `upload-constants-patch.js` (new) | — | Override `STEP_LABELS`, `TOTAL_STEPS`, `STATE_TO_STEP` |
| `send-upload-options.js` (patch) | ~15 spots | New state, activeComponent, wireEvents, wireNextButton, syncComponent, advanceToDelivery, back handler, step-nav |
| `upload-step-options.js` (new) | ~120 lines | Combined delivery + share component |
| `upload-step-options.css` (new) | ~40 lines | Share pill styles |
| `en-gb/index.html` | script list | Add new files in correct order |

`upload-step-delivery.js`, `upload-step-share.js`, `upload-step-confirm.js`, and `upload-constants.js` are **not modified**.

---

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Step indicator rendering at wrong step number | Medium | `STATE_TO_STEP` patch is the single source of truth — verify all states covered |
| Confirm "change" links landing on wrong step | Low | Both old events routed to `choosing-options` in orchestrator |
| Back navigation from confirm skips back too far | Low | Confirmed: confirm back → `choosing-options` (Gotcha 7) |
| Friendly key generated too early when navigating back | Low | Key is cleared when `step <= 2` in step-nav handler (was `<= 3`) |
| Old `step-delivery-selected` / `step-share-selected` events firing unexpectedly | Very low | Old components are hidden, not removed; events fire only on user interaction |
| Share pill selection not persisted across re-renders | Low | `_shareMode` lives on orchestrator, synced to component each render via `_syncComponent` |
