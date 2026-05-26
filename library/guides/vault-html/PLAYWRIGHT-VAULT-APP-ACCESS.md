# Driving a vault app's `sg.*` API from Playwright (headless)

How to open a vault by key in headless Chrome, land on `/en-gb/app`, and call the in-iframe
`window.sg.*` API (`sg.vfs`, `sg.history`, …) from your test. Pairs with
[`AUTHORING.md`](./AUTHORING.md) (the API surface) and the older
`library/guides/content/v0.2.3__guide__vault-playwright-automation.md` (broader automation).

> **The one thing to know:** the app — and therefore `window.sg` — runs **inside a `blob:` iframe**
> nested in the `<app-shell>` element's shadow DOM. You must target **that frame**, not the top page.
> The iframe is `sandbox="allow-scripts allow-forms allow-same-origin"` over a `blob:` URL, so it is
> **same-origin** with the page and `frame.evaluate(...)` works.

---

## 1. Open the vault → land on `/en-gb/app`

Two equivalent ways:

**(a) The hash inbox (simplest).** The root `/#<vault-key>` saves the key and redirects to
`/en-gb/app`:

```js
await page.goto(`${BASE}/#${encodeURIComponent(VAULT_KEY)}`);
await page.waitForURL('**/en-gb/app*');
```

**(b) Pre-seed storage (deterministic, no redirect race):**

```js
await page.addInitScript((key) => {
  try { localStorage.setItem('sg-vault-key', key); } catch (_) {}
  // optional: point at a non-default API → try { sessionStorage.setItem('sg-vault-endpoint','https://dev.send.sgraph.ai'); } catch(_){}
}, VAULT_KEY);
await page.goto(`${BASE}/en-gb/app`);
```

`VAULT_KEY` is a full key `passphrase:vault_id` or a simple token `word-word-1234`. `BASE` is e.g.
`https://dev.vault.sgraph.ai` (must be **https or localhost** — WebCrypto needs a secure context).

> **The vault must have an app** (an `app.json` with an HTML `entry`). If it doesn't, `app-shell`
> redirects to `/en-gb/vault/` and there is **no app iframe / `window.sg`**. The `/en-gb/app` page
> is specifically the app host.

---

## 2. Get the app iframe as a Playwright `Frame`

The iframe's `src` is a `blob:` URL, so match on that:

```js
async function getVaultAppFrame(page, timeoutMs = 15000) {
  // Wait for the iframe to attach inside <app-shell>'s shadow root
  await page.waitForFunction(() => {
    const shell = document.querySelector('app-shell');
    const f = shell && shell.shadowRoot && shell.shadowRoot.querySelector('iframe');
    return !!(f && f.contentWindow);
  }, null, { timeout: timeoutMs });

  // Map it to a Playwright Frame (frames are enumerated across shadow DOM)
  const deadline = Date.now() + timeoutMs;
  let frame = null;
  while (!frame && Date.now() < deadline) {
    frame = page.frames().find(f => f.url().startsWith('blob:'));
    if (!frame) await page.waitForTimeout(100);
  }
  if (!frame) throw new Error('vault app iframe (blob:) not found');

  // Wait for the bridge to be installed inside the iframe
  await frame.waitForFunction(() => !!(window.sg && window.sg.vfs), null, { timeout: timeoutMs });
  return frame;
}
```

(You can also confirm readiness by waiting for the console line `[sg-vfs] ready | …` — attach a
`page.on('console', …)` listener before navigating.)

---

## 3. Call `sg.*` from the frame

```js
const frame = await getVaultAppFrame(page);

// list / read the current vault
const entries = await frame.evaluate(() => window.sg.vfs.list(''));            // [{path,name,size,type}]
const readme  = await frame.evaluate(() => window.sg.vfs.readText('README.md'));

// app context
const info = await frame.evaluate(() => window.sg.app);                        // {selfPath, writable, vaultName, vaultId, fileCount}

// history (past versions)
const commits = await frame.evaluate(() => window.sg.history.log({ limit: 10 }));
const oldText = await frame.evaluate((cid) => window.sg.history.readText(cid, 'maps/cities.json'), commits[2].id);

// a sub-vault file (read-only) — transparent if the parent has a stored ro-links record
const child = await frame.evaluate(() => window.sg.vfs.readText('subvaults/patient-alice/knee.json'));
```

Binary reads come back as `ArrayBuffer`; to bring bytes out to the Node side, base64 them in the
page first:

```js
const b64 = await frame.evaluate(async () => {
  const buf = await window.sg.vfs.read('logo.png');
  let s = '', a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
  return btoa(s);
});
const bytes = Buffer.from(b64, 'base64');
```

---

## 4. Writes (and the access token)

**Reads are tokenless.** **Writes** (`sg.vfs.write`, `sg.sync.push`) need the server **access token**
(the write gate, separate from the encryption key) and a writable open. Provide it either by:

- seeding storage before load: `localStorage['sg-access-key:<vaultId>'] = '<token>'`
  (or `localStorage['sg-backend-access-key']`), or
- from the frame at runtime: `await frame.evaluate((t) => window.sg.auth.setKey(t), token);`

Then:

```js
await frame.evaluate(() => window.sg.vfs.write('out/result.json', JSON.stringify({ ok: true })));
await frame.evaluate(() => window.sg.sync.push());   // publish to the named branch
```

Check `window.sg.app.writable` first; in a read-only (share-token / sub-vault) view, writes reject
with `Read-only vault`.

---

## 5. Gotchas

- **Re-acquire the frame after in-app navigation.** Clicking an `<a href="other.html">` inside the
  app re-mounts the iframe with a **new `blob:` URL** — your old `Frame` handle goes stale. Call
  `getVaultAppFrame(page)` again.
- **Per-tab key.** The vault key is stored per-tab in `sessionStorage` (with a `localStorage`
  fallback). A fresh `page`/context starts empty — seed it (or use the `/#key` inbox) each time.
- **Shadow DOM.** `window.sg` is in the iframe; the app-shell *page* exposes only debug helpers
  (`window._appDebug`) and dispatches an `app-shell:ready` event — not `sg`.
- **Same-origin requirement.** `frame.evaluate` works because the app iframe keeps
  `allow-same-origin`. (External-resource embeds — `<sg-embed-frame>` — deliberately do **not**;
  you can't and shouldn't reach into those.)
- **Promises.** `sg.*` methods are async; `frame.evaluate(() => window.sg.vfs.list(''))` awaits the
  returned promise automatically.

---

## 6. Minimal end-to-end script

```js
const { chromium } = require('playwright');
const BASE = 'https://dev.vault.sgraph.ai';
const VAULT_KEY = process.env.SG_VAULT_KEY;   // "passphrase:vault_id" or "word-word-1234"

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => { if (m.text().includes('[sg-vfs]')) console.log('iframe:', m.text()); });

  await page.goto(`${BASE}/#${encodeURIComponent(VAULT_KEY)}`);
  await page.waitForURL('**/en-gb/app*');

  const frame = await getVaultAppFrame(page);                 // (from §2)
  console.log('files:', await frame.evaluate(() => window.sg.vfs.list('')));
  console.log('app:',   await frame.evaluate(() => window.sg.app));
  console.log('log:',   await frame.evaluate(() => window.sg.history.log({ limit: 5 })));

  await browser.close();
})();
```

---

*Released under CC BY 4.0.*
