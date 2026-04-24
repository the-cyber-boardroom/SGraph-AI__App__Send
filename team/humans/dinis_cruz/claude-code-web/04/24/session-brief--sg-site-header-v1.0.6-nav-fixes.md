# Session Brief — sg-site-header v1.0.6 Nav Fixes
> Written 2026-04-24. Use this to brief a new Claude Code session continuing this work.

---

## What this session did

This session fixed a series of bugs in `sg-site-header` v1.0.6 — the shared
Web Component that renders the top navigation bar on every SGraph site. The
component file is:

```
sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js
```

It is **served from `sgraph.ai` (the Send site)** and imported by both the
Send site and the Tools site. The Tools site loads it via:
```html
<script type="module" src="https://dev.sgraph.ai/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js">
<sg-site-header site="Send" token-bar>
```

All fixes were made in-place to v1.0.6 (already wired into both sites — no
version bump needed for this iteration).

---

## Domain convention (critical — get this right)

```
{env.}{site.}sgraph.ai     ← env comes FIRST, site label comes SECOND
```

| Site  | Prod              | Dev                    | Main                    |
|-------|-------------------|------------------------|-------------------------|
| Send  | `sgraph.ai`       | `dev.sgraph.ai`        | `main.sgraph.ai`        |
| Tools | `tools.sgraph.ai` | `dev.tools.sgraph.ai`  | `main.tools.sgraph.ai`  |

**Not** `tools.dev.sgraph.ai` — that's wrong. Correct is `dev.tools.sgraph.ai`.

The two core functions in the component implement this:

```js
function detectEnv(hostname) {
    if (!hostname.endsWith('sgraph.ai')) return ''  // localhost → treat as prod
    const inner = hostname.slice(0, -('sgraph.ai'.length)).replace(/\.$/, '')
    // inner = '' | 'dev' | 'main' | 'tools' | 'dev.tools' | 'main.tools'
    for (const prefix of ['tools', 'api', 'docs']) {
        if (inner === prefix) return ''                       // 'tools' → env=''
        if (inner.endsWith('.' + prefix))
            return inner.slice(0, -(prefix.length + 1))      // 'dev.tools' → 'dev'
    }
    return inner  // 'dev', 'main', '' — Send has no site prefix
}

function xsite(sitePrefix, env) {
    const envPart  = env        ? env  + '.' : ''
    const sitePart = sitePrefix ? sitePrefix + '.' : ''
    return `https://${envPart}${sitePart}sgraph.ai`
}
```

`ENV` is a module-level constant computed once at load time:
```js
const ENV = detectEnv(window.location.hostname)
// dev.sgraph.ai       → ENV='dev'
// dev.tools.sgraph.ai → ENV='dev'
// tools.sgraph.ai     → ENV=''
// localhost:10060     → ENV=''
```

---

## SITE_CONFIGS — the nav definitions

```js
const SITE_CONFIGS = {
    Send: {
        sitePrefix: '',
        homeUrl:    '/en-gb/',
        tokenBar:   true,
        get tokenBarBase() { return xsite('', ENV) + '/en-gb/browse/' },
        get navItems() {
            return [
                { label: 'How it Works', href: '/en-gb/how-it-works/' },
                { label: 'Vaults',       href: '/en-gb/vaults/' },
                { label: 'Security',     href: '/en-gb/security/' },
                { label: 'Tools',        href: xsite('tools', ENV) },  // cross-site absolute
                { label: 'Pricing',      href: '/en-gb/pricing/' },
            ]
        }
    },
    Tools: {
        sitePrefix: 'tools',
        homeUrl:    '/en-gb/',
        tokenBar:   false,
        get navItems() {
            return [
                { label: 'Send',    href: xsite('', ENV) },  // cross-site absolute
                { label: 'Pricing', href: '/en-gb/pricing/' },
            ]
        }
    }
}

const HOST_SITE_MAP = {
    'sgraph.ai':             'Send',
    'dev.sgraph.ai':         'Send',
    'main.sgraph.ai':        'Send',
    'tools.sgraph.ai':       'Tools',
    'dev.tools.sgraph.ai':   'Tools',
    'main.tools.sgraph.ai':  'Tools',
}
```

Profile resolution: `site` attribute on the element takes precedence over
hostname lookup. The Tools site HTML uses `site="Send"` (hardcoded in the
Tools repo, a separate codebase we cannot change). This means the component
must handle being loaded with `site="Send"` while the page hostname is
`dev.tools.sgraph.ai`.

---

## Key fixes made this session

### Fix 1 — Always absolutise relative hrefs (most important)

**Problem:** Nav items use relative hrefs like `/en-gb/vaults/`. When the Send
header loaded on `dev.tools.sgraph.ai` (with `site="Send"`), clicking
`/en-gb/vaults/` navigated to `dev.tools.sgraph.ai/en-gb/vaults/` → 404.

**Fix:** `_resolveNavItems()` now always absolutises relative hrefs using the
profile's canonical site base:

```js
const siteBase = window.location.hostname.endsWith('sgraph.ai')
    ? xsite(profile?.sitePrefix ?? '', ENV)   // deployed: use canonical site URL
    : window.location.origin                  // localhost: stay on dev server port
profileItems = profileItems.map(i =>
    i.href.startsWith('/') ? { ...i, href: siteBase + i.href } : i
)
```

Result on `dev.tools.sgraph.ai` with Send profile:
- `siteBase = xsite('', 'dev') = 'https://dev.sgraph.ai'`
- `/en-gb/vaults/` → `https://dev.sgraph.ai/en-gb/vaults/` ✓

Result on `localhost:10060`:
- `siteBase = 'http://localhost:10060'`
- `/en-gb/vaults/` → `http://localhost:10060/en-gb/vaults/` ✓ (stays on dev server)

### Fix 2 — Logo link absolutised the same way

**Problem:** `homeUrl: '/en-gb/'` was set as `<a href="/en-gb/">` verbatim, so
clicking the SG/Send logo on `dev.tools.sgraph.ai` stayed on the Tools site.

**Fix:** `_renderHomeUrl()` now applies the same `siteBase` logic:

```js
_renderHomeUrl() {
    const raw = this.getAttribute('home-url') || this._profile()?.homeUrl || '/'
    if (!raw.startsWith('/')) { this._logo.href = raw; return }
    const siteBase = window.location.hostname.endsWith('sgraph.ai')
        ? xsite(this._profile()?.sitePrefix ?? '', ENV)
        : window.location.origin
    this._logo.href = siteBase + raw
}
```

### Fix 3 — Active nav for cross-site and site-root links

**Problem 1:** The Tools link `xsite('tools', ENV)` = `https://dev.tools.sgraph.ai`
has no path (pathname = `/`). When on `dev.tools.sgraph.ai/en-gb/`, pathname
is `/en-gb/` ≠ `/` so it was never marked active.

**Problem 2:** After absolutising all same-site hrefs on localhost, every link
had `hostname === 'localhost'`, so ALL were marked active simultaneously.

**Fix:** `_applyActiveNav()` now distinguishes site-root links from page links:

```js
const url = new URL(i.href)
if (url.hostname === host) {
    if (url.pathname === '/') {
        // Site-root link — active anywhere on that site
        return { ...i, active: true }
    }
    // Page-specific link — require exact pathname match
    return { ...i, active: url.pathname === path }
}
```

Result:
- `https://dev.tools.sgraph.ai` → pathname `/` → active on any Tools page ✓
- `https://dev.sgraph.ai/en-gb/vaults/` → pathname `/en-gb/vaults/` → active only on that exact page ✓

---

## Debug logging currently in the file

The file currently has verbose `console.log` statements added during debugging.
**These should be removed before the next stable version.** The logs are:

- `[sg-site-header] detectEnv: ...` — in `detectEnv()`
- `[sg-site-header] module loaded — hostname=... ENV=...` — at module level
- `[sg-site-header] _profile: attr=... hostMap=... resolved=...` — in `_profile()`
- `[sg-site-header] _resolveNavItems: ...` — before/after absolutise
- `[sg-site-header] _applyActiveNav: ...` — on each active match

To verify the fix is working, open the browser console and look for:
```
[sg-site-header] _resolveNavItems: absolutising relative hrefs with "https://dev.sgraph.ai"
[sg-site-header] _applyActiveNav: ACTIVE (site-root hostname match) href="https://dev.tools.sgraph.ai"
```

---

## What still needs doing

### 1. Remove console.log statements (cleanup for next version)
All the `[sg-site-header]` console.log calls should be stripped before
declaring this component stable. Consider bumping to v1.0.7 at that point.

### 2. `site="Send"` hardcoded in the Tools site HTML
The Tools site (separate repo: `SGGraph-AI__App__Tools` or similar) has:
```html
<sg-site-header site="Send" token-bar>
```
The `site="Send"` causes the Send profile to load on the Tools site. This is
currently worked around by the universal href absolutisation (Fix 1 above), so
it doesn't cause broken links. However:
- The site label shows "Send" on the Tools site instead of "Tools"
- The token bar appears on the Tools site (because Send profile has `tokenBar: true`)

If you can access the Tools site repo, change it to `site="Tools"` or remove
the attribute entirely (hostname detection will pick up 'Tools' automatically).

### 3. Sub-pages active nav on the homepage
The homepage (`/en-gb/`) has no corresponding nav item, so nothing is marked
active when on the homepage. This is intentional but worth confirming with the
product owner.

---

## File locations

| File | Purpose |
|------|---------|
| `sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js` | The component being fixed (all changes this session) |
| `sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.html` | Shadow DOM template (not modified this session) |
| `sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.css` | Component styles (not modified this session) |
| `team/humans/dinis_cruz/claude-code-web/04/24/cross-site-nav-domain-convention.md` | Design doc for the domain convention algorithm |
| `team/humans/dinis_cruz/claude-code-web/04/24/cors-fix-brief--dev-tools-sgraph-ai.md` | CORS fix brief (infrastructure, already resolved) |

---

## Branch and commits

- **Branch:** `claude/fix-sgraph-website-bugs-6V8r0`
- **Key commits this session:**
  - `5aa5007` — fix(header): absolute logo link; site-root href matches active on any page
  - `fca40ce` — fix(header): always absolutise nav hrefs using profile's canonical origin
  - `90facf7` — fix+debug(header): pathname match for same-host links; log _profile() resolution
  - `76808c9` — debug(header): add console.log tracing to v1.0.6 nav resolution
  - `f260a1a` — fix(header): localhost nav links use window.location.origin not production
  - `4f3f5bb` — fix(header): v1.0.6 absolute nav links on localhost for debugging

---

## SgComponent base class (important constraint)

The component extends `SgComponent` from:
```
https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js
```

**Critical rule:** every subclass MUST declare `static jsUrl = import.meta.url`.
`SgComponent` uses this to resolve sibling `.html` and `.css` files via `fetch()`.
Without it, it falls back to its own URL on `tools.sgraph.ai`, causing CORS
errors and loading the wrong template.

All 10 new homepage components created earlier in this session have this:
```js
class SgSendHero extends SgComponent {
    static jsUrl = import.meta.url
    ...
}
```

---

## Infrastructure note (CORS — already fixed)

`SgComponent` fetches sibling `.html`/`.css` files at component load time. When
the Tools site (`dev.tools.sgraph.ai`) imports `sg-site-header.js` from
`dev.sgraph.ai`, the fetch origin is Tools but the target is Send → cross-origin.

This was fixed by adding a **CloudFront Response Headers Policy** to the Send
CloudFront distribution that returns `Access-Control-Allow-Origin: *` for
`/_common/**` paths. The fix was applied externally (not in this repo).
