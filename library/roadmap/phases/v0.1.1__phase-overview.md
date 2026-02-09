# SGraph Send — Phase Overview

**Status:** Active
**Date:** 2026-02-08

This document summarises all planned phases, derived from the six specification documents. Only **Phase 1 (MVP)** is actively scoped in Issues FS. Later phases are listed for context and will be detailed when they enter active development.

---

## Phase 1: MVP (NOW)
**Source:** `project - Secure Send Service brief.md`
**Goal:** Ship core encrypted file transfer with token auth and transparency panel.

**Scope:**
- Core transfer flow: encrypt in browser → upload via pre-signed URL → share link + key → download → decrypt
- Token-based auth for senders, public download for receivers
- Transparency panel showing captured metadata
- Admin token management and usage stats
- 7 API endpoints, S3 data model, 3 environments (dev/qa/prod)
- Static frontend (vanilla JS), FastAPI backend on Lambda

**User Stories:** ADM-1, ADM-2, SND-1–7, RCV-1–5, SEC-1–7

---

## Phase 2: Deploy-Everywhere + Plugin Framework
**Source:** `secure-send-roadmap.md`, `secure-send-plugins-i18n-commercial.md`
**Goal:** Storage abstraction, plugin architecture, PyPI + Docker distribution.

---

## Phase 3: Cost Tracking + Billing
**Source:** `secure-send-roadmap.md`, `secure-send-plugins-i18n-commercial.md`
**Goal:** Per-transfer cost model, Stripe credit purchase, credit deduction.

---

## Phase 4: Fingerprint + Accessibility
**Source:** `secure-send-roadmap.md`, `secure-send-plugins-i18n-commercial.md`
**Goal:** IP enrichment, browser fingerprint transparency, WCAG 2.2 AA.

---

## Phase 5: i18n Phase 1 + Themes
**Source:** `secure-send-plugins-i18n-commercial.md`
**Goal:** Language packs (8 languages), theme system (Matrix, corporate, seasonal).

---

## Phase 6: Security Intelligence + Bot Detection
**Source:** `secure-send-roadmap.md`
**Goal:** IDS rules, bot detection, access timeline, threat dashboard.

---

## Phase 7: Retention + Credit Economics
**Source:** `secure-send-llm-retention-compliance-gtm.md`
**Goal:** Configurable expiry, download limits, deletion by key holder, credit system.

---

## Phase 8: GTM + Launch
**Source:** `secure-send-llm-retention-compliance-gtm.md`, `sgraph-ai-naming-branding-strategy.md`
**Goal:** Competitive analysis, SEO strategy, Product Hunt / HN launch.

---

## Phase 9: CLI + SDK + One-Time Secrets
**Source:** `secure-send-strategic-opportunities.md`
**Goal:** Python CLI, Python SDK, JS/TS SDK, dedicated secrets sub-product.

---

## Phase 10: MCP Server + Webhooks
**Source:** `secure-send-strategic-opportunities.md`
**Goal:** MCP integration for agent workflows, webhook event system.

---

## Phase 11+: Future Phases
**Source:** All spec documents

Includes: LLM integration, user accounts, browser extension, mobile PWA, data room mode, P2P/WebRTC, multi-recipient, compliance/trust pack, warrant canary, notarisation, time-locked transfers, regulated verticals, i18n phases 2–3, enterprise features, revenue diversification.

See `docs/specs/README.md` for the full document-to-phase mapping.
