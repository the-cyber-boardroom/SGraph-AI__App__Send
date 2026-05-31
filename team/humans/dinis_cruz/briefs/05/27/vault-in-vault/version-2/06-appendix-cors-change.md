# 06 — Appendix: The CORS Change That Unblocks ViV

**Pack version** v0.28.7 · **Owner** Dinis / server + DevOps (to apply in AWS) · **Blocks** Phase 0.5 → 2 of `05-implementation-plan.md`.
**Severity of *not* doing it:** ViV cannot work at all — every nested (`null`-origin) kernel is CORS-blocked from the SG/API. **Severity of the current state independently:** a latent CORS footgun (`*` + credentials) that should be fixed regardless of ViV.

---

## 6.1 The problem, precisely

The User Lambda's CORS middleware is configured with a contradictory pair:

```python
# sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py
self.app().add_middleware(CORSMiddleware,
    allow_origins     = ["*"],          # line 117
    allow_credentials = True,           # line 118   ← the problem
    allow_methods     = ["GET","POST","PUT","DELETE","HEAD","OPTIONS"],   # line 119
    allow_headers     = ["Content-Type","X-Requested-With","Origin","Accept","Authorization",
                         HEADER__SGRAPH_SEND__ACCESS_TOKEN, HEADER__SGRAPH_VAULT__WRITE_KEY,
                         HEADER__SGRAPH_VAULT__PUBLIC, HEADER__SGRAPH_VAULT__READ_KEY,
                         HEADER__SGRAPH_TRANSFER__DELETE_AUTH],            # line 120
    expose_headers    = ["Content-Type","X-Requested-With","Origin","Accept","Authorization"])  # line 121
```

Per the Fetch standard, `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Credentials: true` are mutually exclusive. **Starlette resolves this by disabling the `*` wildcard and instead *reflecting* the request's `Origin`** (and adding `Vary: Origin`). For a normal page that silently "works" (it echoes `https://vault.sgraph.ai`). But for a **`null`-origin frame** (every sandboxed `null`-origin kernel, which is the entire ViV design) the request's `Origin` header is the literal string `null`, so the server emits:

```
Access-Control-Allow-Origin: null
Access-Control-Allow-Credentials: true
```

Browsers treat `Access-Control-Allow-Origin: null` inconsistently and commonly **reject** it — which is exactly the `Failed to fetch` the dev lab saw and (mis)attributed to a fundamental "null origins can't reach the server" rule. **There is no such rule.** It's this config.

## 6.2 The fix (one line)

```diff
  self.app().add_middleware(CORSMiddleware,
      allow_origins     = ["*"],
-     allow_credentials = True,
+     allow_credentials = False,
      allow_methods     = ["GET","POST","PUT","DELETE","HEAD","OPTIONS"],
      allow_headers     = [ … unchanged … ],
      expose_headers    = [ … unchanged … ])
```

With credentials off, Starlette emits the clean, static `Access-Control-Allow-Origin: *`, which a `null`-origin frame's request satisfies. Direct kernel-to-SG/API then works at **every** depth, root and nested, with no relay, no proxy, no per-origin reflection fragility — delivering D4 ("each kernel owns its own server traffic, identically").

## 6.3 Why this is safe (it removes a footgun, doesn't add risk)

The auth model on the vault path does **not** use anything `allow_credentials` enables:

- **Auth is a bearer header**, not a cookie: `x-sgraph-access-token` (`sg-send.js:25`); reads are tokenless. The browser client never sets `credentials` on its `fetch` (`mode:'cors'`, default `same-origin` credentials — `sg-send.js:36`).
- **No cookies anywhere on the vault path.** The only "session" construct in the codebase is the Data Room feature on the **admin** Lambda (`Service__Room__Session.py`), which is itself token-based, not cookie-based, and is a different Lambda.
- **Zero-knowledge:** the server holds only ciphertext; the vault key never reaches it. CORS was never the confidentiality boundary — the encryption is.

Conversely, `allow_origins=["*"]` **with** `allow_credentials=True` is the textbook dangerous CORS combination (any origin permitted to send credentials). It is currently un-exploitable only because nothing sends cookies — i.e. it's a loaded footgun with the safety on. **Turning credentials off is strictly safer** *and* unblocks ViV. The one thing to confirm (below) is that nothing actually relies on credentialed CORS today; from the code, nothing does.

## 6.4 AppSec checklist before applying

Narrow and checkable:

1. **Does any User-Lambda endpoint authenticate on cookies, `Origin`, or `Referer`?** From the code: no — uniformly bearer-token (`x-sgraph-access-token`) + vault `write_key`/`read_key` headers. Confirm.
2. **Does any client send `credentials:'include'` to the User Lambda?** From `sg-send.js`: no. Confirm no other caller does.
3. **The admin Data Room session path** (`Service__Room__Session.py`) — confirm it's a separate Lambda/origin and not affected by this middleware change. (It is, from the layout.)

If all three hold (they appear to), the change is safe to apply to `dev` immediately and to prod after the Phase-2 verification.

## 6.5 CloudFront / edge verification (the real remaining checkpoint)

The CDN sits in front of the Lambda. After 6.2, verify at the edge:

1. **`Origin` is forwarded to the origin** for the vault API routes. There is already a presigned-route forward list (`Fast_API__SGraph__App__Send__User.py:150`: `forward_headers=['authorization', HEADER__SGRAPH_SEND__ACCESS_TOKEN]`) — ensure the API behaviour also forwards `Origin` (or that CORS is handled before caching).
2. **`Vary: Origin` is honoured** so the CDN never serves a cached `Access-Control-Allow-Origin` computed for a different request. With the static `*` (post-fix) this is less fragile, but confirm no cached `null`/reflected value lingers from the old config — **invalidate the cache** after the change.
3. **Preflight (`OPTIONS`) passes for `null` origin** with the custom headers (`x-sgraph-access-token`, the write/read-key headers) on the actual vault PUT/GET/DELETE routes.

## 6.6 Verification (the Phase 0.5 gate)

```bash
# 1. Preflight from a null origin must return ACAO:* (not 'null', not reflected)
curl -i -X OPTIONS https://dev.send.sgraph.ai/<vault-route> \
  -H 'Origin: null' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: x-sgraph-access-token'
# expect:  Access-Control-Allow-Origin: *      (NOT 'null')
#          (no Access-Control-Allow-Credentials: true)

# 2. Tokenless GET (public ciphertext read) from null origin
curl -i https://dev.send.sgraph.ai/<vault-read-route> -H 'Origin: null'
# expect: 200 + ACAO:*

# 3. Token PUT (write) from null origin
curl -i -X PUT https://dev.send.sgraph.ai/<vault-write-route> \
  -H 'Origin: null' -H 'x-sgraph-access-token: <token>' --data-binary @cipher.bin
# expect: 2xx + ACAO:*
```

Then the real-browser gate: a `sandbox="allow-scripts"` (`null`-origin) iframe on `dev.vault.sgraph.ai` performs a tokenless GET and a token PUT against `dev.send.sgraph.ai` and both succeed. That green light unblocks Phase 2.

## 6.7 Summary for the change ticket

> **Change:** `allow_credentials = True → False` in the User-Lambda CORS middleware (`Fast_API__SGraph__App__Send__User.py:118`); invalidate CDN cache; confirm CloudFront forwards `Origin` + honours `Vary: Origin`.
> **Why:** lets `null`-origin vault kernels reach the SG/API (the foundation of ViV) and removes the `*`+credentials CORS footgun.
> **Risk:** none identified — auth is bearer-header, no cookies on the vault path, ZK means CORS isn't the confidentiality boundary. AppSec to confirm §6.4.
> **Verify:** §6.6 (curl preflight/GET/PUT from `Origin: null` → `ACAO:*`; real-browser null-iframe round-trip on `dev`).
