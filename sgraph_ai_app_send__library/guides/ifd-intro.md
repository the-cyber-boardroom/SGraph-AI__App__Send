# Iterative Flow Development (IFD) - Intro and how to use

**Purpose**: Complete reference for LLMs assisting with IFD-based development in air-gapped mode  
**Version**: Consolidated v1.2.1

---

## What is IFD?

Iterative Flow Development (IFD) is a methodology for rapid software development using AI assistance while maintaining engineering rigor. It centers on **preserving developer flow state** while leveraging LLMs for code generation.

---

## Core Principles

### 1. Flow State Preservation
- Minimize context switching
- Developer focuses on UX and architecture
- LLM handles boilerplate and repetitive coding
- Work in focused 2-3 hour sessions

### 2. UX-First Development
- Define user experience before writing code
- Describe intended UX to the LLM
- Iterate based on user interaction, not technical perfection

### 3. Real Data From Day One
- **NO mocked data or stubbed services**
- Backend API must exist from v0.1.0
- Test with actual API calls immediately
- Catches integration issues early

### 4. Zero External Dependencies
- Use native web platform (ES6+ JavaScript)
- Web Components (custom elements)
- No frameworks (React/Vue/Angular)
- Browser APIs only (Fetch, DOM, etc.)
- Ensures longevity and simplicity

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

IFD uses three distinct version types with specific rules:

| Version Type | Pattern | Example | Code Sharing | Purpose |
|--------------|---------|---------|--------------|---------|
| **Release** | `vX.0.0` | v1.0.0, v2.0.0 | None | Production deployment |
| **Major** | `vN.X.0` | v0.1.0, v0.2.0, v1.1.0 | None (self-contained) | Consolidation checkpoint |
| **Minor** | `vN.N.X` | v0.1.1, v0.1.2, v0.1.3 | Yes (link back + surgical override) | Active development |

### Minor Versions (`vN.N.X`) — Active Development

**Core Principle: Surgical Overwrites**

The unit of change is **the change itself**, not the file. Minor versions contain **only the specific changes** for that version—a single method override, a CSS rule tweak, a new function.

**Dependency Rules:**
```
✅ v0.1.3 CAN depend on v0.1.2, v0.1.1, v0.1.0
✅ v0.1.3 CAN surgically override any method/rule from earlier versions
✅ v0.1.3 CAN add entirely new files
❌ v0.1.3 CANNOT depend on v0.1.4 (future version)
❌ v0.1.3 CANNOT depend on v0.2.x (different major)
❌ v0.1.3 CANNOT copy entire files just to change one method
```

**Surgical Override Patterns:**

```javascript
// v0.1.0/components/config-panel/config-panel.js (FULL - 500 lines)
class ConfigPanel extends HTMLElement {
    constructor() { /* ... */ }
    getConfig() { /* original */ }
    validateInput() { /* original */ }
    // ... 17 more methods
}
customElements.define('config-panel', ConfigPanel);
```

```javascript
// v0.1.3/components/config-panel/config-panel.js (SURGICAL - 15 lines)
// Override ONLY the validateInput method to fix a bug
ConfigPanel.prototype.validateInput = function() {
    if (!this.config) return false;
    return this.config.preset !== undefined;
};
```

```javascript
// v0.1.5/components/config-panel/config-panel.js (SURGICAL - 20 lines)
// Override getConfig and setConfig for new feature
ConfigPanel.prototype.getConfig = function() {
    return { ...this.config, timestamp: Date.now() };
};

ConfigPanel.prototype.setConfig = function(config) {
    this.config = config;
    this.lastUpdated = Date.now();
    this.render();
};
```

**CSS Surgical Override:**
```css
/* v0.1.0/css/common.css (FULL) */
.config-panel .header { font-size: 1.2rem; color: #333; }

/* v0.1.4/css/common.css (SURGICAL - only the change) */
.config-panel .header { color: var(--text-primary, #333); }
```

**Loading Order in HTML:**
```html
<!-- v0.1.5/index.html - Later definitions win -->
<head>
    <link rel="stylesheet" href="../v0.1.0/css/common.css">
    <link rel="stylesheet" href="../v0.1.4/css/common.css">
</head>
<body>
    <script src="../v0.1.0/components/config-panel/config-panel.js"></script>
    <script src="../v0.1.3/components/config-panel/config-panel.js"></script>
    <script src="components/config-panel/config-panel.js"></script>
</body>
```

### Major Versions (`vN.X.0`) — Consolidation

**Purpose:** Merge surgical overrides into complete, self-contained files.

```
v0.1.0/config-panel.js      # Base: 20 methods
    + v0.1.3/config-panel.js  # Patch: 1 method override
    + v0.1.5/config-panel.js  # Patch: 2 method overrides
    ─────────────────────────
    = v0.2.0/config-panel.js  # Merged: all 20 methods with patches applied
```

**Dependency Rules:**
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

### Minor Version (Surgical - Sparse)
```
v0.1.3/
└── components/
    └── config-panel/
        └── config-panel.js     # 15 lines: 1 method override

v0.1.5/
├── components/
│   └── config-panel/
│       └── config-panel.js     # 20 lines: 2 method overrides
│       └── config-panel.test.js # Tests for those 2 methods only
└── js/
    └── new-feature.js          # 100 lines: entirely new file
```

### Major Version (Complete - Merged)
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
│   └── playground.js
├── tests/
│   ├── test-paths.js
│   └── test-utils.js
├── index.html
└── playground.html
```

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
        this.cleanup();  // Remove event listeners - REQUIRED
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
this.dispatchEvent(new CustomEvent('data-changed', {
    detail: { value: newData },
    bubbles: true
}));

// Component B listens
document.addEventListener('data-changed', (e) => {
    console.log('Received:', e.detail.value);
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
.component {
    color: var(--component-text-color, #333);
}
/* Override: :root { --component-text-color: #000; } */
```

**DO: Keep methods focused and small**
```javascript
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

---

## Testing in IFD

### Core Principles

1. **Co-Located Tests** — Tests live next to what they test
2. **Surgical Tests Match Surgical Changes** — If you override 2 methods, test those 2 methods
3. **Version-Scoped** — Each minor version tests its changes only

### Naming Conventions

| Source File | Test File | Test Type |
|-------------|-----------|-----------|
| `component.js` | `component.test.js` | Unit test |
| `page.html` | `page.html.test.js` | Integration test |

### Surgical Test Example

```javascript
/* v0.1.5/js/playground.test.js
   Tests ONLY the methods overridden in this version:
   - formatBytes() - new formatting logic
   - scheduleAutoRender() - fixed debounce bug */

QUnit.module('Playground v0.1.5 Overrides', function(hooks) {
    
    hooks.before(async function(assert) {
        // Load full chain up to this version
        await TestUtils.loadScript(TestPaths.base + '/v0.1.0/js/playground.js');
        await TestUtils.loadScript(TestPaths.base + '/v0.1.2/js/playground.js');
        await TestUtils.loadScript(TestPaths.base + '/v0.1.5/js/playground.js');
        
        assert.ok(typeof Playground === 'function', 'Playground loaded');
    });
    
    QUnit.test('formatBytes handles zero', function(assert) {
        const instance = new Playground();
        assert.strictEqual(instance.formatBytes(0), '0 B');
    });
    
    // NO tests for other methods - they're tested in earlier versions
});
```

### Test Infrastructure

**test-paths.js** — Centralized path configuration:
```javascript
const TestPaths = {
    base: '/console/v0/v0.1',
    
    configPanel: {
        chain: [
            '/console/v0/v0.1/v0.1.0/components/config-panel/config-panel.js',
            '/console/v0/v0.1/v0.1.3/components/config-panel/config-panel.js',
            '/console/v0/v0.1/v0.1.5/components/config-panel/config-panel.js',
        ],
    },
};
```

**test-utils.js** — Shared helpers:
```javascript
const TestUtils = {
    async loadScript(src) {
        if (document.querySelector(`script[src="${src}"]`)) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },
    
    async loadScriptChain(sources) {
        for (const src of sources) {
            await this.loadScript(src);
        }
    },
    
    cleanup() {
        document.getElementById('qunit-fixture').innerHTML = '';
    }
};
```

### Three Test Environments

| Environment | Tool | Use Case |
|-------------|------|----------|
| **Browser** | `tests/index.html` | Local dev, production QA |
| **CLI** | Karma + ChromeHeadless | CI pipelines |
| **IDE** | Wallaby.js | Real-time TDD |

---

## Development Workflow

### Typical Session

```
9:00 AM  - Start v0.3.4, define UX goals
9:15 AM  - Prompt LLM for new component
9:30 AM  - Review, integrate, test component
10:00 AM - Iterate on UI details
10:30 AM - Add API integration
11:00 AM - Test end-to-end with real data
11:30 AM - Commit v0.3.4, plan v0.3.5
```

### Feature Iteration Process

1. **Start with UX Description**
   ```
   "Create a chat interface with:
   - Resizable textarea
   - Live character count
   - Send on Enter (Shift+Enter for newline)
   - Disabled send button when empty"
   ```

2. **LLM Generates Initial Code**

3. **Human Reviews and Integrates** (air-gapped)

4. **Test with Real Backend**

5. **Iterate on UX Details**

### Version-by-Version Focus

| Version | Focus |
|---------|-------|
| v0.1.0 | Core MVP only - embarrassingly simple |
| v0.1.1 | First UI improvements |
| v0.1.2 | UI polish |
| v0.1.3 | Data enhancements |
| v0.1.4 | Monitoring/logging |
| v0.2.0 | Consolidation - merge proven features |

---

## LLM Prompt Templates

### Creating a New Component

```
Create a [component-name] Web Component with:

**Purpose:** [what it does]

**Technical Requirements:**
- ES6 class extending HTMLElement
- No external dependencies
- Self-contained CSS
- API endpoint: [endpoint]

**Functionality:**
- [feature 1]
- [feature 2]
- [feature 3]

**Events:**
- Emit: [event-name] when [condition]
- Listen: [event-name] to [action]
```

### Adding Feature to Existing Component

```
Add [feature] to this component:

[paste current component code]

Requirements:
- [requirement 1]
- [requirement 2]

Note: Only provide the surgical override (the new/changed method), not the entire component.
```

### Surgical Bug Fix

```
Fix the [method-name] method in [Component]:

Current behavior: [what it does wrong]
Expected behavior: [what it should do]

Provide only the prototype override, not the full component:
Component.prototype.methodName = function() { ... };
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
|--------|--------------|
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

## Production Readiness Checklist

Before v1.0 consolidation:

**Code Quality:**
- ✅ Consistent error handling throughout
- ✅ Memory management (`disconnectedCallback` cleanup)
- ✅ No console errors or warnings

**Architecture:**
- ✅ Clear separation of concerns
- ✅ Event-driven component communication
- ✅ Components are self-contained

**Performance:**
- ✅ Lazy loading for heavy components
- ✅ Debouncing for rapid actions
- ✅ Caching for expensive operations

**Testing:**
- ✅ All surgical tests pass
- ✅ Tests consolidated alongside code
- ✅ Integration tests for pages

---

## Remember

**IFD is about maintaining flow state.** The methodology keeps you focused on solving user problems, not fighting tools or technical debt.

**Version independence means freedom.** Experiment without fear. If v0.4.5 is a dead end, build v0.4.6 from v0.4.4.

**Surgical overrides keep files small.** Only change what needs changing. The more surgical, the better.

**Real data from day one means confidence.** When v1.0 ships, you know it works because you've tested with real data since v0.1.0.

**What stakeholders test IS what ships.** v1.0.0 = the last tested minor version, with only version strings changed.

---

*This is IFD. Simple, fast, maintainable, and built for flow.*
