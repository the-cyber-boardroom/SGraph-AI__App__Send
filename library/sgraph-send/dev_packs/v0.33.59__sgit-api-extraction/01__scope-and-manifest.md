# 01 — Scope and File Manifest

**The rule (from the project lead):** SG/API is *only the code required to make the User
Lambda work*, including the APIs the vault web consumes. Any Python class not used by the
User Lambda does not move.

Everything below was measured, not assumed. Re-run the verification commands in §5 before
you trust any of it — the repo may have moved on.

---

## 1. What Moves

### 1.1 Python source

```
sgraph_ai_app_send/
├── __init__.py                      # package root — loaded by the app
├── lambda__user/                    # ENTIRE tree (50 .py files) — MINUS one file, see §2
├── utils/
│   ├── __init__.py
│   ├── MCP__Setup.py                # loaded at app setup (MCP mount)
│   └── Version.py                   # loaded at app setup
└── _for_osbot_aws/
    ├── __init__.py
    ├── Lambda__Dependencies__Loader.py   # cold-start combined-deps loader
    └── Lambda__Dependencies__Builder.py  # build-time counterpart (used by deploy)
```

`utils/` has 4 `.py` files total; take the whole directory. `_for_osbot_aws/` has 3; take all
three — the Loader runs at cold start, the Builder at deploy time.

### 1.2 Tests

```
tests/unit/lambda__user/          # 33 test files — the suite that proves the move
tests/deploy/User__Lambda/        # 4 files: base + dev/main/prod deploy tests
```

Also bring whatever `tests/unit/__init__.py` / `conftest.py` scaffolding those need — check
for `conftest.py` at every level from `tests/` down and copy the ones on the path.

### 1.3 Deploy assets (User-Lambda only — per the project lead)

```
sgraph_ai_app_send/lambda__user/lambda_function/
├── lambda_handler__user.py          # Lambda entry point
└── deploy/Deploy__Service.py        # the pytest-as-deployer subclass

.github/actions/aws__deploy__lambda/action.yml     # the composite action (adapt: User only)
```

Plus a CI pipeline in the new repo — see ADR-5 and `03` step 2. Do **not** copy
`ci-pipeline.yml` wholesale; it also drives admin, PyPI, Docker Hub and the UI deploys.

### 1.4 Project scaffolding (adapt, don't copy blindly)

`pyproject.toml` — strip the `packages` list down to the moved packages only (it currently
declares six, including four UI trees). `requirements-test.txt`, `.gitignore`, `README.md`
(rewrite — see `04`, the README test).

---

## 2. What Must NOT Move — the one file that breaks the cut

```
sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Join.py     ← EXCLUDE
```

**Why.** It imports four classes from `lambda__admin`:

```python
from sgraph_ai_app_send.lambda__admin.schemas.Schema__Invite__Accept__Request import ...
from sgraph_ai_app_send.lambda__admin.service.Service__Invites               import ...
from sgraph_ai_app_send.lambda__admin.service.Service__Room__Session         import ...
from sgraph_ai_app_send.lambda__admin.service.Service__Audit                 import ...
```

…and it is **not registered** in `Fast_API__SGraph__App__Send__User.setup_routes()`. It is
orphaned: present on disk, unreachable from the app. That is why the runtime trace loads zero
admin files despite this import existing.

**This is the single highest-risk item in the extraction.** A naive `cp -r lambda__user/`
brings it along, and the new repo then either fails to import or silently needs
`lambda__admin` — turning a clean cut into a tangled one.

Per the governing rule ("any Python class not used by the User Lambda does not move"), it
stays. Record it in `05__deletion-candidates.md` as a step-2 candidate for the *original*
repo — do not delete it there during this work.

> **Caveat to verify:** the reality doc lists `/join/*` as 3 live endpoints. Either that is
> stale, or the routes are registered somewhere this investigation did not reach. **Confirm
> before excluding** — command in §5.4. If `/join/*` turns out to be live, it is a genuine
> admin↔user coupling and needs a decision (leave the join feature behind, or move the admin
> services it needs), which is a scope change to escalate, not to resolve silently.

---

## 3. What Stays (explicitly)

| Stays | Why |
|---|---|
| `sgraph_ai_app_send/lambda__admin/` (74 .py) | different lambda, different release cycle; zero runtime coupling |
| All UI trees — `__ui__vault`, `__ui__user`, `__ui__open`, `__ui__share`, `__ui__workspace`, `__ui__admin` | project lead: everything else stays for now |
| `sgraph_ai__website/`, `library/`, `team/` | project lead; much of `library/` is bound for the sgit.ai site instead |
| `sgraph_ai_app_send__docker/` + `deploy/aws/*.cfn.yml` + `deploy-full-cycle.yml` | this is the **joint API + vault** deployment — explicitly deferred |
| `scripts/build-vault-static.sh` | vault-web build tooling |
| `tests/unit/lambda__admin`, `tests/unit/container`, `tests/unit/vault_ui`, `tests/integration`, `tests/e2e` | belong to what stays |
| All `deploy-ui-*.yml`, `deploy-website.yml`, `check-common-checksums.yml`, `jekyll-pages.yml` | UI/website pipelines |

---

## 4. The One Genuine Ambiguity — the UI bundled into the zip

`lambda__user/lambda_function/deploy/Deploy__Service.py` line ~28:

```python
_.add_folder(sgraph_ai_app_send__ui__user.path)     # bundles the user UI into the Lambda zip
```

This imports `sgraph_ai_app_send__ui__user` — a package that is **staying**. So the deploy
code, as-is, will not run in the new repo.

Evidence it may be vestigial: `Fast_API__SGraph__App__Send__User` registers **no static
routes** for the user UI, and the static UI has since moved to S3 + CloudFront (see
`reality/infra/index.md`). So the bundle may serve nothing.

**Do not resolve this by deleting during the move.** Ranked options:

| Option | Notes |
|---|---|
| **A (recommended)** — make the folder-add conditional on the package being importable | zero behaviour change when present, works when absent; smallest honest diff |
| B — pin the UI as a build-time dependency fetched from the origin repo | preserves behaviour exactly; adds a cross-repo build coupling |
| C — drop the line | **is a deletion**; belongs in step 2, only after proving nothing serves from it |

Whichever you pick, state it in the new repo's README and record C in
`05__deletion-candidates.md` with the evidence above.

---

## 5. Verification Commands (re-run these first)

**5.1 — Runtime module trace (proves the clean cut):**
```bash
SEND__STORAGE_MODE=memory python3 -c "
import sys
from sgraph_ai_app_send.lambda__user.fast_api.Fast_API__SGraph__App__Send__User import Fast_API__SGraph__App__Send__User
a=Fast_API__SGraph__App__Send__User(); a.setup()
f={getattr(sys.modules[m],'__file__','') for m in sys.modules if m.startswith('sgraph_ai_app_send')}
print('admin files loaded:', sum('lambda__admin' in x for x in f if x))"
```
Expect `0`. Anything else means a new coupling appeared — stop and investigate.

**5.2 — Find every user→admin import:**
```bash
grep -rn 'lambda__admin' sgraph_ai_app_send/lambda__user/ --include='*.py'
```
Expect only `Routes__Join.py`. Any other hit is a new blocker.

**5.3 — Files not loaded at app setup (deletion candidates, NOT exclusions):**
Re-run the trace in `00__README.md`'s findings table. Expect ~12: the deploy/handler files
(loaded at deploy/invoke time), four transfer schemas and `Service__Access_Token` (lazily
imported), the `testing/` helper — **all of which move** — plus `Routes__Join.py`, which does not.

**5.4 — Confirm `Routes__Join` really is orphaned:**
```bash
grep -rn 'Routes__Join' sgraph_ai_app_send/ --include='*.py' | grep -v 'routes/Routes__Join.py'
curl -s localhost:8080/api/openapi.json | grep -c '/join/'   # against a running instance
```
Both should be empty/zero. If not, escalate per §2's caveat.

---

*Released under CC BY 4.0.*
