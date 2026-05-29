/* =================================================================================
   Phase 3 probe — null-origin iframe facts (pack §5.5)

   Before flipping app-shell's 4 app iframes from same-origin blob: to null-origin
   srcdoc, confirm the three load-bearing browser facts the migration depends on:

     P1. A parent-origin `blob:` URL does NOT load in a sandbox WITHOUT
         allow-same-origin (this is WHY srcdoc is mandatory, pack §5.5).
     P2. `srcdoc` DOES load + run scripts at a null origin, and postMessage
         round-trips parent↔child.
     P3. WindowProxy reference equality (e.source === iframe.contentWindow) still
         works for a null-origin child (so app-shell.js:1578 source check survives).

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

    test('P1 — parent-origin blob: URL is blocked in a sandbox without allow-same-origin', async ({ page }) => {
        await page.goto(baseURL);
        const result = await page.evaluate(async () => {
            const html = '<!doctype html><script>parent.postMessage("BLOB_RAN","*")<\/script>';
            const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';   // null origin — NO allow-same-origin
            iframe.src = blobUrl;

            let ran = false;
            const onMsg = (e) => { if (e.data === 'BLOB_RAN') ran = true; };
            window.addEventListener('message', onMsg);

            const loadResult = await new Promise((resolve) => {
                iframe.addEventListener('load',  () => resolve('load'));
                iframe.addEventListener('error', () => resolve('error'));
                document.body.appendChild(iframe);
                setTimeout(() => resolve('timeout'), 1200);
            });
            await new Promise(r => setTimeout(r, 150));
            window.removeEventListener('message', onMsg);
            iframe.remove();
            URL.revokeObjectURL(blobUrl);
            return { ran, loadResult };
        });
        // The script inside the parent-origin blob must NOT execute in a null-origin
        // sandbox — confirming srcdoc is required for the Phase 3 app frames.
        expect(result.ran).toBe(false);
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
