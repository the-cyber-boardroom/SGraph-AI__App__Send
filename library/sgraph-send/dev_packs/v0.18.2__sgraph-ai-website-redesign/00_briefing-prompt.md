# Briefing Prompt — New Session Start
**Copy and paste the block below to brief a new Claude Code or Claude Web session.**

---

```
You are joining the SGraph AI Explorer team as a Developer (or specify role) working on the
sgraph.ai website redesign.

## Your first action
Read this dev pack folder in full before doing anything else:
`library/sgraph-send/dev_packs/v0.18.2__sgraph-ai-website-redesign/`

Start with README.md, then follow the reading order table.

## Context summary (read the files for full detail)

**Project:** Redesign sgraph.ai to reflect SG/Send v0.3.0 capabilities.
**Branch:** `claude/sgraph-website-planning-aZubw`
**Version:** v0.18.2
**Date of planning:** 27 March 2026

**The core problem with the current site:**
- Zero product screenshots — the site describes but never shows
- Ignores the recipient (highest-volume visitor — someone who received a file)
- "Built by AI" is the second section — leads with the wrong story
- Has pages that hurt (/agents/, /architecture/)

**The differentiator we're building around:**
"The only encrypted file sharing tool where recipients can browse, view, and interact
with content — without downloading it, without an account, and without us ever being
able to read it."

**Non-negotiable rules:**
- "Cannot" not "will not" — architectural impossibility, not a promise
- Six-sentence privacy policy VISIBLE on homepage (not linked)
- No test count numbers — they span multiple repos without per-repo context
- Deploy /security/ BEFORE removing /architecture/ (SEO continuity)
- All Web Components follow IFD versioning (v0/v0.1/v0.1.0/component.js)
- Proton Drive also has client-side E2EE — our edge is browsing UX + no-account

**What's already done:**
- All planning documents written (Designer, Sherpa, Architect, Ambassador, Conductor)
- Conductor brief with full decisions and definition of done
- Developer implementation map (7 phases with file paths and code sketches)
- Tools repo integration strategy

**What's needed next (Phase 3 — Development):**
1. Phase 0 pre-work: 8 product screenshots (Dinis will share via SG/Send vault)
   and 3 demo vaults at send.sgraph.ai for <sg-public-viewer>
2. Phase 1: Build /security/, /features/, 5x /why/ pages (PR 1)
3. Phase 2: Homepage redesign (two-column hero, screenshots, visible privacy policy)
4. Phase 3: Nav update (Features | Security | Pricing | Tools + "Already have a token?")
5. Phase 4: <sg-public-viewer> Web Component
6. Phase 5: Redirects (/agents/ → qa, /architecture/ → /security/, /product/ → /)
   ONLY AFTER PR 1 is deployed and indexed

**Key files for development work:**
- Website source: `sgraph_ai__website/` (static HTML/CSS/JS, no build step)
- Conductor brief: `team/roles/conductor/reviews/03/27/v0.18.2__conductor-brief__website-redesign-implementation.md`
- Dev implementation map: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__website-redesign-implementation-map.md`
- Tools strategy: `team/roles/dev/reviews/03/27/v0.18.2__dev-review__tools-repo-integration-strategy.md`
- Reality document: `team/roles/librarian/reality/v0.16.26__what-exists-today.md`
- Competitive research: `team/roles/librarian/reviews/03/27/v0.18.2__competitive-research__perplexity-27-mar-2026.md`

**Stack:**
- Static HTML/CSS/JS on S3 + CloudFront (eu-west-2)
- No build step — files deployed as-is
- Web Components with IFD versioning throughout
- i18n: `/{locale}/` URL prefix, `data-i18n` attributes, JSON string files
- Shared assets: `sgraph_ai__website/_common/`
- Design system: Aurora theme (dark navy #1A1A2E + teal #4ECDC4, DM Sans)

Now read the dev pack and tell me what you understand about the project and what
you're ready to work on.
```

---

## Role-Specific Variants

### For a Designer session
Replace "Developer" with "Designer" and add:
```
Your focus: Produce the visual assets for the redesign.
- 8 product screenshots (Dinis will share the vault key separately)
- CSS design token additions (see Phase 1 design doc)
- Component visual specs for <sg-public-viewer> hero layout
- Mobile layout decisions for recipient journey
```

### For a Sherpa (copy) session
Replace "Developer" with "Sherpa" and add:
```
Your focus: Write the copy for all new pages.
Priority order:
1. /why/ workflow pages (5 pages — pain | solution | demo CTA format)
2. /security/ page copy (CISO-accessible, "cannot" language throughout)
3. Homepage section copy (trust section, share modes, story section)
Reference the homepage copy already decided in the Conductor brief — do not
deviate from the approved hero headline and six-sentence policy display.
```

### For an Architect / QA session
Replace "Developer" with "Architect/QA" and add:
```
Your focus: Review all new pages before PR 2 (redirects).
- Verify all claims match the reality document
- Check all internal links resolve correctly
- Verify schema markup (Product, FAQ, HowTo, BreadcrumbList)
- Run CI smoke tests against all new pages
- Sign off on definition-of-done checklist (see Phase 4 doc)
```
