# Dev Pack: Extracting SG/API into Its Own Repository

**version** v0.33.59 · **date** 16 August 2026
**for** a fresh Claude Code session doing the extraction (assume no prior context)
**source brief** `v0.33.59__dev-brief__the-split-move-first-and-delete-second.md` (project lead)
**status** PROPOSED — nothing here is implemented yet

---

## Read These In Order

| # | File | What it gives you |
|---|---|---|
| **00** | this file | orientation, the governing discipline, what's already been decided |
| **01** | `01__scope-and-manifest.md` | the exact file manifest — what moves, what stays, and the one file that must NOT move |
| **02** | `02__architecture-and-decisions.md` | ADRs: boundary, naming/layering, history, artifact test, versioning |
| **03** | `03__implementation-plan.md` | sequenced steps with verification gates |
| **04** | `04__verification-and-acceptance.md` | the identical-output test, the README test, acceptance criteria |

---

## The Governing Discipline (from the source brief — do not violate)

> **Move with zero changes, verify, then delete in a separate series afterwards.**

The source brief contains two instructions that are individually right and mutually exclusive
in one step: *"literally copy from one place to the other"* and *"this is also a good
opportunity to see what features we don't need anymore."* **A move plus a change means that
when something breaks, nobody can tell which caused it.**

```
   STEP 1   MOVE     zero behaviour changes, verified by identical build output
   STEP 2   DELETE   separate commits, each reversible, each with a reason
```

Step 2 is genuinely optional and better done later, under less pressure. **If you find dead
code during the move, write it down — do not delete it.** `05__deletion-candidates.md` is
where it goes (create it as you find things; it is the input to a later series).

There is exactly **one** exception, and it qualifies because it changes the build rather than
the product: the shared CI pipeline (ADR-5). Do that during the split, because converging
three diverged pipelines later is far more expensive than starting them shared.

---

## What Has Already Been Decided (do not relitigate)

These came from the project lead directly. They are settled inputs, not open questions:

1. **SG/API = only the code required to make the User Lambda work** — including the APIs the
   vault web consumes. Any Python class not used by the User Lambda does **not** move.
2. **Only the User-Lambda deploy scripts move.** Everything else stays for now — explicitly
   including the joint API-plus-vault container deployment, which is a later piece of work.
3. **Everything else stays in the current repo** — docs, `library/`, `team/`, all UI trees,
   the website. (A lot of `library/` is destined for the sgit.ai website instead.)

---

## What The Investigation Established (evidence, not assumption)

Measured against the repo at v0.33.54. Re-verify with the commands in `01` before trusting.

| Finding | Consequence |
|---|---|
| **The cut is clean at runtime.** Building the User FastAPI app loads **42 sgraph modules and zero `lambda__admin` files.** | The extraction is viable as a near-pure copy |
| **Exactly one file breaks it:** `Routes__Join.py` imports 4 classes from `lambda__admin` — and is **not registered** in the app (orphaned). | It must be excluded. See `01`. |
| **The working copy is a shallow clone** — 191 commits from 11 June; the project started in February. | `git filter-repo` here would silently carry ~2 months of a ~6-month history **and appear to succeed**. Unshallow first. See ADR-3. |
| **The obvious build artifact spans both repos.** The Docker image bundles the API plus three UI trees; `build-vault-static.sh` overlays four user-UI `_common` layers into the vault tree. | The identical-output test cannot be "build the container both sides". See ADR-4. |
| **`Deploy__Service.py` bundles the user UI into the Lambda zip** (`_.add_folder(...)`) — but the FastAPI app registers **no** static routes for it. | Possibly vestigial. It is a **step-2 deletion candidate, not a step-1 change.** See `01` §4. |
| **Instrumentation exists but points the wrong way** — `lambda__admin/server_analytics/`, `Schema__Analytics__Raw_Event`, `Schema__Analytics__Pulse` are in the **admin** lambda. | The brief's "instrument before retiring" has nothing usable for the user surface yet |
| **Reusable-workflow precedent already exists** — `workflow_call` in `ci-pipeline.yml` and `_test-ui-vault.yml`, plus external `owasp-sbot/OSBot-GitHub-Actions` actions. | ADR-5 builds on this rather than inventing it |

---

## The Success Criterion

From the source brief, sharpened:

> **Can somebody who has never seen this code deploy it from the new repository, following
> only its README, without asking anybody a question?**

That single test proves the extraction is complete (a missed dependency surfaces
immediately), the deployment is real rather than remembered, and the documentation actually
moved. `04` turns it into a checklist.

---

## Scope Boundary — What This Pack Does NOT Cover

- **`sgit-web`** (the thin one-to-one interface over the protocol) — later, when there is
  something to put in it.
- **A separate vault API repo** — the source brief is right that a repository holding two
  features is worse than a module holding two features. Keep vault-specific server code as a
  named module inside the extracted repo; extract only when its release cycle actually diverges.
- **`vault-web` extraction** — a later move, same discipline. Note it is *harder* than this
  one because of the `_common` overlay coupling (see ADR-4).
- **The joint API + vault container deployment** — explicitly deferred by the project lead.
- **Any deletion.** Record candidates; delete in a separate series.

---

*Released under CC BY 4.0.*
