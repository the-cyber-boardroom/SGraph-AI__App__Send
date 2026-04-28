# CORS Fix Brief — dev.tools.sgraph.ai fetching from dev.sgraph.ai

## What you need to do

Fix a CORS error that prevents the Tools website (`dev.tools.sgraph.ai`)
from loading web component templates (`.html`, `.css`) served from the
Send website (`dev.sgraph.ai`).

---

## The error (exact console output)

```
Access to fetch at
  'https://dev.sgraph.ai/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.css'
from origin 'https://dev.tools.sgraph.ai' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

Same error for `.html` files. HTTP status: `net::ERR_FAILED`.

---

## Why this happens — the component loading chain

1. `dev.tools.sgraph.ai/en-gb/` loads `sg-site-header.js` via a `<script type="module">` tag  
   pointing to `https://dev.sgraph.ai/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js`

2. That JS file imports `SgComponent` from `https://tools.sgraph.ai/components/base/...`.  
   `SgComponent` uses `static jsUrl = import.meta.url` (the URL of `sg-site-header.js`)  
   to `fetch()` the sibling `.html` and `.css` files.

3. The fetch origin is `https://dev.tools.sgraph.ai`.  
   The fetch target is `https://dev.sgraph.ai/_common/js/components/...`.  
   These are **different origins** → browser sends CORS preflight.

4. `dev.sgraph.ai` (served from S3 + CloudFront) returns **no CORS headers**  
   → browser blocks the response.

**This is not a code bug in the component.** The loading mechanism is correct and intentional — the `_common/` folder on `dev.sgraph.ai` is the shared component library that all SGraph sites import from. The fix is on the **infrastructure side**.

---

## What needs fixing

The **CloudFront distribution(s) and/or S3 bucket** serving `dev.sgraph.ai`
(and `sgraph.ai` prod, `main.sgraph.ai`) need to return CORS response headers
for requests to `/_common/**` paths, allowing origins from `*.sgraph.ai`.

---

## Infrastructure facts

| What | Where |
|------|-------|
| Static site deploy script | `scripts/deploy_static_site.py` |
| Deploy workflow | `.github/workflows/deploy-website.yml` |
| CloudFront URL rewrite function | `sgraph_ai__website/cloudfront/url-rewrite.js` |
| S3 bucket naming convention | `{account-id}--static-sgraph-ai--{region}` |
| Known CloudFront dist ID (prod) | `E2YZA5CZTJE62H` (in url-rewrite.js comment) |
| Dev/main dist IDs | In GitHub secrets: `WEBSITE_CF_DIST`, `WEBSITE_CF_DIST_MAIN` |
| Lambda CORS (API, not static) | `sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py` — uses `allow_origins=["*"]` — **not the problem here** |

The Lambda CORS is already `*` — the problem is purely the **static asset serving**
(S3/CloudFront), which has no CORS policy configured.

---

## Required origins to allow

All of these origins need to be able to fetch from `dev.sgraph.ai` (and
`sgraph.ai` prod):

```
https://tools.sgraph.ai
https://dev.tools.sgraph.ai
https://main.tools.sgraph.ai
```

Using `Access-Control-Allow-Origin: *` for the `/_common/**` path is acceptable
— these are public static assets with no authentication.

---

## Two approaches to fix (pick one)

### Option A — CloudFront Response Headers Policy (recommended)

Create a CloudFront Response Headers Policy that adds:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Max-Age: 86400
```

Associate this policy with the CloudFront behaviour that serves `/_common/*`
(or all paths, since all assets are public).

This can be done via:
- AWS Console → CloudFront → Your distribution → Behaviours → Edit → Response headers policy
- Or via boto3/osbot-aws in a script

### Option B — S3 Bucket CORS Configuration

Add a CORS configuration to the S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://tools.sgraph.ai",
      "https://dev.tools.sgraph.ai",
      "https://main.tools.sgraph.ai",
      "https://*.sgraph.ai"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

**Caveat:** S3 bucket CORS only applies when the request hits S3 directly.
When CloudFront is in front, CloudFront must be configured to **forward the
`Origin` request header** and to **cache responses by `Origin`** — otherwise
CloudFront strips CORS headers or serves cached non-CORS responses.

For a CloudFront-fronted S3 site, Option A is cleaner.

---

## What is NOT the fix

- Changing `SgComponent` loading logic — the design is intentional
- Changing the `<script>` tag on the Tools pages — the cross-site import is intentional
- Modifying the Lambda CORS config — that's for the API, not static assets

---

## How to test the fix

After applying, verify from browser console on `dev.tools.sgraph.ai`:

```js
fetch('https://dev.sgraph.ai/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.css')
  .then(r => console.log(r.status, r.headers.get('access-control-allow-origin')))
```

Expected: `200  *`

---

## Repo context

- Branch: `claude/fix-sgraph-website-bugs-6V8r0`
- All component files are in: `sgraph_ai__website/v0/v0.2/v0.2.0/_common/js/components/`
- The shared component library is served from `dev.sgraph.ai/_common/...`
- Tools site source: separate repo, not in this codebase
- `CLAUDE.md` project instructions: `.claude/CLAUDE.md`
- Reality document: `team/roles/librarian/reality/`
