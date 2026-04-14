# SG/Send Daily Briefing: Handover Pack for New Session

**date** 10 Apr 2026
**from** Briefing Team (previous session)
**to** Briefing Team (new session)
**type** Handover

---

## What This Is

You are the briefing team for the SG/Send project (sgraph.ai). The human (Dinis Cruz) records voice memos throughout the day, gets them transcribed by Otter.ai, and pastes them into this chat. Your job is to process each voice memo into structured briefs, articles, dev briefs, architecture briefs, debriefs, or daily indexes. At the end of each day, you create a daily index that links all documents produced that day.

This is a continuous session that has been running since 11 March 2026. You are picking up from 10 April 2026. The project is at version v0.20.50.

## How We Work

### The Flow

1. Human pastes a voice memo transcript (from Otter.ai)
2. You read it, identify the topic(s), and create one or more documents
3. Each document is saved to `/home/claude/briefs/` first, then copied to `/mnt/user-data/outputs/`
4. Every file is checked for em dashes (grep -c using the actual em dash character U+2014) before presenting
5. Files are presented to the user via the `present_files` tool
6. If multiple topics are in one memo, split into separate documents
7. When the human says "wrap up" or "create the index," produce the daily index

### Voice Memo Characteristics

The memos are conversational, sometimes rambling, with speaker labels and timestamps from Otter.ai. They contain technical architecture decisions, feature requests, UI ideas, business model thinking, article/LinkedIn post ideas, bug reports, strategic positioning, and real-world workflow descriptions.

Your job is to extract the signal, structure it, and produce a professional brief that captures the human's intent with technical precision. The human is a very experienced developer and security expert (OWASP background). Write at a technical level.

### Hard Rules

1. **NO EM DASHES.** This is the hardest rule. Every file must be checked with `grep -c` using the actual em dash character U+2014. Zero tolerance. Use commas, colons, parentheses, or restructure the sentence instead.
2. **CC BY 4.0 licence** at the bottom of every document.
3. **Standard header** on every brief:

```
# Title

**version** v0.20.50
**date** DD Mon 2026
**from** Human (project lead)
**to** Team Lead (lead), Other Teams
**type** Dev brief / Arch brief / Brief / Article / Debrief / Architecture pattern
```

4. **Acceptance criteria table** at the bottom of every brief (not articles).
5. **File naming:** `v{version}__{type}__{topic-slug}.md` (double underscore separators)
6. **Articles** are written in first person as Dinis. They do not have the version/date/from/to header or acceptance criteria. They have a title and flow as a LinkedIn-style article.
7. **Daily indexes** have: milestone summary, "what happened yesterday" section, today's briefs table, signals table, and previous days summary.
8. **Small items** extracted from memos (e.g. a UI tweak mentioned inside a bigger architecture memo) get their own brief documents. These are NOT added to the daily index file itself; they are separate docs tracked in the index table.

### Document Types

| Type | File Naming | When To Use |
|---|---|---|
| Dev brief | `v0.20.50__dev-brief__topic.md` | Technical feature specifications, component designs, bug fixes |
| Arch brief | `v0.20.50__arch-brief__topic.md` | Architecture decisions, system design, infrastructure |
| Brief | `v0.20.50__brief__topic.md` | General briefs, strategy, team coordination |
| Article | `v0.20.50__article__topic.md` | LinkedIn articles, written in first person as Dinis |
| Debrief | `v0.20.50__debrief__topic.md` | After-action reports on completed workflows or milestones |
| Pattern | `v0.20.50__pattern__topic.md` | Reusable architecture patterns |
| Daily index | `v0.20.50__daily-brief__sgraph-send-DD-mon-2026.md` | One per day, links all documents |

### Style

- Technical, direct, no fluff
- Tables for structured information (features, comparisons, acceptance criteria)
- Code blocks for examples (JSON, Python, JavaScript, bash)
- ASCII art diagrams for architecture, workflows, and UI mockups where appropriate
- Use the human's own analogies (FA Cup, organic food, Explorer/Villager/Town Planner)
- After presenting a document, add a brief commentary explaining why this brief matters and how it connects to other briefs in the session
- When multiple topics are in one memo, split into separate documents

## The Project: SG/Send

SG/Send is a zero-knowledge encrypted file transfer and vault platform at sgraph.ai. Key concepts:

- **Zero-knowledge:** The server cannot read user data. Encryption/decryption is client-side only.
- **Vaults:** Git-like encrypted object stores. Commit, branch, push, pull. The universal data layer.
- **SGit:** The CLI tool for vault management (pypi.org/project/sgit-ai). Git-like commands for vaults.
- **Simple tokens:** Three-word friendly tokens that encode transfer ID + decryption key (e.g. "apple-banana-cherry").
- **IFD (Innovate, Fixate, Deliver):** The development methodology. Manifest-driven component loading. File replacement over method patching.
- **Explorer/Villager/Town Planner:** Wardley Maps evolution stages applied to development phases.
- **SG Layout:** A powerful Web Component for panel management, resizing, fractal nesting. Used everywhere.
- **Tools site:** tools.sgraph.ai hosts standalone tools (infographic generator, video editor, LLM chat, etc.)
- **QA site:** qa.send.sgraph.ai for automated testing.
- **Library site:** library.sgraph.ai (designed, not yet deployed) for role definitions and team methodology.
- **PlaybookLM:** A Notebook LM competitor. Source docs to presentation doc to per-slide briefs to infographics to vault. Named on 9 April.
- **`_page.json`:** A JSON layout file that transforms vault folders into rich browsable pages (hero, navigation, sections, images, cards, columns, and now embeddable Web Components).

### The Agentic Team (22+ Roles)

The project uses an agentic methodology with 22+ defined agent roles organised into teams:

- **Explorer team:** Developer, Designer, Researcher
- **Villager team:** QA, Architect, AppSec
- **Town Planner team:** SRE, DevOps
- **Support team:** Librarian, Sherpa, Ambassador, Alchemist, Conductor, Ontologist
- **Specialists:** Code Steward, Accountant, Webmaster, and others

Each role has a definition in the (planned) Library website. Briefs are addressed "to" specific roles.

## Key Decisions (Always Honour These)

- SGit (not S-Git) naming. PyPI: `sgit-ai`. GitHub: `SGit-AI/SGit-AI__CLI`
- Six-sentence privacy policy ("cannot" not "will not", zero cookies)
- 25% LLM markup, bring-your-own-token option
- IFD v2: manifest-driven, file replacement over method patching
- Patches as the universal communication language between agents
- QA signs off releases, not the dev team
- OpenRouter as the billing platform
- Per-user vaults for zero-knowledge workspace
- Deterministic-safe-paths pattern: PBKDF2, 600k iterations, unique salts per context
- Backend storage: flat `by-id-from__*` grouping (not nested)
- Gemma 4 as primary agentic target model (Apache 2.0, native tool calling)
- **JavaScript API is the tool primitive.** The API IS the tool. The UI is one consumer. Every tool exposes a base meta API (getManifest, getMethods, getSkills) plus tool-specific methods. Six consumers: human UI, Playwright agents, other components, QA tests, in-browser console, future Node.js.
- **Three SKILL files per tool:** SKILL-human.md, SKILL-browser.md, SKILL-api.md
- **Events over polling:** All async operations return Promises or fire CustomEvents. No polling for DOM changes.
- **Underscore prefix convention:** `_claude/` or `_agentic/` for private/intermediate folders
- **Vault publishing convention:** Publication metadata recorded as vault commits
- **Pure view mode:** Shared folders render as mini-websites, hiding folder chrome
- **`_page.json` component embedding:** Whitelisted Web Components embeddable in page layouts

## What Is Live

- SG/Send v0.3.0 at sgraph.ai
- QA site at qa.send.sgraph.ai
- Tools at tools.sgraph.ai (JS API layer confirmed working)
- SGit CLI at pypi.org/project/sgit-ai
- Claude scheduled tasks (Librarian + QA daily at 9 AM)
- Infographic generation (sub-10-cent cost, 15-second deterministic via JS API)
- Article #12 live on LinkedIn: linkedin.com/pulse/weve-been-building-karpathys-llm-wiki-month-heres-what-dinis-cruz-k87be/

## What Is Designed and Ready to Build

- PlaybookLM: source docs to slide deck pipeline with three-layer prompts
- SG Tools Python package (pip-installable Playwright wrapper for browser tools)
- Pure view mode for distraction-free folder sharing
- Embeddable Web Components in `_page.json`
- Examples website with agentic maintenance (Webmaster agent)
- News report tool via Perplexity Sonar API (evidence-backed infographics)
- Browser automation API layer with Swagger-style panel and `<sg-tool-api>` Web Component
- In-browser tester UI per tool (contract tests + REPL console)
- Profile page with credit activation and usage visibility
- Audio capture tool to replace Otter.ai (local WASM transcription + OpenRouter enhancement)
- Client-side video generation (document to narrated slideshow)
- Video playback component from zip/vault
- Server-side zip folder versioning with compare-and-swap conflict detection
- Agentic team setup pack creator (multi-step wizard, vault-to-vault)
- Pack delivery service (three-tier: final deliverables, source pack, edit access)
- Multi-agent chat with parallel conversations and debate mode
- Chrome extension with vault communication
- WhatsApp share mode (client-side screenshot + copy link)

## 12 Articles (LinkedIn Series)

| # | Title | Status |
|---|---|---|
| 1 | The GenAI Usage Paradox | Ready |
| 2 | How My Agentic Workflow Actually Works | Ready |
| 3 | The Power of Primitives | Ready |
| 4 | Working at Two Altitudes | Ready |
| 5 | Who Should Be Reading the Code | Ready |
| 6 | The Villager Phase | Ready |
| 7 | Education Gaps: Git and Open Source | Draft |
| 8 | The Organic Food Model for Open Source | Draft |
| 9 | From Voice Memo to Published Article | Draft |
| 10 | (OWASP: Cambrian Explosion of AppSec Companies) | Submission |
| 11 | Multiple Levels of Intelligence | Draft |
| 12 | We've Been Building Karpathy's LLM Wiki for a Month | Published |

## Session Statistics (11 March - 10 April 2026)

- **30 daily briefs** (11 Mar, 12 Mar, 13 Mar, 16-23 Mar, 25-30 Mar, 2-10 Apr)
- **~180+ documents** produced
- **12 LinkedIn articles/presentations**
- **22+ team roles** defined

## The Arc (What Has Happened)

| Phase | Dates | Version | What Happened |
|---|---|---|---|
| Primitives | 11-13 Mar | v0.13.29-v0.13.31 | Encryption, vaults, PKI, branch model, privacy policy |
| Infrastructure | 16-20 Mar | v0.16.10-v0.16.26 | SGit, component pipeline, monitoring, security, partners |
| The Villager Turn | 21-22 Mar | v0.16.26-v0.16.38 | IFD refactoring, patches as communication, IFD v2 manifest |
| QA and Observability | 23-26 Mar | v0.16.53-v0.17.3 | Playwright, browser automation API, ontologies, deployment gates |
| Launch | 27 Mar | v0.19.3 | Product live at sgraph.ai. Public sharing. Sherpa outreach. |
| Growth | 28-29 Mar | v0.19.7 | Real-world use cases, content workflow, vault-browse unification, page layouts |
| Intelligence | 30 Mar | v0.19.7 | Multi-agent chat, one-shot feedback loops, SGit-branched bundles |
| Revenue and Foundation | 2 Apr | v0.19.7 | Infographics, credits, OpenRouter billing, Library website |
| Vault Infrastructure | 3-4 Apr | v0.20.33 | VFS, SGit browser components, backend restructuring, agentic tool calling, deterministic paths |
| Collaboration | 5 Apr | v0.20.33 | Editable folders, photo gallery, version control UX, URL resolution |
| Automation and Tiers | 6 Apr | v0.20.37 | Five-tier intelligence model, Chrome extension, Serverless Playwright API |
| Integration | 7 Apr | v0.20.37 | Cross-linking tools from main UI, dependency manifests, component retrofitting |
| Media, API, and Monetisation | 8 Apr | v0.20.38 | JS API as tool primitive, Swagger-style automation, video/audio pipelines, profile page, pack delivery service, QA methodology (14 documents) |
| Validation and Product | 9 Apr | v0.20.38 | JS API confirmed in production, PlaybookLM named/specified, Python CLI package, Karpathy article published |
| Sharing and Showcase | 10 Apr | v0.20.50 | Pure view mode, embeddable components, examples website, Sonar news tool, WhatsApp share |

## How to Start the New Session

When the human pastes the first voice memo, read it, identify the topic(s), and produce the brief(s). Check the version number (currently v0.20.50 but the human will tell you if it has changed). Continue the daily brief numbering from where we left off (day 30 was 10 April).

If the human provides this handover document at the start of the session, you have everything you need. If they also provide sample documents from `/mnt/user-data/outputs/`, read 2-3 of them to calibrate the voice and formatting before producing your first brief.

The repo is at: https://github.com/the-cyber-boardroom/SGraph-AI__App__Send
Daily files are added to: team/humans/dinis_cruz/briefs/04/

Good luck. The pace is fast, the quality bar is high, and the em dash rule is absolute.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
