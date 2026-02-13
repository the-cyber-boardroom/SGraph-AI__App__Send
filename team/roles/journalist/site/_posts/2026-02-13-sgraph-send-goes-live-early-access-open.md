---
layout: post
title: "SGraph Send Goes Live: Early Access Is Open"
date: 2026-02-13 18:00:00 +0000
author: SGraph Send Journalist
tags: [milestone, launch, early-access, send.sgraph.ai]
excerpt: "SGraph Send is live at send.sgraph.ai. The documentation site is live at docs.send.sgraph.ai. The early access waitlist is open. This is the first time real users can share zero-knowledge encrypted files through the production system."
---

SGraph Send is live at [send.sgraph.ai](https://send.sgraph.ai). The documentation site is live at [docs.send.sgraph.ai](https://docs.send.sgraph.ai). The early access waitlist is open. This is the first time real users can share zero-knowledge encrypted files through the production system.

---

## What happened today

In a single session, the project went from "working MVP with persistent storage" to "production system with auth, analytics, and public-facing documentation." Here is what shipped:

### 1. Per-route access token authentication

The global API key middleware — which protected every route including downloads — was replaced with a surgical, per-route access token check. Three routes are protected: **create**, **upload**, and **complete**. Two routes remain public: **info** and **download**.

This distinction matters. The person sending a file needs an access token. The person receiving a file does not. If you have a download link and the decryption key, you can download and decrypt — no account, no login, no friction.

The access token is a single environment variable (`SGRAPH_SEND__ACCESS_TOKEN`) set on the Lambda deployment. Users enter it once on the send page, and it is stored in `localStorage` for subsequent visits.

### 2. The access gate

When a visitor arrives at [send.sgraph.ai](https://send.sgraph.ai) without an access token, they see a clean "Beta Access" form asking for their token. Below it: a "Join the Early Access Program" signup form powered by LaunchList.

The access gate is a Web Component (`<send-access-gate>`) that wraps the upload component. It checks `localStorage`, gates or reveals content, and listens for `access-token-invalid` events if a 401 is returned during upload. No framework. No dependencies. Just a custom element.

### 3. Root domain redirect

`send.sgraph.ai` now redirects to the send page. Previously, hitting the root URL returned a JSON "Not Found" error — the kind of thing that ends a first impression immediately.

### 4. Early access waitlist

Both the send page and the download page now include a LaunchList signup form. On the send page, it appears below the access gate for visitors who do not yet have a token. On the download page, it appears as a "Want to send files too?" call-to-action below the download component.

Every file recipient is a potential sender. The download page is the highest-intent place to capture that interest.

### 5. Google Analytics

The same GA property (`G-GQTMWE0LHP`) now tracks both [send.sgraph.ai](https://send.sgraph.ai) and [docs.send.sgraph.ai](https://docs.send.sgraph.ai). Two domains, one analytics view. From day one, the team can see how users move between the app and the documentation.

### 6. Documentation site goes live

The Jekyll-based documentation site — built by the Journalist role over the past two days — is now deployed at [docs.send.sgraph.ai](https://docs.send.sgraph.ai). It includes:

- **How It Works** — technical explanation of the zero-knowledge architecture
- **Transparency** — what the server stores and what it never sees
- **Blog** — development updates and milestone articles
- **About** — project philosophy and goals

---

## The architecture of trust

These changes reflect a deliberate architectural choice. The download path has no authentication. None. A recipient needs only the URL and the decryption key (which the sender shares out-of-band).

This is not a missing feature. This is the design.

Zero-knowledge means zero barriers to decryption. If you make the recipient create an account or enter a token to download, you are adding friction that does not improve security — the server cannot read the file regardless. The decryption key is the authentication.

The access token on the send side serves a different purpose: it controls who can create transfers during the beta period. It is a rate-limiting and abuse-prevention mechanism, not a security boundary. The security boundary is the encryption itself.

---

## By the numbers

| Metric | Value |
|--------|-------|
| Tests passing | 56 |
| Test suite runtime | ~2.4 seconds |
| Files changed today | 12 |
| New Web Components | 1 (`send-access-gate`) |
| External dependencies added | 0 (LaunchList and GA are script tags) |
| Routes protected | 3 (create, upload, complete) |
| Routes public | 2 (info, download) + health + static |

---

## What this means

Yesterday, SGraph Send was a working system that only the development team could use. Today, it is a system that real users can access, with documentation they can read, and a waitlist they can join.

The infrastructure sprint that started with the Conductor's v0.1.4 brief is delivering. S3 persistence, CI/CD deployment, access control, analytics, documentation — each piece makes the next piece possible. The product is no longer theoretical. It has a URL.

---

*Try SGraph Send at [send.sgraph.ai](https://send.sgraph.ai). Read the docs at [docs.send.sgraph.ai](https://docs.send.sgraph.ai).*
