---
name: use-sg-playwright
description: Drive the SG/Playwright browser-automation service over HTTP — navigate pages, run scripted multi-step sequences, take screenshots/PDFs, extract DOM/text/HTML, batch-probe one page from many angles, or hold a stateful browser session. Trigger when the user asks to "navigate to a URL", "take a screenshot of a page", "scrape a page", "fill a form on a site", "extract the DOM from", "render a PDF of", "click a button on", "drive a browser", or any phrasing that means "remote-control a real Chromium instance through the sg-playwright API". The launching operator gives you a HOST (the FQDN of an ephemeral sg-compute EC2 / a /pw vault proxy) and a TOKEN; every call is HTTP — you hold no browser yourself. CRITICAL on auth: use `x-sgraph-access-token: ${TOKEN}` for `${HOST}/pw/...` (the proxied production path) and `X-API-Key: ${TOKEN}` for direct stack access — sending the wrong header gets 401 on every call.
---

# use-sg-playwright

## Connect

The launching operator gives you two values:

```
HOST   = https://<name>.sg-compute.sgraph.ai      # FQDN; trusted cert; no -k needed
TOKEN  = <token from `sg va info`>
```

**The auth header depends on the path** — this is the #1 first-attempt failure:

| Path | Header | Why |
|---|---|---|
| `${HOST}/pw/...` (vault `/pw` reverse proxy — the production path) | `x-sgraph-access-token: ${TOKEN}` | The `/pw` proxy strips the inbound header and injects `X-API-Key` upstream. A caller sending `X-API-Key` to the proxy gets 401 at the proxy. |
| `${HOST}/...` (direct service — local Docker / direct EC2 port) | `X-API-Key: ${TOKEN}` | Hits the API-key middleware directly. |

Every request via the `/pw` proxy:

```bash
curl -s -H "x-sgraph-access-token: ${TOKEN}" -H "Content-Type: application/json" \
     -X POST "${HOST}/pw/<route>" -d '{...}'
```

Direct access (no proxy):

```bash
curl -s -H "X-API-Key: ${TOKEN}" -H "Content-Type: application/json" \
     -X POST "${HOST}/<route>" -d '{...}'
```

Verify the service is reachable:

```bash
curl -sf -H "x-sgraph-access-token: ${TOKEN}" "${HOST}/pw/health/info"        # /pw proxy
curl -sf -H "X-API-Key: ${TOKEN}"             "${HOST}/health/info"           # direct
```

## Decision tree — which route to use

| Goal | Route |
|---|---|
| Single page, one or two actions | `POST /browser/{navigate,click,fill,get-content,get-url,screenshot}` |
| Multi-step linear script | `POST /sequence/execute` |
| One page, many independent reads (URL + DOM + screenshot + …) | `POST /inspect` |
| Render to PNG or HTML, one-shot | `POST /screenshot` |
| Multiple actions against the SAME page across calls (amortise navigate + decrypt) | `POST /session/open` → `/session/{id}/act` + `/session/{id}/probe` → `/session/{id}/close` |
| Prometheus metrics | `GET /metrics` |
| Capability detection | `GET /health/capabilities` |

## The 24 step verbs

Linear pipeline steps for `/sequence/execute`, building blocks for `/inspect` probes:

```
navigate        click           fill            press           select          hover
scroll          wait            wait_for        screenshot      evaluate        dispatch_event
set_viewport    get_content     get_url         get_text        get_html        get_dom_tree
get_a11y_tree   get_pdf         get_console_tail   get_network_failures
video_start     video_stop
```

### `wait_for` predicates (precedence, top to bottom)

| Field | What it waits for |
|---|---|
| `function` | A JS predicate returns truthy. **Allowlist-gated** — default service rejects. |
| `network_idle_ms` | No in-flight requests for N consecutive ms (`websocket`+`eventsource` excluded). |
| `text` | Visible text appears (optionally scoped to `selector`). |
| `selector` + `selector_gone: true` | Selector detaches from DOM. |
| `selector` (default) | Selector is visible. |
| `selector` + `visible: false` | Selector is merely attached. |
| `url_pattern` | Page URL matches. |
| `state` | `load` / `domcontentloaded` / `networkidle`. |

## Recipes

### 1. Simple navigate + screenshot

```json
POST /sequence/execute
{
  "capture_config": {"screenshot": {"enabled": true, "sink": "inline"}},
  "sequence_config": {},
  "steps": [
    {"action": "navigate",   "url": "https://example.com"},
    {"action": "screenshot", "full_page": true}
  ]
}
```

Response: `step_results[1].artefacts[0]` has `inline_b64` (base64 PNG) + `width`/`height` in pixels.

### 2. Wait for SPA to render, then capture text + DOM

```json
POST /sequence/execute
{
  "capture_config": {}, "sequence_config": {},
  "steps": [
    {"action": "navigate",     "url": "https://app.example.com"},
    {"action": "wait_for",     "text": "Welcome back"},
    {"action": "get_text"},
    {"action": "get_dom_tree", "max_depth": 4}
  ]
}
```

### 3. `/inspect` — snapshot once, probe many (the most efficient pattern)

```json
POST /inspect
{
  "navigate": {"url": "https://app.example.com"},
  "settle":   [{"action": "wait_for", "text": "Welcome back"}],
  "probes": {
    "current_url":  {"action": "get_url"},
    "page_text":    {"action": "get_text"},
    "page_dom":     {"action": "get_dom_tree", "max_depth": 4},
    "a11y":         {"action": "get_a11y_tree", "interesting_only": false},
    "shot":         {"action": "screenshot",   "full_page": true}
  },
  "diagnostics_on_fail": true
}
```

Response: `probe_results.{current_url, page_text, page_dom, a11y, shot}`. On failure, `diagnostics: {console_log, network_failures}` is populated.

Probes are **read-only** — `click`/`fill`/`navigate`/`evaluate`/`wait_for` in `probes` returns HTTP 422.

### 4. Vault-decrypt + many probes — `/session/*`

When you need to act on a page MULTIPLE times without paying the navigate+decrypt cost each call:

```json
POST /session/open                    → {"session_id": "...", "expires_in_ms": 300000}
POST /session/{sid}/act               → run a /sequence-shape body (navigate + decrypt steps)
POST /session/{sid}/probe             → run an /inspect-shape body (no navigate) against the held page
POST /session/{sid}/probe             → ...again. Page state persists.
POST /session/{sid}/close             → tear down. Auto-closes on TTL too.
```

### 5. Run a JS predicate (requires service allowlist)

```json
{"action": "wait_for", "function": "() => window.__appReady === true", "timeout_ms": 10000}
```

If the JS isn't in the allowlist, the step's `error_message` will contain "allowlist" and `sequence status` is `failed` (NOT HTTP 422 — `Sequence__Runner` keeps one bad step from aborting the sequence).

## Response shape (every endpoint)

`/sequence/execute` and `/session/{id}/act` return `Schema__Sequence__Response`:

```json
{
  "sequence_id": "safe-id_xxxx",
  "trace_id":    "abcdef01",
  "status":      "completed" | "partial" | "failed",
  "engine":      "sync",
  "total_duration_ms": 1234,
  "steps_total": 4, "steps_passed": 4, "steps_failed": 0, "steps_skipped": 0,
  "step_results": [
    {"step_id": "0", "step_index": 0, "action": "navigate", "status": "passed",
     "duration_ms": 800, "artefacts": [],
     "content": null, "url": null, "text": null, "html": null,
     "dom_tree": null, "accessibility_tree": null,
     "return_value": null, "return_type": null,
     "console_log": null, "network_failures": null,
     "error_message": null, "error_type": null}
    ...
  ],
  "artefacts": [...],
  "timings": {"playwright_start_ms": ..., "browser_launch_ms": ..., "steps_ms": ...,
              "browser_close_ms": ..., "total_ms": ...}
}
```

Every step result carries EVERY lifted field (most are `null`). Look for the field that matches the verb you ran:

| Verb | Field populated |
|---|---|
| `get_url` | `url` |
| `get_text` | `text` |
| `get_html` | `html` |
| `get_content` | `content`, `content_format`, `content_type` |
| `get_dom_tree` | `dom_tree` (nested JSON) |
| `get_a11y_tree` | `accessibility_tree` (CDP flat `nodes` shape) |
| `evaluate` | `return_value`, `return_type` |
| `get_console_tail` | `console_log` (list) |
| `get_network_failures` | `network_failures` (list) |
| `screenshot` / `get_pdf` | `artefacts[i]` |

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `401` on every call | Wrong auth header — `X-API-Key` against the `/pw` proxy, or `x-sgraph-access-token` against direct. | See the Connect section's table; pick the header that matches the path. |
| `404` from a known route | Some paths are `/pw`-prefixed (proxy), some aren't (direct). | Use `${HOST}/pw/...` vs `${HOST}/...` per your environment. |
| `/inspect` screenshot probe reports `passed` but `artefacts: []` | Without `capture_config` the screenshot has no sink → no artefact emitted. The step still "succeeds" in capturing bytes; they just go nowhere. | Set `"capture_config": {"screenshot": {"enabled": true, "sink": "inline"}}` at the TOP LEVEL of the `/inspect` body. |
| `get_text` returns `""` on a shadow-DOM-heavy app | `get_text` uses light-DOM `innerText` — does NOT pierce shadow roots. | Use `get_dom_tree` (which DOES pierce open shadow roots, marks `shadow_root: true`) or `screenshot` for shadow-heavy pages. |
| `wait_for: function` returns `failed` with "allowlist" | Default service has empty allowlist. | Either use `/screenshot` (which has its own `allow_all` runner for `javascript`), or ask the operator to populate the allowlist. |
| `get_a11y_tree` returns flat `{nodes: [...]}` instead of a nested tree | This is the new CDP shape since Playwright 1.49 removed `page.accessibility`. Filter `n.ignored === false` for "interesting only". | Update any client that expected the old nested shape. |
| `/inspect`'s `probe_results.X.url` startswith different URL than `navigate.url` | Site redirected (e.g. `https://sgraph.ai/` → `https://sgraph.ai/en-GB/`). | Compare loosely (`startswith` instead of `==`). |
| `wait_for: network_idle_ms` never reaches quiet | Site has long-polling XHR, analytics beacons. | Use `wait_for: text` or `wait_for: function` against a specific signal instead. |

## Reading the docs while you work

```bash
# via /pw proxy:
curl -sf -H "x-sgraph-access-token: ${TOKEN}" "${HOST}/pw/health/capabilities" | jq
curl -sf -H "x-sgraph-access-token: ${TOKEN}" "${HOST}/pw/health/info"          | jq
curl -sf -H "x-sgraph-access-token: ${TOKEN}" "${HOST}/pw/metrics"              | head
```

The full Swagger UI is at `${HOST}/pw/docs` — every schema, every example, live against your stack.
