# IFD Testing Guide - LLM Brief

**Version**: 1.2.0  
**Purpose**: Quick reference guide for LLMs assisting with testing in IFD-based projects  
**Companion to**: IFD (Iterative Flow Development) Methodology v1.1.0

---

## Overview

This guide provides a complete, practical testing workflow for IFD projects that:

- **Aligns with IFD principles** - Co-located tests, version independence, surgical precision
- **Requires zero build tools for development** - Open `index.html` in any browser
- **Supports CI/CD pipelines** - Karma + ChromeHeadless for automated testing
- **Enables real-time TDD** - Wallaby.js for instant feedback in IDE
- **Works in production** - Run tests on deployed servers for live QA debugging

### Three Execution Environments

| Environment | Tool | Use Case | Dependencies |
|-------------|------|----------|--------------|
| **Browser** | `tests/index.html` | Local dev, production QA, debugging | None (just a browser) |
| **Command Line** | Karma + ChromeHeadless | CI pipelines, pre-commit hooks | Node.js |
| **IDE** | Wallaby.js | Real-time TDD, coverage visualization | Node.js + Wallaby license |

### Why This Matters

**Development**: 
 - Use Wallaby → for real-time test execution/code-coverage
 - Open `tests/index.html` in browser → instant feedback, no setup

**CI/CD**: 
- `npm test` runs Karma → blocks deployment if tests fail.

**Production QA**: 
- Visit `https://your-app.com/tests/index.html` → run tests against live deployment, debug browser-specific issues users report.

---

## Testing Philosophy in IFD

Testing in IFD follows the same core principles as development: **version independence**, **co-location**, **surgical precision**, and **real data from day one**. Tests live with the code they test, evolve with each version, and test exactly what changed.

---

## Core Principles

### 1. **Co-Located Tests**

Tests live next to what they test:

```
v0.1.4/
├── components/
│   └── cytoscape-renderer/
│       ├── cytoscape-renderer.js      # Source (full or surgical override)
│       └── cytoscape-renderer.test.js # Tests for this version's changes
├── js/
│   ├── playground.js                  # Surgical override (2 methods)
│   └── playground.test.js             # Tests for those 2 methods only
├── playground.html                    # Page
└── playground.html.test.js            # Integration test for the page
```

**Why co-location?**
- Tests evolve with their source code
- Clear ownership (obvious which test covers what)
- Version independence (v0.1.6 changes don't break v0.1.4 tests)
- Code coverage maps correctly (no cross-version confusion)

### 2. **Surgical Tests Match Surgical Changes**

If a minor version surgically overrides 2 methods, its test file tests those 2 methods:

```
v0.1.0/components/config-panel/
├── config-panel.js           # Full: 20 methods
└── config-panel.test.js      # Full: tests all 20 methods

v0.1.3/components/config-panel/
├── config-panel.js           # Surgical: overrides validateInput()
└── config-panel.test.js      # Surgical: tests only validateInput()

v0.1.5/components/config-panel/
├── config-panel.js           # Surgical: overrides getConfig(), setConfig()
└── config-panel.test.js      # Surgical: tests only getConfig(), setConfig()
```

**The test file is as surgical as the source file.**

### 3. **Naming Conventions**

| Source File | Test File | Test Type |
|-------------|-----------|-----------|
| `component.js` | `component.test.js` | Unit test |
| `page.html` | `page.html.test.js` | Integration test |

**Unit tests** (`*.test.js`): Test specific methods/functions  
**Integration tests** (`*.html.test.js`): Test how components work together on a page

### 4. **Version-Scoped Testing**

Following IFD's version independence:

- Each minor version has tests for its changes only
- Tests load the full dependency chain (base + patches)
- Global test runner discovers all `*.test.js` across versions
- v0.2.0 consolidation merges tests alongside code

### 5. **Shared Test Infrastructure**

Only test utilities are shared across versions:

```
v0.1/
├── tests/
│   ├── test-paths.js     # Path configuration
│   ├── test-utils.js     # Shared helpers
│   └── index.html        # Global test runner
├── v0.1.0/               # Base version (full tests)
├── v0.1.3/               # Surgical patches + surgical tests
└── v0.1.5/               # Surgical patches + surgical tests
```

---

## Test Infrastructure Setup

### Shared Files

**test-paths.js** - Centralized path configuration:

```javascript
const TestPaths = {
    // Base path for all resources
    base: '/console/v0/v0.1',
    
    // Define the loading chain for each component
    // Order matters: base first, then patches in version order
    
    configPanel: {
        // Load in this order to build complete component
        chain: [
            '/console/v0/v0.1/v0.1.0/components/config-panel/config-panel.js',
            '/console/v0/v0.1/v0.1.3/components/config-panel/config-panel.js',
            '/console/v0/v0.1/v0.1.5/components/config-panel/config-panel.js',
        ],
    },
    
    // Components with no overrides - single file
    graphCanvas: '/console/v0/v0.1/v0.1.2/components/graph-canvas/graph-canvas.js',
    
    // CSS follows same pattern
    css: {
        chain: [
            '/console/v0/v0.1/v0.1.0/css/common.css',
            '/console/v0/v0.1/v0.1.4/css/common.css',
        ],
    },
    
    // Services
    get apiClient() { return `${this.base}/v0.1.1/js/api-client.js`; },
};
```

**test-utils.js** - Shared test helpers:

```javascript
const TestUtils = {
    // Load a script dynamically
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
    
    // Load a chain of scripts in order (for surgical overrides)
    async loadScriptChain(sources) {
        for (const src of sources) {
            await this.loadScript(src);
        }
    },
    
    // Load CSS dynamically
    async loadCss(href) {
        if (document.querySelector(`link[href="${href}"]`)) return;
        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            document.head.appendChild(link);
        });
    },
    
    // Load a chain of CSS in order (for surgical overrides)
    async loadCssChain(hrefs) {
        for (const href of hrefs) {
            await this.loadCss(href);
        }
    },
    
    // Wait for next animation frame
    nextFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    },
    
    // Wait for custom element to be defined
    async waitForComponent(tagName) {
        await customElements.whenDefined(tagName);
        await this.nextFrame();
    },
    
    // Create and mount a component
    async createComponent(tagName, attributes = {}) {
        const fixture = document.getElementById('qunit-fixture');
        const element = document.createElement(tagName);
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        fixture.appendChild(element);
        await this.waitForComponent(tagName);
        return element;
    },
    
    // Trigger DOM event
    triggerEvent(element, eventType, options = {}) {
        const event = new Event(eventType, { bubbles: true, ...options });
        element.dispatchEvent(event);
    },
    
    // Wait for custom event
    waitForEvent(target, eventName, timeout = 1000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeout);
            target.addEventListener(eventName, (e) => {
                clearTimeout(timer);
                resolve(e);
            }, { once: true });
        });
    },
    
    // Mock API client
    createMockApiClient(overrides = {}) {
        return {
            htmlToDot: async () => ({ dot: 'digraph {}', stats: {}, processing_ms: 0 }),
            fetchUrl: async () => ({ html: '', content_type: 'text/html' }),
            ...overrides
        };
    },
    
    // Cleanup after each test
    cleanup() {
        const fixture = document.getElementById('qunit-fixture');
        if (fixture) fixture.innerHTML = '';
    }
};
```

**index.html** - Global test runner:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>MGraph Test Suite</title>
    <link rel="stylesheet" href="https://code.jquery.com/qunit/qunit-2.20.0.css">
</head>
<body>
    <div id="qunit"></div>
    <div id="qunit-fixture"></div>
    
    <script src="https://code.jquery.com/qunit/qunit-2.20.0.js"></script>
    
    <!-- Shared test infrastructure -->
    <script src="test-paths.js"></script>
    <script src="test-utils.js"></script>
    
    <!-- 
    Tests from ALL versions (surgical tests included)
    Each test file loads its own dependencies via TestPaths
    -->
    
    <!-- v0.1.0 base tests -->
    <script src="../v0.1.0/components/config-panel/config-panel.test.js"></script>
    <script src="../v0.1.0/js/api-client.test.js"></script>
    
    <!-- v0.1.3 surgical override tests -->
    <script src="../v0.1.3/components/config-panel/config-panel.test.js"></script>
    
    <!-- v0.1.4 tests -->
    <script src="../v0.1.4/components/cytoscape-renderer/cytoscape-renderer.test.js"></script>
    
    <!-- v0.1.5 surgical override tests -->
    <script src="../v0.1.5/components/config-panel/config-panel.test.js"></script>
    <script src="../v0.1.5/js/playground.test.js"></script>
    
    <!-- Integration tests -->
    <script src="../v0.1.5/playground.html.test.js"></script>
</body>
</html>
```

---

## Writing Tests

### Surgical Unit Test (Override-Specific)

When your minor version surgically overrides specific methods, test only those methods:

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   ConfigPanel - Surgical Override Tests
   v0.1.3 - Tests ONLY the validateInput() override
   ═══════════════════════════════════════════════════════════════════════════ */

QUnit.module('ConfigPanel v0.1.3 Override', function(hooks) {
    
    hooks.before(async function(assert) {
        // Load the FULL chain: base + all patches up to this version
        await TestUtils.loadScript(TestPaths.base + '/v0.1.0/components/config-panel/config-panel.js');
        await TestUtils.loadScript(TestPaths.base + '/v0.1.3/components/config-panel/config-panel.js');
        
        assert.ok(typeof ConfigPanel !== 'undefined', 'ConfigPanel loaded with patches');
    });
    
    hooks.afterEach(function() {
        TestUtils.cleanup();
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // ONLY test what v0.1.3 changed: validateInput()
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('validateInput returns false when config is null', function(assert) {
        const panel = new ConfigPanel();
        panel.config = null;
        
        assert.strictEqual(panel.validateInput(), false, 'should return false for null config');
    });
    
    QUnit.test('validateInput returns false when preset is undefined', function(assert) {
        const panel = new ConfigPanel();
        panel.config = { otherProperty: 'value' };
        
        assert.strictEqual(panel.validateInput(), false, 'should return false without preset');
    });
    
    QUnit.test('validateInput returns true when preset exists', function(assert) {
        const panel = new ConfigPanel();
        panel.config = { preset: 'minimal' };
        
        assert.strictEqual(panel.validateInput(), true, 'should return true with preset');
    });
    
    // NO tests for other methods - they're tested in v0.1.0's test file
});
```

### Base Unit Test (Full Component)

The base version tests everything:

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   ConfigPanel - Full Unit Tests
   v0.1.0 - Base implementation
   ═══════════════════════════════════════════════════════════════════════════ */

QUnit.module('ConfigPanel v0.1.0 Base', function(hooks) {
    
    // Store originals for restoration
    let originalConsoleLog;
    let instance = null;
    
    hooks.before(async function(assert) {
        // Store originals
        originalConsoleLog = console.log;
        
        // Load only the base - no patches
        await TestUtils.loadScript(TestPaths.base + '/v0.1.0/components/config-panel/config-panel.js');
        assert.ok(typeof ConfigPanel !== 'undefined', 'ConfigPanel loaded');
    });
    
    hooks.afterEach(function() {
        // Restore mocks
        console.log = originalConsoleLog;
        
        // Clean up instance
        instance = null;
        
        // Clean up DOM
        TestUtils.cleanup();
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // Constructor Tests
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('constructor initializes default state', function(assert) {
        instance = new ConfigPanel();
        assert.deepEqual(instance.config, {}, 'config should be empty object');
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // All 20 methods tested here...
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('getConfig returns current config', function(assert) {
        instance = new ConfigPanel();
        instance.config = { preset: 'full' };
        assert.deepEqual(instance.getConfig(), { preset: 'full' });
    });
    
    QUnit.test('setConfig updates config', function(assert) {
        instance = new ConfigPanel();
        instance.setConfig({ preset: 'minimal' });
        assert.strictEqual(instance.config.preset, 'minimal');
    });
    
    QUnit.test('validateInput original implementation', function(assert) {
        instance = new ConfigPanel();
        // Test original behavior (before v0.1.3 fix)
        assert.ok(typeof instance.validateInput() === 'boolean');
    });
    
    // ... tests for all other methods
});
```

### Integration Test Structure

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   PageName - Integration Tests
   v0.1.4
   ═══════════════════════════════════════════════════════════════════════════ */

QUnit.module('PageName Integration', function(hooks) {
    
    let originalApiClient = null;
    
    hooks.before(async function(assert) {
        // Load CSS chain
        await TestUtils.loadCssChain([
            TestPaths.base + '/v0.1.0/css/common.css',
            TestPaths.base + '/v0.1.4/css/common.css',
        ]);
        
        // Load all components used on this page (with their patch chains)
        await TestUtils.loadScript(TestPaths.apiClient);
        await TestUtils.loadScriptChain(TestPaths.configPanel.chain);
        await TestUtils.loadScript(TestPaths.graphCanvas);
        
        assert.ok(true, 'All components loaded');
    });
    
    hooks.beforeEach(function() {
        originalApiClient = window.apiClient;
    });
    
    hooks.afterEach(function() {
        window.apiClient = originalApiClient;
        TestUtils.cleanup();
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // Component Communication Tests
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('components can be instantiated together', async function(assert) {
        const fixture = document.getElementById('qunit-fixture');
        fixture.innerHTML = `
            <component-a></component-a>
            <component-b></component-b>
        `;
        
        await TestUtils.nextFrame();
        
        assert.ok(fixture.querySelector('component-a'), 'component-a renders');
        assert.ok(fixture.querySelector('component-b'), 'component-b renders');
    });
    
    QUnit.test('event from A is received by B', async function(assert) {
        const fixture = document.getElementById('qunit-fixture');
        fixture.innerHTML = `
            <component-a></component-a>
            <component-b></component-b>
        `;
        
        await TestUtils.nextFrame();
        
        const compA = fixture.querySelector('component-a');
        const eventPromise = TestUtils.waitForEvent(fixture, 'data-changed');
        
        compA.triggerChange();
        
        const event = await eventPromise;
        assert.ok(event.detail, 'event should have detail');
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // Mock API Flow Tests
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('full flow with mock API', async function(assert) {
        window.apiClient = TestUtils.createMockApiClient({
            fetchData: async () => ({ items: [1, 2, 3] })
        });
        
        const fixture = document.getElementById('qunit-fixture');
        fixture.innerHTML = `<component-a></component-a>`;
        
        await TestUtils.nextFrame();
        
        const comp = fixture.querySelector('component-a');
        await comp.loadData();
        
        assert.strictEqual(comp.items.length, 3, 'should load mocked data');
    });
});
```

---

## Test Isolation Patterns

### The Problem

Tests can leak state through:
- Mocked global functions (`console.log`, `fetch`)
- Event listeners on `document`
- Timers (`setTimeout`, `setInterval`)
- Global variables (`window.apiClient`)
- Prototype modifications (especially with surgical overrides!)

### The Solution

**Track and restore everything in `afterEach`:**

```javascript
QUnit.module('Component', function(hooks) {
    
    // 1. Store originals at module scope
    let originalConsoleLog;
    let originalApiClient;
    let originalMethod;  // For prototype overrides
    let instance = null;
    let eventListenersAdded = [];
    
    // 2. Helper to track event listeners
    function addTrackedListener(target, event, handler) {
        target.addEventListener(event, handler);
        eventListenersAdded.push({ target, event, handler });
    }
    
    hooks.before(function() {
        originalConsoleLog = console.log;
        originalApiClient = window.apiClient;
        // Store original method if testing prototype modification
        originalMethod = ConfigPanel.prototype.someMethod;
    });
    
    // 3. Restore EVERYTHING in afterEach
    hooks.afterEach(function() {
        // Restore globals
        console.log = originalConsoleLog;
        window.apiClient = originalApiClient;
        
        // Restore prototype if modified
        if (originalMethod) {
            ConfigPanel.prototype.someMethod = originalMethod;
        }
        
        // Clean up timers on instance
        if (instance?.autoRenderTimer) {
            clearTimeout(instance.autoRenderTimer);
        }
        
        // Remove tracked event listeners
        eventListenersAdded.forEach(({ target, event, handler }) => {
            target.removeEventListener(event, handler);
        });
        eventListenersAdded = [];
        
        // Clear instance
        instance = null;
        
        // Clean up DOM
        TestUtils.cleanup();
    });
    
    QUnit.test('example with mocked console', function(assert) {
        instance = new Component();
        
        let logged = null;
        console.log = (msg) => { logged = msg; };  // Safe - restored in afterEach
        
        instance.doSomething();
        
        assert.ok(logged, 'should log message');
    });
    
    QUnit.test('example with tracked listener', function(assert) {
        instance = new Component();
        
        let received = null;
        addTrackedListener(document, 'custom-event', (e) => {
            received = e.detail;
        });
        
        instance.emitEvent();
        
        assert.ok(received, 'should receive event');
    });
});
```

---

## Running Tests

### Method 1: Browser (Development & Production QA)

Open `tests/index.html` in any browser - no build tools required:

```bash
# Local development - start your dev server
python -m http.server 8000
open http://localhost:8000/console/v0/v0.1/tests/index.html

# OR just open the file directly (if no CORS issues)
open tests/index.html
```

**Production QA** - Run tests on deployed server:
```
https://html-graph.dev.mgraph.ai/console/v0/v0.1/tests/index.html
```

**Why production testing matters:**
- Debug browser-specific issues users report
- Verify deployment didn't break anything
- Test against production APIs and data
- No local setup required for QA team
- Reproduce issues in the exact environment where they occur

**Best for**: Quick feedback during development, production debugging, cross-browser testing

### Method 2: Karma (CI / Command Line)

**karma.conf.cjs**:

```javascript
module.exports = function(config) {
    config.set({
        basePath: '.',
        frameworks: ['qunit'],
        
        files: [
            // Shared test infrastructure
            { pattern: 'tests/test-paths.js', type: 'js' },
            { pattern: 'tests/test-utils.js', type: 'js' },
            
            // Co-located tests (glob finds all)
            { pattern: 'v0.1.*/**/*.test.js', type: 'js' },
            
            // Source files (served but not included)
            { pattern: 'v0.1.*/**/*.js', included: false, served: true },
            { pattern: 'v0.1.*/**/*.css', included: false, served: true },
        ],
        
        // Exclude test files from source pattern
        exclude: [],
        
        // Map paths for dynamic loading
        proxies: {
            '/console/v0/v0.1/': '/base/',
        },
        
        browsers: ['ChromeHeadless'],
        singleRun: true,
        browserNoActivityTimeout: 60000,
    });
};
```

**package.json**:

```json
{
    "scripts": {
        "test": "karma start karma.conf.cjs --single-run"
    },
    "devDependencies": {
        "karma": "^6.4.3",
        "karma-chrome-launcher": "^3.2.0",
        "karma-qunit": "^4.2.0",
        "qunit": "^2.21.0"
    }
}
```

**Run**:

```bash
npm install
npm test
```

**Best for**: CI pipelines, pre-commit hooks, full suite runs

### Method 3: Wallaby.js (Real-Time IDE Feedback)

**wallaby.cjs**:

```javascript
module.exports = function(wallaby) {
    return {
        files: [
            // Test utilities (not instrumented)
            { pattern: 'tests/test-paths.js', instrument: false },
            { pattern: 'tests/test-utils.js', instrument: false },
            
            // Source files from all versions
            { pattern: 'v0.1.*/**/*.js', load: false },
            { pattern: 'v0.1.*/**/*.css', load: false },
            
            // Exclude test files from source instrumentation
            { pattern: '!v0.1.*/**/*.test.js' },
        ],
        
        tests: [
            'v0.1.*/**/*.test.js',
        ],
        
        testFramework: 'qunit',
        
        env: {
            kind: 'chrome',
        },
        
        // use middleware to proxy requests to the correct folder
        middleware: function (app, express) {
            app.use('/console/v0/v0.1', express.static(wallaby.projectCacheDir));
        },
        
        setup: function() {
            if (!document.getElementById('qunit-fixture')) {
                const fixture = document.createElement('div');
                fixture.id = 'qunit-fixture';
                document.body.appendChild(fixture);
            }
        },
    };
};
```

**Best for**: TDD workflow, instant feedback, code coverage visualization

---

## GitHub Actions CI Integration

**.github/actions/qunit__run-tests/action.yml** (Composite Action):

```yaml
name: 'Run QUnit Tests'
description: 'Run QUnit browser tests with Karma'

inputs:
  working-directory:
    description: 'Directory containing test configuration'
    required: false
    default: '.'

runs:
  using: "composite"
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install dependencies
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      run: npm install
    
    - name: Run QUnit tests
      shell: bash
      working-directory: ${{ inputs.working-directory }}
      run: npm test
```

**.github/workflows/ci-pipeline.yml**:

```yaml
name: CI Pipeline

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  run-qunit-tests:
    name: "Run QUnit Browser Tests"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: console/v0/v0.1
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run QUnit tests
        run: npm test

  # Optional: Run tests against multiple browsers
  cross-browser-tests:
    name: "Cross-Browser Tests"
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [ChromeHeadless, FirefoxHeadless]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
        working-directory: console/v0/v0.1
      - run: npm test -- --browsers=${{ matrix.browser }}
        working-directory: console/v0/v0.1
```

---

## Version Consolidation (v0.2.0)

When consolidating minor versions into a major version:

### Code Consolidation
Base files + surgical patches → merged complete files

### Test Consolidation
Base tests + surgical tests → merged complete test files

```
Before (v0.1.x):
─────────────────
v0.1.0/components/config-panel/
├── config-panel.js           # Full: 500 lines
└── config-panel.test.js      # Full: tests 20 methods

v0.1.3/components/config-panel/
├── config-panel.js           # Patch: 15 lines (1 method)
└── config-panel.test.js      # Patch: tests 1 method

v0.1.5/components/config-panel/
├── config-panel.js           # Patch: 20 lines (2 methods)
└── config-panel.test.js      # Patch: tests 2 methods


After (v0.2.0):
─────────────────
v0.2.0/components/config-panel/
├── config-panel.js           # Merged: all methods integrated
└── config-panel.test.js      # Merged: all tests in one file
```

### Consolidation Steps

1. **Copy tests with their source files** - Tests follow their code
2. **Merge test files** - Combine base tests + all patch tests
3. **Update test-paths.js** - Point to consolidated locations (simpler, no chains)
4. **Run full suite** - All tests should pass without modification
5. **Coverage consolidates** - No more fragmented coverage across versions

### Merged Test File Example

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   ConfigPanel - Complete Unit Tests
   v0.2.0 - Consolidated from v0.1.x
   ═══════════════════════════════════════════════════════════════════════════ */

QUnit.module('ConfigPanel', function(hooks) {
    
    hooks.before(async function(assert) {
        // Single file - no chain needed
        await TestUtils.loadScript(TestPaths.base + '/v0.2.0/components/config-panel/config-panel.js');
        assert.ok(typeof ConfigPanel !== 'undefined', 'ConfigPanel loaded');
    });
    
    hooks.afterEach(function() {
        TestUtils.cleanup();
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // Constructor (from v0.1.0)
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('constructor initializes default state', function(assert) {
        // ... from v0.1.0 tests
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // validateInput (from v0.1.3 patch tests)
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('validateInput returns false when config is null', function(assert) {
        // ... from v0.1.3 tests
    });
    
    QUnit.test('validateInput returns false when preset is undefined', function(assert) {
        // ... from v0.1.3 tests
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // getConfig/setConfig (from v0.1.5 patch tests)
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('getConfig includes timestamp', function(assert) {
        // ... from v0.1.5 tests
    });
    
    // ... all other tests merged together
});
```

---

## Critical Anti-Patterns to AVOID

❌ **Don't** create full test files for surgical overrides (test only what changed)  
❌ **Don't** put tests in a central folder separate from source  
❌ **Don't** create individual HTML files per unit test  
❌ **Don't** share tests across major versions  
❌ **Don't** forget to load the full script chain in order  
❌ **Don't** mock in unit tests what you can test directly  
❌ **Don't** forget to restore mocked globals in `afterEach`  
❌ **Don't** forget prototype modifications are global (restore them!)  
❌ **Don't** add event listeners without tracking them for cleanup  
❌ **Don't** leave timers running after tests complete

---

## Quick Reference

| Aspect | IFD Testing Approach |
|--------|----------------------|
| **Test Location** | Co-located with source |
| **Surgical Override** | Surgical test (only changed methods) |
| **Base Component** | Full test (all methods) |
| **Unit Test Naming** | `source.test.js` |
| **Integration Test Naming** | `page.html.test.js` |
| **Loading Strategy** | Full chain: base + patches in order |
| **Framework** | QUnit (no build step) |
| **Browser Runner** | `tests/index.html` (works in production!) |
| **CI Runner** | Karma + ChromeHeadless |
| **IDE Integration** | Wallaby.js |
| **Isolation** | `afterEach` cleanup (including prototypes) |
| **Mocking** | Minimal, restore always |
| **Coverage** | Per-version, co-located |
| **Consolidation** | Merge base tests + patch tests |

---

## Example: Surgical Test File

```javascript
/* ═══════════════════════════════════════════════════════════════════════════
   Playground - Surgical Override Tests
   v0.1.5/js/playground.test.js
   
   Tests ONLY the methods overridden in this version:
   - formatBytes() - new formatting logic
   - scheduleAutoRender() - fixed debounce bug
   ═══════════════════════════════════════════════════════════════════════════ */

QUnit.module('Playground v0.1.5 Overrides', function(hooks) {
    
    let instance = null;
    
    hooks.before(async function(assert) {
        // Load full chain up to this version
        await TestUtils.loadScript(TestPaths.base + '/v0.1.0/js/playground.js');
        await TestUtils.loadScript(TestPaths.base + '/v0.1.2/js/playground.js');
        await TestUtils.loadScript(TestPaths.base + '/v0.1.5/js/playground.js');
        
        assert.ok(typeof Playground === 'function', 'Playground loaded with patches');
    });
    
    hooks.afterEach(function() {
        if (instance?.autoRenderTimer) {
            clearTimeout(instance.autoRenderTimer);
        }
        instance = null;
        TestUtils.cleanup();
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // formatBytes (overridden in v0.1.5)
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('formatBytes handles zero', function(assert) {
        instance = new Playground();
        assert.strictEqual(instance.formatBytes(0), '0 B');
    });
    
    QUnit.test('formatBytes formats KB with one decimal', function(assert) {
        instance = new Playground();
        assert.strictEqual(instance.formatBytes(1536), '1.5 KB');
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // scheduleAutoRender (bug fix in v0.1.5)
    // ═══════════════════════════════════════════════════════════════════════
    
    QUnit.test('scheduleAutoRender clears existing timer', function(assert) {
        instance = new Playground();
        instance.htmlInput = { getHtml: () => '<div>test</div>' };
        instance.currentHtml = '<div>test</div>';
        
        instance.scheduleAutoRender();
        const firstTimer = instance.autoRenderTimer;
        
        instance.scheduleAutoRender();
        
        assert.ok(firstTimer !== instance.autoRenderTimer, 'timer should be replaced');
    });
    
    // NO tests for other methods - they're tested in earlier versions
});
```

---

**This is IFD Testing.** Zero-dependency browser testing, CI-ready pipelines, production QA capability, and surgical precision matching your code changes.