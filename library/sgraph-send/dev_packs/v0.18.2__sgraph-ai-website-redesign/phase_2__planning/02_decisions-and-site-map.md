# Decisions and Site Map — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 2: Planning | Source: Conductor brief, Architect review, Sherpa review**

All decisions in this document are settled. They represent consensus across Designer, Sherpa, Architect, and Ambassador roles. Do not reopen them without a new Conductor brief.

---

## Pages to REMOVE

| Page | Action | Redirect |
|------|--------|----------|
| `/agents/` + 3 sub-pages | Remove | `→ qa.send.sgraph.ai/team/` (301) |
| `/architecture/` | Replace with `/security/` | `→ /{locale}/security/` (301) |
| `/product/` | Merge into homepage | `→ /{locale}/` (301) |

**Order rule:** Deploy `/security/` BEFORE adding the redirect from `/architecture/`. The old page must be indexed before the redirect fires. PR 1 adds everything new. PR 2 (after PR 1 is deployed and indexed) adds redirects and removes old pages.

---

## Pages to ADD

| Page | Priority | Audience | Purpose |
|------|----------|----------|---------|
| `/{locale}/features/` | P1 | Evaluator | Full v0.3.0 feature showcase with screenshots |
| `/{locale}/security/` | P1 | Evaluator / CISO | Replaces /architecture/; architecture-as-guarantee |
| `/{locale}/why/share-a-folder/` | P2 | Recipient | Workflow landing — browsable folder |
| `/{locale}/why/gallery-preview/` | P2 | Recipient | Workflow landing — gallery view |
| `/{locale}/why/print-as-pdf/` | P2 | Recipient | Workflow landing — SgPrint |
| `/{locale}/why/share-a-video/` | P2 | Recipient | Workflow landing — video sharing |
| `/{locale}/why/send-securely/` | P2 | Evaluator | Workflow landing — zero-knowledge model |

All new pages: en-gb and en-us at launch. Other locales follow-up sprint.

---

## Site Map (After Redesign)

| URL | Status | Audience | Key content |
|-----|--------|----------|-------------|
| `/{locale}/` | Redesign | All | Hero + demo + screenshots + 6-sentence policy |
| `/{locale}/features/` | **New** | Evaluator | All v0.3.0 features, screenshots, comparison table |
| `/{locale}/security/` | **New** | CISO/Evaluator | Architecture deep-dive, FAQ, subpoena/breach questions |
| `/{locale}/pricing/` | Keep/update | All | Pay-per-use model, no subscription |
| `/{locale}/why/share-a-folder/` | **New** | Recipient | Pain → solution → demo CTA |
| `/{locale}/why/gallery-preview/` | **New** | Recipient | Pain → solution → demo CTA |
| `/{locale}/why/print-as-pdf/` | **New** | Recipient | Pain → solution → demo CTA |
| `/{locale}/why/share-a-video/` | **New** | Recipient | Pain → solution → demo CTA |
| `/{locale}/why/send-securely/` | **New** | Evaluator | Pain → solution → demo CTA |
| ~~`/{locale}/agents/`~~ | Remove (PR 2) | — | → qa.send.sgraph.ai/team/ |
| ~~`/{locale}/architecture/`~~ | Remove (PR 2) | — | → /security/ 301 |
| ~~`/{locale}/product/`~~ | Remove (PR 2) | — | → / 301 |

---

## Navigation (New)

**Desktop nav:** `Features` | `Security` | `Pricing` | `Tools` + locale picker

**"Already have a token?" persistent link** — right of nav, left of locale picker:
```
Already have a token? → send.sgraph.ai
```
This is the highest-priority UX change. The highest-volume visitor is someone who received a token and arrived at sgraph.ai to understand the product. This link gets them to the product immediately.

**Footer:** `send.sgraph.ai` | `tools.sgraph.ai` | `qa.send.sgraph.ai` | `GitHub` | `Security` | `Pricing` | Contact

---

## Homepage Section Order (New)

| # | Section | Action | Key content |
|---|---------|--------|-------------|
| 1 | **Hero** | Redesign | Two-column: headline left, `<sg-public-viewer>` right |
| 2 | **How it works** | New | 3-step: Drop → Encrypt → Share |
| 3 | **Feature showcase** | New | Gallery, folder, SgPrint screenshots |
| 4 | **Trust / Privacy** | New | 6-sentence policy (VISIBLE, not linked) + zero cookies |
| 5 | **Share modes** | New | 3 cards — Token Only / Combined / Separate Key |
| 6 | **Conversion CTA** | Redesign | "Try Free — No Account Required" |
| 7 | **The story** | Reposition | AI/GitHub story — below fold, curiosity reward |

The story section moves from position 2 (current) to position 7. It stays, it just stops being the lead.

---

## Homepage Copy (Final)

### Hero
**H1:** "Share files. Browse them. Nobody can read them. Not even us."
**Subheading:** "Files are encrypted in your browser before upload. Recipients get a gallery, a folder, or a PDF — without downloading. The server never sees your data."
**Primary CTA:** "Try Free — No Account Required →"
**Secondary CTA:** "Buy Credits — £5 →"

### How It Works (3 steps)
1. **Drop** — Add files. Choose your share mode. Pick your retention period.
2. **Encrypt** — AES-256-GCM runs in your browser. The key never leaves your device.
3. **Share** — Send a friendly token. Recipients browse, view, and interact — no download required.

### Trust Callout
> "Zero cookies. Zero tracking. We cannot read your files."
> "Privacy policy: 6 sentences. Theirs: 4,000+ words."

### Six-Sentence Privacy Policy (displayed in full, in the page body)
1. We encrypt your files in your browser before upload.
2. We cannot decrypt your files because we never have the key.
3. We do not use cookies, tracking pixels, or analytics on the product.
4. We store only encrypted ciphertext and a hashed IP address.
5. We delete your data after the retention period you chose.
6. That's everything. There is nothing else.

### Primary Conversion CTA
**"Try it now. No signup required."**
[Try Free →]  [Buy Credits — £5 →]

---

## `/security/` Page Structure

```
H1: Security
Lead: "We cannot read your files. This is not a promise — it is architecture."

Section 1: How the encryption works
  - Browser-side AES-256-GCM
  - Key generated per transfer, never sent to server
  - Web Crypto API (browser-native, no JS crypto libs)
  - Key shared via URL fragment (#key=...) — fragment never sent to server

Section 2: The three evaluator questions
  Q: What if your servers are subpoenaed?
  A: We can only produce ciphertext — unreadable without the key.
  Q: What if you're breached?
  A: Attackers get encrypted ciphertext. Useless without the key.
  Q: Who controls the retention period?
  A: The sender. We delete on their schedule.

Section 3: Transparency panel (screenshot + explanation)
Section 4: Zero cookies — verify yourself (DevTools instruction)
Section 5: GDPR-by-architecture callout
Section 6: Six-sentence privacy policy (full, visible)
Section 7: Open source — audit it yourself (GitHub link)
```

**FAQ Schema (5 questions):**
1. Does the server ever see my files? — No. Encryption happens in your browser.
2. What happens if SG/Send's servers are breached? — Attackers get ciphertext only.
3. Can SG/Send be compelled to hand over files? — Only ciphertext. Unreadable without the key.
4. How is the encryption key shared? — Via URL fragment, never sent to the server.
5. Does SG/Send use cookies? — No. Zero cookies, zero tracking, verifiable in DevTools.

---

## `/why/` Page Template

Each `/why/` page follows this pattern:
```
H1: [Specific pain/action — user's language]

Pain: "Today you..."
  [1-2 sentences describing the current frustrating experience]

Solution: "With SG/Send..."
  [1-2 sentences describing what changes]

Screenshot or <sg-public-viewer> demo

CTA: "Try it now — no account required"

BreadcrumbList: sgraph.ai > Why > [page name]
```

### Five pages at launch

| Page | H1 | Pain | Solution |
|------|----|------|---------|
| `/why/share-a-folder/` | "Share a folder without zipping it" | You zip, they download, they unzip, they scroll | Send a token — they browse the folder structure in their browser |
| `/why/gallery-preview/` | "Send images that recipients can actually browse" | You send a link, they download a zip, they lose context | Gallery view — thumbnails, type badges, lightbox on click |
| `/why/print-as-pdf/` | "Send a document that looks professional" | You send a .md file that no one can read | SgPrint renders it as a branded PDF in the recipient's browser |
| `/why/share-a-video/` | "Share a video without upload limits" | Video platforms log it, ads play, account required | Encrypted video in a vault — plays in browser, key yours |
| `/why/send-securely/` | "Share files you actually need to keep private" | You use email. You use Dropbox. Both see your files. | Zero-knowledge means we cannot read what we cannot see |

---

## SEO Actions

| Action | Priority | Page |
|--------|---------|------|
| Deploy `/security/` before removing `/architecture/` | P0 | /security/ |
| Add Product schema (`SoftwareApplication`) | P1 | Homepage |
| Add FAQ schema | P1 | /security/, /pricing/ |
| Add HowTo schema (upload wizard) | P1 | Homepage |
| Add BreadcrumbList | P2 | All non-root pages |
| Generate locale-aware sitemap with `xhtml:link` | P2 | sitemap.xml |
| CloudFront Function for non-JS crawlers at root | P2 | CF config |

---

## QA Site Integration

`qa.send.sgraph.ai` is the **proof layer**. sgraph.ai is the **pitch layer**. Every marketing claim links to the QA site for verification.

| QA content | How to use it |
|-----------|---------------|
| Test report pages + screenshots | Link from /features/ — "See it tested →" |
| Architecture docs | Source material for /security/ |
| Use case test pages | Link from /why/ pages — "See it in action →" |
| Agent team pages | Footer link "Meet the team building this →" |
| Vault browser tool (tools.sgraph.ai) | Link from /features/ and /security/ |

---

*Phase 2 Planning — Decisions and Site Map*
*v0.18.2 — 27 March 2026*
*Sources: Conductor brief, Architect review, Sherpa review*
