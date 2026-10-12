# Brief — Create a test vault for the embed-handshake flow

**To:** the agent that will create test vaults on `dev.vault.sgraph.ai`
**From:** Explorer (Claude Code session `claude/wizardly-bell-wcBUT`)
**Date:** 2026-06-01
**Related commit:** the post-merge follow-up to `cb59f097` that introduces
`EmbedProtocol` + `app-shell._initEmbed` + browser integration test
`tests/integration/vault_ui/browser/test__embed_handshake.py`.

---

## Goal

Provide a **single, reusable test vault** on the dev environment that lets us
manually validate the new iframe-embed open flow (postMessage handshake — no
URL hash, no localStorage key) against the live deployed code, end-to-end. The
automated browser-integration test pins the protocol shape; this vault pins
the **deployed wiring**.

## Background — what's new

Before this change: opening a vault always went through
`https://dev.vault.sgraph.ai/#{vault-key}` → root inbox saves the key to
`localStorage` → redirects to `/en-gb/app/` or `/en-gb/vault/`.

That flow has three issues when the vault is loaded inside an iframe inside
another origin (App Iframe embedding another vault, dashboards listing
multiple vaults, etc.):
1. **Storage partitioning** — `localStorage` at `dev.vault.sgraph.ai` is
   partitioned by top-level origin in modern browsers, so the key leaks into
   a partitioned store past the embed session.
2. **Key in URL** — appears in the iframe's `src` and navigation history.
3. **No structured handshake** — parent has no clean way to know when the
   vault is ready.

The new flow: parent loads the vault iframe at
`https://dev.vault.sgraph.ai/en-gb/app/?embed=1`, the iframe posts
`{sg:'vault-embed-ready', v:1}` to its parent, the parent posts
`{sg:'vault-open', key, mode?, deepLink?}` back, the iframe opens the vault
with an in-memory key (NOT persisted) and posts `{sg:'vault-ready', vaultName,
fileCount, hasApp}` once mounted. Full protocol in
`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/embed-protocol.js`.

## What to create

### One vault, named **`embed-pilot`** (or whatever's clean for the dev env)

Push these files via `sgit create` + `sgit commit` + `sgit push` against the
dev SG/Send endpoint:

```
app.json          (see below)
styles.css        (see below)
home/index.html   (default entry — distinctive content the test can spot)
patient/index.html (deep-link target — for the optional deep-link assertion below)
```

#### `app.json`

```json
{
  "title":    "Embed Test Vault",
  "entry":    "home/index.html",
  "present":  true,
  "auto_open": true,
  "permissions": { "fs": { "read": true } },
  "hud": { "mode": "minimal", "show": { "vaultName": false } },
  "resources": { "css": ["styles.css"], "js": [] }
}
```

Why `mode: "minimal"`: the embed scenario is "vault inside another app's UI",
so the host chrome should be minimal — recipients don't need the SG/App nav
row inside an already-chromed embed.

#### `styles.css`

```css
body { margin: 0; padding: 24px; font-family: system-ui, sans-serif;
       background: #0d1117; color: #e6edf3; }
.beacon { background: rgb(70, 130, 180); padding: 12px 20px; border-radius: 6px;
          color: #fff; font-weight: 600; display: inline-block; }
.fragment { margin-top: 24px; color: #94a3b8; }
.fragment code { background: rgba(255,255,255,0.08); padding: 2px 8px;
                 border-radius: 4px; }
```

#### `home/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Embed Test — Home</title>
</head>
<body>
  <div class="beacon" id="page-label">EMBEDDED_VAULT_OK · home</div>
  <p class="fragment">Vault key was passed via postMessage; this page rendered
     without the key ever appearing in the URL or in localStorage. Click
     <a href="patient/index.html#section">patient/index.html#section</a>
     to also exercise the deep-link + hash-anchor path inside the embed.</p>
  <h2 id="section">Section anchor</h2>
  <p>If the back/forward arrows in the HUD appear and work, the nav stack
     is functioning inside the embedded iframe.</p>
  <script>
    try { window.parent && window.parent.postMessage({type:"sg-app-ready"}, "*"); }
    catch (_) {}
  </script>
</body>
</html>
```

#### `patient/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Embed Test — Patient</title>
</head>
<body>
  <div class="beacon" id="page-label">EMBEDDED_VAULT_OK · patient</div>
  <h2 id="section">Patient section</h2>
  <p>You reached this via a deep-link inside the embed. The
     <code>?embed=1</code> flag should still be set on the URL and the
     parent should NOT have seen a fresh <code>vault-ready</code> for
     this navigation (nav events inside the vault are not part of the
     v1 protocol).</p>
  <script>
    try { window.parent && window.parent.postMessage({type:"sg-app-ready"}, "*"); }
    catch (_) {}
  </script>
</body>
</html>
```

## How to test (manual, after the vault is pushed)

Save the vault key the agent gets back from `sgit create` — you'll need it for
the parent page. Then save this HTML to your laptop as `embed-test.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Embed Test Parent</title></head>
<body>
  <div style="font:14px system-ui; padding:12px;">
    <div>Status: <code id="status">init</code></div>
    <div>Ready pings: <code id="pings">0</code></div>
    <div>Vault-ready: <code id="ready">none</code></div>
  </div>
  <iframe id="vault"
          src="https://dev.vault.sgraph.ai/en-gb/app/?embed=1"
          style="width:900px;height:600px;border:1px solid #333;"></iframe>

  <script>
    const VAULT_KEY = '<PASTE VAULT KEY HERE>';   // ← from sgit create output
    const iframe = document.getElementById('vault');
    let pings = 0;

    window.addEventListener('message', function (e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.sg === 'vault-embed-ready') {
        pings++;
        document.getElementById('pings').textContent = pings;
        document.getElementById('status').textContent = 'sending-key';
        iframe.contentWindow.postMessage(
          { sg: 'vault-open', key: VAULT_KEY, mode: 'app' },
          'https://dev.vault.sgraph.ai'        // targetOrigin — don't use '*' for the key
        );
      } else if (e.data.sg === 'vault-ready') {
        document.getElementById('status').textContent = 'open';
        document.getElementById('ready').textContent =
          `${e.data.vaultName} · files=${e.data.fileCount} · hasApp=${e.data.hasApp}`;
      }
    });
  </script>
</body>
</html>
```

Open `embed-test.html` in Chrome / Firefox / Safari. **Expected**:

| Step | What you should see |
|---|---|
| 1. Iframe mounts | "Embed Test Vault" appears inside the iframe (minimal HUD: brand only). |
| 2. Status flow | `init` → `sending-key` → `open`. |
| 3. Ready pings | At least `1` (the iframe sends it once on first load). |
| 4. Vault-ready | Shows the vault name + `files=4` (or more) + `hasApp=true`. |
| 5. Page content | "EMBEDDED_VAULT_OK · home" rendered on a blue tag (proves the CSS resource loaded too). |
| 6. URL inspection | The iframe URL bar (devtools → Frames panel) shows `?embed=1` with **NO `#key` and NO key in any query param**. |
| 7. Storage inspection | DevTools → Application → Local Storage / Session Storage (for `https://dev.vault.sgraph.ai`) shows **no `sg-vault-key` entry**. |
| 8. Click deep-link | Click "patient/index.html#section" inside the iframe → page changes to "EMBEDDED_VAULT_OK · patient", scrolls to the section anchor. |

## What to report back

A short note with:

1. The vault key (out-of-band — chat / vault / encrypted note, **not** in this repo).
2. Browser-by-browser pass/fail of the 8 items above. Screenshots of (5) and the
   devtools panel for (6) + (7) would be ideal.
3. Any console errors in either the parent or the iframe — the embed flow should be
   silent on a healthy run.
4. Any deviation in `vault-ready` payload shape (e.g. `fileCount` reporting wrong).

## Automated coverage already in place

Don't re-test what the CI suite covers (waste of time):

- **`tests/unit/vault_ui/loader/test__embed_protocol.js`** — 37 assertions pin
  the message shapes, origin validation, mode parsing, version constant.
- **`tests/integration/vault_ui/browser/test__embed_handshake.py`** — full
  end-to-end: spins up the FastAPI test server + UI server + Chromium, seeds
  a vault via sgit, drives a parent page through the handshake, asserts the
  app frame's content rendered, the CSS rule applied, AND the key was not
  written to either localStorage or sessionStorage in the iframe.

Both run in CI on every PR via `.github/workflows/_test-ui-vault.yml`. What
THIS vault adds is the **deployed-environment** validation — i.e. catching
deployment-or-CDN-only issues that the local test server can't see.

## Tear-down

The vault is fine to keep as a long-running fixture on dev. If the test
report finds anything regressed, leave the vault in place so the fix can
validate against it. When the vault is no longer needed, `sgit vault delete`
cleans it up; the brief can stay in this repo as historical context.
