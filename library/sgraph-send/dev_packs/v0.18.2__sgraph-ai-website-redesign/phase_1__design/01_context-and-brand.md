# Context and Brand — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 1: Design | Source: Designer + Ambassador + Librarian reviews**

This document is the reference for what SG/Send is, what it actually does, and what's settled on brand and positioning. Read before writing any copy or designing any page.

---

## What SG/Send Actually Is (v0.3.0)

SG/Send is zero-knowledge encrypted file sharing where **recipients browse, not just download**.

That last part is the differentiator. Not encryption alone — Proton Drive also has client-side E2EE. What no competitor offers is a recipient browsing a gallery, a folder, or a formatted document in their browser, with the content decrypted client-side, without downloading a zip file, without creating an account, without us ever seeing the plaintext.

### The One Sentence (North Star)
> "SG/Send lets you share encrypted files that recipients can browse, read, and explore — without the server ever seeing your data."

### The Hero Headline
> "Share files. Browse them. Nobody can read them. Not even us."

---

## What v0.3.0 Ships (Code-Verified Features)

| Feature | What it does |
|---------|-------------|
| **Gallery view** | Mixed-content grid — images, PDFs, markdown, video — with type-aware thumbnails. Lightbox on click. |
| **Folder browser** | Multi-pane folder navigation. Recipients explore structure without downloading. |
| **SgPrint** | Markdown files rendered as branded PDFs in the recipient's browser. |
| **Friendly tokens** | Human-readable `word-word-number` format (e.g. `coral-equal-1774`). ~1 billion combinations. |
| **Three share modes** | Token Only / Combined / Separate Key — sender chooses the security tradeoff. |
| **Upload wizard** | 6-step guided flow. Drag-and-drop. Choice of retention period. |
| **Lightbox viewer** | Individual file open from gallery or folder. |
| **Receipt confirmation** | Sender gets confirmation when recipient opens the vault. |
| **Transparency panel** | UI showing what was stored vs. what was never sent. |
| **17 language support** | `/{locale}/` URL prefix, `data-i18n` attributes, JSON string files. |
| **Zero cookies** | Verifiable in DevTools — Application → Cookies. None. |

---

## What It Is Not

- Not a subscription service — pay-per-use at £0.01/file
- Not requiring accounts — no email, no signup for sender or recipient
- Not using server-side encryption — the key never reaches the server
- Not using cookies or analytics on the product

---

## Architecture (for "cannot" claims)

```
Browser                          Server
  │                                │
  ├─ AES-256-GCM key generated     │
  ├─ Files encrypted in browser    │
  ├─ Ciphertext → upload          ─┤─ stores ciphertext + hashed IP only
  │                                │
  ├─ Key embedded in URL fragment  │
  │  (#key=...) — never sent      ─┤─ never sees the key
  │                                │
  └─ Recipient decrypts in browser │
     (no server involvement)       │
```

**SHA-256 with daily salt** on IP addresses — not personally identifiable.

**Key technical consequence:** If the server is subpoenaed, breached, or compelled — it can only produce encrypted ciphertext. Unreadable without the key.

---

## Brand (Settled — Do Not Revisit)

| Element | Decision |
|---------|----------|
| Colour scheme | Dark navy `#1A1A2E` + teal `#4ECDC4` — unchanged |
| Typography | DM Sans (body) + JetBrains Mono (code/tokens) — unchanged |
| Logo | `SG/` + ⚡ lightning bolt — unchanged |
| Tagline | "Your files, your keys, your privacy" — unchanged |
| Design system name | Aurora |

### Missing CSS tokens to add
```css
--bg-secondary: #16213E;
--bg-card: #0F3460;
--border-subtle: rgba(78,205,196,0.15);
--radius-card: 12px;
--shadow-card: 0 4px 24px rgba(0,0,0,0.3);
--transition-base: 0.2s ease;
--max-width-content: 1120px;
--hero-min-height: 600px;
```

---

## Voice Rules (Non-Negotiable)

1. **"Cannot" not "will not"** — always. "We cannot read your files" = architectural fact. "We will not read your files" = a promise. These are different things.
2. **Precise over vague** — "AES-256-GCM in your browser" not "bank-level encryption."
3. **Respect reader intelligence** — no dumbed-down copy, no exclamation marks.
4. **Short as a feature** — 6-sentence privacy policy is a product feature, not a legal shortcut.

---

## Competitive Positioning (Evidence-Based)

Research source: Perplexity AI, 27 March 2026. Full evidence at `phase_3__development/04_tools-repo-strategy.md` and source doc index.

| Differentiator | SG/Send | WeTransfer | Proton Drive |
|---------------|---------|------------|--------------|
| Client-side encryption | ✅ | ❌ server-side | ✅ (also client-side) |
| Recipients browse without downloading | ✅ gallery + folder, no login | ⚠️ previews only, not encrypted structured UX | ❌ requires Proton account |
| No account required | ✅ token-based | ❌ email required | ❌ account required |
| Friendly tokens | ✅ | ❌ opaque URLs | ❌ opaque URLs |
| Zero cookies (verifiable) | ✅ | ❌ | ❌ |
| Pay-per-use | ✅ £0.01/file | ❌ subscription | ❌ subscription |
| Privacy policy | 6 sentences | 4,000+ words | Multi-page |
| Open source | ✅ | ❌ | Partial |

### The WeTransfer AI training positioning window
"We can't train AI on files we can't see." — factually accurate (architectural impossibility). Use on homepage and /security/. Do NOT say "WeTransfer trains AI on your files" — frame it as what we architecturally cannot do.

### What NOT to claim
- ❌ "Server-side ZK is an oxymoron" — accurate but adversarial; keep for talks, not on-site
- ❌ "WeTransfer is download only" — they have Previews now; say "not an encrypted structured gallery/folder UX"
- ❌ "Encryption is our differentiator vs Proton" — they also have client-side E2EE
- ❌ "Proton stores files in the clear" — they do not

---

## Current Site Problems (What We're Fixing)

1. **Zero product screenshots** — the current site describes but never shows
2. **Ignores the recipient** — highest-volume visitor is someone who received a file
3. **Wrong lead story** — "Built by AI agents" is the second section; wrong audience, wrong order
4. **Harmful pages** — `/agents/` and `/architecture/` hurt more than help
5. **Stats bar misleads** — test counts span multiple repos without per-repo context

---

## Target Audiences (Priority Order)

1. **Recipient (70% of traffic)** — someone who received a token. They land on sgraph.ai to understand what it is before using it. Their journey: "What is this? Can I trust it? → I want to send files too."
2. **Evaluator (20%)** — security-conscious person evaluating SG/Send for their team. Needs: architecture evidence, GDPR reassurance, audit capability.
3. **Investor / Observer (10%)** — checking the project's credibility and build quality. Needs: clear differentiation, evidence of technical depth.

---

*Phase 1 Design — Context and Brand*
*v0.18.2 — 27 March 2026*
*Sources: Designer review, Ambassador review, Librarian briefing pack, Competitive research*
