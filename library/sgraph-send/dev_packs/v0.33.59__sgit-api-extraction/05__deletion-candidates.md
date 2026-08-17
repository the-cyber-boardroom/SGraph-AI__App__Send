# 05 — Deletion Candidates

Recorded during the pre-move verification session (v0.33.61, 17 August 2026), per the
governing discipline in `00__README.md`: **nothing here has been deleted — these are
candidates for a later, separate deletion series.** Each entry states the evidence; each
future deletion must be its own reversible commit with a stated reason.

---

## In the origin repo (SGraph-AI__App__Send)

### 1. `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Join.py`

- **Evidence:** imports 4 classes from `lambda__admin`; not registered in
  `Fast_API__SGraph__App__Send__User.setup_routes()`; no other file references it;
  `/join/*` paths absent from the live OpenAPI spec (47 paths, zero `join`).
- **Code-verified 2026-08-17.** The reality doc's `/join/*` section was stale and has been
  corrected in the same change as this file.
- **Action when deleting:** delete the file; no route/test references exist.

### 2. UI-folder bundling in `Deploy__Service.py` (`_.add_folder(sgraph_ai_app_send__ui__user.path)`)

- **Evidence:** `Fast_API__SGraph__App__Send__User` registers no static routes; the user UI
  is served from S3 + CloudFront (see `reality/infra/`); the bundle very likely serves nothing.
- **Status:** made conditional on the package being importable (option A from `01` §4) in the
  pre-move session — zero behaviour change while the package is present. The line itself
  remains a deletion candidate once proven vestigial against a live deployment.

### 3. `APP_SEND__UI__USER__*` constants in `lambda__user/user__config.py`

- **Evidence:** after the UI-asset tests were relocated to `tests/unit/ui__user/`, these five
  constants (`ROUTE__PATH__CONSOLE`, `START_PAGE`, `MAJOR__VERSION`, `LATEST__VERSION`,
  `LOCALE`) are referenced only by those relocated tests — no application code reads them.
- **Action when deleting:** move the constants into the UI test module (or the UI tree) and
  drop them from `user__config.py`. Low risk; do it when the extraction repo trims its config.

### 4. `test_2__upload_dependencies` (per-package dependency zips) in `tests/deploy/User__Lambda/deploy_aws/test_Deploy__User__Service__base.py`

- **Evidence:** the test itself is annotated "Legacy: individual per-package zips (kept until
  combined zip is validated)"; `test_2b__upload_combined_dependencies` is the replacement.
- **Action when deleting:** remove the legacy test and `upload_lambda_dependencies_to_s3`
  usage once the combined zip has been the deployed path for a full release cycle.

---

## NOT deletion candidates — couplings that block later deletions

### A. `lambda__admin` imports `Routes__Info__SGraph` from the user tree

`sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py:2` imports
`Routes__Info__SGraph` from `lambda__user`. This does not affect the extraction (the moved
copy is self-contained), but it **blocks step 6's deletion of `lambda__user/` from the origin
repo** — the admin lambda would stop importing. Before that deletion, either move
`Routes__Info__SGraph` into a shared location in the origin repo or give the admin lambda its
own copy.

### B. `tests/unit/lambda__user__with_admin/` (3 files)

`test_Service__Access_Token.py`, `test_Admin__Service__Client.py`,
`test_Routes__Transfers__with_tokens.py` — relocated out of `tests/unit/lambda__user/` in the
pre-move session because they boot the **in-memory Admin FastAPI** (the no-mocks pattern for
the user→admin token-validation flow). They stay in the origin repo, where both lambdas
exist, and keep running in CI (`tests/unit`). They are cross-lambda integration coverage,
not dead code.

---

*Released under CC BY 4.0.*
