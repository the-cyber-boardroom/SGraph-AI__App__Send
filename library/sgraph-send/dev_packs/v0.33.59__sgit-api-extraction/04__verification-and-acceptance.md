# 04 — Verification and Acceptance

Two tests carry this work: the **identical-output test** (proves the move changed nothing) and
the **README test** (proves the extraction is complete). Everything else is supporting detail.

---

## 1. The Identical-Output Test (gate on step 3)

The source brief is right that this is what makes the move trustworthy, and right that it is
*testable rather than a matter of care*. The only adjustment: the artifact is the **Lambda
deploy zip**, not the container — the container spans both repos (ADR-4).

### 1.1 Method

```bash
# at BASELINE (origin repo, pre-move commit)
#   build the User-Lambda deploy package, then:
python3 - <<'PY' > /tmp/baseline-manifest.txt
import zipfile, hashlib
z = zipfile.ZipFile('<deploy-zip-path>')
for n in sorted(z.namelist()):
    print(n, hashlib.sha256(z.read(n)).hexdigest())
PY

# repeat in the NEW repo -> /tmp/new-manifest.txt
diff /tmp/baseline-manifest.txt /tmp/new-manifest.txt
```

Compare **member names and per-member hashes**. Never compare the archive's own hash — zips
embed timestamps and ordering, so it differs for reasons that mean nothing.

### 1.2 Allowed to differ — and nothing else

| Difference | Why acceptable |
|---|---|
| version strings | the new repo versions independently |
| absolute paths / path prefixes | different repo root |
| zip member ordering, timestamps | archive metadata, not content |
| user-UI folder members | only if `01` §4 option A was taken — **record the decision** |

**Any other difference is a defect in the move.** Find it before proceeding. That is the whole
reason the move happens before the deletions.

### 1.3 Second gate — the test suite

```bash
python -m pytest tests/unit/lambda__user -q
```
Same pass count as the baseline, **no new skips**. A skip that appears after the move is a
silent failure wearing a disguise — a fixture that no longer resolves usually shows up this way.

---

## 2. The README Test (gate on step 4)

> **Can somebody who has never seen this code deploy it from the new repository, following
> only its README, without asking anybody a question?**

Run it as an actual test, not a thought experiment. Ideally a fresh Claude Code session with
no context, or a colleague who has not seen the work.

**Rules:** the README only. No access to the origin repo, no asking the author, no prior
knowledge. Note every point where the tester has to guess, look elsewhere, or ask — each one
is a documentation defect to fix before the step passes.

**Passes when:**

- [ ] Repo cloned, dependencies installed from documented commands alone
- [ ] `pytest tests/unit/lambda__user` green
- [ ] One deployment target deployed end to end
- [ ] `GET /api/info/health` returns `{"status":"ok"}` on the deployed URL
- [ ] `GET /api/openapi.json` lists the `/api/vault/*` routes
- [ ] A vault round-trip works against it: `sgit clone <vault-key> --endpoint <url> --token <t>`
- [ ] Teardown documented and performed cleanly
- [ ] Zero questions asked

**Why this is the right criterion:** it tests everything the split is for at once. A leftover
dependency on the origin repo surfaces immediately, the deployment is proven rather than
remembered, and the documentation — the part most likely to be left behind — has to exist.

---

## 3. Overall Acceptance

The extraction is done when all of these hold:

| # | Criterion | Evidence |
|---|---|---|
| 1 | New repo contains exactly the manifest in `01`, minus `Routes__Join.py` | file listing diff |
| 2 | No `lambda__admin` import anywhere in the new repo | `grep -rn 'lambda__admin' .` → empty |
| 3 | Runtime trace loads zero admin modules | `01` §5.1 → `0` |
| 4 | Identical-output test passes | manifest diff, documented exceptions only |
| 5 | `tests/unit/lambda__user` green, same count, no new skips | pytest output vs baseline |
| 6 | History carried **or** archive decision documented in README | `git log` depth, or the README statement |
| 7 | CI runs via the shared reusable workflow, not a copy | workflow file is a thin caller |
| 8 | README test passes with zero questions | tester's notes |
| 9 | Origin repo's User-Lambda deploy job disabled (not deleted) | workflow diff |
| 10 | Deletion candidates recorded, **nothing deleted** in this series | `05__deletion-candidates.md` exists and is non-empty |
| 11 | Version bump reasoned as *rename*, not *move* (ADR-7) | release note wording |
| 12 | Reality docs updated in the same change | `reality/infra/` + `reality/send-api/` |

**Criterion 10 is the one most likely to be violated**, because deleting is the satisfying
part. A pull request that both moves and deletes should be sent back.

---

## 4. Rollback

Cheap by construction, if the discipline held.

- **Before step 5:** the origin repo is untouched and still deploys. Abandon the new repo.
- **After step 5, before step 6:** re-enable the origin User-Lambda deploy job — the code is
  still there, which is why step 5 disables rather than deletes.
- **After step 6:** rollback depends on history existing. If step 1 chose *archive*, deletions
  in the new repo are recoverable only from the archived origin. **This is the concrete reason
  the history decision comes first.**

---

## 5. What "Done" Does Not Include

Not part of this work, and not a reason to hold it open: `sgit-web`, a separate vault API
repo, `vault-web` extraction, the joint API + vault container deployment, and any feature
retirement. Those are steps 6–7 and later packs.

---

*Released under CC BY 4.0.*
