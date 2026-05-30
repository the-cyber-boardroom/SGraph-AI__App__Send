# Driving sg-playwright from a Claude Session

*A guide written by a Claude session, for the next Claude session.*

If you're reading this, someone has probably handed you two things — a **host** and an
**access key** — and said "use the Playwright service." This guide is everything you need.
You don't need to read anything else. By the end you'll be taking screenshots of live pages
with single HTTP calls, no local browser required.

This guide is itself evidence of the thing it describes: it was written by a Claude session
that used `sg-playwright` to screenshot the very library you're reading it in.

---

## What this is

`sg-playwright` is a browser-automation service — Playwright and Chromium running in a
container, exposed over HTTP. You drive a real browser by making HTTP calls. You hold no
browser yourself; every action (navigate, click, screenshot) is a request.

The image is public on Docker Hub (`diniscruz/sg-playwright`). In our setup it runs on an
ephemeral **SG/Compute** stack, reached through a vault's `/pw` reverse proxy. The operator
who hands you the host has already started it.

**Why use it instead of installing Playwright locally?** Because in a sandboxed Claude
session, installing Playwright + Chromium + wrangling the network proxy is slow and fragile.
This service is one `pip`-free HTTP call away and far more reliable.

---

## What you've been given

```
HOST   = https://<name>.sg-compute.sgraph.ai     # trusted Let's Encrypt cert, no -k needed
TOKEN  = <access key, e.g. m1jF-VWmiXshsuqP25om6OpVYXFKYG2W>
```

Every call goes to `${HOST}/pw/...` with this header:

```
x-sgraph-access-token: ${TOKEN}
```

**Use `x-sgraph-access-token` exactly.** Not `Authorization: Bearer`, not `X-API-Key`. If
you use the wrong header you get a 401 saying *"Client API key is missing"* — which is
misleading; it means missing, i.e. wrong-named, not invalid. (This trips up every first
attempt. Now you know.)

---

## Step 1 — Smoke test (always do this first)

Confirm you can reach the service and what version it is:

```bash
curl -s "$HOST/pw/health/info" -H "x-sgraph-access-token: $TOKEN" | jq .service_version
# expect something like "v0.2.47"
```

Then confirm the workhorse runs end-to-end:

```bash
curl -s -X POST "$HOST/pw/sequence/execute" \
  -H "x-sgraph-access-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"steps":[{"action":"navigate","url":"https://example.com"},
                {"action":"wait_for","selector":"body","timeout_ms":5000},
                {"action":"screenshot","full_page":true}],
       "capture_config":{"screenshot":{"enabled":true,"sink":"inline"}}}' \
  | jq '{status, steps_passed}'
# expect: {"status":"completed","steps_passed":3}
```

If both are green, you're unblocked.

---

## Step 2 — A reusable helper

In a Claude session you'll want a small Python helper so each screenshot is one function
call. Drop this in your workspace:

```python
import json, base64, urllib.request

HOST  = "https://<name>.sg-compute.sgraph.ai"   # paste yours
TOKEN = "<access key>"                            # paste yours

def run(steps, capture_screenshot=True):
    """Run a sequence, return the parsed response."""
    body = {"steps": steps, "sequence_config": {"halt_on_error": False}}
    if capture_screenshot:
        body["capture_config"] = {"screenshot": {"enabled": True, "sink": "inline"}}
    req = urllib.request.Request(
        f"{HOST}/pw/sequence/execute",
        data=json.dumps(body).encode(),
        headers={"x-sgraph-access-token": TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def save_shots(resp, prefix="shot"):
    """Write every inline screenshot artefact to disk; return file paths."""
    paths = []
    for i, s in enumerate(resp.get("step_results", [])):
        for j, a in enumerate(s.get("artefacts", [])):
            if a.get("inline_b64"):
                p = f"{prefix}-{i}-{j}.png"
                with open(p, "wb") as f:
                    f.write(base64.b64decode(a["inline_b64"]))
                paths.append(p)
    return paths

def screenshot(url, prefix="shot", full_page=True, wait_selector="body"):
    resp = run([
        {"action": "navigate", "url": url, "wait_until": "networkidle", "timeout_ms": 30000},
        {"action": "wait_for", "selector": wait_selector, "timeout_ms": 15000},
        {"action": "screenshot", "full_page": full_page},
    ])
    print("status:", resp.get("status"))
    return save_shots(resp, prefix)
```

Then a screenshot is just:

```python
files = screenshot("https://qa.sgraph.ai/en-gb/library/use-cases/", "use-cases")
# view files[0] with your image tool
```

Decode the base64, write the PNG, and view it with your file-viewing tool. Done.

---

## Step 3 — The step verbs you'll actually use

Everything goes through `/pw/sequence/execute` with a `steps` array. The verbs you'll reach
for most:

- **`navigate`** — `{url, wait_until?, timeout_ms?}`. `wait_until` is one of
  `load` / `domcontentloaded` / `networkidle`.
- **`wait_for`** — `{selector?, state?, url_pattern?, timeout_ms?, visible?}`. Your main
  synchronisation tool. Wait for the thing you care about before screenshotting.
- **`screenshot`** — `{full_page?, selector?}`. Produces an inline PNG artefact.
- **`click`** — `{selector, timeout_ms?}`.
- **`fill`** — `{selector, value, clear_first?}`.
- **`press`** — `{key, selector?}`. `key` is an enum (`Enter`, `Tab`, `Escape`, …).
- **`get_content`** — `{selector?, content_format?}`. Read HTML/text. (Note: may be flaky
  on some builds — see Gotchas.)
- **`evaluate`** — `{expression}`. **Allowlisted** to constant, side-effect-free reads
  only (`document.title`, `window.location.href`). Don't try to bypass it.

Full current list and response schema: `GET ${HOST}/pw/docs` (Swagger) and
`GET ${HOST}/pw/openapi.json`.

---

## Step 4 — Reading the response

The response is typed and per-step. The shape you care about:

```json
{
  "status": "completed",          // completed | failed | partial
  "steps_passed": 3,
  "step_results": [
    {"action":"navigate","status":"passed","error_type":null,"artefacts":[]},
    {"action":"screenshot","status":"passed","artefacts":[
       {"artefact_type":"screenshot","sink":"inline","inline_b64":"<base64 PNG>",
        "size_bytes":13531}]}
  ]
}
```

Key facts:

- **HTTP 200 even when a step fails.** A failed step is `status:"failed"` with an
  `error_type` (`timeout` / `selector_not_found` / `navigation_failed` / …). Branch on
  `error_type`, don't retry blindly.
- **Non-2xx means a request-level problem** — 401 (bad/missing auth header), 400/422
  (malformed body or, notably, an invalid URL — see Gotchas).
- **Screenshots come back as `inline_b64`** inside the owning step's `artefacts`. Decode and
  write to disk.

---

## Step 5 — `halt_on_error` and capture config

- `sequence_config.halt_on_error`: `true` (default) stops at the first failure and marks the
  rest `skipped`; `false` runs everything. Use `false` when you want a best-effort capture
  even if one step fails.
- `capture_config.screenshot.sink`: use `inline` (the default that works). `vault` / `s3`
  sinks are seams and may not be wired — don't rely on them.

---

## Gotchas (learned the hard way, so you don't have to)

**The auth header is `x-sgraph-access-token`.** Wrong header → 401 "Client API key is
missing". This is the #1 first-attempt failure.

**URLs with a `:` in the hash fragment get rejected (HTTP 400).** If you're opening a vault
or any SPA whose URL looks like `https://host/#id:key`, the service's URL validator rejects
the colon. **Workaround: URL-encode the colon as `%3A`** —
`https://host/#id%3Akey`. The page decodes it back correctly.

**`networkidle` returns before an async SPA has rendered.** For server-rendered pages,
`wait_until:"networkidle"` + `wait_for body` is enough. For client-side apps that fetch and
render after load (e.g. anything that decrypts a vault in-browser), `networkidle` fires too
early. Wait for a **selector that only exists once the content you want has rendered** — not
`body`, which exists immediately. If you don't know the right selector, take an early
screenshot to see the loading state, identify a stable element in the loaded UI, and wait on
that.

**Avoid blind time-waits.** There's no fixed-duration `wait` verb on every build. Prefer
`wait_for` on a real selector. (If a build genuinely strands you, a `wait_for` on a
known-present element with a sensible `timeout_ms` is the honest tool; do not wait on a
deliberately-missing selector to burn time — it works but it's a smell, and it slows you by
the full timeout every run.)

**Every sequence is a fresh browser.** No cookies, storage, or sessions survive between
calls. If the target page needs auth, pass it per-request (the service never retains it).
Within a single `sequence/execute`, steps share one context — so navigate, interact, and
screenshot in one sequence rather than chaining separate calls.

**`evaluate` is read-only and allowlisted.** It's for constant reads, not for scraping. For
bulk DOM, use `get_content`.

---

## A worked example: screenshot several pages cleanly

```python
pages = {
    "home":      "https://qa.sgraph.ai/en-gb/library/",
    "use-cases": "https://qa.sgraph.ai/en-gb/library/use-cases/",
    "js-api":    "https://qa.sgraph.ai/en-gb/library/use-cases/agentic-js-api/how-it-works/",
}
for name, url in pages.items():
    files = screenshot(url, prefix=name)
    print(name, "->", files)
```

Three full-page screenshots, three HTTP calls, no local browser. View each PNG with your
file tool.

---

## When this guide is wrong or the service has changed

Two live sources of truth, in order:

1. `GET ${HOST}/pw/health/info` — confirm the version. If it's far from what this guide
   assumes, behaviour may differ.
2. `GET ${HOST}/pw/openapi.json` and `GET ${HOST}/pw/docs` — the machine-readable spec and
   Swagger UI from the running image. Authoritative for paths and response shapes.

If the service surprises you — an unhelpful error, a verb that doesn't behave as documented,
a gap you'd hit a wall without — that's worth reporting back to whoever runs the stack. The
maintainers can't see the gaps from inside the code; you can, from out here driving it.

---

## The shortest possible version

1. Header: `x-sgraph-access-token: <TOKEN>`.
2. Smoke: `GET $HOST/pw/health/info`.
3. Everything else: `POST $HOST/pw/sequence/execute` with a `steps` array.
4. Screenshots come back as `inline_b64` — decode, save, view.
5. Wait for a *meaningful* selector, never a blind timer.
6. SPA URLs with `:` in the fragment → encode it as `%3A`.

That's the whole job.
