# 03 — Implementation Plan

Sequenced. Each step has a gate; **do not start the next step until the current gate passes.**
Steps 0–2 are preparation and must complete before a single file moves.

Escalate rather than improvise if: a second user→admin import appears, `/join/*` turns out to
be live, or the unshallow fails.

---

## Step 0 — Baseline and unshallow (blocking, ADR-3)

Nothing moves until this passes.

```bash
# 0.1 make the history real
git fetch --unshallow
git rev-parse --is-shallow-repository                          # must be: false
git log --reverse --format='%ad %h' --date=short | head -1     # must predate 2026-06-11

# 0.2 pin the baseline commit — every comparison is against this
git rev-parse HEAD > /tmp/BASELINE_SHA

# 0.3 re-verify the clean cut (01 §5.1 and §5.2)
grep -rn 'lambda__admin' sgraph_ai_app_send/lambda__user/ --include='*.py'
#   expect ONLY Routes__Join.py

# 0.4 capture the reference artifact (ADR-4)
#   build the User-Lambda deploy zip at baseline; store the member list + per-member sha256
#   as /tmp/baseline-manifest.txt — this is the thing the move must reproduce

# 0.5 capture the reference test result
python -m pytest tests/unit/lambda__user -q    # record the pass count (expect 33 files' worth)
```

**Gate:** repo not shallow, first commit predates 11 June, only `Routes__Join.py` touches
admin, baseline manifest and test count recorded.

**If unshallow fails** (no network, restricted origin): stop and escalate. Choosing "archive"
must be a decision by the project lead, not a consequence of a failed command.

---

## Step 1 — Decide history: carry or archive (blocking, ADR-3)

Cannot be decided after the move. Put the choice and its reason in the new repo's README.

**If carrying:**
```bash
git clone <origin> sgit-api-extract && cd sgit-api-extract
git filter-repo \
  --path sgraph_ai_app_send/lambda__user \
  --path sgraph_ai_app_send/utils \
  --path sgraph_ai_app_send/_for_osbot_aws \
  --path sgraph_ai_app_send/__init__.py \
  --path tests/unit/lambda__user \
  --path tests/deploy/User__Lambda
```
Then verify: `git log --oneline | wc -l` is plausibly large, and
`git log --follow -- sgraph_ai_app_send/lambda__user/user__config.py` shows real history.

**Gate:** either history is carried and spot-verified on three files, or the archive decision
is written down with where the history lives.

---

## Step 2 — Define the shared pipeline (ADR-5)

Before the code lands, so the new repo starts shared rather than converging later.

- Extract the test/tag/deploy job shape into a reusable `workflow_call` workflow in the origin
  repo (the house pattern — `ci-pipeline.yml` and `_test-ui-vault.yml` already do this).
- The new repo's pipeline is a thin caller.
- Do **not** copy `ci-pipeline.yml` — it also drives admin, PyPI, Docker Hub and UI deploys.

**Gate:** the reusable workflow runs green for the origin repo before the new repo depends on it.

---

## Step 3 — MOVE, with zero behaviour changes (the discipline)

Per `01`. Copy the manifest, **exclude `Routes__Join.py`**, adapt only scaffolding.

Permitted changes in this step — and nothing else:

| Allowed | Not allowed |
|---|---|
| `pyproject.toml` packages list trimmed to what moved | any change to route/service/schema logic |
| package/repo name and version metadata | deleting anything (record it instead) |
| CI pipeline wiring per step 2 | "while we're here" tidy-ups |
| `Deploy__Service.py` UI-folder handling per `01` §4 option A | renaming modules or files |
| new README | reformatting, import reordering, lint fixes |

**If you find dead code — write it to `05__deletion-candidates.md` and move on.** This is the
rule the source brief says will be tempting to break, and it is the one that makes step 6 safe.

**Gate (ADR-4), both required:**
1. Deploy-zip member list and per-member hashes match `/tmp/baseline-manifest.txt`, modulo the
   documented allowed differences (version strings, paths, zip timestamps/ordering, UI folder).
2. `pytest tests/unit/lambda__user` — same pass count as step 0.5, no new skips.

Any unexplained difference means something changed that was not meant to. **Find it before
proceeding** — that is the entire point of moving before deleting.

---

## Step 4 — Prove the deployment on one target (README test)

One target, fully, before any others. Deploy from the new repo using **only** its README.

**Gate:** `04`'s README test passes — a person with no prior context reaches a working
`/api/info/health` without asking a question. A missing dependency on the origin repo will
surface here; that is what this step is for.

---

## Step 5 — Cut over

Origin repo: mark the moved paths as relocated (README pointer), disable the User-Lambda
deploy job, keep the code in place until the new pipeline has deployed successfully at least
once. **Do not delete the origin copy in the same change as the cutover** — same discipline,
one variable at a time.

**Gate:** the new repo has deployed the User Lambda successfully; the origin repo's User
deploy job is disabled, not deleted.

---

## Step 6 — Delete (separate series, later, informed by evidence)

Only now, and never folded into step 3.

- Each deletion is its own commit, reversible, with a stated reason.
- Instrument before retiring. Today's analytics (`lambda__admin/server_analytics/`) points at
  the **admin** surface, so there is nothing usable for the user API yet — either add usage
  logging and let it run for a few weeks, or use the two legitimate shortcuts: this codebase
  has essentially one user who can confirm a list in an hour, and anything reachable only from
  a page that no longer exists can go immediately.
- **First candidates already identified:** `Routes__Join.py` (orphaned, in the origin repo);
  the UI-folder bundling in `Deploy__Service.py` if proven vestigial (`01` §4).
- Deletion is normally cheap to reverse because history is right there — which is exactly why
  step 1's history decision matters before you get here.

---

## Step 7 — Later, not now

`sgit-web`, a separate vault API repo, the `vault-web` extraction, and the joint API + vault
container deployment. Each when there is something to put in it, per ADR-6.

---

## Order at a Glance

```
0  baseline + unshallow      ── blocking, ADR-3
1  history: carry or archive ── blocking, cannot be decided later
2  shared pipeline           ── the one build change allowed during the move
3  MOVE (zero changes)       ── gate: identical zip manifest + same tests green
4  prove deployment          ── gate: README test, one target
5  cut over                  ── gate: new repo deploys; origin job disabled, not deleted
6  DELETE (separate series)  ── evidence-led, one reason per commit
7  sgit-web / vault-web / joint container ── later
```

---

*Released under CC BY 4.0.*
