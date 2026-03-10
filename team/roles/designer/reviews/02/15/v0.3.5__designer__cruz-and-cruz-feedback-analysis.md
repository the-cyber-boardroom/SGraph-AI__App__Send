# SGraph Send v0.3.5 — Designer Analysis: Cruz & Cruz Kickoff Feedback

**Version:** v0.3.5
**Date:** 15 February 2026
**From:** Designer
**To:** All roles (routing table below)
**Purpose:** Analysis of Cruz & Cruz first feedback, with proposed decisions, design implications, and role actions.

> For the raw feedback capture see `v0.3.5__designer__cruz-and-cruz-feedback-raw.md`. For the original brief see `v0.3.3__brief__cruz-and-cruz-design-agency.md`. For user personas see [Advocate](v0.3.5__advocate.md). For user guidance see [Sherpa](v0.3.5__sherpa.md).

---

## 1. Overall Assessment

Cruz & Cruz's first reactions are encouraging. They engaged with the material substantively — not just aesthetically — and produced one genuinely strong UX concept (CC-F004) that reframes how we approach our core design challenge. The language concerns (CC-F001, CC-F002) are minor and expected when technical teams brief design teams. The cultural research direction (CC-F006, CC-F007) shows they're thinking about the product globally, which aligns with our i18n-from-day-one strategy (D017).

No red flags. No misunderstandings of the zero-knowledge model. No scope concerns about the deliverables. They're ready to start.

---

## 2. Analysis by Feedback Item

### CC-F001 — "Graph" Word Uncertainty

**Assessment:** Expected and manageable.

"Graph" is abstract to non-technical audiences, and a design agency will naturally gravitate toward words that communicate more immediately. But the name serves the product family strategy — once SGraph Text ships with semantic graph visualisations, the name earns itself. Renaming now would be premature optimisation of something that hasn't been tested with real users.

**Decision:** No action. Name confirmed. If Cruz & Cruz raise it again, explain the product family rationale: SGraph = Secure + Semantic + Graph. The logo and visual identity should do the work of making the name feel natural, rather than the name doing the work alone.

---

### CC-F002 — "Blob" Jargon

**Assessment:** Legitimate and immediately actionable.

"Blob" appeared in both the presentation (slide 3) and the written brief. It's a term we use internally because it's precise — but it means nothing to a designer or end user. Worse, it sounds unappealing. Every user-facing instance should be replaced.

**Proposed replacements:**

| Context | Instead of | Use |
|---------|-----------|-----|
| Architecture explanation | "encrypted blob" | "encrypted data" or "encrypted file" |
| Technical detail | "blob on server" | "encrypted package" |
| Transparency panel | — | "encrypted contents" |

**Action:**

| Role | Task | Ref |
|------|------|-----|
| Journalist | Scrub "blob" from all messaging guidelines and published content | CC-F002 |
| Designer | Ensure Cruz & Cruz mockups use approved terminology | CC-F002 |
| Architect | "Blob" is fine in internal technical docs — no change needed in API contracts or code | CC-F002 |

---

### CC-F003 — "Savvy" Word Interest

**Assessment:** Creative signal, not actionable.

Filed for future brand language exploration. Could surface in tagline work ("Privacy for the savvy") or feature naming. No action now.

---

### CC-F004 — Progress Moments as Trust Education Space

**Assessment: This is the most valuable idea from the session.** It deserves to become a core UX pattern.

#### Why This Works

Our biggest design problem (identified in the kickoff brief, slide 11) is: *how do you explain zero-knowledge without overwhelming the user?* Every approach we'd considered was spatial — landing page sections, tooltips, info panels, "how it works" pages. All of them add clutter or require the user to actively seek information.

CC-F004 reframes this as a **temporal** problem. Users already have forced wait states during encryption (~1-3s), upload (variable), and download + decryption (variable). During these moments, they're captive — watching a progress indicator, waiting. This is the perfect time to drip-feed trust information because:

- The user's attention is already on the screen
- They have nothing else to do
- The information is contextually relevant ("here's what's happening to your file right now")
- Each message can be short (one sentence) because the sequence delivers depth over time
- The UI stays clean — no permanent clutter, information appears and disappears with the progress state

#### What This Solves

| Sherpa Friction Item | How CC-F004 Addresses It |
|---------------------|--------------------------|
| F003 — No progress indicator during encryption | Progress component now has content to show |
| F005 — "Is my file really encrypted?" | Real-time message: "Encrypting your file now..." |
| F006 — "What is zero-knowledge?" | Progressive explanation during upload/download |
| F010 — No file size limits shown | Can show during pre-upload phase |
| F013 — No "How It Works" page | The wait-time sequence *is* the explanation |

| Advocate Recommendation | How CC-F004 Addresses It |
|------------------------|--------------------------|
| #1 — Explanatory content before upload form | Education happens *during* upload instead |
| #3 — "How It Works" visual | Animated/sequenced during progress |

#### Design Implications

The upload and download progress components need to be redesigned as a **multi-phase storytelling component**, not a simple progress bar. Phases:

```
UPLOAD JOURNEY:
1. Pre-encryption    → "Your file will be encrypted in your browser"
2. Encrypting        → "Encrypting with AES-256-GCM... your key stays with you"
3. Uploading         → "Sending encrypted data to our server — we can't read it"
4. Completing        → "Here's what we stored: [transparency summary]"
5. Ready             → Share URL + key + "Learn more" link

DOWNLOAD JOURNEY:
1. Loading info      → "Retrieving encrypted data from server"
2. Downloading       → "The server is sending encrypted data — it doesn't have the key"
3. Decrypting        → "Decrypting in your browser using the key from your link"
4. Complete          → File ready + transparency panel + "How this worked" link
```

Each phase shows one short message. Messages can link to deeper content. The component supports i18n (all text from translation files, per D017).

#### Proposed Decision

**D048: Progress moments used as trust education space.** Upload and download progress components display contextual trust information during natural wait states. Information is delivered temporally (one message per phase) rather than spatially (all at once on page). This becomes the primary mechanism for explaining zero-knowledge to users.

**Action:**

| Role | Task | Ref |
|------|------|-----|
| Designer | Brief Cruz & Cruz to design upload/download progress as multi-phase storytelling component | CC-F004 |
| Journalist | Write the progress phase messages (short, one sentence each, i18n-ready) | CC-F004 |
| Sherpa | Review progress messages against friction log — confirm F003, F005, F006, F010, F013 addressed | CC-F004 |
| Dev | Progress component needs phase-aware rendering with content slots | CC-F004 |
| Advocate | Validate that message sequence works for all four personas (technical → non-technical range) | CC-F004 |

---

### CC-F005 — Corporate Messaging Extension

**Assessment:** Strong future feature concept. Don't build it now, but design for it.

The idea that token owners could configure messages shown during upload/download progress is a natural B2B extension. It turns the progress space into a configurable communication channel: the default content is trust education (CC-F004), but enterprise customers could add or replace messages with their own.

This has real value for the Enterprise Admin persona (from Advocate) — it gives them a touchpoint with their users during the file sharing flow.

#### Architecture Implication

For this to work eventually, the progress component needs:

- A **content slot** that accepts external content (not just hardcoded messages)
- Token metadata would need an optional `display_messages` field (or similar)
- The Admin console would need a UI for configuring per-token messages

None of this needs building now. But the component architecture should not preclude it.

#### Proposed Decision

**D049: Progress component designed with pluggable content slot.** The upload/download progress component supports extensible content — default trust education messages (D048) can be supplemented or replaced by token-owner-configured messages in future. Architecture permits this without requiring it now.

**Action:**

| Role | Task | Ref |
|------|------|-----|
| Architect | Note that token metadata schema may gain a `display_messages` field in future — don't block it | CC-F005 |
| Designer | Tell Cruz & Cruz the progress component should have a clear content area that could accept different content sources | CC-F005 |
| Conductor | Add "corporate messaging in progress component" to Explorer backlog as research item | CC-F005 |

---

### CC-F006 — Cultural Colour Research

**Assessment:** Valuable research direction. Needs scoping before it becomes a time sink.

Colours carry cultural weight — red means luck in China, danger in the West; white means purity in the West, mourning in parts of Asia. For a product targeting privacy-aware markets globally, this matters. But it can also become an unbounded research project.

**Scope it:** Focus on the top 3-5 markets by privacy awareness first. The Advocate and Ambassador roles should identify which markets to prioritise, and then we research colour associations for those markets specifically.

#### Proposed Research Brief

| Question | Owner | Output |
|----------|-------|--------|
| Which markets are most privacy-aware? (top 5) | Advocate + Ambassador | Ranked market list with rationale |
| What colour associations exist in those markets? (positive/negative for security, trust, privacy) | Designer + Ambassador | Cultural colour matrix |
| Do any of our planned themes (Aurora, Glacier, Ember) have negative associations in target markets? | Designer | Theme risk assessment |

**Action:**

| Role | Task | Ref |
|------|------|-----|
| Advocate | Identify top 5 privacy-aware markets (regulatory environment, cultural attitudes, market size) | CC-F006 |
| Ambassador | Support with competitive landscape — where are privacy-first products succeeding? | CC-F006 |
| Designer | Once markets identified, research cultural colour associations and validate theme palettes | CC-F006 |

---

### CC-F007 — Theme Rationale as Discoverable Content

**Assessment:** Low-effort, high-charm idea. Do it.

A "Why this theme?" link from the theme picker to a page explaining the design decisions — colour rationale, cultural considerations, accessibility choices — is a trust-building gesture that costs almost nothing to produce. It reinforces the transparency ethos of the product: we explain our design decisions the same way we explain our data handling.

The feedback loop extension (inviting users to comment on cultural appropriateness) is clever — it generates engagement, produces free research, and signals that we care about getting things right for different communities.

#### Proposed Decision

**D050: Theme rationale pages with feedback loop.** Each theme has a discoverable explanation page covering colour choices, cultural considerations, and accessibility rationale. Pages include a feedback mechanism for users to comment on cultural appropriateness.

**Action:**

| Role | Task | Ref |
|------|------|-----|
| Journalist | Write theme rationale content for each of the 5 themes (once colour research from CC-F006 is done) | CC-F007 |
| Designer | Design the theme explanation page and feedback mechanism | CC-F007 |
| Dev | Implement as a standard IFD page, linked from theme picker | CC-F007 |
| Advocate | Define the feedback questions — what do we actually want to learn from users? | CC-F007 |

---

## 3. Proposed Decisions Summary

| ID | Decision | Origin | Status |
|----|----------|--------|--------|
| D048 | Progress moments used as trust education space | CC-F004 | Proposed |
| D049 | Progress component designed with pluggable content slot | CC-F005 | Proposed |
| D050 | Theme rationale pages with feedback loop | CC-F007 | Proposed |

---

## 4. Full Action Routing

| Role | Actions | Feedback Refs |
|------|---------|---------------|
| **Designer** | Brief Cruz & Cruz on progress-as-education pattern; ensure "blob" scrubbed from mockups; lead cultural colour research once markets identified | CC-F002, CC-F004, CC-F005, CC-F006 |
| **Journalist** | Scrub "blob" from messaging; write progress phase messages; write theme rationale content | CC-F002, CC-F004, CC-F007 |
| **Advocate** | Identify top 5 privacy-aware markets; validate progress messages for all personas; define feedback questions for theme pages | CC-F004, CC-F006, CC-F007 |
| **Ambassador** | Support market research — where are privacy products succeeding? | CC-F006 |
| **Sherpa** | Review progress messages against friction log; confirm friction items addressed | CC-F004 |
| **Architect** | Note future `display_messages` in token schema; no blocking changes needed now | CC-F005 |
| **Dev** | Progress component needs phase-aware rendering with content slots; IFD page for theme rationale | CC-F004, CC-F005, CC-F007 |
| **Conductor** | Add corporate messaging to Explorer backlog | CC-F005 |
| **Historian** | Record D048–D050 in decision log | All |
| **Librarian** | Index this feedback capture and analysis in master index | All |

---

## 5. Response to Cruz & Cruz

Before their next working session, confirm to Cruz & Cruz:

1. **"SGraph" name is confirmed** — proceed with it (CC-F001)
2. **Replace "blob" with "encrypted data"** in all user-facing materials (CC-F002)
3. **Progress-as-education is greenlit** — design the upload/download progress component as a multi-phase storytelling experience, not a simple progress bar (CC-F004)
4. **Design the progress component with a flexible content area** — we'll want to support different content sources in future (CC-F005)
5. **Cultural colour research is welcome** — we'll provide a shortlist of priority markets to focus on (CC-F006)
6. **Theme rationale pages are approved** — include a "Why this theme?" link in the theme picker concept (CC-F007)

---

## Document Lineage

This document is the Designer role's analysis of feedback captured in `v0.3.5__designer__cruz-and-cruz-feedback-raw.md`. It references the kickoff presentation (`sgraph-send-kickoff-cruz-and-cruz.pdf`), the written brief (`v0.3.3__brief__cruz-and-cruz-design-agency.md`), and the v0.3.5 release pack documents for cross-role context.
