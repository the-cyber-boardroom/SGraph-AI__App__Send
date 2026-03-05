# Technical Bootstrap Guide

**Version:** v0.11.12
**Purpose:** Step-by-step instructions for setting up the sgraph_ai__tools repo from scratch.

---

## Phase 0: Prerequisites

Before starting, clone the SG/Send main repo for reference (read-only):

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

You need this to:
- Copy source code for module extraction (crypto.js, api-client.js, etc.)
- Read the architecture and briefing briefs
- Reference the existing component patterns (workspace-shell, send-upload, etc.)

---

## Phase 1: Repo Skeleton (DO THIS FIRST)

### 1.1 Create Repo Structure

```
sgraph_ai__tools/
├── .claude/
│   ├── CLAUDE.md                      # Main project guidance (from template)
│   └── explorer/
│       └── CLAUDE.md                  # Explorer team session instructions
├── .github/
│   └── workflows/
│       ├── deploy.yml                 # Reusable base (test → S3 → CloudFront)
│       ├── deploy__dev.yml            # Dev trigger
│       └── deploy__main.yml           # Main trigger (production)
├── core/
│   └── crypto/
│       ├── v1.0.0/
│       │   └── sg-crypto.js           # First extracted module
│       └── latest/
│           └── sg-crypto.js           # Copy of v1.0.0
├── components/
│   └── header/
│       ├── v1.0.0/
│       │   ├── sg-header.js
│       │   └── sg-header.css
│       └── latest/
│           ├── sg-header.js
│           └── sg-header.css
├── tools/
│   ├── index.html                     # Landing page
│   ├── tools-common.css               # Shared styling
│   ├── ssh-keygen/
│   │   └── index.html
│   └── video-splitter/
│       ├── index.html
│       ├── video-splitter.js
│       └── video-splitter.css
├── briefs/
│   └── BRIEF_PACK.md                  # Session bootstrap (10 sections)
├── team/
│   ├── explorer/
│   │   ├── architect/
│   │   │   ├── README.md
│   │   │   ├── ROLE__architect.md
│   │   │   └── reviews/
│   │   ├── dev/
│   │   │   ├── README.md
│   │   │   ├── ROLE__dev.md
│   │   │   └── reviews/
│   │   ├── designer/
│   │   │   ├── README.md
│   │   │   ├── ROLE__designer.md
│   │   │   └── reviews/
│   │   ├── devops/
│   │   │   ├── README.md
│   │   │   ├── ROLE__devops.md
│   │   │   └── reviews/
│   │   ├── librarian/
│   │   │   ├── README.md
│   │   │   ├── ROLE__librarian.md
│   │   │   ├── reviews/
│   │   │   └── reality/
│   │   │       └── v0.1.0__what-exists-today.md
│   │   └── historian/
│   │       ├── README.md
│   │       ├── ROLE__historian.md
│   │       └── reviews/
│   └── humans/dinis_cruz/
│       ├── briefs/                    # READ-ONLY for agents
│       ├── debriefs/
│       └── claude-code-web/
├── version                            # Contains: v0.1.0
└── README.md
```

### 1.2 Create Version File

```bash
echo "v0.1.0" > version
```

### 1.3 Create CLAUDE.md Files

Copy from `claude-md-templates/` in this dev pack:
- `CLAUDE.md` → `.claude/CLAUDE.md`
- `explorer__CLAUDE.md` → `.claude/explorer/CLAUDE.md`

### 1.4 Create Team Structure

For each of the 6 roles (architect, dev, designer, devops, librarian, historian):

1. Create directory: `team/explorer/{role}/`
2. Create `README.md` with: role name, one-line description, link to ROLE file
3. Copy `ROLE__{name}.md` from `03_role-definitions/` in this dev pack
4. Create `reviews/` directory

### 1.5 Create Initial Reality Document

```markdown
# tools.sgraph.ai — What Exists Today (v0.1.0)

**Last verified:** {date}

## Core Modules
None yet.

## Components
None yet.

## Tools
None yet.

## Tests
None yet.

## Infrastructure
- [ ] S3 bucket created
- [ ] CloudFront distribution configured
- [ ] CI/CD pipeline working
- [ ] tools.sgraph.ai resolving

## PROPOSED — Does Not Exist Yet
- crypto.js extraction (planned Phase 1)
- Video Splitter tool (planned Phase 1)
- SSH Key Generator migration (planned Phase 1)
- LLM Client tool (planned Phase 2)
- Component extraction from send/vault (planned Phase 4)
```

---

## Phase 2: Extract First Core Module (crypto.js)

### 2.1 Copy Source

From the SG/Send main repo:
```bash
# Read the source
cat /tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js
```

### 2.2 Convert to ES Module

Convert the `SendCrypto` object literal into an ES module with named exports. See `code-context.md` in this dev pack for the exact conversion.

**Key changes:**
- Remove the wrapping object literal
- Convert methods to standalone exported functions
- Replace `this.ALGORITHM` etc. with module-level constants
- Add JSDoc to every export

### 2.3 Deploy

Place at `core/crypto/v1.0.0/sg-crypto.js` and copy to `core/crypto/latest/sg-crypto.js`.

### 2.4 Verify

Open a test page and verify the import works:
```html
<script type="module">
  import { generateKey, exportKey } from '/core/crypto/v1.0.0/sg-crypto.js'
  const key = await generateKey()
  const exported = await exportKey(key)
  console.log('Key:', exported)  // Should log a base64url string
</script>
```

---

## Phase 3: Build First Tools

### 3.1 Landing Page

Create `tools/index.html` with:
- SGraph branding header
- Tool directory (cards with name, description, link)
- Privacy badge
- Footer with SG/Send link

### 3.2 SSH Key Generator

Migrate from existing implementation. Ensure it imports shared components from `components/`.

### 3.3 Video Splitter

Build as specified in `BRIEF.md` (Video Splitter Specification section). Key steps:
1. HTML structure from the UI layout spec
2. FFmpeg WASM lazy-loading
3. Fixed-length and custom segment modes
4. Time input parsing
5. Download individual clips + ZIP

---

## Phase 4: Deploy Infrastructure

### 4.1 S3 Bucket

Create bucket with:
- OAI-only access (no public)
- Versioning enabled
- Same region as send.sgraph.ai

### 4.2 CloudFront Distribution

- Domain: `tools.sgraph.ai`
- ACM cert: `*.sgraph.ai` (existing)
- Default root: `tools/index.html`
- CORS: `Access-Control-Allow-Origin: *.sgraph.ai`
- Cache behaviours as specified in `addenda/devops.md`

### 4.3 CI/CD Pipeline

GitHub Actions workflow that:
1. Detects which module changed
2. Syncs to S3 with correct cache headers
3. Invalidates CloudFront for `latest/` paths only

---

## Verification Checklist

Before declaring Phase 1 complete:

- [ ] `.claude/CLAUDE.md` exists and is comprehensive
- [ ] `.claude/explorer/CLAUDE.md` exists
- [ ] `team/explorer/` has all 6 role directories with README.md + ROLE files
- [ ] `briefs/BRIEF_PACK.md` exists with all 10 sections populated
- [ ] `team/explorer/librarian/reality/` has initial reality document
- [ ] `version` file contains `v0.1.0`
- [ ] `core/crypto/v1.0.0/sg-crypto.js` exists and works
- [ ] `tools/index.html` landing page exists
- [ ] At least one tool works (SSH keygen or video splitter)
- [ ] CDN import verification: external page can `import { generateKey } from 'https://tools.sgraph.ai/core/crypto/v1.0.0/sg-crypto.js'`
