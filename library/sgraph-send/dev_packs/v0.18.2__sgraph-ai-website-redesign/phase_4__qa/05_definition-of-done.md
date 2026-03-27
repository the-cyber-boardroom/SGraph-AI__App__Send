# Definition of Done — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 4: QA | Source: Conductor brief section 14, Architect review**

The redesign is done when every item on this checklist is checked. QA role signs off before PR 2 (redirects) is merged.

---

## 13-Item Checklist

### Content

- [ ] **1. Homepage shows product screenshots** — gallery, folder browser, and SgPrint screenshots are real product screenshots (not mockups), displayed in the feature showcase section
- [ ] **2. Six-sentence privacy policy is visible on the homepage body** — all six sentences rendered inline in the trust section; not linked, not referenced, displayed in full
- [ ] **3. `/features/` page exists with all v0.3.0 shipped features** — gallery, folder, SgPrint, tokens, share modes, wizard, lightbox, receipt confirmation, zero cookies, 17 languages; all claims match the reality document
- [ ] **4. `/security/` page exists** — covers encryption architecture, 3 evaluator questions (subpoena/breach/retention), transparency panel, zero cookies (DevTools instruction), GDPR-by-architecture, 6-sentence policy, GitHub link
- [ ] **5. Five `/why/` workflow pages exist** — share-a-folder, gallery-preview, print-as-pdf, share-a-video, send-securely; all in en-gb (en-us optional at launch)

### Navigation and UX

- [ ] **6. Navigation updated** — nav shows Features | Security | Pricing | Tools; no Architecture, no Team/Agents
- [ ] **7. "Already have a token? →" link in header** — visible in desktop nav; links to `send.sgraph.ai`; hidden gracefully on mobile (in mobile menu instead)
- [ ] **8. Stats bar replaced** — old stats bar (agents/endpoints/tests/human) removed from homepage; story section repositioned below fold with only agent count + human count (no test count stat)

### Technical

- [ ] **9. `<sg-public-viewer>` demo working on homepage** — live demo loads in hero right column; graceful fallback to static screenshot if component fails or CORS issue
- [ ] **10. Schema markup added** — Product (SoftwareApplication), FAQ, HowTo on appropriate pages; BreadcrumbList on /why/ pages
- [ ] **11. sitemap.xml updated** — new pages added; removed pages removed; locale alternates (`xhtml:link`) on all new pages

### QA Sign-off

- [ ] **12. CI smoke tests pass on all new pages** — all paths return 200:
  ```
  /en-gb/
  /en-gb/features/
  /en-gb/security/
  /en-gb/pricing/
  /en-gb/why/share-a-folder/
  /en-gb/why/gallery-preview/
  /en-gb/why/print-as-pdf/
  /en-gb/why/share-a-video/
  /en-gb/why/send-securely/
  ```
- [ ] **13. Mobile layout tested on all new pages** — two-column hero collapses correctly; demo appears above headline on mobile; nav collapses to hamburger; no horizontal scroll

---

## QA Role Checks (Run Before PR 2)

### Claim verification
Every competitive claim on the new pages must be traceable to the competitive research document (`team/roles/librarian/reviews/03/27/v0.18.2__competitive-research__perplexity-27-mar-2026.md`). No claim on-site without evidence.

Key checks:
- [ ] "Cannot read your files" = architectural fact, not a promise — review all instances
- [ ] Proton Drive claim is accurate — they also have client-side E2EE; our edge is browsing UX + no-account
- [ ] WeTransfer previews acknowledged — do not say "download only"; say "not an encrypted structured gallery/folder UX"
- [ ] No test count numbers anywhere on the site

### Internal link audit
- [ ] All internal links resolve correctly (no 404s on new pages)
- [ ] All QA site links (`qa.send.sgraph.ai`) resolve correctly
- [ ] `/security/` is accessible before redirect from `/architecture/` is added

### Schema validation
- [ ] Use [schema.org validator](https://validator.schema.org) on homepage, /features/, /security/
- [ ] FAQ schema valid on /security/
- [ ] HowTo schema valid on homepage
- [ ] BreadcrumbList valid on /why/* pages

### CORS check
```bash
curl -I -H "Origin: https://sgraph.ai" https://send.sgraph.ai/health
# Must return: Access-Control-Allow-Origin: https://sgraph.ai
```

---

## QA Site Strategy

`qa.send.sgraph.ai` is the **proof layer**. Every claim on sgraph.ai should link to the QA site for verification. Before sign-off, verify:

- [ ] /features/ links to at least one QA test report — "See it tested →"
- [ ] /security/ links to architecture documentation on QA site
- [ ] /why/ pages link to relevant use case test pages
- [ ] Footer includes link "Meet the team building this →" pointing to `qa.send.sgraph.ai/team/`

---

## Definition of Done: Redirects (PR 2 gate)

PR 2 (which adds redirects and removes old pages) can only proceed when:
1. PR 1 is deployed to production
2. `/security/` is indexed by search engines (recommend 48–72h wait)
3. All 13 checklist items above are checked
4. QA role has signed off

---

*Phase 4 QA — Definition of Done*
*v0.18.2 — 27 March 2026*
*Source: Conductor brief section 14, Architect review migration risk register*
