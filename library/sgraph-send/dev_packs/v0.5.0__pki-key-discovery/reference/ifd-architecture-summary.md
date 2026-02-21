# IFD Issues-FS Architecture — Summary for Admin Console

**Source:** `library/guides/development/ifd/ifd__issues-fs/`

---

## Core Architecture

The IFD Issues-FS pattern uses 4 layers:

### 1. Services (loaded first)
Global singletons on `window.sgraphAdmin`:
```javascript
window.sgraphAdmin = {
    events   : new EventBus(),
    config   : new ConfigManager(),
    keys     : new KeysService(),
    messages : new MessagesService(),
    router   : null  // set by shell
};
```

### 2. EventBus (central nervous system)
```javascript
class EventBus {
    constructor() { this._listeners = {}; this._history = []; }

    on(event, handler)  { /* subscribe   */ }
    off(event, handler) { /* unsubscribe */ }
    emit(event, data)   { /* publish — records to _history for debug panel */ }
}
```

All component communication goes through the EventBus. Components never call each other directly.

### 3. Shell + Router (navigation)
The shell manages:
- Left sidebar navigation (nav sections with items)
- Main content area (shows one component at a time)
- Right sidebar (debug panels: Messages, Events, API Logger)
- Status bar (bottom)

The router:
- Maps `appId` → component element
- Handles `navigated` events
- Calls `onActivate()` / `onDeactivate()` on components

### 4. Components (Web Components, light DOM)
Each component:
- Has a static `appId`, `navLabel`, `navIcon`
- Uses light DOM (no Shadow DOM)
- Subscribes to events in `connectedCallback()`
- Unsubscribes in `disconnectedCallback()`
- Stores bound handlers for cleanup

---

## 3 Debug Panels (required)

### Messages Panel
- Shows user-facing notifications (success, error, warning, info)
- Listens to `message-added` events
- Each message has type, text, timestamp, optional auto-dismiss

### Events Viewer
- Live stream of ALL EventBus events
- Shows event name, data (JSON), timestamp
- Filter by event name
- Clear button
- Useful for debugging component communication

### API Logger
- Records all `fetch()` calls
- Shows method, URL, status, duration, response preview
- Intercepts `window.fetch` or hooks into the API client
- Filter by status (2xx, 4xx, 5xx)
- Clear button

---

## Component Template

```javascript
(function() {
    'use strict';

    class MyComponent extends HTMLElement {
        static get appId()    { return 'my-component'; }
        static get navLabel() { return 'My Component'; }
        static get navIcon()  { return '🔑'; }

        constructor() {
            super();
            this._boundHandlers = {};
        }

        connectedCallback() {
            this.render();
            this.setupEventListeners();
        }

        disconnectedCallback() {
            this.cleanup();
        }

        onActivate()   { this.loadData(); }
        onDeactivate() { /* pause, cleanup timers */ }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="mc-container">
                    <h2 class="mc-title">My Component</h2>
                    <!-- content -->
                </div>
            `;
        }

        setupEventListeners() {
            this._boundHandlers.onRefresh = () => this.loadData();
            this.events.on('refresh', this._boundHandlers.onRefresh);
        }

        cleanup() {
            Object.entries(this._boundHandlers).forEach(([event, handler]) => {
                this.events.off(event, handler);
            });
        }

        async loadData() {
            try {
                const data = await window.sgraphAdmin.keys.list();
                this.renderData(data);
                this.events.emit('api-call', { method: 'GET', url: '/keys/list', status: 200 });
            } catch (err) {
                this.events.emit('api-error', { operation: 'loadData', error: err.message });
                window.sgraphAdmin.messages.error('Failed to load data');
            }
        }

        getStyles() {
            return `
                .mc-container { padding: 1rem; }
                .mc-title { color: var(--admin-text); margin: 0 0 1rem; }
            `;
        }

        get events() { return window.sgraphAdmin.events; }
    }

    customElements.define('my-component', MyComponent);
})();
```

---

## Key Rules

1. **Light DOM** — no `attachShadow()`. Enables style cascading and surgical overrides.
2. **IIFE** — `(function() { ... })()` keeps internals private.
3. **EventBus only** — no direct method calls between components.
4. **Cleanup** — every `on()` has a matching `off()` in `disconnectedCallback()`.
5. **CSS prefix** — short unique prefix per component (e.g., `pk-`, `kl-`, `kr-`).
6. **Static registration** — `appId`, `navLabel`, `navIcon` as static getters.
7. **Lifecycle hooks** — `onActivate()` for lazy loading, `onDeactivate()` for cleanup.
