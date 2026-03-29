# Launch Checklist — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Phase 5: Release | Source: Conductor brief, DevOps, Ambassador review**

Two-PR release strategy. PR 1 is safe to deploy at any time. PR 2 must wait for PR 1 to be deployed and indexed.

---

## Pre-Launch Requirements

### Blockers (must be done before PR 1 can be built)

- [ ] **8 product screenshots** — Dinis will take and share via SG/Send vault. Target paths in `sgraph_ai__website/_common/img/screenshot-*.png`
- [ ] **3 demo vaults created** at `send.sgraph.ai` (`demo-gallery-001`, `demo-folder-001`, `demo-doc-001`)
- [ ] **CORS configuration** — `send.sgraph.ai` allows `sgraph.ai` origin for `<sg-public-viewer>`
- [ ] **`static.sgraph.ai` available** — or pinned components served locally from `_common/components/`

---

## PR 1 — All New Content (Safe to deploy anytime)

### Before merging PR 1
- [ ] All 13 Definition-of-Done items checked (see `05_definition-of-done.md`)
- [ ] QA smoke tests pass locally
- [ ] Dinis has reviewed the PR
- [ ] Mobile layout reviewed on iPhone and Android

### PR 1 contains
- New pages: `/security/`, `/features/`, 5x `/why/` pages
- Homepage redesign (two-column hero, screenshots, 6-sentence policy, new sections)
- Navigation update (Features | Security | Pricing | Tools + "Already have a token?")
- `<sg-public-viewer>` Web Component
- New CSS tokens
- Schema markup (SoftwareApplication, FAQ, HowTo, BreadcrumbList)
- sitemap.xml updated with new pages (old pages still present)
- CI smoke test updates

### PR 1 does NOT contain
- No redirects
- No deletions
- No removal of old pages

---

## Post-PR 1 Deployment

### Immediate (deploy day)
- [ ] Smoke test all new pages in production
- [ ] Verify `<sg-public-viewer>` loads on homepage (or fallback displays gracefully)
- [ ] Check schema markup in [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Submit updated sitemap to Google Search Console
- [ ] Confirm `/security/` is accessible and indexed-crawlable

### Wait period (48–72 hours)
- [ ] Monitor Search Console for `/architecture/` ranking — confirm before 301 redirect
- [ ] Monitor for any errors on new pages (CloudFront logs, CI alerts)

---

## PR 2 — Redirects and Removals (after PR 1 is indexed)

### Gate: PR 2 can only proceed when
- [ ] PR 1 has been in production for at least 48 hours
- [ ] `/security/` appears in search engine results (or at minimum is crawled)
- [ ] No major errors reported on PR 1 content

### PR 2 contains
- CloudFront redirect rules:
  - `/architecture/` → `/security/` (301)
  - `/product/` → `/` (301)
  - `/agents/` → `qa.send.sgraph.ai/team/` (301)
  - `/agents/sherpa/` → `qa.send.sgraph.ai/team/` (301)
  - `/agents/ambassador/` → `qa.send.sgraph.ai/team/` (301)
  - `/agents/architect/` → `qa.send.sgraph.ai/team/` (301)
- Remove old pages from sitemap.xml
- CI updates (validate, smoke test)
- Remove old page HTML files (after redirects are confirmed working)

### After PR 2
- [ ] Test all redirect paths — confirm 301 responses
- [ ] Confirm old URLs redirect correctly
- [ ] Update any internal links that still point to old paths
- [ ] Monitor `qa.send.sgraph.ai/team/` for traffic spike (the agents pages will now redirect there)

---

## v0.3.0 Launch Messaging

### Announcement copy (for use by Ambassador/Journalist role)

**Short version (tweet/social):**
> "SG/Send v0.3.0 is live. Encrypted file sharing where recipients browse — not just download. Gallery view, folder browser, SgPrint. No account. No cookies. We can't read your files (architecture, not promise). sgraph.ai"

**Two-tweet thread:**

Tweet 1:
> "Most encrypted file sharing: you encrypt, they download a zip, they decrypt, they scroll.
> SG/Send v0.3.0: you encrypt, they get a gallery — browse, view, click — without downloading. No account. No cookies. Key never reaches our server."

Tweet 2:
> "The part we're most proud of: 'We cannot read your files' is architecture, not a promise.
> Subpoena our servers → get encrypted ciphertext. Breach us → same result.
> Verify in DevTools: zero cookies. Audit the crypto: github.com/the-cyber-boardroom/SGraph-AI__App__Send"

---

## Post-Launch Monitoring

- [ ] CloudFront error rate — watch for 4xx/5xx spikes
- [ ] Search Console — monitor impressions/clicks on new pages
- [ ] `<sg-public-viewer>` fallback rate — if high, investigate CORS or send.sgraph.ai availability
- [ ] Homepage conversion (early-access signups) — compare 2-week pre/post redesign

---

## What's NOT in This Release

Per Conductor brief scope limits:
- ❌ tools.sgraph.ai redesign — nav update only, not a full redesign
- ❌ Translation of new pages — en-gb and en-us only at launch
- ❌ `/investors/` page — served by homepage + pitch materials
- ❌ Speed test tool — out of scope for this sprint
- ❌ `/compare/` dedicated page — the competitive table on /features/ or /security/ is sufficient at launch

---

*Phase 5 Release — Launch Checklist*
*v0.18.2 — 27 March 2026*
*Sources: Conductor brief, Developer implementation map, Ambassador review*
