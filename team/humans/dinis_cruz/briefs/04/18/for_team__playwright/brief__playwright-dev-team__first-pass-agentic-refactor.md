# Brief — Playwright Service: First Pass Toward the Agentic Runtime

**From:**     Architecture session (QA + Dinis)
**To:**       Playwright Service Dev team
**Date:**     2026-04-18
**Status:**   For implementation
**Read this alongside:** [`arch__layered-dynamic-code-fastapi-runtime-v4.md`](./arch__layered-dynamic-code-fastapi-runtime-v4.md) — the direction-of-travel architecture. This brief is the practical first pass.

---

## 1. Context — what this is, what it isn't

You've done good work on v0.1.28 (the S3-zip boot shim in `df56f1f`) and v0.1.29 (the three-part plan on `claude/general-session-HRsiq`). Both moved the architecture in the right direction and some of their decisions — atomic rollback via env var, always-up admin diagnostics, generic code loader — survive into the end state.

Since v0.1.29 landed in your docs, the architecture has evolved materially. The v4 architecture doc (attached) is the direction of travel. **It is not what you implement right now.** Over time, Layer 1 and Layer 2 will become standalone PyPI packages in their own repos, publishable to Docker Hub. The network sidecar, capability declarations, and lockdown layers will come as separate workstreams.

This brief is about **the next pragmatic step** from where you are. Constraints for this pass:

- Everything stays in this repo. No new repos.
- No PyPI publishing. No Docker Hub publishing of Layer 1 artefacts.
- All code that will one day become Layer 1 / Layer 2 / Layer 3 lives inside `sgraph_ai_service_playwright/` as subpackages — but **named and structured** so the later split is a mechanical `git mv`.

Your mandate is narrower than the v0.1.29 plan proposed: **don't split the repo yet**. But do adopt the target naming, the target module layout, and the target admin API shape, so that when we do split repos later, nothing needs renaming.

---

## 2. The first-pass goal — one sentence

**Code and container separated so that changing application code does not require rebuilding the image — with a fast local iteration loop and a fast cloud deployment loop.**

This is the one workflow to nail. Every other decision in this brief serves it.

Concretely:

| Loop | Starting today | Target after this pass |
|---|---|---|
| Local iteration | Edit → rebuild image → run — minutes | Edit → `docker restart` — seconds |
| Cloud iteration (dev Lambda) | Edit → rebuild → push ECR → deploy — ~7 min | Edit → `python scripts/deploy_code.py` — ~30 s |

Both loops must work reliably from day 1 after this refactor lands. The local one is the primary outcome; the cloud one is already ~80% built (v0.1.28 boot shim) and just needs the missing pieces filled in.

---

## 3. Architecture — the mental model for this pass

Inside the single repo, reorganise around three logical tiers. Not separate repos yet; subpackages within `sgraph_ai_service_playwright/`.

```
sgraph_ai_service_playwright/
├── agentic_fastapi/                  ← Future Layer 1 (core-fastapi)
│   ├── loader/                       ← Code loading: local, URL, passthrough
│   ├── admin/                        ← Admin FastAPI (stable contract)
│   ├── boot/                         ← Boot shim, error pinning, root app mounting
│   └── schemas/                      ← Schema__Agentic__*
│
├── agentic_fastapi_aws/              ← Future Layer 2 (adds S3 loader)
│   └── loader/                       ← S3 code source adapter
│
├── service/                          ← Playwright-specific (Layer 3 code)
│   ├── routes/                       ← /browser/*, /sequence/*
│   ├── schemas/                      ← Playwright schemas
│   └── service/                      ← Playwright_Service etc.
│
├── skills/                           ← Three SKILL files for THIS service
│   ├── SKILL-human.md
│   ├── SKILL-browser.md
│   └── SKILL-agent.md
│
├── consts/                           ← Existing
└── version                           ← Existing
```

The subpackage names (`agentic_fastapi`, `agentic_fastapi_aws`) match the future PyPI package names (`sgraph-ai-agentic-fastapi`, `sgraph-ai-agentic-fastapi-aws`). When we split later, `git mv sgraph_ai_service_playwright/agentic_fastapi/ ../sgraph-ai-agentic-fastapi/sgraph_ai_agentic_fastapi/` and one `pyproject.toml` change is most of the work.

**Dependency rule:** `agentic_fastapi` does NOT import from `agentic_fastapi_aws` or `service`. `agentic_fastapi_aws` does NOT import from `service`. Verify with grep before you merge. This rule is what makes the future split mechanical.

---

## 4. What to build — the concrete list

### 4.1 Core classes (under `agentic_fastapi/`)

All classes carry the `Agentic_` prefix; all schemas use `Schema__Agentic__*`. The v4 arch doc §11 covers naming.

**Loader (`agentic_fastapi/loader/`):**
- `Agentic_Code_Source__Base` — abstract class, defines `is_configured()` and `resolve() → Schema__Agentic__Load_Result`
- `Agentic_Code_Source__Local` — priority 1 (local path) + priority 2 (baked `/app/code`)
- `Agentic_Code_Source__URL` — priority 3 (HTTP(S) zip download)
- `Agentic_Code_Source__Passthrough` — priority 6 (fallback)
- `Agentic_Code_Loader` — orchestrator; takes a list of sources in priority order, returns first configured

**Admin API (`agentic_fastapi/admin/`):**
- `Agentic_Admin_API` — FastAPI class with all admin routes (§5 below)
- One `Routes__Admin__*` class per concern (same as existing `Routes__*` pattern in `fast_api/`)
- Always mounted at `AGENTIC_ADMIN_PATH_PREFIX` (default `/admin`)

**Boot (`agentic_fastapi/boot/`):**
- `Agentic_Boot_Shim` — replaces today's `lambda_entry.py`. Builds the root FastAPI, mounts admin ALWAYS, mounts user app on `/` when loaded. Error-pinning preserved from v0.1.28.
- `Agentic_Boot_Recorder` — captures stdout/stderr into ring buffer during boot, exposed via `/admin/boot-log`

**Schemas (`agentic_fastapi/schemas/`):**
- `Schema__Agentic__Admin__Info` — what `/admin/info` returns
- `Schema__Agentic__Manifest` — what `/admin/manifest` returns
- `Schema__Agentic__Load_Result` — what the loader returns
- `Schema__Agentic__Error` — structured error shape (`code`, `message`, `hint`, `retriable`, `trace_id`)

### 4.2 Entry point

Rewrite `lambda_entry.py` to do very little — just call into `Agentic_Boot_Shim`:

```python
# lambda_entry.py — baked into image, stable
from sgraph_ai_service_playwright.agentic_fastapi.boot import Agentic_Boot_Shim

boot_shim = Agentic_Boot_Shim()
app       = boot_shim.build_root_app()          # admin mounted always; user app mounted if loaded

if __name__ == '__main__':
    boot_shim.run_uvicorn()                     # blocks, serves at 0.0.0.0:8000
```

The idea: `lambda_entry.py` is a very thin script. All real logic is in the `Agentic_*` classes so it's testable, reusable, and eventually moves to the Layer 1 repo.

### 4.3 Layer 2 code source (under `agentic_fastapi_aws/`)

- `Agentic_Code_Source__S3` — priority 4 source. Uses `osbot-aws` `S3` class. Depends only on `agentic_fastapi` (for the base class).

The boot shim at startup builds the `Agentic_Code_Loader` with the sources registered in precedence order. If `agentic_fastapi_aws` is importable, the S3 source is added to the loader. If not (future split scenario), it isn't. This is a plugin pattern — apps can add their own sources without modifying Layer 1.

### 4.4 Packaging + deploy script (under `scripts/`)

Rewrite `scripts/package_code.py` as `scripts/deploy_code.py` — end-to-end one-command deploy:

```
python scripts/deploy_code.py --stage dev

  1. Reads version from consts/version
  2. Packages sgraph_ai_service_playwright/ + agentic_fastapi/ + agentic_fastapi_aws/ + service/ + skills/ + capabilities.json into a zip
  3. Uploads to s3://{account}--sgraph-ai--{region}/apps/sg-playwright/dev/v{X.Y.Z}.zip
  4. Bumps AGENTIC_CODE_SOURCE_S3_KEY on the dev Lambda (UpdateFunctionConfiguration)
  5. Waits for Lambda to acknowledge the config update (aws lambda wait function-updated)
  6. Hits /admin/info, asserts code_version matches the new version
  7. Reports elapsed time
```

One command. ~30 seconds end-to-end. This IS the cloud iteration loop.

Keep the old `package_code.py` working during migration for belt-and-braces — rename it later.

### 4.5 Three SKILL files (under `skills/`)

Ship three markdown files describing the Playwright service. They're served at `/admin/skills/{name}` by the admin API.

**`SKILL-human.md`** — operator-facing. curl examples for every useful endpoint. Env vars the operator needs to set. How to read responses. ~1-2 pages.

**`SKILL-browser.md`** — exploring from a browser / Playwright. Useful patterns. Can be thin since browser consumption of this service is secondary.

**`SKILL-agent.md`** — agent-facing. This is the important one. For each endpoint, answer: when do I use this vs that? how do I compose sequences? what are the gotchas (proxy auth, Chromium cold start, shadow DOM)? Concrete working examples in agent-idiomatic form (as Python snippets that an agent would actually generate).

Writing tip: look at the existing `tools/v0/v0.1/v0.1.37/en-gb/infographic-gen/SKILL-browser.md` style as a reference — same intent (help an agent orchestrate), different transport (HTTP here, JS there).

Skills files live inside the image under `/app/skills/` and are served by `Agentic_Admin_API` — they're filesystem reads at request time.

### 4.6 `capabilities.json` — stub only in this pass

Create `capabilities.json` at repo root with a maximum-permissions baseline. Actual enforcement comes later (v4 arch §6). For this pass:

```json
{
  "code": {
    "time_budget_seconds":    900,
    "memory_budget_mb":       5120,
    "dynamic_upload_allowed": false
  },
  "network": {
    "default": "allow"
  },
  "files": {
    "local_paths": ["/tmp"]
  },
  "credentials": {
    "env": ["FAST_API__AUTH__API_KEY__VALUE"]
  }
}
```

The `Agentic_Admin_API` reads this file at boot and surfaces it at `/admin/capabilities`. Nothing enforces it yet. It exists so agents can read what this container claims about itself, and so the format is in use from day 1.

---

## 5. Admin API — what to include in this pass

From the v4 arch doc §5. Priority-ordered — top of this list is the floor; bottom is optional for v1.

### MUST have in this pass

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/admin/health` | `{status: "ok"}` |
| `GET`  | `/admin/info` | Boot snapshot: layer version, code source, boot status, user app loaded |
| `GET`  | `/admin/manifest` | Navigational summary (§4 of v4) |
| `GET`  | `/admin/openapi.json` | Served by FastAPI automatically — just make sure routes are tagged properly |
| `GET`  | `/admin/skills` | List of SKILL files present |
| `GET`  | `/admin/skills/{name}` | Read skill file from `/app/skills/` |
| `GET`  | `/admin/capabilities` | Read `/app/capabilities.json`, return it |
| `GET`  | `/admin/error` | Structured error if user app failed to load |
| `GET`  | `/admin/env` | Redacted env snapshot (redact keys matching `*KEY*`, `*TOKEN*`, `*SECRET*`, `*PASSWORD*`) |
| `GET`  | `/admin/boot-log` | Last N lines of boot stdout/stderr from the ring buffer |

### SHOULD have (skip only if time-critical)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/admin/modules` | Python modules loaded under `sgraph_ai_service_playwright.service` namespace |
| `GET`  | `/admin/audit-log?since={ts}` | Ring buffer of admin calls |

### DEFER to future pass

| Method | Path | Why defer |
|---|---|---|
| `POST` | `/admin/code/deploy` | Needs `AGENTIC_ADMIN_MODE=full` support. Not needed for the first-pass iteration loops. |
| `POST` | `/admin/code/set-source` | Same. |
| `POST` | `/admin/code/rollback` | Same. |

Rationale for deferring mutation endpoints: the first-pass iteration loops use either local mount (`AGENTIC_CODE_LOCAL_PATH`) or `scripts/deploy_code.py` to push code. Neither needs the admin API to accept uploads. Adding mutation endpoints safely (`full` mode, audit, upload validation, size limits) is a chunk of work that doesn't serve the primary goal of this pass. Add them when we need agentic code upload — which is the `sgraph-ai/agentic-code` L3 app's problem, not the Playwright service's.

### All admin endpoints auth with API key

Same header + value mechanism already in use (`FAST_API__AUTH__API_KEY__NAME` / `FAST_API__AUTH__API_KEY__VALUE`). For now, one key set covers user routes + admin routes. Splitting admin auth from user auth comes later.

### Mount order

Admin FastAPI mounts **first** at `AGENTIC_ADMIN_PATH_PREFIX`. User FastAPI mounts **after** at `/`. If user code fails to load, the admin API still responds — this is the always-up diagnostic from the v0.1.29 plan, kept intact.

---

## 6. Env var contract for this pass

Adopt the `AGENTIC_*` prefix from day 1. This is the main renaming from v0.1.28 work.

### Keep from v0.1.28, rename

| v0.1.28 name | New name | Note |
|---|---|---|
| `SG_PLAYWRIGHT__CODE_LOCAL_PATH` | `AGENTIC_CODE_LOCAL_PATH` | — |
| `SG_PLAYWRIGHT__CODE_S3_VERSION` | Becomes part of `AGENTIC_CODE_SOURCE_S3_KEY` | see below |
| `SG_PLAYWRIGHT__LAMBDA_NAME` | — | No longer needed; S3 key is direct |
| `SG_PLAYWRIGHT__IMAGE_VERSION` | `AGENTIC_IMAGE_VERSION` | — |
| `SG_PLAYWRIGHT__CODE_SOURCE` | `AGENTIC_CODE_SOURCE` | Set by boot shim for introspection |

### Full list for this pass

| Var | Default | Purpose |
|---|---|---|
| `AGENTIC_CODE_LOCAL_PATH` | — | Priority 1 — local dir |
| `AGENTIC_CODE_SOURCE_URL` | — | Priority 3 — URL zip |
| `AGENTIC_CODE_SOURCE_URL_INTEGRITY` | — | Optional sha256 |
| `AGENTIC_CODE_SOURCE_S3_BUCKET` | — | Priority 4 — S3 bucket |
| `AGENTIC_CODE_SOURCE_S3_KEY` | — | Priority 4 — S3 key (full path, no "stage/version" logic in the shim) |
| `AGENTIC_CODE_APP_FACTORY` | `sgraph_ai_service_playwright.service.main:build_app` | Dotted path |
| `AGENTIC_CODE_CACHE_ROOT` | `/tmp/code-cache` | — |
| `AGENTIC_ADMIN_MODE` | `read_only` | `disabled` / `read_only` / `full` (only `read_only` supported in this pass — ignore `full` even if set) |
| `AGENTIC_ADMIN_PATH_PREFIX` | `/admin` | — |
| `AGENTIC_CAPABILITIES_PATH` | `/app/capabilities.json` | — |
| `AGENTIC_IMAGE_VERSION` | read from `/app/image_version` | — |

### S3 key format

The boot shim builds the S3 key directly from `AGENTIC_CODE_SOURCE_S3_KEY` — no synthesis from `LAMBDA_NAME` + `STAGE` + `VERSION`. The deploy script builds the right key and sets it.

Target layout in S3 (per v4 arch §8):

```
s3://{account}--sgraph-ai--{region}/apps/sg-playwright/{stage}/v{X.Y.Z}.zip
```

One bucket per account/region hosts all agentic apps' code. The `apps/` prefix is reserved for application-code zips; other prefixes (`artefacts/`, `vaults/`, etc.) are free for future use without partition conflicts.

---

## 7. The two iteration loops — what they look like

### Loop 1 — Local (the primary outcome)

```bash
# Starting state: repo cloned, Docker image built once

# Edit any Python file in sgraph_ai_service_playwright/

docker restart sgp-local                        # ~2 seconds

curl -H "x-api-key: local-key" \
     http://localhost:8000/browser/screenshot  # test
```

The container is started once with this shape (document this in README):

```bash
docker run -d --name sgp-local \
  --platform linux/amd64 \
  --add-host=host.docker.internal:host-gateway \
  -p 8000:8000 \
  -e AGENTIC_CODE_LOCAL_PATH=/mnt/code \
  -e AGENTIC_ADMIN_MODE=read_only \
  -e FAST_API__AUTH__API_KEY__NAME=x-api-key \
  -e FAST_API__AUTH__API_KEY__VALUE=local-key \
  -v $(pwd):/mnt/code:ro \
  {ecr-or-local-image}:latest
```

Restart picks up code changes because the mount is live. Image doesn't need rebuilding. Python process re-imports fresh. Iteration: ~5 seconds edit-to-test.

**Acceptance:** after this brief lands, this command works on a developer machine and code changes show up on restart. Put the command in README.md.

### Loop 2 — Cloud (dev Lambda)

```bash
# Starting state: dev Lambda running, code has been deployed at least once

# Edit any Python file

python scripts/deploy_code.py --stage dev       # ~30 seconds

curl -H "api-key: ..." https://dev.playwright.sgraph.ai/...   # test
```

The deploy script (§4.4 above) does the full cycle: package, upload, bump env, wait for config update, validate `/admin/info`. Output on success:

```
version:   v0.1.30
zip size:  2.1 MB
s3 key:    s3://{account}--sgraph-ai--{region}/apps/sg-playwright/dev/v0.1.30.zip
upload:    3.2s
config:    2.8s
wait:      12.1s
validate:  0.4s
total:     18.5s  ✓  code_version on Lambda now v0.1.30
```

**Acceptance:** the script runs end-to-end, the `/admin/info` reports the new version, and if anything fails the script tells you exactly where.

---

## 8. Unblock the current 502

Before you do any of the above: the dev Lambda is currently returning 502 on every request. Root cause (from the review of `df56f1f`): the image was deployed but no zip exists in S3 at the expected path.

**Fix (~5 minutes):**

Option A — manual zip upload to unblock immediately:
```bash
cd /path/to/repo
python scripts/package_code.py --lambda-name sg-playwright-dev
# Check the zip landed in S3, hit /health/info, should work
```

Option B — set `AGENTIC_CODE_LOCAL_PATH=/var/task` on the dev Lambda env vars. Forces the boot shim to use the baked-in code, skipping S3. Temporary — remove once S3 has a real zip.

Do Option A if CI / creds are easy. Option B if you need the Lambda up right now without pushing anything to S3.

Once this brief is implemented, the deploy loop becomes `python scripts/deploy_code.py --stage dev` and the 502 scenario stops being possible (the script uploads the zip and bumps the env in one transaction).

---

## 9. What to defer, explicitly

These are in the v4 arch doc and will come in later briefs. Don't attempt any in this pass:

- **Splitting agentic_fastapi into its own repo + PyPI package.** Later.
- **Publishing anything to Docker Hub.** Later.
- **Network sidecar (mitmproxy + SG/Send).** Later, separate brief.
- **Capability enforcement.** `/admin/capabilities` reads and surfaces the file in this pass. Enforcement is later.
- **`AGENTIC_ADMIN_MODE=full` mutation endpoints.** Later — the agentic-code L3 app will need these; this service doesn't.
- **Lockdown layers.** Later.
- **Multi-tenant anything.** Later.
- **Stateful session management.** Will not come back — the service is already stateless per the v0.1.24 refactor. Keep it that way. (v4 §0 Axiom 1.)

If you find yourself reaching for any of these, stop and re-read the brief — it's likely you've scope-crept.

---

## 10. Naming conventions to adopt NOW

These are cheap to do today and expensive to do later.

- **Python classes:** `Agentic_*` prefix for everything that becomes Layer 1 or Layer 2. `Agentic_Code_Loader`, `Agentic_Admin_API`, `Agentic_Boot_Shim`, `Agentic_Capability_Declaration`, `Agentic_Code_Source__Local`, etc.
- **Schemas:** `Schema__Agentic__*` pattern. `Schema__Agentic__Admin__Info`, `Schema__Agentic__Manifest`, etc.
- **Env vars:** `AGENTIC_*`. All of them. No exceptions for "but this one's existing" — rename now, because renaming after the Lambda is live is harder.
- **Subpackages:** `agentic_fastapi`, `agentic_fastapi_aws` — names match future PyPI package names.
- **Event namespace (internal logging / audit):** `agentic:container:*`. `agentic:container:ready`, `agentic:container:code:loaded`, `agentic:container:code:error`, etc.
- **Admin route tags:** tag admin routes with `admin` in the OpenAPI, service routes with `service`. Makes `/admin/openapi.json` clean.

What stays Playwright-named: anything under `sgraph_ai_service_playwright/service/`. These are Layer 3 specifics. `Playwright_Service`, `Routes__Browser`, `Schema__Browser__*` — all fine as they are.

---

## 11. Testing strategy for this pass

Three layers:

**Unit:** every `Agentic_*` class has unit tests. Easy because the classes are small and have narrow responsibilities. Expected: `pytest tests/unit/agentic_fastapi/` green.

**Integration — local:** a test that starts the container with `AGENTIC_CODE_LOCAL_PATH=/mnt/code`, hits `/admin/info`, asserts `user_app_loaded: true` + `code_source: "local:/mnt/code"`. Run in CI on every PR.

**Integration — cloud:** a test that runs `scripts/deploy_code.py --stage dev`, then hits the dev Function URL `/admin/info`, asserts the new `code_version` is reflected. Run after the code lands on main, on a cadence (not every PR — too expensive).

No v1 admin-mutation tests (those endpoints don't exist yet).

### Smoke tests for the two iteration loops

Two scripts in `scripts/`, committed, runnable by anyone:

- `scripts/smoke_local.py` — starts local container, asserts both loops work, reports timings.
- `scripts/smoke_cloud.py` — assumes AWS creds, asserts cloud deploy works, reports timings.

Include these in the CI for the branch once landed. Running them in a PR review is a fast way to catch regressions in the iteration loop — which is the whole point of this pass.

---

## 12. Acceptance check — what "done" looks like

Before merging this work:

1. ✅ Every class renamed to `Agentic_*` where it becomes Layer 1/2.
2. ✅ Every env var uses `AGENTIC_*` prefix. No `SG_PLAYWRIGHT__CODE_*` names remain.
3. ✅ `/admin/manifest`, `/admin/info`, `/admin/openapi.json`, `/admin/skills/{name}`, `/admin/capabilities` all work on a deployed dev Lambda.
4. ✅ Three SKILL files (`human`, `browser`, `agent`) exist and are fetchable via `/admin/skills/{name}`.
5. ✅ `capabilities.json` at repo root, readable via `/admin/capabilities`, surfaced in `/admin/info`.
6. ✅ Local iteration loop works: `docker restart` picks up edited code in ~2 seconds.
7. ✅ Cloud iteration loop works: `scripts/deploy_code.py --stage dev` completes in ~30 seconds and updates `/admin/info.code_version`.
8. ✅ Dev Lambda 502 issue resolved — hitting `/admin/info` returns 200 with a valid payload.
9. ✅ No code in `agentic_fastapi/` imports from `agentic_fastapi_aws/` or `service/`. `grep -r` verifies.
10. ✅ CI is split into Track A (image) and Track B (code) with correct path filters; both green on the branch before merge.
11. ✅ New bucket `{account}--sgraph-ai--{region}` in use; old `{account}--sg-playwright--{region}` is empty or retired.
12. ✅ README.md updated with the local-iteration `docker run` command + the cloud-deploy script usage.

---

## 13. Roughly how long this will take

This is a refactor, not a greenfield build. Much of the code already exists in `df56f1f`'s `lambda_entry.py`, `scripts/package_code.py`, and the v0.1.29 plan's `Code_Loader` sketch. The work is reorganisation + renaming + filling in the admin API gaps + splitting CI.

Rough breakdown (developer-days):

- Reorganise into `agentic_fastapi/` subpackage + rename classes: 1 day
- Admin API endpoints (manifest, skills, capabilities, info extensions): 1 day
- SKILL files (write them): 0.5 day
- `scripts/deploy_code.py` (end-to-end): 0.5 day
- CI pipeline split into Track A (image) + Track B (code): 0.5 day
- README + docs updates, smoke tests, verification: 0.5 day
- Fixing whatever's broken when you try the loops end-to-end: 0.5 day

~4.5 developer-days end-to-end for a careful job. Not a two-week epic.

---

## 14. What this unlocks

When this pass lands:

- **You can iterate on Playwright service code in seconds, not minutes.** That's the headline.
- **The Lambda can be code-updated without image rebuilds.** 30-second cloud deploys instead of 7-minute ones.
- **Agents can discover the service's API without docs** — they hit `/admin/manifest`, then OpenAPI, then `/admin/skills/agent`.
- **When we later split the `agentic_fastapi/` subpackage into its own repo**, the diff is almost entirely `git mv` + a new `pyproject.toml`. No redesigns.
- **When we add capability enforcement**, the `/admin/capabilities` endpoint and the `capabilities.json` file are already in place.
- **When we add the network sidecar**, the container is already emitting the right shape of diagnostic info on `/admin/info.network_sidecar` (currently null — later non-null).

None of the deferred work requires rework of what you ship in this pass. Everything deferred is additive.

---

## 15. Resolved decisions (formerly open questions)

1. **S3 bucket naming — RESOLVED.** Use `{account}--sgraph-ai--{region}` as the bucket. Apps share this bucket under the `apps/{app_name}/{stage}/v{X.Y.Z}.zip` prefix. For this service: `s3://{account}--sgraph-ai--{region}/apps/sg-playwright/dev/v{X.Y.Z}.zip`. This matches v4 arch §8 and makes the bucket reusable for future L3 apps (agentic-code, agentic-pytorch, etc.) without re-partitioning.

   **Migration note:** the bucket rename affects both the boot shim (what URL it fetches from) and the deploy script (where it uploads). Both changes land together. The old `{account}--sg-playwright--{region}` bucket can be emptied and deleted once the new one has a valid zip and the Lambda is reading from it.

2. **CI split — RESOLVED.** Go with two pipelines: one for the container image (Track A, rare), one for the code (Track B, every push). Matches the v0.1.29 plan's pipeline shape. Split at the path filter:
   - Track A triggers on: `Dockerfile`, `requirements.txt`, `lambda_entry.py`, `image_version`, `capabilities.json`, `skills/**`
   - Track B triggers on: everything else under `sgraph_ai_service_playwright/**` and `scripts/**`

   Target timings: Track A ~5 min (image build), Track B ~30s (code package + deploy). The pipeline dispatcher detects the change set and routes; both can run for a push that touches both.

3. **v0.1.24 stateless refactor — RESOLVED (nothing to do).** The service is already stateless per that refactor. No follow-up cleanup needed for this pass. Carry forward the stateless discipline per v4 axiom 1.

---

## 16. References

- `arch__layered-dynamic-code-fastapi-runtime-v4.md` — direction-of-travel (the why)
- `df56f1f` — your v0.1.28 boot shim (the starting point)
- `v0.1.29__part-{1,2,3}__*.md` — your earlier three-part plan, some of which survives here
- JS API Primitive docs (`v0.1.91__tool-api__*`) — pattern reference for SKILL files and manifest/OpenAPI/skills split
