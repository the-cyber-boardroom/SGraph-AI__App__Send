# Secure Send — LLM Integration, Retention, Compliance & Go-to-Market

**Version:** 1.0 DRAFT  
**Date:** February 2026  
**Parent Brief:** `secure-send-brief.md`  
**Companions:** `secure-send-roadmap.md`, `secure-send-plugins-i18n-commercial.md`  
**Repo:** `MGraph-AI__App__Secure_Send`  
**Tracking:** All items below map to Issues FS issues  

---

## 1. Executive Summary

This document captures four further expansion areas for Secure Send:

1. **LLM Integration** — client-side AI features (document summarisation, conversation, semantic graphs, slide generation, audio creation) with a zero-knowledge model. The server never sees the LLM traffic. Users bring their own API keys, use in-browser models (Gemini Nano), or connect to local Ollama instances. We can also resell API credits with markup.

2. **Retention & Ephemeral Design** — the platform is designed for ephemeral transactions. Enforce maximum retention (1/3/7 days), download limits (1/5/10 then auto-delete), and deletion-by-decryption-key-holder. This is a core design principle, not just a feature.

3. **Security, Compliance & Trust** — publish security reviews, map to compliance frameworks (GDPR, ISO 27001, SOC 2), AWS Well-Architected analysis, a DSAR page, vendor due diligence pack, and continuous security assessment by an AI security agent.

4. **Go-to-Market** — competitive analysis, naming research (current name may be taken), SEO strategy, brand state analysis, marketing brief for deeper research.

The unifying security principle remains: **the entire platform can be compromised, subpoenaed, extracted, or accessed by any entity — and there is zero privacy impact.** Data loss is possible, data exposure is not. This single design decision changes everything.

---

## 2. Core Security Principle (Restated)

Before detailing features, it's worth restating the foundational principle that governs every design decision:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  THE PLATFORM CAN BE FULLY COMPROMISED WITH ZERO PRIVACY IMPACT    │
│                                                                     │
│  ✅ Data loss is possible (files could be deleted)                  │
│  ✅ Service disruption is possible (platform could go down)         │
│  ❌ Data exposure is NOT possible (everything is ciphertext)        │
│  ❌ Data corruption is NOT possible (encrypted blobs are immutable) │
│                                                                     │
│  This means:                                                        │
│  • Server compromise → attacker gets useless ciphertext             │
│  • S3 bucket leak → attacker gets useless ciphertext                │
│  • Subpoena / legal request → we hand over useless ciphertext       │
│  • Insider threat → employee sees useless ciphertext                │
│  • Cloud provider access → they see useless ciphertext              │
│  • Bug in application → worst case: metadata exposure (IP, size)    │
│                                                                     │
│  The decryption key NEVER touches the server. Period.               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

Every feature below must preserve this property. If a feature requires the server to see plaintext content, it must run on the client or not exist.

---

## 3. Workstream: LLM Integration

### 3.1 Vision

Once a user has uploaded (or is about to download) a file, they should be able to have a conversation about it, generate summaries, create presentations, produce audio versions, build semantic graphs — all without the server ever seeing the content. The LLM processing happens entirely on the client side or via direct client-to-LLM-provider connections.

### 3.2 LLM Access Modes

| Mode | Where It Runs | Privacy | Cost to User | Notes |
|------|--------------|---------|-------------|-------|
| **In-browser (Gemini Nano)** | Browser (Chrome) | Maximum — never leaves device | Free | Requires Chrome Canary today; mainstream soon |
| **Local Ollama** | User's machine | Maximum — never leaves device | Free (user runs own hardware) | Accessed via `localhost` from browser |
| **BYOK (Bring Your Own Key)** | Client → LLM provider directly | High — server never sees traffic | User pays provider directly | OpenAI, Anthropic, OpenRouter keys |
| **Platform credits** | Client → LLM provider via proxy | High — server proxies but doesn't store | User buys credits from us (markup) | We provide the API key, bill per-use |

### 3.3 Architecture: Zero-Knowledge LLM

```
BROWSER (client-side)
  │
  ├── [User decrypts file locally]
  │
  ├── Mode A: In-browser model (Gemini Nano)
  │   └── File content → browser LLM → summary/chat ──► stays in browser
  │
  ├── Mode B: Local Ollama
  │   └── File content → localhost:11434/api/generate → response ──► stays local
  │
  ├── Mode C: BYOK (direct to provider)
  │   └── File content → api.openai.com (user's key) → response
  │       Server NEVER sees this traffic. Key stored in browser only.
  │
  └── Mode D: Platform credits (proxied)
      └── File content → our proxy → api.anthropic.com (our key) → response
          Proxy is stateless: forwards request, returns response, logs token count only.
          Content is NOT logged, NOT stored, NOT inspected.

SERVER
  │
  └── For Mode D only: token counting + credit deduction
      Logs: { token_count, model, timestamp, credit_cost }
      Does NOT log: prompt, response, file content
```

### 3.4 LLM Features (Plugins)

| Feature | Plugin | LLM Modes | Description |
|---------|--------|-----------|-------------|
| **Document Summary** | `llm-summary` | All | Generate a summary of the uploaded file |
| **Chat with Document** | `llm-chat` | All | Conversational Q&A about the document |
| **Presentation Generator** | `llm-slides` | BYOK, Credits | Create a slide deck from the document |
| **Semantic Graph** | `llm-semantic-graph` | BYOK, Credits | Build a knowledge graph (using MGraph services) |
| **HTML Graph** | `llm-html-graph` | BYOK, Credits | Create an interactive HTML visualisation |
| **Audio Version** | `llm-audio` | Credits (NotebookLM) | Generate an audio/podcast version |
| **Infographic** | `llm-infographic` | BYOK, Credits | Create a visual infographic |
| **Translation** | `llm-translate` | All | Translate the document content |

### 3.5 Artifact Loop

When an LLM generates an artifact (summary, slides, infographic), the user can:

1. **View it** in the browser
2. **Save it** as a new encrypted transfer (same encryption model)
3. **Share it** via a new download link + key
4. **Delete it** (ephemeral by default)

This creates a virtuous loop: upload document → generate summary → share summary → recipient generates slides from summary → shares slides. Each step is a billable transfer.

### 3.6 BYOK Key Storage

User API keys are stored ONLY in the browser (localStorage or sessionStorage):

```
┌──────────────────────────────────────────────────────────────┐
│  🔑 Your API Keys (stored in your browser only)              │
│                                                              │
│  OpenAI:       sk-...4f2a           [Remove]                │
│  Anthropic:    sk-ant-...8b3c       [Remove]                │
│  OpenRouter:   sk-or-...9d1e        [Remove]                │
│                                                              │
│  These keys NEVER leave your browser. Our server cannot      │
│  see them. API calls go directly from your browser to the    │
│  provider.                                                   │
│                                                              │
│  Don't have a key? [Buy platform credits instead →]          │
└──────────────────────────────────────────────────────────────┘
```

### 3.7 Platform Credit Resale

For users who don't have their own API keys, we provide credits with markup:

| Provider | Our Cost (per 1M tokens) | User Cost (credits) | Markup |
|----------|------------------------|-------------------|--------|
| Claude Sonnet | ~$3 | 5 credits ($5) | ~67% |
| GPT-4o | ~$5 | 8 credits ($8) | ~60% |
| Gemini Pro | ~$1.25 | 3 credits ($3) | ~140% |

Credits are deducted from the same credit balance used for file transfers.

### 3.8 Issues FS Tree

```
EPIC: LLM Integration
│
├── SPIKE: In-browser LLM feasibility (Gemini Nano API, Chrome support timeline)
├── SPIKE: Ollama browser access (localhost CORS, WebSocket, security model)
├── SPIKE: BYOK direct-from-browser API calls (CORS, streaming, error handling)
│
├── STORY: LLM — plugin framework for AI features
│   ├── TASK: Define LLM plugin interface (prompt, stream response, token counting)
│   ├── TASK: Implement LLM mode selector (in-browser, Ollama, BYOK, credits)
│   ├── TASK: Implement BYOK key storage (localStorage, add/remove UI)
│   ├── TASK: Implement credit-based proxy (stateless, no content logging)
│   └── TEST: Each mode produces a response; server logs show zero content
│
├── STORY: LLM — document summary
│   ├── TASK: Implement summary generation (prompt engineering for different doc types)
│   ├── TASK: Summary display UI (collapsible, copyable)
│   └── TEST: Summary generated for PDF, text, and code files
│
├── STORY: LLM — chat with document
│   ├── TASK: Implement chat UI (message history, streaming responses)
│   ├── TASK: Context management (document content + conversation history)
│   ├── TASK: Chat history storage (encrypted in localStorage or as transfer)
│   └── TEST: Multi-turn conversation about a document
│
├── STORY: LLM — artifact generation (slides, graphs, infographics)
│   ├── TASK: Presentation generation (Markdown → slides)
│   ├── TASK: Semantic graph generation (using MGraph-AI__Service__Graph)
│   ├── TASK: HTML graph visualisation (using MGraph-AI__Service__Html__Graph)
│   ├── TASK: Infographic generation
│   ├── TASK: Artifact save-as-transfer flow (encrypt → upload → share)
│   └── TEST: Each artifact type generates, displays, and can be saved/shared
│
├── STORY: LLM — audio generation (NotebookLM integration)
│   ├── SPIKE: NotebookLM API / integration options
│   ├── TASK: Implement audio generation from document
│   ├── TASK: Audio player UI
│   └── TEST: Audio version generated and playable in browser
│
└── STORY: LLM — credit resale
    ├── TASK: Define credit-to-token exchange rates per provider
    ├── TASK: Implement token counting + credit deduction for proxied calls
    ├── TASK: Usage dashboard (credits spent on LLM vs file transfers)
    └── TEST: Credit balance decreases correctly after LLM usage
```

---

## 4. Workstream: Retention & Ephemeral Design

### 4.1 Core Principle

**The platform is ephemeral by design.** Files are shared, received, and deleted. This is not long-term storage. This principle serves multiple goals:

- **Security** — less data at rest = smaller blast radius
- **Cost** — automatic cleanup = predictable S3 costs
- **Simplicity** — no need for backup, migration, or archival features
- **Legal** — minimal data retention = minimal legal exposure
- **User behaviour** — nudge users toward ephemeral sharing, not hoarding

### 4.2 Retention Options

| Option | Default | Description | Credit Cost |
|--------|---------|-------------|-------------|
| **1 day** | ✅ Nudged | File auto-deletes after 24 hours | 1 credit |
| **3 days** | Available | File auto-deletes after 72 hours | 3 credits |
| **7 days** | Available | File auto-deletes after 168 hours | 7 credits |
| **Custom** | Enterprise only | Configurable via self-hosted deployment | N/A |

The UI nudges toward 1 day by defaulting to it and making longer options progressively more expensive.

### 4.3 Download Limits

| Option | Description | Behaviour |
|--------|-------------|-----------|
| **Unlimited** | No download limit (default) | File available until retention expires |
| **1 download** | Self-destruct after first download | Blob deleted immediately after first GET |
| **5 downloads** | Delete after 5 downloads | Counter tracked in `meta.json` |
| **10 downloads** | Delete after 10 downloads | Counter tracked in `meta.json` |

When the download limit is reached, the `payload.enc` blob is permanently deleted from S3. The `meta.json` and `events.json` remain (showing the transfer happened, when files were downloaded, and when the blob was deleted).

### 4.4 Deletion by Key Holder

Anyone who possesses both the download link AND the decryption key can delete the transfer. This is elegant because:

- The sender already has both → can delete at any time
- The sender shares both with the receiver → receiver can also delete
- No separate "deletion key" needed → the decryption key IS the authorization
- Server validates: hash the provided key → compare to a stored hash (set at upload time) → if match, delete blob

```
DELETE /transfers/{id}
Authorization: Bearer tok_xxx          (optional — only needed if upload required token)
X-Deletion-Key: a3Bf9xK2mP7qR4sT...   (the decryption key — server hashes and compares)

Response:
{
  "deleted": true,
  "deleted_at": "2026-02-08T18:00:00Z",
  "meta_retained": true,
  "events_retained": true,
  "payload_deleted": true
}
```

After deletion, the transfer status page shows:

```
┌──────────────────────────────────────────────────────────────┐
│  This transfer has been deleted.                              │
│                                                              │
│  Uploaded:    2026-02-08 14:32 UTC                           │
│  Downloaded:  1 time (last: 2026-02-08 16:45 UTC)            │
│  Deleted:     2026-02-08 18:00 UTC                           │
│  Deleted by:  Key holder                                     │
│                                                              │
│  The encrypted file has been permanently removed.            │
│  This metadata will be deleted on 2026-02-09 14:32 UTC.      │
└──────────────────────────────────────────────────────────────┘
```

### 4.5 Auto-Cleanup Lambda

A scheduled Lambda function runs daily (or hourly) to enforce retention:

```python
# cleanup.py — runs on CRON schedule
def cleanup_expired_transfers():
    """Delete payload.enc for transfers past their retention period."""
    now = datetime.utcnow()
    for transfer in list_all_transfers():
        meta = load_meta(transfer.id)
        if meta.expires_at < now and meta.status != "deleted":
            delete_payload(transfer.id)
            update_meta(transfer.id, status="expired", expired_at=now)
            log_event(transfer.id, type="auto_expired")
```

### 4.6 Issues FS Tree

```
EPIC: Retention & Ephemeral Design
│
├── STORY: Retention — configurable expiry
│   ├── TASK: Add retention selector to upload UI (1d default, 3d, 7d options)
│   ├── TASK: Store expires_at in meta.json
│   ├── TASK: Credit cost scales with retention (1/3/7 credits)
│   ├── TASK: Display expiry countdown on status page
│   └── TEST: File auto-deleted after retention period
│
├── STORY: Retention — download limits
│   ├── TASK: Add download limit selector to upload UI (unlimited, 1, 5, 10)
│   ├── TASK: Track download count in meta.json
│   ├── TASK: Delete payload.enc when limit reached
│   ├── TASK: Display "N of M downloads used" on status page
│   └── TEST: Payload deleted after Nth download; subsequent downloads fail gracefully
│
├── STORY: Retention — deletion by key holder
│   ├── TASK: Store hash of decryption key at upload time (server never sees raw key)
│   ├── TASK: Implement DELETE /transfers/{id} with key verification
│   ├── TASK: Update status page to show deletion details
│   └── TEST: Correct key → blob deleted; wrong key → rejected; status page updated
│
├── STORY: Retention — auto-cleanup CRON
│   ├── TASK: Lambda function to sweep expired transfers
│   ├── TASK: Schedule via EventBridge (hourly or daily)
│   ├── TASK: CloudWatch metrics for cleanup (expired_count, bytes_freed)
│   └── TEST: Expired transfers cleaned up; meta retained; events retained
│
└── STORY: Retention — UI nudging
    ├── TASK: Default to 1-day retention (pre-selected, visually prominent)
    ├── TASK: Show credit cost alongside each retention option
    ├── TASK: Explain ephemeral philosophy in UI copy ("designed for sharing, not storage")
    └── TEST: Most users choose 1 day (track via analytics)
```

---

## 5. Workstream: User Accounts & Key Management

### 5.1 Vision

User accounts are needed for: LLM artifact storage, credit purchases, usage history, and multi-device key sync. But accounts must NOT compromise the zero-knowledge model. All user data on the server is encrypted with the user's key.

### 5.2 Account Model

| Component | Provider | Notes |
|-----------|----------|-------|
| Identity | OAuth (Google, GitHub, Apple) or Cognito | Third-party handles auth; we store only an opaque user ID |
| Payment link | Stripe customer ID | Linked to the same opaque user ID |
| Data storage | S3, encrypted per-user | Everything under `users/{user_id}/` is encrypted with user's key |
| Key storage | User's responsibility | Password manager, key store, or our guidance |

### 5.3 Password Manager Integration & Guidance

The decryption key is the single point of failure. If lost, data is gone. We should:

1. **Recommend** storing keys in a password manager (1Password, Bitwarden, LastPass)
2. **Provide guidance** for each major password manager (how to store a "Secure Send key")
3. **Explore partnerships** with password manager vendors (API integration for one-click save)
4. **Implement** a "Save to password manager" button using the Credential Management API where supported

```
┌──────────────────────────────────────────────────────────────┐
│  🔑 Save your decryption key safely                          │
│                                                              │
│  This key is the ONLY way to access your file.               │
│  If you lose it, the file cannot be recovered.               │
│                                                              │
│  [ 📋 Copy to clipboard ]                                    │
│  [ 🔐 Save to 1Password ]       ← Credential Management API │
│  [ 🔐 Save to Bitwarden ]                                   │
│  [ 📄 Download as .key file ]                                │
│                                                              │
│  We recommend saving the key in a password manager           │
│  and sharing it via a different channel than the link.        │
└──────────────────────────────────────────────────────────────┘
```

### 5.4 Issues FS Tree

```
EPIC: User Accounts & Key Management
│
├── STORY: User accounts — OAuth integration
│   ├── TASK: Implement OAuth flow (Google, GitHub, Apple)
│   ├── TASK: Map OAuth identity → opaque user ID
│   ├── TASK: Link user ID to Stripe customer ID
│   ├── TASK: User profile page (usage history, credit balance, active transfers)
│   └── TEST: OAuth login → user dashboard → credit balance visible
│
├── STORY: Key management — password manager guidance
│   ├── TASK: Write guide for storing keys in 1Password
│   ├── TASK: Write guide for storing keys in Bitwarden
│   ├── TASK: Write guide for storing keys in LastPass
│   ├── TASK: Write guide for storing keys in Apple Keychain
│   ├── TASK: Implement "Download as .key file" button
│   └── TEST: Guides are clear, accurate, and tested
│
├── SPIKE: Password manager API integration (Credential Management API)
│   ├── TASK: Assess browser support for Credential Management API
│   ├── TASK: Prototype "Save to password manager" button
│   └── TASK: Explore 1Password / Bitwarden partnership opportunities
│
└── STORY: User data — encrypted per-user storage
    ├── TASK: Define user data model (all server-side data encrypted with user key)
    ├── TASK: Implement per-user S3 prefix (users/{user_id}/)
    ├── TASK: User data is inaccessible without user's key (same zero-knowledge model)
    └── TEST: Server-side user data is ciphertext; decryptable only with user's key
```

---

## 6. Workstream: Credit Economics

### 6.1 Vision

Everything is credit-driven from early on. Free tokens come with 500 credits. When credits run out, the user has proven value and is at the moment of purchase. This is the conversion funnel.

### 6.2 Credit Cost Table

| Action | Credits | Rationale |
|--------|---------|-----------|
| File transfer (1-day retention) | 1 | Base unit |
| File transfer (3-day retention) | 3 | 3× retention = 3× cost |
| File transfer (7-day retention) | 7 | 7× retention = 7× cost |
| LLM summary (in-browser/Ollama) | 0 | User's own compute |
| LLM summary (BYOK) | 0 | User's own API key |
| LLM summary (platform credits) | 2-5 | Depends on model + tokens |
| LLM chat message (platform credits) | 1 | Per message |
| Artifact generation (slides, graph) | 5-10 | Heavier LLM usage |
| Audio generation (NotebookLM) | 10 | Premium feature |
| Email sharing | 1 | Per email sent |
| Additional download beyond limit | 1 | Per extra download |

### 6.3 Token + Credit Distribution

```
New token created by operator:
  token_id:       tok_abc123
  initial_credits: 500
  expires:         30 days (or custom)
  
Credit lifecycle:
  500 credits issued
  → User uploads 10 files (1-day each) = 10 credits
  → User uploads 3 files (7-day each) = 21 credits  
  → User generates 5 summaries (platform LLM) = 15 credits
  → User shares 3 files via email = 3 credits
  ────────────────────────────────────────────
  Remaining: 451 credits
  
  At this rate, 500 credits lasts weeks.
  When they hit zero → purchase prompt.
  
Purchase packs:
  100 credits  = £5
  500 credits  = £20   (£5 saving)
  1000 credits = £35   (£15 saving)
```

### 6.4 Key Metrics

| Metric | What It Tells Us |
|--------|-----------------|
| Credits issued (free) | Acquisition cost |
| Credits consumed (total) | Platform usage |
| Credits consumed (by action type) | Feature demand |
| % tokens that exhaust credits | Engagement depth |
| % exhausted tokens that purchase | Conversion rate |
| Revenue per credit | Unit economics |
| Cost per credit (infra) | Margin |
| Credits purchased / credits consumed | Monetisation ratio |

### 6.5 Issues FS Tree

```
EPIC: Credit Economics
│
├── STORY: Credits — unified credit system
│   ├── TASK: Define credit cost per action (table above)
│   ├── TASK: Implement credit ledger (per token, per user)
│   ├── TASK: Implement credit deduction middleware (check → deduct → allow)
│   ├── TASK: Implement "insufficient credits" UX (soft prompt, not hard block initially)
│   └── TEST: Actions deduct correct credits; zero-balance shows purchase prompt
│
├── STORY: Credits — purchase flow
│   ├── TASK: Stripe Checkout for credit packs (100/500/1000)
│   ├── TASK: Webhook: payment success → credit ledger top-up
│   ├── TASK: Purchase history UI
│   └── TEST: E2E: purchase → credits appear → usable immediately
│
├── STORY: Credits — analytics
│   ├── TASK: Track credit consumption by action type
│   ├── TASK: Track conversion funnel (issued → exhausted → purchased)
│   ├── TASK: Admin dashboard: credit economics overview
│   └── TEST: Metrics match manual calculation
│
└── SPIKE: Credit pricing validation
    ├── TASK: Calculate actual infra cost per credit
    ├── TASK: Compare with competitor pricing
    ├── TASK: Model breakeven at various user volumes
    └── TASK: Propose adjusted pricing if margin too thin/thick
```

---

## 7. Workstream: Security, Compliance & Trust

### 7.1 Vision

Publish everything. Security reviews, vulnerability findings (fixed), compliance mappings, Well-Architected analysis, privacy policies — all public, all linked from the website. The goal is that when a corporate security team evaluates Secure Send, every answer is already on the website before they ask.

### 7.2 Security Assessments

| Assessment | Tool / Method | Frequency | Publish? |
|-----------|--------------|-----------|----------|
| **Automated security scan** | AI security agent (Claude/GPT) | Every release | Yes — findings + fixes |
| **Dependency audit** | `pip audit`, `npm audit`, Snyk | Every release | Yes — clean bill or fixes |
| **Penetration test (automated)** | OWASP ZAP, Nuclei | Monthly | Yes — summary report |
| **Code security review** | AI agent + manual | Quarterly | Yes — findings + fixes |
| **AWS Well-Architected Review** | AWS WA Tool | Quarterly | Yes — full report |
| **Infrastructure audit** | CloudTrail, Config Rules | Continuous | Summary published |

### 7.3 Compliance Framework Mapping

| Framework | Applicability | Expected Status | Notes |
|-----------|--------------|-----------------|-------|
| **GDPR** | High (EU users) | Largely compliant by design | Zero PII on server; DSAR page (see below) |
| **ISO 27001** | Medium (enterprise sales) | Partially aligned | Map controls; full cert is expensive, defer |
| **SOC 2 Type II** | Medium (enterprise sales) | Partially aligned | Map to trust principles; full audit deferred |
| **CCPA** | Low (US users) | Compliant by design | Same as GDPR — we don't have their data |
| **HIPAA** | Low (health data) | NOT compliant (and won't claim to be) | Would need BAA with AWS; defer |
| **PCI DSS** | N/A | Stripe handles all payment card data | We never see card numbers |

### 7.4 The DSAR Page

A Data Subject Access Request page that's genuinely useful and slightly entertaining:

```
┌──────────────────────────────────────────────────────────────────┐
│  📋 Data Subject Access Request (GDPR Article 15)                │
│                                                                  │
│  You have the right to know what personal data we hold           │
│  about you. Here's everything:                                   │
│                                                                  │
│  ── What we might have ──                                        │
│                                                                  │
│  If you've used Secure Send, we may have stored your IP          │
│  address alongside a transfer record. That's it.                 │
│                                                                  │
│  We do NOT store: your name, email, file names, file             │
│  contents, browsing history, cookies, or any other               │
│  identifying information.                                        │
│                                                                  │
│  ── Look up your data ──                                         │
│                                                                  │
│  Enter your IP address to see if we have any records:            │
│  [________________________] [Search]                              │
│                                                                  │
│  Your current IP: 203.0.113.42 [Use this]                        │
│                                                                  │
│  ── Request deletion ──                                          │
│                                                                  │
│  IP records are automatically deleted when transfers expire       │
│  (maximum 7 days). If you want immediate deletion, you can       │
│  request it below. We'll remove all records associated with      │
│  your IP address within 24 hours.                                │
│                                                                  │
│  [Request deletion of my IP records]                             │
│                                                                  │
│  ── Why this page is mostly empty ──                             │
│                                                                  │
│  Secure Send is designed so that we hold as little data as       │
│  possible about you. All file contents are encrypted on your     │
│  device before they reach us. We literally cannot read them.     │
│  The best DSAR response is a short one.                          │
└──────────────────────────────────────────────────────────────────┘
```

### 7.5 Vendor Due Diligence Pack

A pre-built page for corporate security teams evaluating Secure Send:

```
/security
├── /security/overview          — architecture, encryption model, zero-knowledge proof
├── /security/assessments       — published security reviews + remediation
├── /security/compliance        — GDPR, ISO 27001, SOC 2 mapping status
├── /security/well-architected  — AWS WA review (latest)
├── /security/dsar              — Data Subject Access Request page
├── /security/privacy-policy    — Plain-language privacy policy
├── /security/terms             — Terms of service
├── /security/subprocessors     — List of data subprocessors (AWS only)
├── /security/incident-response — How we handle security incidents
├── /security/questionnaire     — Pre-filled SIG/CAIQ questionnaire download
└── /security/contact           — security@securesend.example.com + PGP key
```

### 7.6 IP Address Retention Question

An open question surfaced in the voice memo: **should we retain IP addresses at all?**

| Option | Pros | Cons |
|--------|------|------|
| **Keep IPs (current)** | Transparency panel works, abuse detection, legal compliance | GDPR personal data, attack surface |
| **Hash IPs** | Can still detect repeat visitors, less exposure | Lose transparency panel accuracy, still arguably PII |
| **Don't store IPs** | Minimal data, strongest privacy claim | Lose transparency, lose abuse detection, lose IDS |
| **Store IPs, auto-delete with transfer** | Compromise — useful while active, gone when transfer expires | Slightly more complex cleanup |

**Recommendation:** Store IPs, auto-delete when the transfer expires (max 7 days). This preserves the transparency panel and abuse detection during the transfer lifecycle while ensuring no long-term IP retention. Flag for the security agent and GRC agent to analyse and opine.

### 7.7 Issues FS Tree

```
EPIC: Security, Compliance & Trust
│
├── STORY: Security — continuous AI security assessment
│   ├── TASK: Define security agent prompt (architecture review, code review, threat model)
│   ├── TASK: Run security assessment on every release (CI integration)
│   ├── TASK: Publish findings + fixes on /security/assessments
│   └── TEST: Security agent identifies known-vulnerable test pattern
│
├── STORY: Security — AWS Well-Architected Review
│   ├── TASK: Run WA review (Security, Reliability, Cost pillars)
│   ├── TASK: Remediate high/medium findings
│   ├── TASK: Publish WA report on /security/well-architected
│   └── TEST: Zero high-risk findings in WA review
│
├── STORY: Compliance — GDPR mapping
│   ├── TASK: Map all data flows to GDPR articles
│   ├── TASK: Build DSAR page (self-service IP lookup + deletion)
│   ├── TASK: Write plain-language privacy policy
│   ├── TASK: Document lawful basis for IP processing (legitimate interest)
│   └── TEST: DSAR page works; privacy policy covers all processing
│
├── STORY: Compliance — framework mapping (ISO 27001, SOC 2)
│   ├── TASK: Map controls to ISO 27001 Annex A
│   ├── TASK: Map to SOC 2 Trust Service Criteria
│   ├── TASK: Identify gaps + remediation plan
│   ├── TASK: Publish compliance status on /security/compliance
│   └── TEST: Mapping is complete; gaps are documented with remediation timeline
│
├── STORY: Trust — vendor due diligence pack
│   ├── TASK: Build /security page hierarchy (overview, assessments, compliance, etc.)
│   ├── TASK: Pre-fill SIG Lite questionnaire
│   ├── TASK: Pre-fill CAIQ (Cloud Assessment Initiative Questionnaire)
│   ├── TASK: Write incident response plan
│   ├── TASK: Publish subprocessor list
│   └── TEST: Corporate security evaluator can answer all standard questions from /security
│
└── SPIKE: IP address retention analysis
    ├── TASK: Security agent: analyse IP retention options
    ├── TASK: GRC agent: GDPR implications of IP retention
    ├── TASK: Recommend approach (store + auto-delete with transfer)
    └── TASK: Implement chosen approach
```

---

## 8. Workstream: Go-to-Market & Naming

### 8.1 The Naming Problem

"Secure Send" is already in use:

- `securesend.link` — share secrets securely
- Various "SecureSend" products in enterprise file sharing
- Generic enough to be crowded in search results

**Action required:** Research and propose an alternative name before public launch.

### 8.2 Naming Research Brief

This brief should be executed by an agent (or Claude) to produce a naming recommendation:

```
NAMING RESEARCH BRIEF

Objective:
  Find a unique, memorable, brandable name for a privacy-first,
  zero-knowledge, ephemeral file sharing service.

Requirements:
  - Domain available (.com preferred, .io acceptable)
  - Not currently in use by a competing product
  - Not trademarked in relevant classes (file sharing, SaaS, security)
  - Works in English and is pronounceable internationally
  - Conveys: security, simplicity, ephemerality, privacy
  - Short (1-2 words, ideally ≤10 characters)

Avoid:
  - "Secure" in the name (overused, SEO-crowded)
  - "Safe" in the name (same problem)
  - Names that sound like existing products (SendGrid, WeTransfer, Dropbox)

Name Directions to Explore:
  1. Ephemeral / transient metaphors (flash, spark, vapor, mist, pulse)
  2. Lock / vault metaphors (vault, seal, lock — but avoid cliché)
  3. Invented words (Zupr, Vaultr, Ephm)
  4. Nature metaphors for transience (dew, tide, bloom)
  5. Compression of concept ("zero-knowledge" → "znk", "zeno")
  6. Cultural / multilingual options (Portuguese, Japanese, etc.)

Deliverables:
  - 10 candidate names with domain availability
  - Google/Bing search analysis for each (what currently shows)
  - Trademark search (basic, USPTO + EU IPO)
  - LLM search ranking (what do Claude, GPT, Gemini return for each name?)
  - Recommendation with rationale
```

### 8.3 Competitive Analysis Brief

```
COMPETITIVE ANALYSIS BRIEF

Objective:
  Map the competitive landscape for privacy-first file sharing.

Research Areas:
  1. Direct competitors (encrypted file sharing)
     - WeTransfer, Send.it, Firefox Send (discontinued), Tresorit Send,
       OnionShare, SecureDrop, Wormhole, Bitwarden Send
     - For each: pricing, encryption model (server-side vs E2E),
       open source?, self-hostable?, retention model, file size limits

  2. Indirect competitors (general file sharing)
     - Dropbox Transfer, Google Drive sharing, iCloud link sharing
     - Why they're not privacy-first; what they do well

  3. Open source alternatives
     - Lufi, PairDrop, Snapdrop, Send (fork of Firefox Send)
     - Deployment model, community size, feature set

  4. Pricing landscape
     - Free tiers, paid plans, per-transfer pricing, subscription models
     - Price sensitivity: what do users actually pay?

  5. Differentiation
     - What does Secure Send offer that nobody else does?
       (transparency panel, cultural adaptation, plugin architecture,
        deploy-everywhere, LLM integration, credit economics)

Deliverables:
  - Comparison table (features × competitors)
  - Pricing comparison table
  - Differentiation matrix
  - Market positioning recommendation
  - Competitor pages for the website (/compare/wetransfer, /compare/tresorit, etc.)
```

### 8.4 SEO & Marketing Strategy Brief

```
SEO & MARKETING STRATEGY BRIEF

Objective:
  Develop an organic growth strategy for launch.

Research Areas:
  1. Search term analysis
     - "send files securely", "encrypted file sharing", "private file transfer"
     - "WeTransfer alternative", "send large files free", "zero knowledge file sharing"
     - Volume, competition, difficulty for each

  2. Current brand state
     - Google results for chosen name
     - Bing results for chosen name
     - LLM results (what do Claude, ChatGPT, Gemini say when asked about the product?)
     - GitHub stars/forks (once published)
     - Social media presence

  3. Content strategy
     - Blog posts: "Why your file sharing isn't private", "What zero-knowledge means",
       "Browser fingerprinting explained"
     - Comparison pages: /compare/{competitor}
     - Security transparency pages (dual-purpose: trust + SEO)

  4. Distribution channels
     - Product Hunt launch
     - Hacker News (Show HN)
     - Reddit (r/privacy, r/selfhosted, r/netsec)
     - Dev.to / Medium technical posts
     - AWS Marketplace listing
     - Docker Hub discovery
     - PyPI discovery

  5. Viral mechanics
     - Every file shared = brand exposure to receiver
     - "Powered by [Product Name]" footer on download page
     - "How it works" page educates receiver → potential new sender

Deliverables:
  - SEO keyword strategy (20 target terms, prioritised)
  - Content calendar (12 weeks of posts)
  - Launch plan (Product Hunt, HN, Reddit sequence)
  - Brand monitoring setup (Google Alerts, social listening)
```

### 8.5 Issues FS Tree

```
EPIC: Go-to-Market & Naming
│
├── STORY: Naming — research and selection
│   ├── TASK: Execute naming research brief (10 candidates)
│   ├── TASK: Domain availability check (.com, .io, .dev)
│   ├── TASK: Basic trademark search (USPTO, EU IPO)
│   ├── TASK: Google/Bing/LLM search analysis per candidate
│   ├── TASK: Shortlist 3 names → operator decides
│   └── TEST: Chosen name has available domain, no trademark conflict, clean search results
│
├── STORY: Competitive analysis
│   ├── TASK: Execute competitive analysis brief
│   ├── TASK: Build comparison table (features × competitors)
│   ├── TASK: Build pricing comparison
│   ├── TASK: Write competitor comparison pages (/compare/{name})
│   └── TEST: Comparison pages are factual, fair, and published
│
├── STORY: SEO & content strategy
│   ├── TASK: Keyword research (20 target terms)
│   ├── TASK: Content calendar (12 weeks)
│   ├── TASK: Write 3 launch blog posts
│   ├── TASK: Build /compare pages
│   └── TEST: Blog posts published; target keywords tracked
│
├── STORY: Launch plan
│   ├── TASK: Product Hunt listing preparation
│   ├── TASK: Hacker News Show HN post draft
│   ├── TASK: Reddit posts (r/privacy, r/selfhosted, r/netsec)
│   ├── TASK: Dev.to technical post
│   └── TEST: Launch sequence executed; initial traffic measured
│
└── STORY: Brand monitoring
    ├── TASK: Set up Google Alerts for brand name
    ├── TASK: Set up GitHub star tracking
    ├── TASK: Monthly brand state report (search rankings, mentions, traffic)
    └── TEST: First brand state report produced
```

---

## 9. Updated Consolidated Roadmap

Adding to the phases from previous documents:

```
Phase 0 (NOW)        ── MVP ──────────────────────────────────────────
Phase 1 (MVP+2w)     ── Deploy-Everywhere + Plugin Framework ─────────
Phase 2 (MVP+4w)     ── Cost Tracking + Billing ──────────────────────
Phase 3 (MVP+6w)     ── Fingerprint + Accessibility ──────────────────
Phase 4 (MVP+8w)     ── i18n Phase 1 + Themes ────────────────────────
Phase 5 (MVP+10w)    ── Security Intelligence + Bot Detection ────────
Phase 6 (MVP+12w)    ── i18n Phase 2 + Dogfooding Brands ─────────────
Phase 7 (MVP+14w)    ── Retention & Ephemeral + Credit Economics ──── ← NEW
Phase 8 (MVP+16w)    ── Naming + Competitive Analysis + Launch ────── ← NEW
Phase 9 (MVP+18w)    ── LLM Integration (In-browser + BYOK) ──────── ← NEW
Phase 10 (MVP+20w)   ── User Accounts + Key Management ───────────── ← NEW
Phase 11 (MVP+22w)   ── LLM Artifacts (Slides, Graphs, Audio) ────── ← NEW
Phase 12 (MVP+24w)   ── Compliance & Trust Pack ──────────────────── ← NEW
Phase 13 (MVP+26w)   ── i18n Phase 3 + Cultural UX ───────────────────
Phase 14 (MVP+28w)   ── Enterprise + Marketplace ─────────────────────
```

---

## 10. Full Issues FS Epic Tree (This Document)

```
EPIC: Secure Send — LLM, Retention, Compliance & GTM
│
├── EPIC: LLM Integration
│   ├── SPIKE: In-browser LLM feasibility
│   ├── SPIKE: Ollama browser access
│   ├── SPIKE: BYOK direct-from-browser calls
│   ├── STORY: LLM plugin framework
│   ├── STORY: Document summary
│   ├── STORY: Chat with document
│   ├── STORY: Artifact generation (slides, graphs, infographics)
│   ├── STORY: Audio generation (NotebookLM)
│   └── STORY: Credit resale for LLM usage
│
├── EPIC: Retention & Ephemeral Design
│   ├── STORY: Configurable expiry (1/3/7 days)
│   ├── STORY: Download limits (1/5/10/unlimited)
│   ├── STORY: Deletion by key holder
│   ├── STORY: Auto-cleanup CRON
│   └── STORY: UI nudging toward ephemerality
│
├── EPIC: User Accounts & Key Management
│   ├── STORY: OAuth integration
│   ├── STORY: Password manager guidance
│   ├── SPIKE: Password manager API integration
│   └── STORY: Encrypted per-user storage
│
├── EPIC: Credit Economics
│   ├── STORY: Unified credit system
│   ├── STORY: Purchase flow
│   ├── STORY: Credit analytics
│   └── SPIKE: Credit pricing validation
│
├── EPIC: Security, Compliance & Trust
│   ├── STORY: Continuous AI security assessment
│   ├── STORY: AWS Well-Architected Review
│   ├── STORY: GDPR mapping + DSAR page
│   ├── STORY: ISO 27001 / SOC 2 mapping
│   ├── STORY: Vendor due diligence pack
│   └── SPIKE: IP address retention analysis
│
└── EPIC: Go-to-Market & Naming
    ├── STORY: Naming research + selection
    ├── STORY: Competitive analysis
    ├── STORY: SEO & content strategy
    ├── STORY: Launch plan
    └── STORY: Brand monitoring
```

---

*This document extends the Secure Send specification. All items should be instantiated as Issues FS issues by the Conductor. The naming workstream (Section 8) is time-sensitive — should be resolved before any public launch or marketing activity. The retention model (Section 4) should be implemented alongside the MVP or immediately after, as it affects core UX and credit economics.*
