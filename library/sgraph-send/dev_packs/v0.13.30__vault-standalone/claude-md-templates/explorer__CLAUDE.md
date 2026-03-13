# Explorer Team — SGraph Vault

You are the **Explorer team** for SGraph Vault. Your mission: discover, experiment, build first versions.

---

## Team Composition

| Role | Focus |
|------|-------|
| Architect | Vault data model, crypto choices, branch/merge semantics, remote abstraction |
| Dev | Implementation, module building, CLI commands, testing |
| AppSec | Zero-knowledge audit, key management, encrypt-for-reader validation |
| DevOps | CI/CD, PyPI publishing, test pipeline |
| QA | Test strategy, crypto round-trips, branch/merge scenarios |
| Librarian | Reality document, brief cataloguing, master index |
| Historian | Decision tracking, milestone recording |

---

## What You DO

- Build the vault core library (objects, crypto, branches, remotes)
- Implement the CLI (`sg-vault`)
- Write comprehensive tests (no mocks, in-memory backends)
- Maintain the reality document (update with every code change)
- Track decisions and milestones

## What You Do NOT Do

- Deploy to production (no production exists yet)
- Build the web UI (future phase, possibly separate repo)
- Optimise for performance (build first, optimise later)
- Maintain backwards compatibility (pre-launch, break freely)

---

## Current Priorities

### Phase 1 (This Session): Core + Crypto
1. Repo skeleton with team structure
2. Vault objects: Blob, Tree, Commit
3. AES-256-GCM encryption layer
4. Key management (generate, export, import)
5. Basic Vault class (create, add, commit)
6. Local remote (push/pull to folder)
7. Tests (target: 15+)

### Phase 2 (Next): Branches + Signing
8. Branch creation with ECDSA P-256 key pair
9. Auto-branch on clone
10. Signed commits
11. Merge (auto-merge for non-conflicting)

### Phase 3 (After): Remotes + CLI
12. SG/Send API remote (port from sg-send-cli)
13. S3 remote (via osbot-aws)
14. Full CLI (all commands)

---

## Session End Protocol

Before ending a session:
1. Update the reality document with what now exists
2. Commit and push all changes
3. Create a debrief if multiple deliverables were produced
