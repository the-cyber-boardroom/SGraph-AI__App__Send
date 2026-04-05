# IFD Versioning Guide - LLM Brief

**Version**: 1.2.0  
**Purpose**: Quick reference for LLMs on IFD version types, dependency rules, and surgical override patterns  
**Companion to**: IFD (Iterative Flow Development) Methodology v1.1.0

---

## Version Types Overview

IFD uses three distinct version types, each with specific rules:

| Version Type | Pattern | Example | Code Sharing | Purpose |
|--------------|---------|---------|--------------|---------|
| **Release** | `vX.0.0` | v1.0.0, v2.0.0 | None | Production deployment |
| **Major** | `vN.X.0` | v0.1.0, v0.2.0, v1.1.0 | None (self-contained) | Consolidation checkpoint |
| **Minor** | `vN.N.X` | v0.1.1, v0.1.2, v0.1.3 | Yes (link back) | Active development |

---

## Minor Versions (`vN.N.X`)

**Pattern**: Third number changes (v0.1.**1**, v0.1.**2**, v0.1.**3**)

### Purpose
- Active development happens here
- Each minor version adds focused features
- Rapid iteration (15-30 minute cycles)
- Potentially shippable at any point

### Core Principle: **Surgical Overwrites**

The unit of change is **the change itself**, not the file.

Minor versions should contain **only the specific changes** for that version - a single method override, a CSS rule tweak, a new function. This leverages how JavaScript and CSS naturally handle redefinitions.

### Code Sharing Rule: **Link Back + Surgical Override**

```
v0.1/
├── v0.1.0/                              # Base major version
│   └── components/
│       └── config-panel/
│           └── config-panel.js          # Full component: 500 lines, 20 methods
│
├── v0.1.3/                              # Surgical override
│   └── components/
│       └── config-panel/
│           └── config-panel.js          # ONLY 15 lines: overrides 1 method
│
└── v0.1.5/                              # Another surgical override
    └── components/
        └── config-panel/
            └── config-panel.js          # ONLY 20 lines: overrides 2 methods
```

### How Surgical Overrides Work

**JavaScript prototype/class method override:**

```javascript
// v0.1.0/components/config-panel/config-panel.js (FULL - 500 lines)
class ConfigPanel extends HTMLElement {
    constructor() { /* ... */ }
    connectedCallback() { /* ... */ }
    render() { /* ... */ }
    getConfig() { /* original implementation */ }
    setConfig(config) { /* original implementation */ }
    validateInput() { /* original implementation */ }
    // ... 17 more methods
}
customElements.define('config-panel', ConfigPanel);
```

```javascript
// v0.1.3/components/config-panel/config-panel.js (SURGICAL - 15 lines)
// Override ONLY the validateInput method to fix a bug

ConfigPanel.prototype.validateInput = function() {
    // Fixed implementation
    if (!this.config) return false;
    return this.config.preset !== undefined;
};
```

```javascript
// v0.1.5/components/config-panel/config-panel.js (SURGICAL - 20 lines)
// Override getConfig and setConfig for new feature

ConfigPanel.prototype.getConfig = function() {
    return {
        ...this.config,
        timestamp: Date.now()  // New: add timestamp
    };
};

ConfigPanel.prototype.setConfig = function(config) {
    this.config = config;
    this.lastUpdated = Date.now();  // New: track updates
    this.render();
};
```

**CSS cascade override:**

```css
/* v0.1.0/css/common.css (FULL - 200 lines) */
.config-panel {
    padding: 1rem;
    background: #f5f5f5;
    border: 1px solid #ddd;
}
.config-panel .header {
    font-size: 1.2rem;
    color: #333;
}
/* ... 50 more rules */
```

```css
/* v0.1.4/css/common.css (SURGICAL - 5 lines) */
/* Override ONLY the header color for dark mode support */
.config-panel .header {
    color: var(--text-primary, #333);
}
```

### Loading Order Matters

**HTML loads files in order - later definitions win:**

```html
<!-- v0.1.5/index.html -->
<head>
    <!-- Base CSS first -->
    <link rel="stylesheet" href="../v0.1.0/css/common.css">
    <!-- Surgical override loaded after -->
    <link rel="stylesheet" href="../v0.1.4/css/common.css">
</head>
<body>
    <!-- Base component first -->
    <script src="../v0.1.0/components/config-panel/config-panel.js"></script>
    <!-- Surgical overrides in version order -->
    <script src="../v0.1.3/components/config-panel/config-panel.js"></script>
    <script src="components/config-panel/config-panel.js"></script>
</body>
```

**Result**: ConfigPanel class has:
- All 20 methods from v0.1.0
- `validateInput` replaced by v0.1.3's version
- `getConfig` and `setConfig` replaced by v0.1.5's versions

### Design Patterns for Surgical Overrides

**Pattern 1: Prototype method override**
```javascript
// Override a single method
ClassName.prototype.methodName = function() {
    // New implementation
};
```

**Pattern 2: Extend and override**
```javascript
// Store original for potential use
const originalMethod = ClassName.prototype.methodName;

ClassName.prototype.methodName = function() {
    // Pre-processing
    const result = originalMethod.call(this);
    // Post-processing
    return result;
};
```

**Pattern 3: Configuration override**
```javascript
// Override configuration/constants only
ClassName.DEFAULT_CONFIG = {
    ...ClassName.DEFAULT_CONFIG,
    newOption: true
};
```

**Pattern 4: CSS custom property override**
```css
/* Base defines with fallback */
.component { color: var(--text-color, #333); }

/* Override just the variable */
:root { --text-color: #222; }
```

### What Goes in Each Minor Version

```
v0.1.3/ should contain ONLY:
├── The bug fix (1 method override)
├── Any NEW files needed for that fix
├── Test for that specific fix
└── Nothing else

NOT:
├── Copy of entire config-panel.js
├── Unrelated changes
├── "While I'm here" improvements
```

### Dependency Rules

```
✅ v0.1.3 CAN depend on v0.1.2, v0.1.1, v0.1.0
✅ v0.1.3 CAN surgically override any method/rule from earlier versions
✅ v0.1.3 CAN add entirely new files
❌ v0.1.3 CANNOT depend on v0.1.4 (future version)
❌ v0.1.3 CANNOT depend on v0.2.x (different major)
❌ v0.1.3 CANNOT copy entire files just to change one method
```

### When to Create a New Minor Version

- Fixing a bug (override the broken method)
- Adding a feature (add new methods or override existing)
- Tweaking behavior (override specific logic)
- Any change, no matter how small

### The More Surgical, The Better

```
❌ Bad: Copy 500-line file to change 1 method
✅ Good: 15-line file that overrides just that method

❌ Bad: Override entire CSS file for one color change
✅ Good: 3-line CSS file with just the rule override

❌ Bad: "While I'm here, let me refactor this too"
✅ Good: Exactly one concern per minor version
```

---

## Major Versions (`vN.X.0`)

**Pattern**: Second number changes, third is zero (v0.**1**.0, v0.**2**.0, v1.**1**.0)

### Purpose
- Consolidation checkpoint
- **Merges** surgical overrides into complete files
- Creates a clean, self-contained baseline
- What gets tested before release

### Code Sharing Rule: **Merge and Copy**

Major versions are **completely self-contained**. During consolidation, surgical overrides are **merged** into complete files.

### Consolidation Process: Merging Surgical Overrides

**From v0.1.x to v0.2.0:**

This is NOT just copying files. It's **merging** the base with all surgical patches:

```
v0.1.0/config-panel.js      # Base: 20 methods
    + v0.1.3/config-panel.js  # Patch: 1 method override
    + v0.1.5/config-panel.js  # Patch: 2 method overrides
    + v0.1.7/config-panel.js  # Patch: 1 method override
    ─────────────────────────
    = v0.2.0/config-panel.js  # Merged: all 20 methods with patches applied
```

**Consolidation steps:**

1. **Start with base file** from v0.1.0
2. **Apply each surgical override** in version order
3. **Integrate changes** into the base file directly
4. **Result**: Single complete file with all improvements
5. **Update imports** to be relative within v0.2.0
6. **Run all tests** to verify nothing broke

**Example consolidation:**

```javascript
// v0.2.0/components/config-panel/config-panel.js (MERGED RESULT)
class ConfigPanel extends HTMLElement {
    constructor() { /* from v0.1.0 */ }
    connectedCallback() { /* from v0.1.0 */ }
    render() { /* from v0.1.0 */ }
    
    // Merged from v0.1.5 override
    getConfig() {
        return {
            ...this.config,
            timestamp: Date.now()
        };
    }
    
    // Merged from v0.1.5 override
    setConfig(config) {
        this.config = config;
        this.lastUpdated = Date.now();
        this.render();
    }
    
    // Merged from v0.1.3 override (bug fix)
    validateInput() {
        if (!this.config) return false;
        return this.config.preset !== undefined;
    }
    
    // ... remaining methods from v0.1.0
}
customElements.define('config-panel', ConfigPanel);
```

### Folder Structure After Consolidation

```
v0.2/
└── v0.2.0/                         # Completely self-contained
    ├── components/
    │   ├── config-panel/
    │   │   └── config-panel.js     # Merged from v0.1.0 + v0.1.3 + v0.1.5 + v0.1.7
    │   ├── html-input/
    │   │   └── html-input.js       # Merged from v0.1.1 + v0.1.6
    │   └── graph-canvas/
    │       └── graph-canvas.js     # From v0.1.2 (no overrides existed)
    ├── css/
    │   └── common.css              # Merged from v0.1.0 + v0.1.4
    └── js/
        └── api-client.js           # From v0.1.0 (no overrides existed)
```

### Dependency Rules

```
✅ v0.2.0 is completely self-contained
✅ v0.2.0 has complete merged files (no surgical patches)
✅ v0.2.1 CAN depend on v0.2.0 (and add surgical overrides)
❌ v0.2.0 CANNOT depend on v0.1.x (previous major family)
❌ v0.2.0 CANNOT require loading multiple files for one component
❌ v0.2.0 CANNOT link to files outside its folder
```

### When to Create a New Major Version

- Minor versions have stabilized
- Too many surgical patches (loading order getting complex)
- Features are proven and tested
- Preparing for stakeholder review
- Clean slate needed

---

## Release Versions (`vX.0.0`)

**Pattern**: First number changes, second and third are zero (v**1**.0.0, v**2**.0.0)

### Purpose
- Production deployment marker
- Exact copy of previous major version
- Only version numbers and documentation change
- What stakeholders tested IS what ships

### Code Sharing Rule: **Exact Copy, Version Numbers Only**

```
# v0.9.0 was tested and approved
# v1.0.0 is IDENTICAL except version strings

v1.0.0/
├── components/           # Identical to v0.9.0
├── css/                  # Identical to v0.9.0
├── js/                   # Identical to v0.9.0
├── index.html            # Version string updated: "v1.0.0"
├── package.json          # Version updated: "1.0.0"
└── CHANGELOG.md          # Release notes added
```

### What Changes in a Release Version

**ONLY these things:**
- Version strings in code comments
- Version in `package.json` / config files
- Version displayed in UI
- Release notes / changelog
- Documentation updates

**NOTHING else:**
- No bug fixes
- No feature additions
- No refactoring
- No "quick improvements"
- No "one more surgical fix"

### Why This Rule Exists

```
What was tested IS what ships.

If v0.9.15 passed QA, then v1.0.0 = v0.9.15.
No exceptions. No "quick fixes."
```

---

## Complete Version Lifecycle

```
Development Flow (with Surgical Overrides):
───────────────────────────────────────────

v0.1.0 ──┬── v0.1.1 ── v0.1.2 ── v0.1.3 ── ... ── v0.1.9 ───┐
 (base)  │  (patch)   (patch)   (patch)         (patch)     │
         │                                                  │
         │  Each minor: surgical overrides only             │
         │  Files stay small (just the changes)             │
         └──────────────────────────────────────────────────┘
                                                            │
                                               [merge + consolidate]
                                                            │
                                                            ▼
v0.2.0 ──┬── v0.2.1 ── v0.2.2 ── ... ── v0.2.15 ────────────┐
(merged) │  (patch)   (patch)         (patch)               │
         │                                                  │
         │  Fresh base with all v0.1.x changes merged       │
         │  New surgical overrides start here               │
         └──────────────────────────────────────────────────┘
                                                            │
                                               [merge + consolidate]
                                                            │
                                                            ▼
                              ... more major versions ...
                                                            │
                                               [stakeholder testing]
                                                            │
                                                     [approved!]
                                                            │
                                                            ▼
v1.0.0  ◄── RELEASE (copy v0.9.15, change version strings only)
(frozen)
```

---

## Folder Structure Patterns

### Minor Version Folder (Surgical - Sparse)

```
v0.1.3/
└── components/
    └── config-panel/
        └── config-panel.js     # 15 lines: 1 method override
```

```
v0.1.4/
└── css/
    └── common.css              # 5 lines: 2 rule overrides
```

```
v0.1.5/
├── components/
│   └── config-panel/
│       └── config-panel.js     # 20 lines: 2 method overrides
│       └── config-panel.test.js # Tests for those 2 methods
└── js/
    └── new-feature.js          # 100 lines: entirely new file
    └── new-feature.test.js     # Tests for new feature
```

### Major Version Folder (Complete - Merged)

```
v0.2.0/
├── components/
│   ├── config-panel/
│   │   └── config-panel.js       # Complete merged file
│   │   └── config-panel.test.js  # All tests merged
│   ├── html-input/
│   │   └── html-input.js
│   └── graph-canvas/
│       └── graph-canvas.js
├── css/
│   └── common.css                # Complete merged CSS
├── js/
│   ├── api-client.js
│   ├── new-feature.js
│   └── playground.js
├── tests/
│   ├── test-paths.js
│   └── test-utils.js
├── index.html
└── playground.html
```

---

## Design Guidelines for Override-Friendly Code

### Make Code Easy to Override Surgically

**DO: Use prototype methods (easily overridable)**
```javascript
class Component extends HTMLElement {
    methodName() { /* ... */ }
}
// Can be overridden with: Component.prototype.methodName = ...
```

**DO: Use CSS custom properties**
```css
.component {
    color: var(--component-text-color, #333);
    padding: var(--component-padding, 1rem);
}
/* Override with: :root { --component-text-color: #000; } */
```

**DO: Keep methods focused and small**
```javascript
// Easy to override one behavior
validateEmail() { /* ... */ }
validatePhone() { /* ... */ }
validateForm() {
    return this.validateEmail() && this.validatePhone();
}
```

**DON'T: Use closures that hide methods**
```javascript
// Cannot be surgically overridden
const Component = (function() {
    function privateMethod() { /* hidden */ }
    return class { /* ... */ };
})();
```

**DON'T: Inline everything in one giant method**
```javascript
// Impossible to override just the email validation
validateForm() {
    // 200 lines of mixed validation logic
}
```

---

## Quick Reference Table

| Action | Version Type | What Goes in the Version |
|--------|--------------|--------------------------|
| Fix one method | Minor (v0.1.4) | Only that method override |
| Add new feature | Minor (v0.1.4) | Only new files + method overrides needed |
| Tweak CSS color | Minor (v0.1.4) | Only that CSS rule |
| Consolidate | Major (v0.2.0) | Merged complete files |
| Ship to production | Release (v1.0.0) | Copy, version strings only |

---

## Critical Rules Summary

### Minor Versions (`vN.N.X`)
```
✅ DO contain only surgical changes (methods, rules, functions)
✅ DO keep override files as small as possible
✅ DO leverage JS/CSS cascade for overrides
✅ DO link back to earlier versions for unchanged code
✅ DO add tests for your specific changes
❌ DON'T copy entire files to change one thing
❌ DON'T bundle unrelated changes
❌ DON'T modify previous minor versions
```

### Major Versions (`vN.X.0`)
```
✅ DO merge all surgical patches into complete files
✅ DO create self-contained folder (no external dependencies)
✅ DO run full test suite after consolidation
❌ DON'T just copy files (merge the patches!)
❌ DON'T make functional changes during consolidation
❌ DON'T leave files requiring multiple loads
```

### Release Versions (`vX.0.0`)
```
✅ DO copy exactly from previous major
✅ DO update version strings only
❌ DON'T make any code changes
❌ DON'T modify after release (ever)
```

---

**This is IFD Versioning.** Surgical changes, clean merges, and the confidence that what you tested is what you ship.