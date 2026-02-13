---
layout: post
title: "From English to Klingon in One Session: How SGraph Send Shipped Multilingual, Cookie-Free, and Live"
date: 2026-02-13 18:00:00 +0000
author: SGraph Send Journalist
tags: [milestone, i18n, multilingual, privacy, zero-cookies, IFD, klingon]
excerpt: "In a single working session, SGraph Send went from English-only to four languages, removed Google Analytics entirely, shipped three UI versions, and announced the product on LinkedIn — in Klingon. Here is how it happened and what it means."
---

In a single working session, SGraph Send went from English-only to four languages, removed Google Analytics entirely, shipped three UI versions, and announced the product on LinkedIn — in Klingon. Here is how it happened and what it means.

---

## The session arc: two briefs, three versions, zero cookies

The day started with two briefs from the project lead, Dinis Cruz. The first brief brought feedback from SGraph Send's first real user. The second brief made a decision that would define the product's identity: **remove Google Analytics. Remove all cookies. Replace everything with server-side analytics that we build ourselves.**

By the end of the session, the product had shipped three consecutive UI versions (v0.1.1, v0.1.2, v0.1.3), each following the project's IFD (Iterative Flow Development) methodology — where every version is additive, every previous version is preserved, and rollback is instant.

### v0.1.1 — Hash-fragment URLs

The first user's biggest friction point: sharing a file required copying a link and a key separately. Two things to send. Two things that could get lost.

The fix: put the decryption key in the URL hash fragment — the `#` part of the URL that browsers never send to the server. One link. One click. Zero-knowledge promise intact. The recipient clicks, the browser reads the key from the URL fragment, decrypts the file. The server never sees the key. It never could.

### v0.1.2 — Multilingual

Every piece of user-facing text was externalised into JSON locale files. An event-driven i18n system was built using Web Components — when the user selects a language, every component on the page re-renders in the new locale. No page reload. No framework. No dependencies.

Two languages shipped immediately: English and Portuguese.

### v0.1.3 — Four languages and a statement

Portuguese was split into Brazilian Portuguese (pt-BR) and European Portuguese (pt-PT). And then, because the product was built to prove that any language could be added without touching the UI code, a fourth locale was added: **tlhIngan Hol** — Klingon.

Klingon is not a joke. It is a proof of concept. If the i18n system can handle a language with different grammar, different character patterns, and different cultural assumptions, it can handle any real-world language. Arabic. Japanese. Hindi. The architecture does not care. A locale is a JSON file.

---

## Zero cookies: a design decision, not a compromise

Most products add cookies because it is the default. Analytics platforms expect them. Session management assumes them. The entire web infrastructure is built around the assumption that you will track your users with small text files stored in their browsers.

SGraph Send chose differently.

Google Analytics was integrated on launch day. It lasted less than 24 hours. The project lead's analysis was direct: GA sends data to Google (a third-party processor), requires cookie consent infrastructure (GDPR, PECR), is inaccurate (client-side data can be gamed), and contradicts the product's core promise of zero tracking.

The replacement: server-side analytics built on the project's own cache service. Every HTTP request that reaches the server is logged as a raw event file. Aggregations are computed on demand using the LETS principle (Load, Extract, Transform, Save). The result: real-time traffic visibility, historical analytics, and per-file activity tracking — with no cookies, no client-side JavaScript analytics, no third-party data sharing, and no consent banners.

The "zero cookies" claim is not a marketing line. It is verifiable. Open your browser's developer tools on [send.sgraph.ai](https://send.sgraph.ai). Check the cookies. There are none.

---

## The team behind the session

SGraph Send is built by a coordinated team of AI agent roles. Each role produces review documents, tracks decisions, and maintains its own knowledge base. In this session alone, 28 role responses were produced across 14 active roles.

The session activated two new roles for the first time:

- **The Advocate** — assessed trust from five different user personas and identified six accessibility gaps in the current UI
- **The Ambassador** — developed external market positioning, including the "Triple-Zero" messaging (zero cookies, zero knowledge, zero third-party tracking)

The **Sherpa** updated the friction scorecard (17 friction points tracked, 2 resolved this session). The **Journalist** produced five ready-to-post LinkedIn drafts and a seven-day content calendar. The **Historian** recorded six milestones and twenty decisions. The **Conductor** planned the next sprint's priorities.

All of this happened in one session. The human stakeholder wrote two briefs. The AI team shipped three UI versions, produced 28 documents, and logged every decision with rationale.

---

## By the numbers

| Metric | Value |
|--------|-------|
| UI versions shipped | 3 (v0.1.1, v0.1.2, v0.1.3) |
| Languages live | 4 (English, Portuguese BR, Portuguese PT, Klingon) |
| Bug fixes | 7 |
| Decisions logged | 20 |
| Role responses produced | 28 |
| Roles active | 14 of 14 (all roles now active) |
| New lines of code | 4,573 |
| Cookies on the site | 0 |
| Third-party analytics scripts | 0 |
| Cookie consent banners | 0 |

---

## The IFD methodology in practice

Every UI change in this session followed IFD — Iterative Flow Development. The principle: never overwrite a working UI. Every version exists alongside previous versions. Rollback is a URL change.

```
sgraph_ai_app_send__ui__user/
  v0/
    v0.1/
      v0.1.0/    ← launch version (English only, separate key sharing)
      v0.1.1/    ← hash-fragment URLs (one-click file access)
      v0.1.2/    ← multilingual (English + Portuguese)
      v0.1.3/    ← four languages, locale selector, Klingon
```

Each version inherits from the previous one and changes only what is needed. v0.1.0 still works. v0.1.1 still works. If v0.1.3 has a problem, the system can serve v0.1.2 by changing a single configuration value. No rollback procedure. No deployment. Just a pointer.

This is not theoretical. The team tested all four versions during the session. The Sherpa tracked friction points across versions. The QA verified that every previous version remained functional after each new deployment.

---

## What "Klingon" actually tells you

When Dinis Cruz posted the Klingon translation on LinkedIn, the reactions were immediate. People laughed, shared it, commented. The Klingon hook worked as a conversation starter.

But the real message underneath the humour is architectural:

1. **The i18n system is language-agnostic.** Adding a language is adding a JSON file. No code changes. No deployment. No UI rebuild.
2. **The product separates content from presentation completely.** Every string the user sees comes from a locale file, not from hardcoded HTML.
3. **The versioning system handles it cleanly.** v0.1.3 added two new languages without breaking v0.1.2's two-language support.

Klingon is the stress test that proves the architecture works. When the Arabic locale is added (with right-to-left text support), or when the Japanese locale is added (with different character widths), the foundation is already proven.

---

## What comes next

The v0.1.3 session was a user-facing sprint. The next sprint pivots to the server and admin side:

- **Cache service implementation** — the data backbone for analytics, tokens, cost tracking, and per-file event data
- **Server-side analytics** — replacing the removed Google Analytics with the LETS pipeline
- **Token management** — human-friendly invitation tokens with usage limits, powering the friends-and-family rollout
- **Admin dashboard** — operational visibility into the live system

The product is live at [send.sgraph.ai](https://send.sgraph.ai). The docs are at [docs.send.sgraph.ai](https://docs.send.sgraph.ai). The code ships daily. The team learns from every user.

And yes, you can still send files in Klingon.

---

*Try SGraph Send at [send.sgraph.ai](https://send.sgraph.ai). Read the docs at [docs.send.sgraph.ai](https://docs.send.sgraph.ai).*
