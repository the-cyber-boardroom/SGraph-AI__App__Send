# Tools — Proposed Items Index

**Domain:** tools/proposed/ | **Last updated:** 2026-05-24 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## Video Editing

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Video Editor Expansion | Multiple tracks, captions, masking, keyframes, non-destructive JSON transform model, undo/redo | Section 18 |
| `sg-local-storage` Web Component | IndexedDB persistence, capacity management, viewer; reusable across tools | Section 18 |
| Video crop/overlay/capture tools | Three tools for video editing workflows | Section 30 |
| Video Playback Component | Playback component for recorded/uploaded video | Section 23 |
| Video Generation | AI-assisted video generation tool | Section 23 |

## Infographic Generator v0.1.1

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Simple/document/multi-doc/template/advanced modes | Five distinct input modes for the infographic tool | Section 20 |
| 5+ pre-built templates | Executive summary, tech architecture, timeline, comparison, process flow | Section 20 |
| Model comparison side-by-side | Same prompt to multiple models simultaneously | Section 20 |
| Gallery + "Remix this" on website | Example infographics gallery with one-click remix | Section 20 |

## LLM Component Family (sg-llm)

| Component | One-Line Description | Monolith Section |
|-----------|---------------------|-----------------|
| `sg-llm-connection` | Provider/key/model selector UI | Section 19 |
| `sg-llm-reality` | Reality constructor — build model's complete context visually | Section 19 |
| `sg-llm-output` | Streaming response display component | Section 19 |
| `sg-llm-stats` | Token counts, cost estimate, speed metrics | Section 19 |
| `sg-llm-debug` | Full request inspector (request + response JSON, timing) | Section 19 |
| `sg-llm-bundle` | Execution bundle manager (save/load/replay, fork tree) | Section 19 |
| `sg-llm-bundle-list` | Bundle browser UI (time travel through saved requests) | Section 19 |
| `sg-llm-attachments` | File drop, clipboard paste, image/file cache | Section 19 |

## Agentic LLM Component Suite

| Component | One-Line Description | Monolith Section |
|-----------|---------------------|-----------------|
| `sg-tool-definition` | Visual editor for JSON tool schemas with validation | Section 21 |
| `sg-json-sender` | Structured JSON construction with schema-aware input | Section 21 |
| `sg-json-receiver` | Auto-detect text/tool_call/JSON; tree viewer; diff view | Section 21 |
| `sg-tool-runner` | Tool registration API; execute on tool_call; return results | Section 21 |
| `sg-agentic-loop` | Full agentic orchestration with max iterations, cost budget, human gate | Section 21 |
| `sg-sandbox` (JS) | Sandboxed iframe + Web Worker; timeout; memory limits | Section 21 |
| `sg-sandbox` (Python) | Pyodide WASM in Web Worker; same security as JS sandbox | Section 21 |

## Composite Tools

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Document-Driven Analysis | Drop document → summary + infographic + briefing in one click | Section 20 |
| Patch Review Component (`sg-patch-review`) | Visual diff viewer, agent manifests, approval status tracking | Section 20 |
| Multi-Agent Chat UI | Agent picker sidebar, multi-ask mode, debate mode, consolidator agent | Section 20 |
| Model Chooser Web Component | Standalone model selector with categories, cost, history | Section 20 |
| Attachment Manager Web Component | Standalone drag-drop, clipboard paste, preview component | Section 20 |
| sg-git-graph Web Component | Interactive vault/git commit graph with zoom, pan, time slider | Section 20 |
| One-Shot LLM Development Environment | Visual IDE with context/code/preview/LLM zones | Section 19 |

## Infrastructure / IFD

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Per-tool IFD chains (`tools/{tool-name}/v0/...`) | Replace monolithic tools path with per-tool IFD versioning | Section 22 |
| `site.json` navigation registry | Site entity with navigation sections, grouping, dependency graph | Section 22 |
| DAG dependency verification script | Validate no circular load-time imports across entity manifests | Section 22 |
| Fractal IFD generalised to send.sgraph.ai | Send as site entity with own `site.json` | Section 22 |

## WASM Tools

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| `sg-wasm` shared component | WASM lifecycle: download, IndexedDB cache, hash validation, offline | Section 19 |
| `sg-audio-transcription` | Whisper WASM two-pass transcription with timestamps, SRT/VTT export | Section 19 |
| Audio tool (capture) | Browser-based audio capture tool | Section 23 |
| `sg-public-viewer` | Web Component for public vault content viewing | Section 17 |
| News Report Tool | Sonar API integration for automated news report generation | Section 24 |

---

## Social Previews and Vault Rendering (05/14 briefs — docs 388, 391)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Dynamic social previews for public vaults | OG meta tags + Twitter Card tags for vault URLs; crawler-detected; cached per vault version | doc 388 |
| Preview sidecar service | User-agent detection for social crawlers (WhatsApp, Facebook, Twitter, LinkedIn, Slack) + dynamic OG image generation | doc 388 |
| og-config.json author configuration | Author-placed file in vault root to override social preview defaults | doc 388 |
| Vault rendering: bare-metal mode | Published vaults bypass iframe wrapper; vault HTML calls backend directly via same-origin shim | doc 391 |
| Bootstrap script for bare-metal rendering | < 1KB script injecting `window.SG.vault` API surface (get, put, list, commit, subscribe) | doc 391 |

## Infographic Tool v2 (05/14 brief — doc 390)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Infographic tool v2 — pre-auth payment integration | Cost-visible submit UI with Stripe pre-auth hold; replaces bring-your-own-key model | doc 390 |
| Session asset tray | Thumbnail history of generated infographics per session; iteration history; prompt recall | doc 390 |
| Curated model picker (3 tiers) | Fast/cheap, balanced, high-quality — hides raw model IDs from users | doc 390 |
| Visible/editable system prompt with presets | System prompt shown and editable; saveable as named presets | doc 390 |
| Variant grid | 2-3 simultaneous generations per submit for easy comparison | doc 390 |

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 17–32)*

---

## TUI API — Structured Surface for Text UIs (05/17 briefs — Day 67, docs 442–443)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-202 | TUI API: core concept and 7 API surfaces | Development sequence: capability→CLI→TUI→Web API→Web UI; 7 surfaces (status, list, get, invoke, subscribe, stream, reflect); TUI-of-TUIs fractal; LLM-consumable; structured output not human text | doc 442 |
| P-203 | TUI API extensions (IAM, memfs, orientation) | Multiple TUI APIs per tool; native IAM least-privilege (per-action, vs MCP all-or-nothing); orientation endpoint (now-what?); change-control as first-class surface; memfs virtual filesystem (skills.md/changelog loaded on demand) | doc 443 |

## SG/Edge TUI — Visually-Rich Terminal Interface (05/17 briefs — Day 67, docs 440–441)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-200 | SG/Edge rich TUI (Textual + Rich) | Visually-rich TUI for SG/Edge operations; Textual + Rich recommended over Bubble Tea + Lipgloss; SSH/SSM/docker exec compatible; locale/TERM/terminfo design constraints addressed | doc 440 |
| P-201 | Five prototype SG/Edge TUI screens | Deployment reality, topology, local-vs-edge-vs-deployed, slug detail, live event stream; ASCII mockups defined; 5-7 days of work; promotes one to canonical after use | doc 441 |

## SG Labs Admin Interface (05/17 briefs — Day 67, doc 436)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-196 | SG Labs admin interface | Management for predetermined labs; 6 UI surfaces; 8 lifecycle states (cold/standby/provisioning/waiting-for-dns/ready/live/stopping/archived); Simple Token access control; templates as vault collections; first 5 labs named; TXT-records settled | doc 436 |

---

## SG Mail — Email Client on Vaults (05/16 briefs — doc 426)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-175 | SG Mail email client on vaults | Vault is system of record for EML files; vault client is the UX; NOT building email infrastructure | doc 426 |
| P-176 | AWS SES inbound connector | SES receives → drops to S3 → S3 event trigger Lambda → read EML → write to vault via email-fs | doc 426 |
| P-177 | AWS SES outbound connector | Vault compose UI → outbound service → SES API → recipient; DKIM/SPF managed by SES | doc 426 |
| P-178 | Email web app UI | Inbox, folders, thread view, compose, reply/forward, search, contacts, attachments, mobile-responsive | doc 426 |
| P-179 | WorkMail migration tool | Reads mbox/maildir export; parses each EML; commits to vault via email-fs | doc 426 |
| P-180 | Multi-provider backup for email vault | Cross-account S3 (Tier 1) + non-AWS provider (B2 or R2) (Tier 5) | doc 426 |
| P-181 | Cloudflare Email Service connector (v2) | Cloudflare Email Routing → Workers → POST EML to vault; agent-native positioning | doc 426 |
| P-182 | Gmail API connector (v2) | OAuth-based read + mirror of Gmail into vault; optional bidirectional sync | doc 426 |

## Backup and Restore Infrastructure (05/16 briefs — doc 427)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-183 | Backup mini-app with sg-backup-operations vault | Dedicated vault + worker EC2; UI + JS API + audit trail; dogfoods vault-as-mini-app pattern | doc 427 |
| P-184 | Seven-tier backup storage strategy | Same-account S3 → cross-account S3 → S3-IA → Glacier → multi-provider → offline archive | doc 427 |
| P-185 | Separate AWS backup account with write-only IAM | Ransomware in account A cannot delete backups in account B; Organizations sub-account | doc 427 |
| P-186 | Daily automated restore drill | Random vault → scratch environment → hash compare → result committed to backup vault | doc 427 |
| P-187 | Weekly full-restore + quarterly DR drill | Full vault inventory restore to fresh AWS account; quarterly tabletop exercise | doc 427 |
| P-188 | Scheduled Claude Code backup health-check sessions | Agentic workflow: reads backup vault JS API; alerts on stale or failed backups | doc 427 |
| P-189 | Backblaze B2 as first multi-provider backup target | S3-compatible; $6/TB-mo; backup-focused; validates multi-provider architecture | doc 427 |
