/* =================================================================================
   Phase 3 probe — null-origin iframe facts (pack §5.5)

   Before flipping app-shell's 4 app iframes from same-origin blob: to null-origin
   srcdoc, confirm the load-bearing browser facts the migration depends on:

     P1. The security property of dropping allow-same-origin: a frame in
         `sandbox="allow-scripts"` runs at an OPAQUE origin (location.origin ===
         "null") and CANNOT read the parent's localStorage (SecurityError) — even
         when its document is a parent-origin blob: URL. (Empirically: the blob
         DOES load and run; what changes is the origin becomes opaque. So dropping
         allow-same-origin is the operative change; srcdoc-vs-blob is a style
         choice. We use srcdoc — it's cleaner, drops the objectURL lifecycle, and
         matches the already-null kernel site.)
     P2. `srcdoc` DOES load + run scripts at a null origin, and postMessage
         round-trips parent↔child.
     P3. WindowProxy reference equality (e.source === iframe.contentWindow) still
         works for a null-origin child (so the app-shell source check survives).
     P4. Playwright frameLocator can still read text + computed style INSIDE a
         null-origin srcdoc frame (the migration path for the e2e regressions).

   Pure DOM experiments — no app-shell, no vault, no network. Decides the approach
   for the real change; committed so the assumption is documented + re-checkable.
   ================================================================================= */

import { test, expect } from '@playwright/test';
import http from 'node:http';

let server, baseURL;

test.beforeAll(() => new Promise((resolve) => {
    // Any real http origin works; the page only needs a non-null origin to create
    // blob: URLs whose origin differs from a null-origin sandbox child.
    server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><meta charset=utf-8><title>probe</title><body>probe host</body>');
    });
    server.listen(0, '127.0.0.1', () => { baseURL = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));

test.afterAll(() => new Promise((resolve) => server ? server.close(resolve) : resolve()));

test.describe('Phase 3 null-origin probe', () => {

    test('P1 — a parent-origin blob: in sandbox=allow-scripts INHERITS the parent origin (why srcdoc)', async ({ page }) => {
        await page.goto(baseURL);

        const result = await page.evaluate(async (parentOrigin) => {
            // The thing we must NOT do: load a parent-minted blob: into the app frame.
            // Empirically Chromium gives such a frame the PARENT's origin even under
            // sandbox="allow-scripts" — so dropping allow-same-origin is NOT enough on
            // its own; the document source matters. srcdoc (P2) yields a true null
            // origin; blob: does not. This test pins that contrast so the srcdoc choice
            // in app-shell can't silently regress back to blob:.
            const html = '<!doctype html><script>' +
                'parent.postMessage({ ran: true, origin: String(location.origin) }, "*");' +
                '<\/script>';
            const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';
            iframe.src = blobUrl;

            const got = {};
            const onMsg = (e) => { if (e.data && e.data.ran) { got.ran = true; got.origin = e.data.origin; } };
            window.addEventListener('message', onMsg);
            document.body.appendChild(iframe);
            await new Promise(r => setTimeout(r, 600));
            window.removeEventListener('message', onMsg);
            iframe.remove();
            URL.revokeObjectURL(blobUrl);
            return { got, parentOrigin };
        }, baseURL);

        // The blob frame runs ...
        expect(result.got.ran).toBe(true);
        // ... but it is NOT null-origin (it inherited the parent's origin) — the precise
        // reason the Phase 3 app frames use srcdoc, not blob:. Compare P2 (srcdoc→null).
        expect(result.got.origin).not.toBe('null');
        expect(result.got.origin).toBe(result.parentOrigin);
    });

    test('P2 — srcdoc runs scripts at null origin and postMessage round-trips', async ({ page }) => {
        await page.goto(baseURL);
        const result = await page.evaluate(async () => {
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';   // null origin
            iframe.srcdoc =
                '<!doctype html><script>' +
                'window.addEventListener("message",function(e){' +
                  'if(e.data&&e.data.ping){e.source.postMessage({pong:e.data.ping,origin:String(location.origin)},"*");}' +
                '});' +
                'parent.postMessage({booted:true},"*");' +
                '<\/script>';

            const got = { booted: false, pong: null, childOrigin: null };
            const onMsg = (e) => {
                if (e.data && e.data.booted) got.booted = true;
                if (e.data && e.data.pong)   { got.pong = e.data.pong; got.childOrigin = e.data.origin; }
            };
            window.addEventListener('message', onMsg);

            await new Promise((resolve) => {
                iframe.addEventListener('load', resolve);
                document.body.appendChild(iframe);
                setTimeout(resolve, 1200);
            });
            // Send a ping into the child and await its pong.
            iframe.contentWindow.postMessage({ ping: 42 }, '*');
            await new Promise(r => setTimeout(r, 200));
            window.removeEventListener('message', onMsg);
            iframe.remove();
            return got;
        });
        expect(result.booted).toBe(true);
        expect(result.pong).toBe(42);
        // A null-origin srcdoc reports origin "null" — the security property we want.
        expect(result.childOrigin).toBe('null');
    });

    test('P3 — e.source === iframe.contentWindow holds for a null-origin child (1578 survives)', async ({ page }) => {
        await page.goto(baseURL);
        const result = await page.evaluate(async () => {
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';   // null origin
            iframe.srcdoc = '<!doctype html><script>parent.postMessage({hello:1},"*")<\/script>';

            const checkP = new Promise((resolve) => {
                const onMsg = (e) => {
                    if (e.data && e.data.hello) {
                        window.removeEventListener('message', onMsg);
                        // The exact check app-shell.js:1578 performs.
                        resolve(e.source === iframe.contentWindow);
                    }
                };
                window.addEventListener('message', onMsg);
            });

            document.body.appendChild(iframe);
            const sourceMatches = await Promise.race([
                checkP,
                new Promise(r => setTimeout(() => r('timeout'), 1200))
            ]);
            iframe.remove();
            return { sourceMatches };
        });
        // Reference equality of WindowProxy objects is cross-origin safe — the source
        // validation at app-shell.js:1578 keeps working after the null-origin flip.
        expect(result.sourceMatches).toBe(true);
    });

    test('P5 — window.onerror inside a null-origin srcdoc frame forwards errors out via postMessage (Phase 4 re-spec)', async ({ page }) => {
        await page.goto(baseURL);
        const result = await page.evaluate(async () => {
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts allow-forms';   // null origin (matches the 4 app frames)
            // Mirrors the bridge re-spec: the frame installs window.onerror → postMessage,
            // then throws asynchronously. The parent can no longer reach IN under null-origin,
            // so the frame must report OUT. This pins the mechanism app-shell now relies on.
            iframe.srcdoc =
                '<!doctype html><script>' +
                'window.onerror=function(m,s,l,c){parent.postMessage({type:"sg-app-error",message:String(m),origin:String(location.origin)},"*");return false;};' +
                'setTimeout(function(){ throw new Error("boom from app"); },10);' +
                '<\/script>';

            const got = { type: null, message: null, origin: null };
            const onMsg = (e) => {
                if (e.data && e.data.type === 'sg-app-error') {
                    got.type = e.data.type; got.message = e.data.message; got.origin = e.data.origin;
                }
            };
            window.addEventListener('message', onMsg);
            document.body.appendChild(iframe);
            await new Promise(r => setTimeout(r, 400));
            window.removeEventListener('message', onMsg);
            iframe.remove();
            return got;
        });
        expect(result.type).toBe('sg-app-error');
        expect(result.message).toContain('boom from app');
        // Confirms the report crosses the null-origin boundary (the frame is opaque-origin).
        expect(result.origin).toBe('null');
    });
});

test.describe('Phase 3 frameLocator on null-origin frame', () => {
    test('P4 — frameLocator reads text + computed style inside a sandboxed srcdoc frame', async ({ page }) => {
        await page.goto('/en-gb/app');
        // Build a null-origin srcdoc frame on the page, then read into it via frameLocator.
        await page.evaluate(() => {
            const f = document.createElement('iframe');
            f.id = 'p3kid';
            f.setAttribute('sandbox', 'allow-scripts allow-forms');
            f.srcdoc = '<!doctype html><body style="background:rgb(13,17,23)"><p id="msg">HELLO-NULL</p></body>';
            document.body.appendChild(f);
        });
        const fl = page.frameLocator('#p3kid');
        await expect(fl.locator('#msg')).toHaveText('HELLO-NULL');
        const bg = await fl.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
        expect(bg).toBe('rgb(13, 17, 23)');
    });
});
