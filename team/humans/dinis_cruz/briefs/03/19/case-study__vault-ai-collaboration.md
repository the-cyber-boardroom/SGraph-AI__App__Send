# Case Study: AI-Agent Code Collaboration via Encrypted Vaults

## How a Human and an AI Built a Tool Together Without Sharing a Filesystem, a Git Repo, or Elevated Privileges

**Date:** 19 March 2026
**Context:** A single session where a human developer (macOS) and an AI agent
(Claude, running in a sandboxed container) collaboratively built a Python CLI
tool from architecture discussion to 62 passing tests.

---

## The Problem: How Do You Collaborate on Code With an AI Agent?

Every current approach to AI-agent code collaboration has a fundamental tension:
the agent needs enough access to be useful, but every permission granted is a
permission that can be misused, leaked, or exploited.

Today's options all make uncomfortable tradeoffs.

---

## The Current State of the Art

### Option 1: Copy-Paste / Chat-Based

```
  Human                              AI Chat
  ─────                              ───────
  "Write me a function that..."  ──▶  [generates code]
                                  ◀──  ```python
                                       def my_function():
                                           ...
                                       ```
  [manually copy]
  [paste into editor]
  [fix indentation]
  [run tests]
  [copy error output]
  "I got this error..."         ──▶  [generates fix]
                                  ◀──  ```python
                                       ...
                                       ```
  [copy, paste, test, repeat]
```

**What's wrong:**
- Every exchange is a manual copy-paste cycle
- Context is lost between messages — the AI doesn't see your file tree
- No version history of what the AI produced
- Files with 500+ lines become unwieldy in chat
- The human is a slow, error-prone copy-paste machine

### Option 2: Drag-and-Drop / File Attachments

```
  Human                              AI Chat
  ─────                              ───────
  [drags file into chat]        ──▶  [reads file content]
                                  ◀──  "Here's the modified version..."
                                       [downloads file]
  [replaces local file]
  [runs tests]
  [drags error log into chat]   ──▶  [reads log]
                                  ◀──  [downloads fixed file]
  [replaces again, tests again]
```

**What's wrong:**
- Slightly better than copy-paste but still manual per-file
- No way to send a whole project — you'd need to zip it
- Downloaded files lose their path context
- No commit history, no diff, no rollback
- Still a human-in-the-middle for every file operation

### Option 3: AI Agent with GitHub Access (OAuth / PAT)

```
  ┌──────────┐    OAuth/PAT     ┌──────────┐
  │  Human   │ ──────────────▶  │  GitHub   │
  └──────────┘                  └──────────┘
                                     ▲
  ┌──────────┐    OAuth/PAT     ─────┘
  │ AI Agent │ ──────────────▶
  └──────────┘
```

**What's wrong:**
- **Over-privileged credentials.** GitHub PATs and OAuth tokens grant access
  to ALL repos the user can access, not just the one the agent needs.
  A token scoped to push to `my-project` also has read access to every
  private repo in the org. GitHub does not yet support fine-grained
  agentic credentials that scope to a single repo + branch.
- **Credential leakage surface.** The PAT must be given to the AI agent's
  environment. If that environment is compromised (prompt injection,
  container escape, supply chain attack), the attacker gets the same
  access as the developer.
- **Bot accounts are prohibited.** GitHub's Terms of Service do not allow
  bot accounts — they actively monitor for automated/agentic account
  usage and will ban accounts detected operating this way. This means
  there is no legitimate path to having a dedicated agent identity on
  GitHub. Commits must go through a human's account, which means the
  agent inherits all of that human's access and the commits are
  mis-attributed.
- **No encryption at rest.** Code sits in plaintext on GitHub's servers.
  Fine for open source, problematic for proprietary code.

### Option 4: AI Agent Running Locally (Claude Code, Cursor, Copilot Workspace)

```
  ┌─────────────────────────────────────────┐
  │  Developer's Machine                    │
  │                                         │
  │  ┌───────────┐    ┌──────────────────┐  │
  │  │ AI Agent  │───▶│ Local Filesystem │  │
  │  │ (runs as  │    │ ~/.ssh/          │  │
  │  │  user)    │    │ ~/.aws/          │  │
  │  │           │    │ ~/Documents/     │  │
  │  │           │    │ /etc/            │  │
  │  └───────────┘    └──────────────────┘  │
  │                                         │
  │  Agent has FULL access to everything    │
  │  the user can access.                   │
  └─────────────────────────────────────────┘
```

**What's wrong:**
- **The agent runs as YOU.** It has your SSH keys, your AWS credentials,
  your browser cookies, your password manager, your email. Every file
  on your machine is readable.
- **No privilege boundary.** There is no separation between "the agent
  needs to edit src/main.py" and "the agent can read ~/.ssh/id_rsa".
  The filesystem doesn't know the difference.
- **Prompt injection → full compromise.** If a malicious instruction is
  embedded in a file the agent reads (a README, a dependency, a
  downloaded artifact), the agent executes it with your full privileges.
- **No audit trail.** Local file changes don't have commit attribution.
  You can't tell what the agent changed vs what you changed unless you
  diff manually.
- **"Just sandbox it" doesn't scale.** Docker/VM isolation helps but
  then the agent can't access your project files, your Git config,
  or your test infrastructure — defeating the purpose.

---

## What We Did Instead: Encrypted Vault as the Collaboration Channel

```
  ┌─────────────────┐                         ┌─────────────────┐
  │  Human           │                         │  AI Agent        │
  │  (macOS)         │                         │  (sandboxed      │
  │                  │                         │   container)     │
  │  Has:            │                         │                  │
  │  - vault key     │                         │  Has:            │
  │  - access token  │                         │  - vault key     │
  │  - local editor  │                         │  - access token  │
  │  - browser       │                         │  - Python/Node   │
  │  - full OS       │                         │  - pytest        │
  │                  │                         │  - pip           │
  │  Does NOT have:  │                         │                  │
  │  - agent's       │                         │  Does NOT have:  │
  │    private keys  │                         │  - SSH keys      │
  │                  │                         │  - AWS creds     │
  │                  │                         │  - GitHub access │
  │                  │                         │  - filesystem    │
  │                  │                         │  - browser       │
  │                  │                         │  - user's files  │
  └────────┬────────┘                         └────────┬────────┘
           │                                           │
           │  sgit push/pull                           │  sgit push/pull
           │  (encrypted)                              │  (encrypted)
           │                                           │
           ▼                                           ▼
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │                    SG/Send Server                          │
  │                                                            │
  │  Stores: encrypted ciphertext (AES-256-GCM)               │
  │  Knows:  nothing about the content                        │
  │  Has:    no decryption keys                               │
  │                                                            │
  │  The server is a dumb encrypted object store.             │
  │  It cannot read the code. It cannot modify it.            │
  │  It cannot tell who is human and who is AI.               │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

### The Privilege Model

```
  ┌─────────────────────────────────────────────────────┐
  │              What the AI Agent CAN Do               │
  ├─────────────────────────────────────────────────────┤
  │  ✓ Clone the vault (read files via vault key)       │
  │  ✓ Create/modify files in ITS OWN clone branch      │
  │  ✓ Commit changes to its clone branch               │
  │  ✓ Push its branch for merging into named branch    │
  │  ✓ Pull changes from the named branch               │
  │  ✓ Run tests in its own sandbox                     │
  │  ✓ Install packages in its own sandbox              │
  │  ✓ Fetch URLs on its network allowlist              │
  └─────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │           What the AI Agent CANNOT Do               │
  ├─────────────────────────────────────────────────────┤
  │  ✗ Write directly to the main/named branch          │
  │  ✗ Access the human's filesystem                    │
  │  ✗ Read SSH keys, AWS creds, browser cookies        │
  │  ✗ Push to GitHub (no Git credentials)              │
  │  ✗ Access any other vault (key is per-vault)        │
  │  ✗ Decrypt other users' data on the server          │
  │  ✗ Modify files outside the vault                   │
  │  ✗ Persist state between sessions (except via vault)│
  │  ✗ Reach any network host not on the allowlist      │
  │  ✗ Access other clone branches' private keys        │
  └─────────────────────────────────────────────────────┘
```

### What's Exchanged

```
  Credentials given to the AI:
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  1. Vault key (read access to ONE vault)            │
  │     <access-id>:<vault-id>                          │
  │     e.g. a1b2c3d4e5f6g7h8i9j0k1l2:x9y8z7w6        │
  │                                                     │
  │  2. Access token (write access to ONE vault)        │
  │     <scoped-token>                                  │
  │     e.g. project__sprint-3__a1b2c                   │
  │                                                     │
  │  That's it. Two strings.                            │
  │                                                     │
  │  No GitHub PAT. No SSH key. No AWS credentials.     │
  │  No OAuth flow. No org-wide access.                 │
  │                                                     │
  └─────────────────────────────────────────────────────┘

  What these credentials grant:
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  Vault key  → decrypt and read files in this vault  │
  │  Token      → push to this agent's clone branch     │
  │                                                     │
  │  Scope: exactly ONE vault, ONE branch. Nothing else.│
  │  Revocable: token can be revoked at any time.       │
  │  Auditable: every push is a commit on the branch.   │
  │                                                     │
  └─────────────────────────────────────────────────────┘
```

### What Happens at Clone Time: Per-Branch PKI

When the AI agent clones a vault, something important happens automatically:

```
  sgit clone <vault-key>
  │
  ├── 1. Download encrypted vault objects
  ├── 2. Decrypt with vault key
  ├── 3. Create a NEW clone branch (branch-clone-XXXX)
  ├── 4. Generate a PKI key pair for this branch
  │      ├── Private key → .sg_vault/local/  (STAYS LOCAL, never uploaded)
  │      └── Public key  → .sg_vault/bare/keys/  (shared with vault)
  └── 5. Extract working copy
```

The private key never leaves the agent's environment. It is used to sign
commits on this clone branch. The public key is stored in the vault so
other participants can verify who made each commit.

**This means:**
- The agent can only commit to its own branch
- Commits are cryptographically attributable to the clone that made them
- The human (or a CI system) controls when/whether to merge into the named branch
- Even if the access token leaked, the attacker couldn't impersonate this
  specific clone without the private key

---

## Future: Full PKI Vault Mode

The session described in this case study uses the **basic vault operating mode**
— the least restrictive security tier. More restrictive modes are being added:

```
  Current (basic mode):
  ┌─────────────────────────────────────────────────────┐
  │  All vault files readable by anyone with vault key  │
  │  Clone branches have auto-generated PKI             │
  │  Commits signed with clone branch key               │
  └─────────────────────────────────────────────────────┘

  Coming (full PKI mode):
  ┌─────────────────────────────────────────────────────┐
  │  Vault users have PKI identities (managed outside   │
  │  the vault — the user brings their own key pair)    │
  │                                                     │
  │  File-level encryption with recipient public keys:  │
  │  - Owner encrypts file FOR specific readers         │
  │  - Only holders of the matching private key can     │
  │    decrypt that file                                │
  │  - Different files can have different access lists   │
  │  - An agent could be granted access to src/ but     │
  │    not to secrets/ or config/                       │
  │                                                     │
  │  The vault becomes a zero-knowledge access control  │
  │  system where the server enforces nothing — the     │
  │  cryptography enforces everything.                  │
  └─────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  Example: Selective file access via PKI                          │
  │                                                                  │
  │  vault/                                                          │
  │  ├── src/main.py          encrypted for: [human, agent-1]       │
  │  ├── src/utils.py         encrypted for: [human, agent-1]       │
  │  ├── tests/               encrypted for: [human, agent-1]       │
  │  ├── config/prod.env      encrypted for: [human]        ONLY    │
  │  ├── secrets/api-keys     encrypted for: [human]        ONLY    │
  │  └── docs/architecture    encrypted for: [human, agent-1,       │
  │                                           agent-2, reviewer]    │
  │                                                                  │
  │  Agent-1 can read src/ and tests/ but CANNOT decrypt             │
  │  config/prod.env or secrets/api-keys — not because of            │
  │  access control rules, but because it doesn't have the           │
  │  private key. The math prevents it, not a policy.                │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

## The Session Flow

```
  Human (macOS)                    SG/Send                     Claude (container)
  ─────────────                    ───────                     ──────────────────

  1. Creates vault               ──▶ vault created
     Shares vault key + token         (encrypted store)
     with Claude in chat

                                                          2. Clones vault
                                                     ◀──     sgit clone
                                                              → PKI key pair
                                                                generated for
                                                                clone branch

                                                          3. Writes code
                                                             (Python CLI,
                                                              JS transforms,
                                                              CSS shields,
                                                              HTML viewer,
                                                              54 tests)

                                                          4. Runs tests
                                                             54 passed ✓

                                                          5. Commits + pushes
                                                     ──▶     v0.2.0 pushed
                                                              (to clone branch)

  6. Pulls                       ◀──
     sgit pull
     → sees all new files
     → merged into named branch

  7. Runs tests locally
     54 passed ✓

  8. Runs CLI
     fetch → inject → viewer
     works ✓

  9. Reports bug                 ──▶                     10. Reads bug in chat
     "transform not found"                                    Fixes workspace.py

                                                         11. Runs tests
                                                              54 passed ✓

                                                         12. Commits + pushes
                                                     ──▶     v0.2.4 pushed

  13. Pulls                      ◀──
      sgit pull
      → 3 files modified

  14. Runs CLI
      works ✓

  15. Requests new features      ──▶                     16. Adds multi-transform
      "add debug scripts"                                     Adds 3 debug scripts
      "support more pages"                                    Adds new shields
                                                              62 tests

                                                         17. Commits + pushes
                                                     ──▶     v0.3.0 pushed

  18. Pulls                      ◀──
      sgit pull
      → 9 files changed

  19. Opens vault in web app
      → sees full commit graph
      → all 8 commits visible
      → attributed to the agent's clone branch
```

### Commit Attribution

Every commit in the vault is on the agent's clone branch, signed with the
clone branch's private key:

```
  ● obj-cas-imm-b8f04faf15e0  v0.3.0  branch-clone-00c1c75  19 Mar 18:36
  │
  ● obj-cas-imm-00598d94c935  v0.2.5  branch-clone-00c1c75  19 Mar 15:19
  │
  ● obj-cas-imm-36c1ca2960ab  v0.2.4  branch-clone-00c1c75  19 Mar 15:15
  │
  ● obj-cas-imm-414de0ec10f6  v0.2.3  branch-clone-00c1c75  19 Mar 15:10
  │
  ● obj-cas-imm-adc50555145e  v0.2.2  branch-clone-00c1c75  19 Mar 15:05
  │
  ● obj-cas-imm-6c67e556bcdd  v0.2.1  branch-clone-00c1c75  19 Mar 14:55
  │
  ● obj-cas-imm-b0f6aae2e7ca  v0.2.0  branch-clone-00c1c75  19 Mar 14:42
  │
  ● obj-cas-imm-feee96f71743  v0.1.0  branch-clone-00c1c75  19 Mar 01:47
  │
  ● obj-cas-imm-00d2d2216e96  (initial)  main               19 Mar 01:35
```

The agent's work is on `branch-clone-00c1c75`. The human's initial commit
is on `main`. If there were multiple agents, each would have its own branch
with its own PKI key pair. You can see exactly what each participant
contributed, verified cryptographically.

---

## Comparison Matrix

```
┌──────────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│                      │ Copy-    │ File     │ GitHub   │ Local    │ SG/Send  │
│                      │ Paste    │ Attach   │ PAT/OAuth│ Agent    │ Vault    │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Credentials needed   │ None     │ None     │ PAT/OAuth│ User's   │ Vault key│
│                      │          │          │ (broad)  │ full OS  │ + token  │
│                      │          │          │          │ access   │ (scoped) │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Blast radius if      │ None     │ None     │ All repos│ Full OS  │ One vault│
│ compromised          │ (no      │ (no      │ in scope │ (SSH,AWS │ one      │
│                      │  access) │  access) │ of token │  cookies │ branch   │
│                      │          │          │          │  files)  │          │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Encrypted at rest    │ No       │ No       │ No       │ No*      │ Yes      │
│                      │          │          │          │          │ AES-256  │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Server can read code │ N/A      │ Yes      │ Yes      │ N/A      │ No       │
│                      │ (chat)   │ (upload) │ (GitHub) │          │ (zero-   │
│                      │          │          │          │          │  knowldge│
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Commit attribution   │ None     │ None     │ Human's  │ None     │ Per-     │
│                      │          │          │ identity*│          │ branch   │
│                      │          │          │          │          │ with PKI │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Agent identity       │ None     │ None     │ Prohib-  │ None     │ Auto PKI │
│                      │          │          │ ited by  │          │ per clone│
│                      │          │          │ GitHub   │          │ branch   │
│                      │          │          │ ToS      │          │          │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Version history      │ Chat log │ Chat log │ Git log  │ Git log  │ Vault    │
│                      │ only     │ only     │          │ (local)  │ commit   │
│                      │          │          │          │          │ graph    │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Multi-file support   │ Painful  │ Manual   │ Yes      │ Yes      │ Yes      │
│                      │          │ per-file │          │          │          │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Agent can run tests  │ No       │ No       │ Via CI   │ Yes      │ Yes      │
│                      │          │          │          │ (as user)│ (sandbox)│
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Works across AI      │ Yes      │ Yes      │ Vendor-  │ Vendor-  │ Yes      │
│ providers            │ (manual) │ (manual) │ specific │ specific │ (any     │
│                      │          │          │          │          │  CLI)    │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Revocable access     │ N/A      │ N/A      │ Revoke   │ Kill     │ Revoke   │
│                      │          │          │ PAT      │ process  │ token    │
│                      │          │          │ (broad)  │          │ (scoped) │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ File-level access    │ N/A      │ N/A      │ No       │ No       │ Yes      │
│ control              │          │          │ (all or  │ (all or  │ (via PKI │
│                      │          │          │  nothing)│  nothing)│  future) │
├──────────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Session continuity   │ None     │ None     │ Via repo │ Local    │ Clone    │
│ (new AI session)     │ (re-     │ (re-     │          │ files    │ vault =  │
│                      │  explain)│  upload) │          │ persist  │ full     │
│                      │          │          │          │          │ context  │
└──────────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

  * GitHub: bot accounts are prohibited by ToS; commits go through human identity
  * Local: disk encryption helps but the running agent has plaintext access
```

---

## The Key Insight: The Vault Is a Capability, Not a Credential

Traditional access control asks: **"Who are you?"** → then grants broad access.

The vault model asks: **"What can you do?"** → and the answer is exactly:
read/write files in this one vault, on your own branch. Nothing more.

```
  Traditional (identity-based):
  ┌──────────┐     ┌──────────┐     ┌──────────────────────────┐
  │ "I am    │ ──▶ │ Auth     │ ──▶ │ Access to:               │
  │  Dinis"  │     │ Server   │     │  - All repos in org      │
  │          │     │          │     │  - All branches           │
  └──────────┘     └──────────┘     │  - All CI/CD pipelines   │
                                    │  - All deployment targets │
                                    │  - All secrets            │
                                    └──────────────────────────┘

  Vault (capability-based):
  ┌──────────┐     ┌──────────┐     ┌──────────────────────────┐
  │ "I have  │ ──▶ │ SG/Send  │ ──▶ │ Access to:               │
  │  this    │     │ Server   │     │  - This vault's files    │
  │  key +   │     │          │     │  - My clone branch only  │
  │  token"  │     │          │     │  - Nothing else           │
  └──────────┘     └──────────┘     └──────────────────────────┘

  Future vault (PKI-scoped):
  ┌──────────┐     ┌──────────┐     ┌──────────────────────────┐
  │ "I have  │ ──▶ │ SG/Send  │ ──▶ │ Access to:               │
  │  this    │     │ Server   │     │  - Files encrypted for   │
  │  key +   │     │          │     │    my public key         │
  │  my PKI  │     │          │     │  - My clone branch only  │
  │  identity│     │ (server  │     │  - Nothing else           │
  │          │     │  can't   │     │  - Math enforces this,   │
  │          │     │  tell)   │     │    not policy             │
  └──────────┘     └──────────┘     └──────────────────────────┘
```

The AI agent doesn't need to prove it's Claude, or authenticate as a GitHub
user, or assume anyone's identity. It just has a key that opens one box,
and a branch that only it can sign commits to.

---

## What Was Built in This Session

To make this concrete — this wasn't a toy demo. The session produced a
working tool with real utility:

```
  Tool v0.3.0
  ├── 4 CLI commands (fetch, inject, list, push)
  ├── 6 transform scripts (1 filter + 3 debug tools + 2 site-specific)
  ├── 3 shield strategies (default + 2 site-specific)
  ├── 1 static viewer (split-view HTML comparison)
  ├── 62 passing tests (including 4 live integration tests)
  ├── 8 commits across the session
  └── 0 external dependencies for the CLI (pure Python stdlib)
```

The architecture evolved three times during the session (Node.js DOM
manipulation → Node.js injection → Python injection), driven by the human's
insight that client-side injection eliminates the need for server-side DOM
manipulation entirely.

---

## Reproducibility

Any new AI agent session can pick up exactly where this one left off:

```bash
pip3 install sg-send-cli
sgit clone --base-url https://dev.send.sgraph.ai <vault-key>
cd <vault-dir>
pip install -r requirements.txt
python3 -m pytest tests/ -v        # 62 tests pass
python3 -m mitm_tool.cli --help    # ready to work
```

No briefing document. No context window stuffing. No "here's what we did
last time." The code is the context. The tests are the specification.
The commit history is the conversation record.

---

## The Security Layering

```
  ┌────────────────────────────────────────────────────────────────┐
  │  Layer 1: Network isolation                                    │
  │  Agent can only reach domains on an explicit allowlist.        │
  │  Cannot phone home, cannot exfiltrate to arbitrary hosts.      │
  ├────────────────────────────────────────────────────────────────┤
  │  Layer 2: Vault scoping                                        │
  │  Vault key grants access to ONE vault. Access token grants     │
  │  write to ONE vault. No lateral movement to other vaults.      │
  ├────────────────────────────────────────────────────────────────┤
  │  Layer 3: Branch isolation                                     │
  │  Agent writes to its own clone branch only. Cannot modify      │
  │  main or other branches. Merge is a human decision.            │
  ├────────────────────────────────────────────────────────────────┤
  │  Layer 4: Per-branch PKI                                       │
  │  Clone branch has its own key pair. Private key stays local.   │
  │  Commits are cryptographically signed. Can't impersonate.      │
  ├────────────────────────────────────────────────────────────────┤
  │  Layer 5: Zero-knowledge server                                │
  │  SG/Send stores only ciphertext. Server compromise reveals     │
  │  nothing — no code, no file names, no commit messages.         │
  ├────────────────────────────────────────────────────────────────┤
  │  Layer 6 (future): File-level PKI encryption                   │
  │  Individual files encrypted for specific recipients' public    │
  │  keys. Agent can only decrypt files it was given access to.    │
  │  Enforced by cryptography, not policy.                         │
  └────────────────────────────────────────────────────────────────┘
```

---

## Conclusion

The SG/Send vault model provides something that none of the current
alternatives offer: **scoped, encrypted, auditable, revocable code
collaboration with AI agents — without trusting the agent with anything
beyond the project files.**

It's not about whether AI agents are trustworthy. It's about building
systems where trust isn't required.

```
  ┌────────────────────────────────────────────────────────────┐
  │                                                            │
  │   The best security model is the one where a compromised   │
  │   agent can only damage the one thing it was working on    │
  │   — on its own branch, signed with its own key —           │
  │   and everything it did is in the commit log.              │
  │                                                            │
  └────────────────────────────────────────────────────────────┘
```

---

*Case study written during the session it describes.*
*All code referenced is in the shared vault on dev.send.sgraph.ai.*
