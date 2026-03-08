# IFD Methodology — Complete Briefing for Desktop App Development

**Source:** `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` (in the SGraph-AI__App__Send repo)
**Purpose:** Self-contained IFD reference for the desktop app agentic team. You should not need to look elsewhere.

---

## What Is IFD?

**Iterative Flow Development** — a methodology for rapid software development using AI assistance while maintaining engineering rigour. It centres on **preserving developer flow state** while leveraging LLMs for code generation.

This is NOT "Incremental Feature Development". The name matters — the focus is on **flow state** and **iteration speed**, not just incrementalism.

---

## Core Principles

### 1. Flow State Preservation
- Minimise context switching
- Developer focuses on UX and architecture
- LLM handles boilerplate and repetitive coding
- Work in focused 2–3 hour sessions

### 2. UX-First Development
- Define user experience before writing code
- Describe intended UX to the LLM
- Iterate based on user interaction, not technical perfection

### 3. Real Data From Day One
- **NO mocked data or stubbed services**
- Backend API must exist from v0.1.0
- Test with actual API calls immediately

### 4. Zero External Dependencies
- Use native web platform (ES6+ JavaScript)
- Web Components (custom elements)
- No frameworks (React/Vue/Angular)
- Browser APIs only (Fetch, DOM, etc.)

### 5. Progressive Enhancement
```
v0.1.0 → Core MVP only (minimal functionality)
v0.1.1 → First UI improvements
v0.1.2 → UI Polish
v0.1.3 → Data enhancements
v0.1.4 → Monitoring/logging
v0.1.5+ → Advanced features
v0.2.0 → Consolidation (proven features only)
```

---

## Version Types and Rules

IFD uses three distinct version types:

| Version Type | Pattern | Example | Code Sharing | Purpose |
|-------------|---------|---------|-------------|---------|
| **Release** | `vX.0.0` | v1.0.0, v2.0.0 | None | Production deployment |
| **Major** | `vN.X.0` | v0.1.0, v0.2.0 | None (self-contained) | Consolidation checkpoint |
| **Minor** | `vN.N.X` | v0.1.1, v0.1.2 | Yes (link back + surgical override) | Active development |

### Minor Versions (`vN.N.X`) — Active Development

**Core Principle: Surgical Overwrites**

The unit of change is **the change itself**, not the file. Minor versions contain **only the specific changes** for that version — a single method override, a CSS rule tweak, a new function.

**Dependency Rules:**
```
✅ v0.1.3 CAN depend on v0.1.2, v0.1.1, v0.1.0
✅ v0.1.3 CAN surgically override any method/rule from earlier versions
✅ v0.1.3 CAN add entirely new files
❌ v0.1.3 CANNOT depend on v0.1.4 (future version)
❌ v0.1.3 CANNOT depend on v0.2.x (different major)
❌ v0.1.3 CANNOT copy entire files just to change one method
```

**Surgical Override Example:**

```javascript
// v0.1.0/components/sidebar/sidebar.js (FULL — 300 lines)
class AppSidebar extends HTMLElement {
    constructor() { /* ... */ }
    render() { /* original */ }
    handleNavigation() { /* original */ }
    // ... more methods
}
customElements.define('app-sidebar', AppSidebar);
```

```javascript
// v0.1.3/components/sidebar/sidebar.js (SURGICAL — 10 lines)
// Override ONLY handleNavigation to add keyboard shortcuts
AppSidebar.prototype.handleNavigation = function(site) {
    this.activeWebview = site;
    this.updateIndicator(site);
    window.__TAURI__.invoke('switch_webview', { site });
};
```

**CSS Surgical Override:**
```css
/* v0.1.0/css/theme.css (FULL) */
.sidebar { background: #1a1a2e; width: 60px; }

/* v0.1.4/css/theme.css (SURGICAL — only the change) */
.sidebar { width: 72px; }
```

**Loading Order in HTML — Later definitions win:**
```html
<head>
    <link rel="stylesheet" href="../v0.1.0/css/theme.css">
    <link rel="stylesheet" href="../v0.1.4/css/theme.css">
</head>
<body>
    <script src="../v0.1.0/components/sidebar/sidebar.js"></script>
    <script src="../v0.1.3/components/sidebar/sidebar.js"></script>
    <script src="components/sidebar/sidebar.js"></script>
</body>
```

### Major Versions (`vN.X.0`) — Consolidation

Merge surgical overrides into complete, self-contained files:

```
v0.1.0/sidebar.js         # Base: 15 methods
    + v0.1.3/sidebar.js    # Patch: 1 method override
    + v0.1.5/sidebar.js    # Patch: 2 method overrides
    ─────────────────────
    = v0.2.0/sidebar.js    # Merged: all 15 methods with patches applied
```

**Rules:**
```
✅ v0.2.0 is completely self-contained
✅ v0.2.0 has complete merged files (no surgical patches)
✅ v0.2.1 CAN depend on v0.2.0 (and add surgical overrides)
❌ v0.2.0 CANNOT depend on v0.1.x (previous major family)
❌ v0.2.0 CANNOT link to files outside its folder
```

### Release Versions (`vX.0.0`) — Production

**Exact copy of previous major version.** Only version strings and documentation change. **No code changes.**

```
What was tested IS what ships.
If v0.9.15 passed QA, then v1.0.0 = v0.9.15.
No exceptions. No "quick fixes."
```

---

## Folder Structure

### Minor Version (Surgical — Sparse)
```
v0.1.3/
└── components/
    └── sidebar/
        └── sidebar.js          # 10 lines: 1 method override

v0.1.5/
├── components/
│   └── sidebar/
│       └── sidebar.js          # 15 lines: 2 method overrides
│       └── sidebar.test.js     # Tests for those 2 methods only
└── js/
    └── keyboard-shortcuts.js   # 50 lines: entirely new file
```

### Major Version (Complete — Merged)
```
v0.2.0/
├── components/
│   ├── sidebar/
│   │   └── sidebar.js          # Complete merged file
│   │   └── sidebar.test.js     # All tests merged
│   ├── site-card/
│   │   └── site-card.js
│   └── settings-panel/
│       └── settings-panel.js
├── css/
│   └── theme.css               # Complete merged CSS
├── js/
│   ├── tauri-bridge.js
│   └── event-bus.js
├── index.html
└── settings.html
```

---

## IFD Applied to the Desktop App

### Two-Layer Versioning

The desktop app has two distinct layers that version independently:

#### 1. App Version (Release Versioning)

The overall app version represents a release:

```
v0.1.0  — Basic shell, single webview (send.sgraph.ai)
v0.2.0  — Multi-site, keychain integration
v0.3.0  — File associations, local viewer
v0.4.0  — Auto-update, code signing
```

This is the version users see, stored in `tauri.conf.json` and `Cargo.toml`.

#### 2. Component Versioning (IFD)

The local JS components use folder-based versioning:

```
src/app-shell/v0.1.0/app-shell.js     <- app shell at v0.1.0
src/app-shell/v0.2.0/app-shell.js     <- app shell with sidebar improvements
src/sidebar/v0.1.0/sidebar.js         <- sidebar at v0.1.0 (independent of app-shell)
```

A change to the sidebar doesn't require bumping the app-shell version.

#### 3. Rust Backend Versioning

Rust code doesn't use folder-based versioning (Cargo handles this). Instead:

- New commands are added to the existing modules
- Breaking changes bump the app version
- Rust tests verify command contracts

---

## Web Components Architecture

### Component Structure

```javascript
class MyComponent extends HTMLElement {
    constructor() {
        super();
        this.state = { /* component state */ };
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();
    }

    disconnectedCallback() {
        this.cleanup();  // Remove event listeners — REQUIRED
    }

    render() {
        this.innerHTML = `<!-- Component HTML -->`;
    }

    setupEventListeners() {
        // Attach event handlers
    }

    cleanup() {
        // Remove listeners to prevent memory leaks
    }
}

customElements.define('my-component', MyComponent);
```

### Component Communication — Events Only

**Use CustomEvents, NOT direct method calls:**

```javascript
// Component A dispatches
this.dispatchEvent(new CustomEvent('site-selected', {
    detail: { site: 'send.sgraph.ai' },
    bubbles: true
}));

// Component B listens
document.addEventListener('site-selected', (e) => {
    this.loadWebview(e.detail.site);
});
```

### Design for Surgical Overrides

**DO: Use prototype methods (easily overridable)**
```javascript
class Component extends HTMLElement {
    methodName() { /* ... */ }
}
// Can override: Component.prototype.methodName = ...
```

**DO: Use CSS custom properties**
```css
.component { color: var(--component-text-color, #333); }
/* Override: :root { --component-text-color: #000; } */
```

**DO: Keep methods focused and small**
```javascript
validateUrl() { /* ... */ }
validateToken() { /* ... */ }
validateConfig() {
    return this.validateUrl() && this.validateToken();
}
```

**DON'T: Use closures that hide methods**
```javascript
// CANNOT be surgically overridden
const Component = (function() {
    function privateMethod() { /* hidden */ }
    return class { /* ... */ };
})();
```

---

## Testing in IFD

### Core Principles

1. **Co-located tests** — tests live next to what they test
2. **Surgical tests match surgical changes** — if you override 2 methods, test those 2 methods
3. **Version-scoped** — each minor version tests its changes only

### Naming Conventions

| Source File | Test File |
|-------------|-----------|
| `component.js` | `component.test.js` |
| `page.html` | `page.html.test.js` |

### Surgical Test Example

```javascript
/* v0.1.5/components/sidebar/sidebar.test.js
   Tests ONLY the methods overridden in this version:
   - handleNavigation() — added Tauri IPC call
   - updateIndicator() — fixed animation bug */

QUnit.module('Sidebar v0.1.5 Overrides', function(hooks) {
    hooks.before(async function(assert) {
        await TestUtils.loadScript('/v0.1.0/components/sidebar/sidebar.js');
        await TestUtils.loadScript('/v0.1.3/components/sidebar/sidebar.js');
        await TestUtils.loadScript('/v0.1.5/components/sidebar/sidebar.js');
        assert.ok(typeof AppSidebar === 'function', 'Sidebar loaded');
    });

    QUnit.test('handleNavigation calls Tauri IPC', function(assert) {
        // test only the overridden method
    });

    // NO tests for other methods — they're tested in earlier versions
});
```

---

## Critical Anti-Patterns to AVOID

❌ **Don't** copy entire files to change one method — use surgical overrides
❌ **Don't** create shared code between Major versions
❌ **Don't** use external JavaScript frameworks/libraries
❌ **Don't** mock data or stub APIs — use real data from day one
❌ **Don't** over-engineer in v0.1.0 — keep it minimal
❌ **Don't** add features without proving them in minor versions first
❌ **Don't** bundle unrelated changes in one minor version
❌ **Don't** forget `disconnectedCallback` cleanup (memory leaks!)
❌ **Don't** use direct method calls between components — use events
❌ **Don't** create full test files for surgical overrides — test only what changed

---

## Quick Reference

| Aspect | IFD Approach |
|--------|-------------|
| **Full name** | Iterative Flow Development |
| **Dependencies** | None (native web only) |
| **Components** | Web Components (custom elements) |
| **Communication** | CustomEvents (event-driven) |
| **State** | Component-local + event coordination |
| **Minor Versions** | Surgical overrides, link back |
| **Major Versions** | Self-contained, merged files |
| **API** | Real from v0.1.0, no mocks |
| **Testing** | Co-located, surgical, QUnit |
| **AI Role** | Code generation + refinement |
| **Human Role** | Architecture + UX + review + decisions |

---

## Key IFD Principles for the Desktop App

1. **Never modify a deployed version** — if `app-shell/v0.1.0/` has a bug, create `v0.1.1/`, don't edit `v0.1.0/`
2. **Each change is a commit** — atomic, reviewable, revertible
3. **Test before release** — `cargo tauri build` must succeed before tagging
4. **Independent component versions** — sidebar v0.1.0 can coexist with app-shell v0.2.0
5. **App release is composition** — a release combines specific component versions and Rust backend state
6. **Surgical overrides keep files small** — only change what needs changing

---

## Remember

**IFD is about maintaining flow state.** The methodology keeps you focused on solving user problems, not fighting tools or technical debt.

**Version independence means freedom.** Experiment without fear. If v0.4.5 is a dead end, build v0.4.6 from v0.4.4.

**Surgical overrides keep files small.** Only change what needs changing. The more surgical, the better.

**Real data from day one means confidence.** When v1.0 ships, you know it works because you've tested with real data since v0.1.0.

**What stakeholders test IS what ships.** v1.0.0 = the last tested minor version, with only version strings changed.

---

*This document is self-contained. You do not need access to the SGraph-AI__App__Send repo to understand and apply IFD.*
