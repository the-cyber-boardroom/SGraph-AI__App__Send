# First Session Prompt

**Version:** v0.11.12
**Date:** 5 March 2026
**Purpose:** Copy-paste this into the first Claude Code session for the tools project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **sgraph_ai__tools** — the canonical component library and tool platform for the SGraph ecosystem.

This is a standalone project (separate repo) that provides:
- **core/** — Pure JS modules (crypto, API client, LLM, video) used by all SGraph projects
- **components/** — Reusable UI elements (header, footer, upload-dropzone)
- **tools/** — Standalone browser-based tools (video splitter, SSH keygen, LLM client)

All other SGraph projects (send.sgraph.ai, vault.sgraph.ai, workspace, chrome extension) will import shared JS from tools.sgraph.ai. This is a dependency inversion — tools is the source, everything else imports from it.

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it (read-only) and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/README.md` — index of all bootstrap documents
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/BRIEF.md` — full briefing
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/architecture.md` — three-tier structure, module APIs
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/code-context.md` — source code to extract
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/06_what-to-clone.md` — what to copy from SG/Send

Also read the role definitions:
8. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__architect.md`
9. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__dev.md`
10. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__designer.md`
11. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__devops.md`
12. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__librarian.md`
13. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/03_role-definitions/ROLE__historian.md`

And the briefs:
14. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md`
15. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md`
16. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-briefing-pack.md`

And the CLAUDE.md templates:
17. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/09_claude-md-review.md`

And the source code you need to extract:
18. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`
19. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-chat/llm-chat.js`
20. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-connection/llm-connection.js`

## Step 2: Create the repo

After reading all documents, your first task is:

1. Create the sgraph_ai__tools repo structure as described in `05_technical-bootstrap-guide.md`
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md` for the new repo (from templates)
3. Create `team/explorer/{role}/` directories with README.md + ROLE__{name}.md for each of the 6 roles
4. Create `briefs/BRIEF_PACK.md` with all 10 sections populated
5. Create initial reality document at `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. Extract crypto.js from the send repo as `core/crypto/v1.0.0/sg-crypto.js` (convert to ES module with named exports)
7. Create landing page at `tools/index.html`
8. Build at least one working tool (SSH Key Generator or Video Splitter)
9. Verify CDN import works

You are operating as the **Explorer team** with 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian. Team structure first, then module extraction, then tools.

**Non-negotiable:** Vanilla JS only. No frameworks. ES modules. Named exports. JSDoc. No build step. Client-side only.
```
