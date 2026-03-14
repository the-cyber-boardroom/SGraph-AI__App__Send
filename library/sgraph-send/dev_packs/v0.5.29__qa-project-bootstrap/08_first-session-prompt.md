# First Session Prompt

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Copy-paste this into the first Claude Code session for the QA project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **SG/Send QA Automation**.

This is a standalone project (separate repo) that tests the SG/Send encrypted file sharing platform via headless browser automation and generates living documentation from the screenshots captured during test runs.

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/README.md` — index of all bootstrap documents
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/01_project-context.md` — what SG/Send is
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/02_mission-brief.md` — your mission and deliverables
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/04_practices-reference.md` — coding practices to follow
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/06_what-to-clone.md` — what to copy from the main repo

Also read the role definitions:
8. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/03_role-definitions/qa-lead.md`
9. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/03_role-definitions/architect.md`
10. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/03_role-definitions/developer.md`

And the research that informed tool decisions:
11. `/tmp/sgraph-send-ref/team/roles/architect/reviews/02/22/v0.5.29__research__browser-automation-tool-evaluation.md` — Playwright vs agent-browser evaluation
12. `/tmp/sgraph-send-ref/team/roles/dev/reviews/02/22/v0.5.29__review__qa-project-bootstrap-pack.md` — feasibility and technical decisions

Also read the CLAUDE.md files to understand the conventions this project inherits:
13. `/tmp/sgraph-send-ref/.claude/CLAUDE.md` — global project conventions
14. `/tmp/sgraph-send-ref/.claude/explorer/CLAUDE.md` — Explorer team conventions (this QA project operates as Explorer)

## Step 2: Create the new repo

After reading all documents, your first task is:

1. Create the `sg_send-qa` repo structure as described in `05_technical-bootstrap-guide.md`
2. Create a `.claude/CLAUDE.md` for the new repo (adapt from the SG/Send conventions — see the bootstrap pack's `09_claude-md-review.md` for what to keep, adapt, and skip)
3. Follow Phase 1 of the technical bootstrap guide
4. Get the first browser test running (Phase 2)

You are operating as the **Explorer team** with 6 roles: QA Lead, Architect, Developer, DevOps, Librarian, Sherpa. The QA Lead drives priorities. Start with the Architect and Developer to set up infrastructure.

**Key decision already made:** Use **Playwright for Python** as the primary browser automation tool. The Architect evaluation is in the research document above.
```
