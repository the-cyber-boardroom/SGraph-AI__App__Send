# Agentic FastAPI Runtime — Layered Architecture (v4)

**Version:** v4 (direction-of-travel)
**Status:** DRAFT → to be finalised and used as the north star for all downstream briefs
**Supersedes:** v3 of this doc
**Lineage:** v0.21.2 arch brief → v0.1.28/29 CCW plans → v1–v3 of this doc → v4 (final rewrite with stateless axiom, `agentic` naming, lockdown-layer pattern)

---

## 0. Axioms

Three principles govern every design decision in this document. They are not suggestions. They are the foundation.

### Axiom 1 — Statelessness

Every API call completes within its own invocation. No call depends on state left behind by a previous call; no call produces state that a future call needs. Containers are ephemeral; replicas are interchangeable; replacement is not an exceptional event. The only state that persists is in external stores (SG/Send vaults, S3, cloud storage) which are themselves addressed by immutable identifiers.

**What this means in practice:**
- No in-process session state
- No shared in-memory cache that affects semantic behaviour (optimisation caches in `/tmp` are allowed; they don't change results)
- No "upload then reload" two-call patterns — every mutation is one atomic call
- No long-running background jobs
- No server-side sessions at the app level — every call carries its own auth
- No polling endpoints as the default flow — the caller gets its result synchronously, or not at all

**Why this matters:**
- Enables ephemeral infrastructure (Lambda, Firecracker, spot instances) as a first-class deployment target
- Enables autoscaling without coordination (replicas added/killed without disruption)
- Enables multi-cluster and multi-cloud deployments without sync machinery
- Makes testing deterministic (each test starts from a clean container)
- Makes failures recoverable by retry — no half-completed state to reconcile

### Axiom 2 — Least privilege by declaration

No code is trusted by default. Every capability is explicitly declared. A container gets access to exactly the resources it declared it needs — code execution limits, allowed hostnames, permitted vaults, projected credentials — and nothing more. The declaration is immutable per container lifetime (boot-only).

**What this means in practice:**
- Capability declarations are JSON files, committed to version control, auditable, diffable
- Declarations ship baked into Layer 3 images as a maximum; deployments can narrow but not widen
- Enforcement is compositional: container runtime (time/memory/IAM) + network sidecar (hostnames) + vault ACLs (files) + admin API mode (code upload)
- Changing capabilities = restarting the container with a new declaration; there is no runtime mutation of what's allowed

### Axiom 3 — Self-description via standard primitives

Every layer, every app is discoverable by agents using primitives the agent already knows: HTTP, OpenAPI, markdown. No bespoke protocol. No broker. No MCP server.

**What this means in practice:**
- Every FastAPI app auto-serves OpenAPI at a known path
- Every layer/app ships three SKILL files (`human`, `browser`, `agent`)
- Every container publishes a navigational `/admin/manifest` endpoint
- Agents discover capability through three calls: `/admin/manifest` → `/admin/openapi.json` → `/admin/skills/agent`

---

## 1. What this is — and who it's for

A composable runtime for executing Python code and automating browsers **on behalf of AI agents**. The primary consumer is not a human operator; it's an agent that needs a programmable place to run code, drive browsers, fetch data, and store results — under explicit, least-privilege, ephemeral access.

The agent's two headline capabilities:

1. **Code execution** — run Python, get results. Time-budgeted, network-constrained, ephemeral.
2. **Browser automation** — navigate the web, fill forms, extract content, capture artefacts. Stateless per call.

> **The Playwright service is one application built on this architecture. It is not the architecture itself.**

### What "agent-first" changes about the design

| Framing | Consequence |
|---|---|
| The admin API is the agent's control plane | Upload + reload in one atomic call (axiom 1) |
| Agents execute semi-trusted or untrusted code | Sandbox is the container runtime, not a Python check |
| Every capability is explicitly granted | Least-privilege by default per axiom 2 |
| Every call is its own world | No sessions, no background jobs, no polling-as-default |
| Agents discover tools programmatically | OpenAPI + SKILL files, per axiom 3 |
| Errors drive self-correction | Structured errors with `code`, `hint`, `retriable` |

---

## 2. Architecture overview

```
┌───────────────────────────────────────────────────────────┐
│   Container runtime (K8s / Firecracker / Lambda / ECS)    │
│   ↑ provides the hard security boundary                   │
│                                                           │
│   ┌─────────────────────────┐    ┌─────────────────────┐ │
│   │   Application container │    │  Network sidecar    │ │
│   │   ───────────────────   │    │  ─────────────────  │ │
│   │                         │───▶│  mitmproxy +        │ │
│   │   (Any base image)      │    │  SG/Send client     │ │
│   │   + agentic-fastapi     │    │  + policy engine    │ │
│   │   + agentic-fastapi-aws │    │                     │ │
│   │     (optional)          │    │  (enforces the      │ │
│   │   + LWA (binary)        │    │   container's       │ │
│   │   + app code            │    │   declared network  │ │
│   │   + SKILL files         │    │   capability)       │ │
│   │   + capabilities.json   │    │                     │ │
│   │                         │    │                     │ │
│   └───────────┬─────────────┘    └──────────┬──────────┘ │
│               │                              │            │
│               │ (artefacts)                  │ (traffic)  │
│               ▼                              ▼            │
│   ┌──────────────────────────────────────────────────┐   │
│   │          SG/Send vaults                          │   │
│   │  (encrypted, versioned — files, traffic logs)    │   │
│   └──────────────────────────────────────────────────┘   │
│                                                           │
│   Security = runtime isolation + declared capability      │
│              + admin mode + sidecar policy                │
└───────────────────────────────────────────────────────────┘
```

Four things to notice:

1. **L1 and L2 are payloads, not base images.** L3 picks its own base (Playwright's, CUDA, Alpine, whatever) and installs L1/L2 on top via PyPI + `COPY --from`.

2. **The network sidecar is a peer container.** Its enforcement is deferred in v1 (interface defined, implementation later); capability declaration format is live now.

3. **Security is compositional.** Hard boundary from the runtime; declared capability from the JSON; admin mode from L1; sidecar policy for network. No single component is "the" security.

4. **Every layer self-describes.** OpenAPI for shape, SKILL files for meaning.

---

## 3. The payloads

### Layer 1 — `sgraph-ai-agentic-fastapi` (the chassis)

A PyPI package plus a Docker Hub OCI shim image.

**Contains:**
- FastAPI chassis with API key auth (from `osbot-fast-api-serverless`)
- `Agentic_Code_Loader` — local paths, URL-zip, passthrough
- `Agentic_Admin_API` — always-up admin FastAPI at `/admin/*`
- `Agentic_Boot_Shim` — resolves code, mounts apps, pins errors
- `Agentic_Capability_Declaration` — reads and surfaces the declaration
- AWS Lambda Web Adapter binary (no-ops outside Lambda)
- SKILL files covering the Layer 1 admin API

**Distribution:**

| Artefact | Location |
|---|---|
| `sgraph-ai-agentic-fastapi` | PyPI |
| `sgraph-ai/agentic-fastapi-shim:v1` | Docker Hub + ECR |

**Adoption:**

```dockerfile
FROM python:3.12-slim
RUN pip install sgraph-ai-agentic-fastapi==1.0.0
COPY --from=sgraph-ai/agentic-fastapi-shim:v1 /shim/ /
COPY ./my_app /app/code
CMD ["python3", "/entry.py"]
```

**Python imports:**

```python
from sgraph_ai_agentic_fastapi.loader import Agentic_Code_Loader
from sgraph_ai_agentic_fastapi.admin  import Agentic_Admin_API
from sgraph_ai_agentic_fastapi.boot   import Agentic_Boot_Shim
```

### Layer 2 — `sgraph-ai-agentic-fastapi-aws`

PyPI-only. Adds S3 as a code source.

```dockerfile
RUN pip install sgraph-ai-agentic-fastapi==1.0.0 \
                sgraph-ai-agentic-fastapi-aws==1.0.0
```

**Dependencies:** `sgraph-ai-agentic-fastapi` + `osbot-aws` (boto3).

**Public surface:** `Agentic_Code_Source__S3` class that plugs into L1's loader via registered-adapter pattern.

### Layer 3 — Application images

Each app picks its base, installs L1 (+ L2), adds its code and SKILL files, ships its own capabilities.json default, publishes.

Examples:
- `sgraph-ai/agentic-playwright:v1.0.0` — FROM Playwright's base
- `sgraph-ai/agentic-code:v1.0.0` — FROM `python:3.12-slim`, admin API `full`, agent uploads code
- `sgraph-ai/agentic-pytorch-runtime:v1.0.0` — FROM `pytorch/pytorch`

### Lockdown layers — a pattern for subtractive layers

Not every layer adds capability. Some layers exist specifically to **remove** or **constrain** capabilities. They wrap a lower layer and produce a hardened variant.

Examples of legitimate lockdown layers:

- **`sgraph-ai-agentic-lockdown-production`** — wraps L1/L2, pins `ADMIN_API_MODE=disabled`, strips mutation endpoints unconditionally, adds `/admin/security-posture` describing what was locked. L3 apps in production `FROM` this instead of raw L1/L2.
- **`sgraph-ai-agentic-monitoring`** — wraps L1, adds structured logging on every admin call, pushes metrics to a backend, exposes `/admin/metrics`.
- **`sgraph-ai-agentic-compliance-audit`** — wraps L2, enforces that every `capabilities.json` declares required audit metadata, blocks boot if missing.

Each of these is a real layer in the stack, inserted between L2 and L3 (or between L1 and L2). They subtract; they constrain; they enforce. This is consistent with least-privilege: **some layers remove capability, and that's a feature.**

Lockdown layers share the payload model (PyPI + optional shim). They take Layer 1's admin API contract as stable input and constrain it as their output.

### The network sidecar — `sgraph-ai/agentic-net-sidecar`

Peer container. mitmproxy + SG/Send client + policy engine. Enforces the container's declared network capability. Covered in §7. **Interfaces defined in v1; enforcement implementation deferred.**

---

## 4. Self-description: OpenAPI + SKILLs

### The two halves

OpenAPI tells you the **shape**: endpoints, params, schemas, return types. Free from FastAPI at `/admin/openapi.json`.

SKILL files tell you the **meaning**: what this service is for, when to use which endpoint, how to compose workflows, known gotchas, concrete working examples.

| Question | OpenAPI | SKILL files |
|---|---|---|
| What does this service do? | ❌ | ✅ |
| When to use endpoint X vs Y? | ❌ | ✅ |
| How to compose a workflow? | ❌ | ✅ |
| What are the gotchas? | ❌ | ✅ |
| Concrete working examples? | ❌ | ✅ |
| Endpoint parameter types? | ✅ | ❌ |
| Return schemas? | ✅ | ❌ |

Neither is sufficient alone. Together they're a complete self-description.

### The three SKILL files — self-contained per layer/app

Every layer, every Layer 3 app ships three files:

| File | Audience | Content |
|---|---|---|
| `SKILL-human.md` | End user / operator | `curl` commands, env vars, response reading |
| `SKILL-browser.md` | Dev exploring interactively | Browser-based interaction patterns |
| `SKILL-agent.md` | Agent | Idiomatic orchestration patterns, endpoint selection, workflows, gotchas |

**SKILL files are self-contained per layer/app.** No merging at runtime.

- Layer 1's SKILL files describe Layer 1's admin API as *it* exposes it.
- Layer 3's SKILL files describe Layer 3's complete API — including any Layer 1 features it kept, and correctly reflecting any Layer 1 features it disabled, renamed, or constrained.
- A lockdown layer's SKILL files describe what *that* layer exposes, post-lockdown.
- Every SKILL file is the authoritative description of what the container it's shipped in actually does.

Since all repos are public on GitHub, L3 authors can reference or copy from L1's SKILL files when writing their own, but they own the final contents. This avoids the runtime-merging trap where an L3 SKILL claims `/admin/code/upload-zip` works but the L3 actually disabled it.

**SKILL files ship inside the container image and are served at:**
- `GET /admin/skills` → list of available files (`["human", "browser", "agent"]`)
- `GET /admin/skills/{name}` → the file contents

### Discovery flow

```
Agent connects
    ↓
GET /admin/manifest       → what is this container?
    ↓
GET /admin/openapi.json   → what endpoints exist + their shapes
    ↓
GET /admin/skills/agent   → how do I use them idiomatically
    ↓
Agent starts calling endpoints
```

No MCP server. No broker. No protocol. Three HTTP GETs to a complete description.

### The `/admin/manifest` endpoint

```json
{
  "layer": {
    "name":    "agentic-fastapi",
    "version": "1.0.0"
  },
  "app": {
    "name":          "agentic-playwright",
    "version":       "v1.0.0",
    "description":   "Playwright browser automation over HTTP",
    "openapi_url":   "/admin/openapi.json",
    "skills_url":    "/admin/skills"
  },
  "runtime": {
    "target":        "lambda",
    "image_version": "v1",
    "capabilities_url": "/admin/capabilities"
  },
  "admin_api_mode":  "read_only"
}
```

Navigational. Minimal. Agents traverse from here.

### Why this beats MCP

MCP requires a new protocol per tool, a server layer, a hop per call, mutual MCP knowledge between agent and tool.

This approach uses:
- HTTP — every agent already speaks it
- OpenAPI — every FastAPI tool already generates it
- Markdown — every agent already reads it

No new protocol, no broker, three standard files.

Same pattern as the browser-based JS API Primitive (`window.__tool` + `manifest.json` + `api.json` + SKILLs). Different transport (DOM events vs HTTP). Same agent-discovery shape.

---

## 5. The admin API — the agent's control plane

### Three modes

| Mode | `AGENTIC_ADMIN_MODE` | Default? | Used by |
|---|---|---|---|
| `disabled` | explicit | — | Hardened production, frozen mode, lockdown layers |
| `read_only` | — | ✅ | Production dynamic mode |
| `full` | explicit | — | Agentic setups, dev, CI |

### Endpoints

Everything under `AGENTIC_ADMIN_PATH_PREFIX` (default `/admin`). Everything requires the API key.

**Discovery (all modes):**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/manifest` | Navigational summary (§4) |
| `GET` | `/admin/health` | `{status: "ok"}` |
| `GET` | `/admin/openapi.json` | OpenAPI spec |
| `GET` | `/admin/skills` | List of SKILL files |
| `GET` | `/admin/skills/{name}` | SKILL file contents |

**State (all modes):**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/info` | Full boot snapshot |
| `GET` | `/admin/error` | Structured error if user app failed to load |
| `GET` | `/admin/env` | Redacted env snapshot |
| `GET` | `/admin/boot-log` | Ring buffer of boot stdout/stderr |
| `GET` | `/admin/modules` | Python modules under user app root |
| `GET` | `/admin/capabilities` | Declared + enforced capabilities (§6) |

**Mutation (`full` mode only):**

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/admin/code/deploy` | multipart `file` + `{confirm: true}` + optional `X-Content-SHA256` | **Atomic:** upload + verify + reload in one call |
| `POST` | `/admin/code/set-source` | `{url}` or `{s3_bucket, s3_key}` + `{confirm: true}` | **Atomic:** switch source + reload |
| `POST` | `/admin/code/rollback` | `{to_version}` + `{confirm: true}` | **Atomic:** switch to previous known-good + reload |

**Note on atomicity (axiom 1):** mutation endpoints are single-call. No "upload then reload" pattern — that would require state between calls, which is forbidden. If upload-and-reload succeeds, everything is in the new state. If anything fails, everything stays in the old state. The response contains the final outcome.

### Events — polling only, statelessly-compatible

Per Axiom 1: no SSE, no long-polling, no background state. Events exist only as escape hatches for pathological cases where a caller wants to know "what happened to my last call" — and even then, each query must be self-contained.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/audit-log?since={ts}` | Ring buffer of audit events since timestamp. Stateless — caller provides the cursor. |

In the ordinary flow, callers get their answer synchronously from the mutation endpoint. The audit log is for forensic lookup, not for driving workflow.

### Error shape

```json
{
  "error": {
    "code":      "UPLOAD_TOO_LARGE",
    "message":   "Zip exceeds 50 MB limit (received 52428800 bytes)",
    "hint":      "Set AGENTIC_CODE_UPLOAD_MAX_BYTES to increase, or split the upload",
    "retriable": false,
    "trace_id":  "abc123..."
  }
}
```

---

## 6. Security model — least privilege by declared capability

### Core principle

No code is trusted by default. Every capability is explicitly granted. A container gets exactly the resources it declared, and nothing more. The declaration is immutable per container lifetime.

### The four dimensions of capability

| Dimension | What the declaration specifies | Enforced by |
|---|---|---|
| **Code execution** | Time budget, memory budget, whether dynamic upload is allowed | Container runtime (Lambda limits, K8s resources) + `AGENTIC_ADMIN_MODE` |
| **Network** | Allowed hostnames + methods, explicit denies | Network sidecar policy (§7) |
| **Files** | Which vaults the container can read/write, any local paths | Vault ACL + container filesystem permissions |
| **Credentials** | Which API keys can be projected from the secret store | Env var projection at container boot |

### Declaration format — JSON

`capabilities.json` baked into Layer 3 image (max surface), with optional deploy-time override (narrowing only).

```json
{
  "code": {
    "time_budget_seconds":    300,
    "memory_budget_mb":       2048,
    "dynamic_upload_allowed": true
  },
  "network": {
    "default":   "deny",
    "allow": [
      { "host": "api.openai.com" },
      { "host": "*.wikipedia.org", "methods": ["GET"] },
      { "host": "httpbin.org" }
    ],
    "deny": [
      { "host": "169.254.169.254" }
    ]
  },
  "files": {
    "vaults": [
      { "id": "vault-abc", "access": "read_write" },
      { "id": "vault-xyz", "access": "read_only"  }
    ],
    "local_paths": []
  },
  "credentials": {
    "env": ["OPENAI_API_KEY"]
  }
}
```

### How the declaration becomes enforcement

1. Image baked with baseline `capabilities.json` — maximum this image will ever do
2. Deployment reads the image's declaration + optional override (narrowing only — deploy-time cannot widen)
3. Runtime configured: time/memory limits set, IAM role scoped to declared secrets, filesystem mounted appropriately
4. Network sidecar receives the declared network block
5. Container boots; Layer 1 reads `/app/capabilities.json`, surfaces on `/admin/capabilities`
6. Agent reads `/admin/capabilities` to confirm what it was granted

### Declaration lifecycle

- **Location:** baked into image at `/app/capabilities.json` (default) OR injected at deploy time via env var `AGENTIC_CAPABILITIES_PATH` pointing at a mounted path.
- **Readable:** boot-only. Changing capabilities = restart the container.
- **Narrowing:** deploy-time overrides must be strictly more restrictive than the image default. Attempting to widen (e.g. adding a network allow rule not in the image default) fails container boot with a clear error.
- **Future — vault-backed declarations:** for orchestrator-managed deployments, declarations can be fetched from a vault at boot. Out of scope for v1.

### Three defence-in-depth mechanisms

1. **Container runtime isolation** — Firecracker / K8s pod / Lambda. The hard boundary.
2. **Network sidecar policy** — outbound traffic clamped to declared allow-list. Agents physically cannot reach undeclared hosts.
3. **Admin API mode + vault ACL** — code upload permission controlled by admin mode; vault access controlled by ACL.

Any one can fail; the other two still hold.

### Example deployments

| Scenario | Runtime | Declared capabilities |
|---|---|---|
| Local dev iterating on code | Docker | Code: unlimited. Network: unrestricted. Files: local mount. Admin: full. |
| Agent summarising Wikipedia articles | Lambda | Code: 60s, 512MB. Network: `*.wikipedia.org`. Files: one output vault. Admin: read_only. |
| Agent running approved multi-site research workflow | K8s pod | Code: 5min, 2GB. Network: 12 allowed domains. Files: research vault R/W + corpus read. Admin: read_only. |
| Agent running user-uploaded Python | Firecracker microVM | Code: 10min, 1GB. Network: deny-by-default, narrow allow list per upload. Files: one ephemeral vault. Admin: full. |

Every scenario follows the same pattern: runtime + sidecar + admin + vaults, carrying the container's declaration. Firecracker is the **right tool** for untrusted code, not an exotic posture — it's the normal choice when user-provided code runs.

### What's NOT in the capability model

- No Python-level sandboxing (RestrictedPython etc.) — the runtime is the boundary
- No syscall filtering (seccomp) at the Layer 1 level — deployments add that at the runtime layer if needed
- No automatic capability inference — declarations are explicit

---

## 7. The network sidecar — spec

**In v1: interfaces and capability integration defined; enforcement implementation deferred.**

### Responsibilities (when enforcement is live)

1. Enforce the container's declared network capability
2. Intercept outbound HTTP(S) via proxy config
3. Capture traffic into SG/Send-backed vault
4. Expose its own admin API (introspection only)
5. Generate + serve per-deployment CA certificate

### Env var contract (app-side)

| Var | Meaning |
|---|---|
| `HTTP_PROXY` / `HTTPS_PROXY` | Sidecar proxy URL |
| `NO_PROXY` | Hosts to skip |
| `AGENTIC_NET_SIDECAR_URL` | Sidecar admin API |
| `AGENTIC_NET_SIDECAR_CA_BUNDLE` | Trusted CA path |
| `SSL_CERT_FILE` | Points at CA bundle |

Standard Python HTTP libraries (requests, httpx, aiohttp, stdlib) respect `HTTPS_PROXY`. Playwright needs explicit proxy config — Layer 3 apps using Playwright handle this.

### Policy — the capability declaration, realised

The sidecar receives the declaration's `network` block at deploy time. Policy is immutable for the container lifetime (axiom 1).

### SG/Send integration (when live)

```
vault://<vault_id>/
├── traffic/
│   ├── 2026-04-18T10-00-00__<request_id>/
│   │   ├── request.json
│   │   └── response.json
│   └── ...
└── policy/
    └── 2026-04-18T10-00-00__initial.json
```

### Surfaced on Layer 1

`/admin/info.network_sidecar`:

```json
{
  "network_sidecar": {
    "url":            "http://localhost:9999/admin",
    "ca_fingerprint": "sha256:abc...",
    "policy_id":      "policy-v3",
    "vault_url":      "sg-send://vault-xyz",
    "allow_count":    5,
    "deny_count":     1,
    "enforcement":    "active"
  }
}
```

When the sidecar isn't deployed or isn't enforcing yet, `network_sidecar` is null or `enforcement: "disabled"`.

### Out of scope for v1

- Non-HTTP traffic (raw TCP, UDP, gRPC over h2 unwrapped)
- Active response tampering beyond simple rewrite rules
- Multi-tenant policy isolation within one sidecar
- Actual enforcement implementation (interfaces ready; implementation next release)

---

## 8. Code loading — the generic primitive

### Source precedence

| Priority | Source | Config | Layer |
|---|---|---|---|
| 1 | Local path override | `AGENTIC_CODE_LOCAL_PATH=/dir` | L1 |
| 2 | Baked-in code | `/app/code` populated at build | L1 |
| 3 | URL zip | `AGENTIC_CODE_SOURCE_URL=https://…` | L1 |
| 4 | S3 zip | `AGENTIC_CODE_SOURCE_S3_BUCKET` + `…_KEY` | L2 |
| 5 | Admin-uploaded | `POST /admin/code/deploy` → `/tmp/code-upload/<ts>/` | L1 |
| 6 | Passthrough | Nothing configured | L1 |

### Integrity

- URL: optional `AGENTIC_CODE_SOURCE_URL_INTEGRITY` (sha256 hex)
- S3: ETag comparison vs cached version
- Admin upload: optional `X-Content-SHA256` header
- Local / baked: trusted (set by deployment)

### Result schema

```python
class Schema__Agentic__Load_Result(Type_Safe):
    code_source   : Safe_Str__Text      # "local:…" / "url:…" / "s3:…" / "upload:…" / "passthrough:…" / "error:<type>"
    sys_path      : Safe_Str__File__Path
    bytes_read    : int
    cache_hit     : bool
    error         : Safe_Str__Text       # set when code_source starts "error:"
    duration_ms   : int
```

---

## 9. Payload model — PyPI + OCI shim

- Python modules → PyPI (`sgraph-ai-agentic-fastapi`, `sgraph-ai-agentic-fastapi-aws`)
- Non-Python assets → OCI shim (`sgraph-ai/agentic-fastapi-shim:v1`) via `COPY --from`
- LWA binary lives in the shim
- Layer 1's SKILL files live in the shim at `/shim/skills/`

Every Layer 3 app adopts the same three lines: install PyPI packages, `COPY --from` shim, `COPY` app code.

---

## 10. Env var contract

All Layer 1 env vars use stable prefixes (`AGENTIC_*`). No project-specific names.

### Code loader

| Var | Layer | Default | Purpose |
|---|---|---|---|
| `AGENTIC_CODE_LOCAL_PATH` | L1 | — | Priority 1 |
| `AGENTIC_CODE_SOURCE_URL` | L1 | — | Priority 3 |
| `AGENTIC_CODE_SOURCE_URL_INTEGRITY` | L1 | — | Optional sha256 |
| `AGENTIC_CODE_SOURCE_S3_BUCKET` | L2 | — | Priority 4 |
| `AGENTIC_CODE_SOURCE_S3_KEY` | L2 | — | S3 key |
| `AGENTIC_CODE_APP_FACTORY` | L1 | `user_app.main:build_app` | Dotted path |
| `AGENTIC_CODE_CACHE_ROOT` | L1 | `/tmp/code-cache` | URL/S3 extracts |
| `AGENTIC_CODE_UPLOAD_MAX_BYTES` | L1 | `52428800` | Upload limit |

### Admin API

| Var | Default | Purpose |
|---|---|---|
| `AGENTIC_ADMIN_MODE` | `read_only` | `disabled` / `read_only` / `full` |
| `AGENTIC_ADMIN_PATH_PREFIX` | `/admin` | Path prefix |
| `AGENTIC_ADMIN_API_KEY_HEADER_NAME` | (required) | Auth header |
| `AGENTIC_ADMIN_API_KEY_HEADER_VALUE` | (required) | Primary key |
| `AGENTIC_ADMIN_API_KEY_HEADER_VALUE__PREVIOUS` | — | Rotation |

### Capability declarations

| Var | Default | Purpose |
|---|---|---|
| `AGENTIC_CAPABILITIES_PATH` | `/app/capabilities.json` | Where to read declaration |
| `AGENTIC_CAPABILITIES_DEPLOY_OVERRIDE` | — | Override path (narrowing only) |

### Network sidecar (when deployed)

| Var | Purpose |
|---|---|
| `HTTP_PROXY` / `HTTPS_PROXY` | Sidecar URL |
| `AGENTIC_NET_SIDECAR_URL` | Sidecar admin API |
| `AGENTIC_NET_SIDECAR_CA_BUNDLE` | Trusted CA path |
| `SSL_CERT_FILE` | Points at CA bundle |

### SG/Send

| Var | Purpose |
|---|---|
| `AGENTIC_SG_SEND_VAULT_URL` | Artefact destination |
| `AGENTIC_SG_SEND_VAULT_KEY` | Vault credential |

### Runtime auto-detect (Layer 1 reads; not set by us)

| Var | Purpose |
|---|---|
| `AWS_LAMBDA_RUNTIME_API` | Lambda — triggers LWA path |
| `KUBERNETES_SERVICE_HOST` | K8s |
| `ECS_CONTAINER_METADATA_URI` | ECS |

---

## 11. Python class + schema naming

All agentic-runtime classes and schemas carry the `Agentic_` prefix:

- Classes: `Agentic_Code_Loader`, `Agentic_Admin_API`, `Agentic_Boot_Shim`, `Agentic_Capability_Declaration`
- Schemas: `Schema__Agentic__Admin__Info`, `Schema__Agentic__Capability__Declaration`, `Schema__Agentic__Load_Result`, `Schema__Agentic__Error`
- Source-adapter classes: `Agentic_Code_Source__Base`, `Agentic_Code_Source__Local`, `Agentic_Code_Source__URL`, `Agentic_Code_Source__S3`

The package namespace already scopes the name (`sgraph_ai_agentic_fastapi.loader.Agentic_Code_Loader`) but the `Agentic_` prefix makes it obvious in stack traces, logs, and IDE autocomplete that these are the agentic-runtime primitives — not someone's project-local `Code_Loader`.

---

## 12. Event namespace

Events follow the `agentic:container:*` pattern. Family-prefixed so multiple product lines can coexist without collision:

- `agentic:container:ready`
- `agentic:container:code:loaded`
- `agentic:container:code:error`
- `agentic:container:reload:complete`
- `agentic:container:upload:complete`
- `agentic:container:network:blocked`

No SSE, no WebSocket streaming (axiom 1). Events recorded in a ring buffer at `/admin/audit-log`, retrievable via `GET /admin/audit-log?since={timestamp}` if a caller wants forensic lookup.

---

## 13. Repo + distribution map

| Component | Repo | PyPI | Image |
|---|---|---|---|
| Layer 1 | `sgraph-ai-agentic-fastapi` | `sgraph-ai-agentic-fastapi` | `sgraph-ai/agentic-fastapi-shim:v1` |
| Layer 2 | `sgraph-ai-agentic-fastapi-aws` | `sgraph-ai-agentic-fastapi-aws` | — |
| Network sidecar | `sgraph-ai-agentic-net-sidecar` | — | `sgraph-ai/agentic-net-sidecar:v1` |
| Playwright app | `sgraph-ai-service-playwright` (existing, to be renamed / migrated) | — | `sgraph-ai/agentic-playwright:v1` |
| Code sandbox app | `sgraph-ai-agentic-code` | — | `sgraph-ai/agentic-code:v1` |
| Lockdown layers | `sgraph-ai-agentic-lockdown-*` | per-lockdown | per-lockdown (if needed) |

---

## 14. CI — per-component

- **L1 repo:** unit tests → publish PyPI → build + push shim image
- **L2 repo:** unit tests → publish PyPI
- **Sidecar repo:** unit tests → build + push image
- **L3 app repos:** Track A (image, rare) + Track B (code, every push)
- **Lockdown layer repos:** unit tests → publish (PyPI or image per lockdown type)

No cross-repo CI dependencies. Each releases on its own cadence.

---

## 15. What this architecture deliberately does NOT do

- **No server-side sessions.** Axiom 1.
- **No shared state between calls or between replicas.** Axiom 1.
- **No long-running background jobs.** Axiom 1.
- **No polling as the default flow.** Polling exists for forensic audit only.
- **No Python-level sandboxing.** The runtime is the boundary.
- **No automatic capability inference.** Declarations are explicit.
- **No cluster-aware reload.** Reload is per-container; cluster-level is an orchestrator concern.
- **No runtime mutation of capabilities.** Boot-only, immutable per container lifetime.
- **No bespoke protocol for agent discovery.** HTTP + OpenAPI + markdown.

---

## 16. Relationship to other work

| Doc | Role |
|---|---|
| `v0.21.2__arch-brief__layered-container-dynamic-code-loading.md` | Origin vision |
| `v0.1.28__s3-zip-hotswap-deployment.md` + `df56f1f` | Reference implementation of the boot shim |
| `v0.1.29__part-{1,2,3}__*.md` | Source of the api/container split and CI shape |
| `v0.1.91__tool-api__*.md` (JS API Primitive) | Source of the SKILL file pattern, event namespace discipline, self-description via manifest + OpenAPI + SKILLs |
| v1–v3 of this doc | Earlier drafts, superseded |
| This doc (v4) | Direction-of-travel, final before Dev briefs |

---

## 17. Next step — Dev briefs

This architecture doc is the **direction-of-travel**. It describes the end state.

A separate Dev brief for the Playwright team is the next artefact. That brief is not an implementation spec for the full architecture — it's pragmatic guidance for moving the existing Playwright repo one step closer to this end state, with an explicit first-pass goal and clear markers for what can be deferred.

First-pass Playwright goal: **code and container separated so code changes don't require image rebuilds, enabling fast local iteration.** That's it. PyPI packaging, lockdown layers, sidecar enforcement, full capability declarations, repo split — all can come later. The one outcome to nail first is the iteration loop.

Subsequent Dev briefs after that:
- Layer 1 as a standalone repo + PyPI publication
- Layer 2 as a standalone repo + PyPI
- Network sidecar (when enforcement is prioritised)
- Agentic code sandbox (the second L3 app)
- Lockdown layers (as demand emerges)

Each brief references this doc as its "why"; each tells its Dev team the "how and in what order".
