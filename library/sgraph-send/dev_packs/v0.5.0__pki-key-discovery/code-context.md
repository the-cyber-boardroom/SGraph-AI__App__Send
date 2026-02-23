# PKI Key Discovery — Code Context

**Purpose:** Source code from the existing codebase. These are the patterns to follow and the code to extend.

---

## 1. Backend: Routes__Tokens (pattern for Routes__Keys)

**File:** `sgraph_ai_app_send/lambda__admin/fast_api/routes/Routes__Tokens.py`

```python
from fastapi                                                                    import HTTPException
from osbot_fast_api.api.routes.Fast_API__Routes                                import Fast_API__Routes
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.schemas.Schema__Token__Create__Request   import Schema__Token__Create__Request
from sgraph_ai_app_send.lambda__admin.service.Service__Tokens                  import Service__Tokens

TAG__ROUTES_TOKENS = 'tokens'

class Routes__Tokens(Fast_API__Routes):
    tag             : str = TAG__ROUTES_TOKENS
    service_tokens  : Service__Tokens

    def create(self, body: Schema__Token__Create__Request) -> dict:
        token_name  = body.token_name
        # ... validation, call service, return result or raise HTTPException
        result = self.service_tokens.create(...)
        if result is None:
            raise HTTPException(status_code=409, detail='Token name already exists')
        return result

    def lookup__token_name(self, token_name: Safe_Str__Id) -> dict:
        result = self.service_tokens.lookup(token_name)
        if result is None:
            raise HTTPException(status_code=404, detail='Token not found')
        return result

    def setup_routes(self):
        self.add_route_post(self.create)
        self.add_route_get (self.lookup__token_name)
        # ... etc
        return self
```

**Key patterns:**
- Class extends `Fast_API__Routes`
- `tag` field controls URL prefix (e.g., `tag = 'keys'` → `/keys/...`)
- Service injected as a field
- `setup_routes()` registers methods with `add_route_post`, `add_route_get`, `add_route_delete`
- Method names with `__` become path params: `lookup__code` → `/keys/lookup/{code}`
- Use `HTTPException` for error responses
- Use `Safe_Str__Id` for path parameters

---

## 2. Backend: Fast_API app (where to register Routes__Keys)

**File:** `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py`

```python
class Fast_API__SGraph__App__Send__Admin(Serverless__Fast_API):
    send_cache_client : Send__Cache__Client  = None
    service_tokens    : Service__Tokens       = None
    # ADD: service_keys : Service__Keys       = None

    def setup(self):
        # ... config, auto-create cache client, auto-create services
        if self.send_cache_client is None:
            self.send_cache_client = create_send_cache_client()
        if self.service_tokens is None:
            self.service_tokens = Service__Tokens(send_cache_client=self.send_cache_client)
        # ADD: if self.service_keys is None:
        #          self.service_keys = Service__Keys(send_cache_client=self.send_cache_client)
        return super().setup()

    def setup_routes(self):
        self.setup_static_routes()
        self.add_routes(Routes__Tokens, service_tokens = self.service_tokens)
        # ADD: self.add_routes(Routes__Keys, service_keys = self.service_keys)
        # ...
```

---

## 3. Backend: Send__Cache__Client (storage layer to extend)

**File:** `sgraph_ai_app_send/lambda__admin/service/Send__Cache__Client.py`

```python
NS_ANALYTICS  = 'analytics'
NS_TOKENS     = 'tokens'
NS_COSTS      = 'costs'
NS_TRANSFERS  = 'transfers'
# ADD: NS_KEYS = 'keys'

class Send__Cache__Client(Type_Safe):
    cache_client   : Cache__Service__Client
    hash_generator : Cache__Hash__Generator

    # Token operations use key_based strategy:
    def token__create(self, token_data):
        token_name = token_data.get('token_name', '')
        return self.cache_client.store().store__json__cache_key(
            namespace       = NS_TOKENS,
            strategy        = 'key_based',
            cache_key       = token_name,
            file_id         = token_name,
            body            = token_data,
            json_field_path = 'token_name')

    def token__lookup(self, token_name):
        cache_hash = self.hash_generator.from_string(token_name)
        response   = self.cache_client.retrieve().retrieve__hash__cache_hash__cache_id(
            cache_hash = str(cache_hash),
            namespace  = NS_TOKENS)
        if response and response.get('cache_id'):
            cache_id = response.get('cache_id')
            return self.cache_client.retrieve().retrieve__cache_id__json(
                cache_id  = cache_id,
                namespace = NS_TOKENS)
        return None

    def token__list_all(self):
        return self.cache_client.admin_storage().folders(
            path             = f'{NS_TOKENS}/data/key-based/',
            return_full_path = False,
            recursive        = False) or []
```

**Key pattern for keys: follow the same `key_based` strategy with lookup code as the cache_key.**

---

## 4. Backend: Type_Safe schema pattern

**File:** `sgraph_ai_app_send/lambda__admin/schemas/Schema__Token__Create__Request.py`

```python
from osbot_utils.type_safe.Type_Safe import Type_Safe

class Schema__Token__Create__Request(Type_Safe):
    token_name  : str
    usage_limit : int  = 50
    created_by  : str  = 'admin'
    metadata    : dict = None
```

**New schema for keys:**
```python
class Schema__Key__Publish__Request(Type_Safe):
    public_key_pem  : str
    signing_key_pem : str = ''
```

---

## 5. Backend: Admin Config (version routing)

**File:** `sgraph_ai_app_send/lambda__admin/admin__config.py`

```python
APP_SEND__UI__ADMIN__ROUTE__PATH__CONSOLE = 'admin'
APP_SEND__UI__ADMIN__START_PAGE           = 'index'
APP_SEND__UI__ADMIN__MAJOR__VERSION       = "v0/v0.1"
APP_SEND__UI__ADMIN__LATEST__VERSION      = "v0.1.2"  # UPDATE to "v0.1.3"
```

---

## 6. Frontend: Current admin shell (v0.1.2 — to be replaced)

**File:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.2/components/admin-shell/admin-shell.js`

The current shell uses Shadow DOM and `data-panel` switching. The new v0.1.3 shell should use:
- **Light DOM** (no `attachShadow`)
- **EventBus** for navigation instead of `data-panel` attribute
- **Router** that matches appId to components
- **Three-column layout**: left nav | main content | debug sidebar

Key current patterns to preserve:
- CSS Grid layout with sidebar
- Mobile responsive (hamburger menu at 768px)
- Health check indicator
- Version badge

---

## 7. Frontend: Current index.html (v0.1.2)

**File:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.2/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SGraph Send — Admin Console</title>
    <link rel="stylesheet" href="../v0.1.0/css/admin.css">
</head>
<body>
    <admin-shell>
        <token-manager        data-panel="tokens"></token-manager>
        <analytics-dashboard  data-panel="analytics"  style="display:none"></analytics-dashboard>
        <metrics-dashboard    data-panel="metrics"     style="display:none"></metrics-dashboard>
        <cache-browser        data-panel="cache"       style="display:none"></cache-browser>
        <system-info          data-panel="system"      style="display:none"></system-info>
    </admin-shell>

    <script src="../v0.1.0/js/admin-api.js"></script>
    <script src="../v0.1.1/js/admin-api-cache.js"></script>
    <script src="components/admin-shell/admin-shell.js"></script>
    <script src="components/token-manager/token-manager.js"></script>
    <!-- ... more components ... -->
</body>
</html>
```

**v0.1.3 index.html should:**
- Load EventBus, ConfigManager, MessagesService FIRST
- Then load admin-api.js (extended with key endpoints)
- Then load the shell
- Then load all components
- Components register themselves with the router via static `appId`

---

## 8. Frontend: Admin API client

**File:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/js/admin-api.js`

```javascript
class AdminAPI {
    constructor() {
        this.baseUrl = '';
    }

    async _fetch(path, options = {}) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            credentials: 'include',  // Cookie auth
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }
        return response.json();
    }

    async createToken(tokenData) {
        return this._fetch('/tokens/create', {
            method: 'POST',
            body: JSON.stringify(tokenData),
        });
    }
    // ... etc
}

const adminAPI = new AdminAPI();
```

**Extend with key endpoints in v0.1.3:**
```javascript
// In v0.1.3/js/admin-api.js:
async publishKey(publicKeyPem, signingKeyPem = '') {
    return this._fetch('/keys/publish', {
        method: 'POST',
        body: JSON.stringify({ public_key_pem: publicKeyPem, signing_key_pem: signingKeyPem }),
    });
}

async lookupKey(code) {
    return this._fetch(`/keys/lookup/${encodeURIComponent(code.toLowerCase())}`);
}

async unpublishKey(code) {
    return this._fetch(`/keys/unpublish/${encodeURIComponent(code.toLowerCase())}`, { method: 'DELETE' });
}

async listKeys() {
    return this._fetch('/keys/list');
}

async getKeyLog() {
    return this._fetch('/keys/log');
}
```

---

## 9. Frontend: CSS Variables (dark theme)

**File:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/css/admin.css`

```css
:root {
    --admin-bg: #0f1117;
    --admin-surface: #1a1d27;
    --admin-surface-hover: #242836;
    --admin-border: #2d3240;
    --admin-text: #e4e6ef;
    --admin-text-secondary: #9ca3b4;
    --admin-text-muted: #6b7280;
    --admin-primary: #4f8ff7;
    --admin-primary-bg: rgba(79, 143, 247, 0.1);
    --admin-success: #10b981;
    --admin-warning: #f59e0b;
    --admin-error: #ef4444;
    --admin-sidebar-width: 240px;
    --admin-header-height: 56px;
    --admin-radius: 6px;
    --admin-font-mono: 'SF Mono', 'Fira Code', monospace;
    --admin-font-size-xs: 0.75rem;
    --admin-font-size-sm: 0.875rem;
    --admin-font-size-lg: 1.125rem;
    --admin-transition: 150ms ease;
}
```

---

## 10. Frontend: IFD Component Pattern (template for all new components)

```javascript
(function() {
    'use strict';

    class ComponentName extends HTMLElement {
        static get appId()    { return 'component-name'; }
        static get navLabel() { return 'Component Name'; }
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

        onActivate()   { /* called when visible */ }
        onDeactivate() { /* called when hidden  */ }

        render() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="cn-container"><!-- HTML --></div>
            `;
        }

        setupEventListeners() {
            this._boundHandlers.onRefresh = () => this.loadData();
            this.events.on('refresh', this._boundHandlers.onRefresh);
        }

        cleanup() {
            this.events.off('refresh', this._boundHandlers.onRefresh);
        }

        getStyles() { return `.cn-container { /* styles */ }`; }

        get events() { return window.sgraphAdmin.events; }
    }

    customElements.define('component-name', ComponentName);
})();
```

**Rules:**
- Light DOM (NO `attachShadow`)
- IIFE pattern (private scope)
- Bound handlers stored in `_boundHandlers` for cleanup
- Every `on()` must have a matching `off()` in `disconnectedCallback()`
- CSS prefix per component (e.g., `pk-` for pki-keys)
- Access EventBus via `window.sgraphAdmin.events`
