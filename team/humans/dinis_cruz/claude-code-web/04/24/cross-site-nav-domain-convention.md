# Cross-Site Navigation: Domain Convention and Resolution Algorithm

> Written before implementing sg-site-header v1.0.7.
> This doc defines what the code must do and why v1.0.6 is wrong.

---

## 1. The Domain Convention

All SGraph sites share the base domain `sgraph.ai`. Each site has a **site prefix**
(a fixed subdomain label) and each environment has an **env segment** that sits
*between* the site prefix and the base domain.

```
{site-prefix.}{env.}sgraph.ai
```

| Part | What it is | Examples |
|------|-----------|---------|
| `site-prefix.` | Fixed label identifying the site. Empty for Send. | `tools.`, `api.`, `docs.`, `` |
| `env.` | Optional environment marker. Empty means production. | `dev.`, `main.`, `staging.`, `` |
| `sgraph.ai` | Base domain. Always fixed. | — |

### The full matrix

| Site | Production | Dev | Main |
|------|-----------|-----|------|
| **Send** | `sgraph.ai` | `dev.sgraph.ai` | `main.sgraph.ai` |
| **Tools** | `tools.sgraph.ai` | `tools.dev.sgraph.ai` | `tools.main.sgraph.ai` |
| **API** *(future)* | `api.sgraph.ai` | `api.dev.sgraph.ai` | `api.main.sgraph.ai` |
| **Docs** *(future)* | `docs.sgraph.ai` | `docs.dev.sgraph.ai` | `docs.main.sgraph.ai` |

Key observation: **the env segment always comes after the site prefix, not before it.**

### Localhost

Localhost ports are site-local development servers. They carry no env marker.
Cross-site links from localhost resolve to **production** — we do not hard-code
local IPs for other sites.

| Port | Site |
|------|------|
| `localhost:10060` | Send |
| `localhost:10063` | Tools |

---

## 2. Parsing `env` from a Hostname

Given `window.location.hostname`, extract the environment identifier:

```
Step 1. If hostname does not end with 'sgraph.ai'
        → env = ''  (localhost or unknown — treat as production)

Step 2. Strip the base domain from the right:
        inner = hostname without the trailing '.sgraph.ai'

        sgraph.ai          → inner = ''
        dev.sgraph.ai      → inner = 'dev'
        main.sgraph.ai     → inner = 'main'
        tools.sgraph.ai    → inner = 'tools'
        tools.dev.sgraph.ai → inner = 'tools.dev'

Step 3. Match a known site prefix at the start of inner.
        Known prefixes (longest first): 'tools', 'api', 'docs', ''

        inner = ''          → site='send',  env=''
        inner = 'dev'       → site='send',  env='dev'
        inner = 'main'      → site='send',  env='main'
        inner = 'tools'     → site='tools', env=''
        inner = 'tools.dev' → site='tools', env='dev'
        inner = 'tools.main'→ site='tools', env='main'
```

### Worked examples

| Hostname | inner | site prefix stripped | env |
|----------|-------|---------------------|-----|
| `sgraph.ai` | `` | `` | **''** (prod) |
| `dev.sgraph.ai` | `dev` | `` | **'dev'** |
| `main.sgraph.ai` | `main` | `` | **'main'** |
| `tools.sgraph.ai` | `tools` | `tools` | **''** (prod) |
| `tools.dev.sgraph.ai` | `tools.dev` | `tools` | **'dev'** |
| `tools.main.sgraph.ai` | `tools.main` | `tools` | **'main'** |
| `localhost:10060` | — | — | **''** (prod) |
| `localhost:10063` | — | — | **''** (prod) |

---

## 3. Building a Cross-Site URL

Once `env` is known, any cross-site URL is:

```
https://{site-prefix.}{env.}sgraph.ai
```

```js
function xsite(sitePrefix, env) {
    const sitePart = sitePrefix ? sitePrefix + '.' : ''
    const envPart  = env        ? env  + '.'        : ''
    return `https://${sitePart}${envPart}sgraph.ai`
}
```

### Cross-site link table — all combinations

#### "Tools" link (from any Send page)

| Current hostname | env | xsite('tools', env) |
|-----------------|-----|---------------------|
| `sgraph.ai` | '' | `https://tools.sgraph.ai` |
| `dev.sgraph.ai` | 'dev' | `https://tools.dev.sgraph.ai` |
| `main.sgraph.ai` | 'main' | `https://tools.main.sgraph.ai` |
| `localhost:10060` | '' | `https://tools.sgraph.ai` |

#### "Send" link (from any Tools page)

| Current hostname | env | xsite('', env) |
|-----------------|-----|----------------|
| `tools.sgraph.ai` | '' | `https://sgraph.ai` |
| `tools.dev.sgraph.ai` | 'dev' | `https://dev.sgraph.ai` |
| `tools.main.sgraph.ai` | 'main' | `https://main.sgraph.ai` |
| `localhost:10063` | '' | `https://sgraph.ai` |

#### Token bar redirect (from any Send page)

| Current hostname | env | token bar base |
|-----------------|-----|----------------|
| `sgraph.ai` | '' | `https://sgraph.ai/en-gb/browse/` |
| `dev.sgraph.ai` | 'dev' | `https://dev.sgraph.ai/en-gb/browse/` |
| `localhost:10060` | '' | `https://sgraph.ai/en-gb/browse/` |

---

## 4. Why v1.0.6 is Wrong

v1.0.6 detects the env by checking if the hostname **starts with** `dev.` or `main.`:

```js
// v1.0.6 — WRONG
if (host.startsWith('dev.'))  return 'dev.'
if (host.startsWith('main.')) return 'main.'
```

Then it prepends that prefix to the cross-site base domain:

```js
// v1.0.6 — WRONG
const xsite = baseDomain => `https://${ENV_PREFIX}${baseDomain}`
// xsite('tools.sgraph.ai') on dev.sgraph.ai → 'https://dev.tools.sgraph.ai'  ✗
// correct answer is                          → 'https://tools.dev.sgraph.ai'  ✓
```

Two problems:
1. **Wrong URL structure.** The env sits *after* the site prefix, not before it. `dev.tools.sgraph.ai` does not exist. `tools.dev.sgraph.ai` does.
2. **Breaks on the Tools site.** `tools.dev.sgraph.ai` does not start with `dev.` so ENV_PREFIX = `''`, and all cross-site links point to production even when on the dev Tools site.

---

## 5. The Fix (v1.0.7 Implementation Plan)

```js
const BASE_DOMAIN = 'sgraph.ai'
const SITE_PREFIXES = ['tools', 'api', 'docs']  // extend as new sites launch

function detectEnv(hostname) {
    if (!hostname.endsWith(BASE_DOMAIN)) return ''  // localhost → prod
    // strip base domain (and leading dot)
    const inner = hostname.slice(0, -(BASE_DOMAIN.length)).replace(/\.$/, '')
    // strip known site prefix (if any)
    for (const prefix of SITE_PREFIXES) {
        if (inner === prefix) return ''             // e.g. 'tools' → env=''
        if (inner.startsWith(prefix + '.')) {
            return inner.slice(prefix.length + 1)  // e.g. 'tools.dev' → env='dev'
        }
    }
    return inner  // 'dev', 'main', etc. — Send with env, no site prefix
}

function xsite(sitePrefix, env) {
    const sitePart = sitePrefix ? sitePrefix + '.' : ''
    const envPart  = env        ? env + '.'         : ''
    return `https://${sitePart}${envPart}${BASE_DOMAIN}`
}

const ENV = detectEnv(window.location.hostname)
```

SITE_CONFIGS then use:
```js
// In Send config:
{ label: 'Tools', href: xsite('tools', ENV) }

// In Tools config:
{ label: 'Send', href: xsite('', ENV) }

// tokenBarBase in Send config:
get tokenBarBase() { return xsite('', ENV) + '/en-gb/browse/' }
```

HOST_SITE_MAP must also cover the Tools env variants:
```js
const HOST_SITE_MAP = {
    'sgraph.ai':             'Send',
    'dev.sgraph.ai':         'Send',
    'main.sgraph.ai':        'Send',
    'tools.sgraph.ai':       'Tools',
    'tools.dev.sgraph.ai':   'Tools',
    'tools.main.sgraph.ai':  'Tools',
}
```

---

## 6. Adding a New Site (e.g. `api.sgraph.ai`)

1. Add `'api'` to `SITE_PREFIXES` in sg-site-header.js
2. Add a `Api` entry to `SITE_CONFIGS`
3. Add `'api.sgraph.ai'`, `'api.dev.sgraph.ai'`, etc. to `HOST_SITE_MAP`
4. Any existing site that links to API uses `xsite('api', ENV)` — automatically correct on all envs

No other code changes needed. `detectEnv()` and `xsite()` handle the rest.
