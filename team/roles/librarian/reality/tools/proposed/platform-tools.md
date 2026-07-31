# Tools — Proposed: Platform Tools

**Domain:** tools/proposed/ | **Last updated:** 2026-07-30 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

This file covers tools platform infrastructure, distribution, terminal interfaces, email on vaults,
and backup systems. These are not end-user browser tools — they are operational and distribution
layer proposals.

---

## Infrastructure / IFD (Section 22 — Tools team arch brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Per-tool IFD chains (`tools/{tool-name}/v0/...`) — replace monolithic tools path with per-tool IFD versioning | Section 22 | PROPOSED |
| `site.json` navigation registry — site entity with navigation sections, grouping, dependency graph | Section 22 | PROPOSED |
| DAG dependency verification script — validate no circular load-time imports across entity manifests | Section 22 | PROPOSED |
| Fractal IFD generalised to send.sgraph.ai — Send as site entity with own `site.json` | Section 22 | PROPOSED |

---

## Social Previews and Vault Rendering (05/14 briefs — docs 388, 391)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Dynamic social previews for public vaults — OG meta tags + Twitter Card tags for vault URLs; crawler-detected; cached per vault version | doc 388 | PROPOSED |
| Preview sidecar service — user-agent detection for social crawlers (WhatsApp, Facebook, Twitter, LinkedIn, Slack) + dynamic OG image generation | doc 388 | PROPOSED |
| og-config.json author configuration — author-placed file in vault root to override social preview defaults | doc 388 | PROPOSED |
| Vault rendering: bare-metal mode — published vaults bypass iframe wrapper; vault HTML calls backend directly via same-origin shim | doc 391 | PROPOSED |
| Bootstrap script for bare-metal rendering — < 1KB script injecting `window.SG.vault` API surface (get, put, list, commit, subscribe) | doc 391 | PROPOSED |

---

## Audio Tool Distribution — Release Shell (06/15 briefs, v0.33.27)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-229 | SG API secrets with TTL and usage count | Daily OpenRouter keys distributed as SG API secrets; time-to-live (hours/days) + usage count cap; minted from admin vault; uses existing SG API secrets capability | 06/15 dev-brief (audio-transcript-tool-release) |
| P-230 | Bring-your-own-or-early-adopter-key UI | Key acquisition choice at tool entry: enter your own OpenRouter key OR use a shared early-adopter key (the SG API secret); two-path entry point | 06/15 dev-brief (audio-transcript-tool-release) |
| P-231 | Three-component hosting via vault-powered-websites | tools site (raw component dev) → embedding vault (themes/layouts/languages) → sgraph.ai path at `/en-gb/tools/audio-transcriber`; agent-controlled; applies vault-powered-websites pattern | 06/15 dev-brief (audio-transcript-tool-release) |
| P-232 | Two-vault split: admin vault + observability vault | Admin vault: key minting and early-adopter key management; observability vault: append-mode usage logs (page opens, executions, country; no PII); separate vaults, separate roles | 06/15 dev-brief (audio-transcript-tool-release) |
| P-233 | Audio tool release phase | Documentation, use cases, descriptions, observability in place on sgraph.ai; the full release, not just the tool working | 06/15 dev-brief (audio-transcript-tool-release) |
| P-234 | Real-time transcription feature | Continuous capture mode (not just file upload); ongoing transcription as audio is captured; builds on `sg-audio-transcription` WASM component (itself PROPOSED) | 06/15 dev-brief (audio-transcribe-experience) |
| P-235 | Self-describing JS API | JS API that describes itself for agentic support and agentic documentation; enables an agent to understand available execution flows without manual docs | 06/15 dev-brief (audio-transcribe-experience) |
| P-236 | Four-to-six simple transcription scenarios | Defined, documented, and testable scenarios covering the key use cases for the audio transcribe tool | 06/15 dev-brief (audio-transcribe-experience) |
| P-237 | Key acquisition UI: four user journeys | Enter your own key; create one guided (OpenRouter account creation); retrieve from password manager; use a provided SG key resolved through SG/Send | 06/15 dev-brief (openrouter-key-acquisition) |

---

## TUI API — Structured Surface for Text UIs (05/17 briefs — Day 67, docs 442–443)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-202 | TUI API: core concept and 7 API surfaces | Development sequence: capability→CLI→TUI→Web API→Web UI; 7 surfaces (status, list, get, invoke, subscribe, stream, reflect); TUI-of-TUIs fractal; LLM-consumable; structured output not human text | doc 442 |
| P-203 | TUI API extensions (IAM, memfs, orientation) | Multiple TUI APIs per tool; native IAM least-privilege (per-action, vs MCP all-or-nothing); orientation endpoint (now-what?); change-control as first-class surface; memfs virtual filesystem (skills.md/changelog loaded on demand) | doc 443 |

---

## SG/Edge TUI — Visually-Rich Terminal Interface (05/17 briefs — Day 67, docs 440–441)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-200 | SG/Edge rich TUI (Textual + Rich) | Visually-rich TUI for SG/Edge operations; Textual + Rich recommended over Bubble Tea + Lipgloss; SSH/SSM/docker exec compatible; locale/TERM/terminfo design constraints addressed | doc 440 |
| P-201 | Five prototype SG/Edge TUI screens | Deployment reality, topology, local-vs-edge-vs-deployed, slug detail, live event stream; ASCII mockups defined; 5–7 days of work; promotes one to canonical after use | doc 441 |

---

## SG Labs Admin Interface (05/17 briefs — Day 67, doc 436)

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

---

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

---

## Voice Note Transcription Tool (07/27 briefs — docs 863–864, v0.33.52)

**PROPOSED — does not exist yet.** First SGraph product entering the market. Architecture brief + strategy brief + contract draft (27 July 2026). The product does one job in one pass: audio in, transcript + analysis + debrief + optional infographic out. No backend. OpenRouter handles inference and billing via per-user keys with spend caps.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-VNT-001 | Voice note transcription tool (web + iOS + Android) | WhatsApp voice memo transcription tool; one repo, three targets, two-branch CI (dev/main → dev-estate/production); no backend (static hosting on GitHub Pages / S3 + CloudFront); one-pass pipeline (audio → transcript + analysis + debrief + optional infographic); OpenRouter per-user key carries spend cap and handles billing; 90-day commercial term from 1 August 2026 | 07/27 arch-brief + strategy-brief |
| P-VNT-002 | OpenRouter per-user key provisioning Lambda | Single Lambda function provisioning OpenRouter keys with spend caps (75% of net receipts after processor fee); deferred past beta; beta users get a hardcoded capped key embedded in client — must carry hard cap, short lifetime, easy revocation before any key ships | 07/27 arch-brief |
| P-VNT-003 | Privacy mode selector (routed / restricted / browser-local) | Three-tier privacy UX: (1) routed default — any OpenRouter provider, cheapest, no processor guarantee; (2) restricted — named providers only, higher price; (3) browser-local — on-device model, nothing leaves device, possibly free; privacy tier and billing tier are the same selector | 07/27 arch-brief |
| P-VNT-004 | Browser-local transcription mode | On-device speech-to-text model running entirely in browser; genuinely private (no network calls for inference); quality/hardware constraints not yet specified; possibly free tier | 07/27 arch-brief |
| P-VNT-005 | Format detection by content (Opus/Ogg and AAC/M4A) | Client detects audio codec by content (magic bytes / codec header), not file extension; Opus in Ogg is the norm (WhatsApp native, 48kHz mono); AAC in M4A is the narrower path (iPhone app-to-app forwarding); both must be accepted; modern browsers decode both natively | 07/27 arch-brief |
