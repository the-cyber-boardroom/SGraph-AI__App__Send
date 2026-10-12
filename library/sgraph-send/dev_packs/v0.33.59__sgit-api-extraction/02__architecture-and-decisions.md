# 02 — Architecture and Decisions

Decisions the extraction rests on. Each states the choice, the reasoning, and what it costs.
ADR-1/2/3/4 must be settled **before** anything moves; ADR-5 is executed during the move;
ADR-6/7 apply at release time.

---

## ADR-1: The boundary is the User Lambda's reachable set — PROPOSED

**Decision.** `sgit-api` is exactly the code the User Lambda needs to run: all of
`lambda__user/` (minus `Routes__Join.py`), plus `utils/`, `_for_osbot_aws/`, and the package
root. Not `lambda__admin/`. Not the UI trees.

**Why this works.** Measured: building the User FastAPI app loads 42 sgraph modules and
**zero** `lambda__admin` files. The runtime boundary already exists; the extraction only has
to make it a repository boundary.

**What this means for the "copy" claim.** The source brief wants a pure copy. This is one —
with a single exclusion (`Routes__Join.py`, orphaned and admin-coupled). That file is the
difference between a clean cut and a tangled one; see `01` §2.

**Honest note on naming.** The extracted service is *not* purely "sgit". The User Lambda also
serves SG/Send transfers, presigned uploads, early-access signup and public preview. The
sgit protocol routes (`Routes__Vault__Pointer`, `__Append`, `__Presigned`) are a subset. The
repo name should reflect what it is — a deployable API service that *includes* the sgit
protocol — rather than implying the whole thing is the protocol. See ADR-2.

---

## ADR-2: Layering decides naming — PROPOSED

The source brief's answer is right and worth restating, because it survives the observation
above:

| Layer | What it is | Interface |
|---|---|---|
| **sgit** | the protocol, and the server that speaks it | one-to-one with protocol operations |
| **Vault** | everything built on top — apps, permissions, chat, sub-vaults | rich, opinionated |

**Decision.** Name by layer: `sgit-api` (protocol server), `sgit-web` (thin one-to-one
interface, later), `vault-web` (the rich application, later).

**Caveat to resolve at naming time.** Since the extracted service carries transfers and
early-access alongside the protocol (ADR-1), `sgit-api` is *aspirational* until those are
either retired or split out. Two honest options: accept the name and treat transfers as
legacy tenants to retire in step 2, or name it for what it is today. **Flag this to the
project lead — it is a naming decision, not an engineering one.**

**Do not create a repository for the vault-specific server features.** The source brief is
right: a repository holding two features is worse than a module holding two features. Keep
them as a clearly named module inside `sgit-api`. Extract when the release cycle actually
diverges — a small evidenced move later beats a speculative one now.

---

## ADR-3: Unshallow before extracting, then decide carry-vs-archive — PROPOSED, **blocking**

**The problem the source brief could not know.** The working copy is a **shallow clone**:
191 commits back to 11 June 2026, while the project began in February. Running
`git filter-repo` here produces a new repository containing roughly two months of a six-month
history — **and reports success.** This is the brief's "silent loss" in its worst form,
because the tooling appears to work.

**Decision — do this first, before any file moves:**

```bash
git fetch --unshallow                                  # or a fresh full clone
git rev-parse --is-shallow-repository                  # must print: false
git log --reverse --format='%ad %h' --date=short | head -1   # must predate 11 June 2026
```

Only once that passes is the carry-vs-archive choice a real choice:

| Option | Cost | When it's right |
|---|---|---|
| **Carry** (`git filter-repo --path sgraph_ai_app_send/lambda__user ...`) | one extra step at the moment everyone wants to move fast | the code will be maintained for years — blame, bisect and the *why* behind odd lines all survive |
| **Archive** | cheap, and it is a decision rather than a default | acceptable *only if* the original repo stays readable and the README says where history lives |

**The wrong outcome is copying the files, not thinking about it, and discovering the gap
during an incident.** Record the choice in the new repo's README either way.

---

## ADR-4: The identical-output test is per-artifact, not per-container — PROPOSED

**Why the obvious test fails.** The natural artifact — the Docker image — bundles the API
*plus* three UI trees, and `scripts/build-vault-static.sh` overlays four user-UI `_common`
layers (v0.3.0–v0.3.3) into the vault tree. After the split neither repo can build that
container alone. "Build both sides and diff" is not available.

**Decision.** The step-1 verification is the **Lambda deployment package**, which is
genuinely single-repo:

1. Build the deploy zip from the origin repo at the pre-move commit; record `sha256` of every
   member and the sorted member list.
2. Build it from the new repo.
3. Compare **member lists and per-member hashes**, not the archive hash (zips embed
   timestamps and ordering).

**Allowed to differ** — and nothing else: version strings, absolute paths, zip timestamps/
ordering, and the user-UI folder if ADR-1's §4 option A is taken (record it explicitly).

**Second gate, equally important:** `tests/unit/lambda__user` (33 files) must pass in the new
repo with the same count and zero skips introduced by the move.

**Note for the later `vault-web` move:** that extraction is *harder* than this one precisely
because of the `_common` overlay. `check-common-checksums.yml` already guards byte-identical
`_common` duplication between the share and open trees — splitting `vault-web` out converts
that intra-repo guard into a cross-repo problem it cannot cover. Solve it with a published
component/registry package, not by copying layers.

---

## ADR-5: Shared CI pipeline, defined once, at the moment of the split — PROPOSED

**The one thing worth doing *during* the move**, because it changes the build rather than the
product — and because converging three diverged pipelines later costs far more than starting
them shared.

**Precedent already exists**: `workflow_call` in `ci-pipeline.yml` and `_test-ui-vault.yml`,
plus external composite actions from `owasp-sbot/OSBot-GitHub-Actions`. This is the house
pattern, not a new idea.

**Decision.** The new repo's pipeline calls a reusable workflow rather than inlining a copy.
On the open question *"does the shared pipeline live in its own repository?"* — the source
brief flags this as the one case where a thin repository may be justified. Recommendation:
**not yet.** Keep the reusable workflow in the origin repo and reference it
(`uses: org/repo/.github/workflows/x.yml@ref`); promote it to its own repository when a
**second** consumer starts duplicating it, which is the same release-cycle rule applied
consistently.

**Do not copy** `ci-pipeline.yml` wholesale — it drives admin deploys, PyPI, Docker Hub and
UI deploys, none of which belong to the new repo.

---

## ADR-6: Repositories track release cycles, not concepts — ACCEPTED (from the source brief)

Ask of any two things: *do they always ship together?* If yes, one repository.

| Question | Answer |
|---|---|
| Separate vault API repo? | **No** — those features ship with the API; keep a named module |
| Deployment in its own repo? | **No** — config ships with the thing deployed |
| One repo per cloud target? | **No** — they do not release independently |
| `sgit-web` separate from `vault-web`? | **Yes** — different products, cadence, audience |

**The trigger to watch for:** deployment configuration earns its own home the moment a
*second* consumer duplicates it. That will be obvious rather than a judgement call.

---

## ADR-7: A move is not a major version; a rename is — ACCEPTED (from the source brief)

A major version signals a **break to consumers**. Relocating code with identical behaviour is
not a break — the same calls return the same results.

What *is* a break, and justifies the bump: a package or module rename, an import-path change,
or a change to how the thing is installed. **This extraction changes the installable package
identity** (`pyproject.toml` name and the declared packages), so a major bump is likely
correct — but state the reason as **the rename**, not "the move felt big".

If the package name is preserved, use a minor bump with a release note saying the code has
moved, and keep the major available for when something genuinely breaks.

**Watch out:** `sgraph_ai_app_send/version` is owned exclusively by the CI pipeline. Do not
hand-edit it in either repo; set the new repo's initial version through its pipeline.

---

*Released under CC BY 4.0.*
