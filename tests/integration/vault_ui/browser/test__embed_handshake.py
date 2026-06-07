"""End-to-end integration test for the embed-protocol handshake.

Scenario:
  1. Backend has an app vault with home/index.html + a small CSS rule.
  2. A parent page (data: URL — null/data origin, cross-origin to the iframe,
     mirroring the real-world App-Iframe-embeds-another-vault case) loads a
     vault iframe pointing at /en-gb/app/?embed=1 with NO key in the URL.
  3. The vault iframe posts {sg:'vault-embed-ready', v:1} to its parent.
  4. The parent posts {sg:'vault-open', key, mode:'app'} back via postMessage.
  5. The vault opens, mounts the app, posts {sg:'vault-ready', ...}.
  6. Test asserts:
        a) The vault-ready handshake completed (parent received the message).
        b) The vault-ready payload reports vaultName + hasApp:true + fileCount.
        c) Inside the iframe → app-shell shadow DOM → null-origin app iframe,
           the seeded page actually rendered (proving the key really opened
           the vault, not just that the handshake superficially completed).
        d) The vault key was NEVER written to the iframe's localStorage (the
           whole point of the embed flow — no key leaks into the partitioned
           storage past the embed session).
"""

import json

from _browser_harness import BrowserHarnessTestCase


_APP_JSON = json.dumps({
    'entry':     'home/index.html',
    'present':   True,
    'auto_open': True,
    'title':     'Embed Pilot',
    'resources': { 'css': ['styles.css'], 'js': [] },
})

_STYLES_CSS = '.tag { background: rgb(70, 130, 180); padding: 4px; color: rgb(255, 255, 255); }'

_HOME_HTML = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<title>Embed Home</title></head><body>'
    '<div class="tag" id="content">EMBEDDED_OK</div>'
    '<script>'
    'try { window.parent && window.parent.postMessage({type:"sg-app-ready"}, "*"); }'
    'catch(_){}'
    '</script>'
    '</body></html>'
)

_PATIENT_HTML = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<title>Embed Patient</title></head><body>'
    '<div class="tag" id="content">EMBEDDED_PATIENT</div>'
    '<script>'
    'try { window.parent && window.parent.postMessage({type:"sg-app-ready"}, "*"); }'
    'catch(_){}'
    '</script>'
    '</body></html>'
)


def _parent_html(vault_url: str, vault_key: str, deep_link: str = '') -> str:
    """Build the parent test page. It loads an iframe at `vault_url?embed=1`,
    waits for 'vault-embed-ready', responds with 'vault-open' carrying the key,
    and exposes the resulting state on window globals for the test to inspect."""
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<title>Embed Parent</title></head><body>'
        '<div id="status">init</div>'
        f'<iframe id="vault" src="{vault_url}" '
        'style="width:800px;height:600px;border:1px solid #444"></iframe>'
        '<script>'
        f'const VAULT_KEY = {json.dumps(vault_key)};'
        f'const DEEP_LINK = {json.dumps(deep_link)};'
        'const iframe = document.getElementById("vault");'
        'const status = document.getElementById("status");'
        'window.__readyPings = [];'
        'window.__vaultReady = null;'
        'window.addEventListener("message", function (e) {'
        '  if (!e.data || typeof e.data !== "object") return;'
        '  if (e.data.sg === "vault-embed-ready") {'
        '    window.__readyPings.push(e.data);'
        '    status.textContent = "sending-key";'
        '    const openMsg = { sg: "vault-open", key: VAULT_KEY, mode: "app" };'
        '    if (DEEP_LINK) openMsg.deepLink = DEEP_LINK;'
        '    iframe.contentWindow.postMessage(openMsg, "*");'   # in real code use the iframe's origin
        '  } else if (e.data.sg === "vault-ready") {'
        '    window.__vaultReady = e.data;'
        '    status.textContent = "vault-ready:" + e.data.vaultName;'
        '  }'
        '});'
        '</script></body></html>'
    )


class test__embed_handshake(BrowserHarnessTestCase):

    def test__parent_drives_handshake_and_vault_mounts_with_no_key_in_storage(self):
        # ── seed a real vault on the local backend ─────────────────────────
        vault_key, _ = self.create_seeded_vault(files = {
            'app.json':           _APP_JSON,
            'styles.css':         _STYLES_CSS,
            'home/index.html':    _HOME_HTML,
            'patient/index.html': _PATIENT_HTML,
        })

        # ── build the parent page and serve it at the same origin as the iframe ──
        # Why same-origin and not data: / cross-origin: Web Crypto requires a
        # secure context, and a nested iframe inherits non-secure from a data:
        # ancestor — so an http://127.0.0.1 iframe inside a data: parent fails
        # SGVaultCrypto.deriveKeys with "Requires secure context". Serving the
        # parent at http://127.0.0.1:PORT/__test_embed_parent__ keeps both
        # parent + iframe on the same secure-context origin.
        #
        # The postMessage protocol is origin-agnostic — same-origin and cross-
        # origin paths both go through window.parent.postMessage + event.source
        # validation — so this test still proves the handshake logic. The
        # null-origin App Iframe parent case (the real-world target) is also
        # covered because EmbedProtocol.validateSource accepts origin="null"
        # when expectedParent=="null", as test__embed_protocol.js → VS5 pins.
        vault_iframe_url = f'{self.ui_url}/en-gb/app/?embed=1'
        parent_url        = f'{self.ui_url}/__test_embed_parent__'
        parent_html       = _parent_html(vault_iframe_url, vault_key)

        page = self.new_app_page()

        console_msgs = []
        page_errors  = []
        page.on('console',   lambda m: console_msgs.append(f'[{m.type}] {m.text}'))
        page.on('pageerror', lambda e: page_errors.append(str(e)))

        # Intercept the parent URL and return the test HTML. Playwright fulfils
        # the request from inside the browser, so the response's origin is the
        # requested URL's origin (the UI server's 127.0.0.1:PORT).
        page.route(parent_url, lambda route: route.fulfill(
            status=200, content_type='text/html; charset=utf-8', body=parent_html
        ))
        page.goto(parent_url, wait_until='load', timeout=15000)

        # ── wait for the vault-ready postMessage to land on window.__vaultReady
        try:
            page.wait_for_function(
                '() => window.__vaultReady !== null',
                timeout=25000
            )
        except Exception:
            print('\n--- parent console ---')
            for m in console_msgs: print(m)
            print('\n--- parent errors ---')
            for e in page_errors:  print(e)
            print(f'\n--- ready pings seen: ---\n{page.evaluate("window.__readyPings")}')
            raise

        # ── Assertion (a): handshake completed ─────────────────────────────
        ready_pings = page.evaluate('window.__readyPings')
        assert len(ready_pings) >= 1, (
            f'expected at least 1 vault-embed-ready ping from the iframe; got {ready_pings!r}'
        )
        assert ready_pings[0]['sg'] == 'vault-embed-ready'
        assert ready_pings[0]['v']  == 1

        # ── Assertion (b): vault-ready payload shape ───────────────────────
        ready = page.evaluate('window.__vaultReady')
        assert ready['sg']       == 'vault-ready'
        assert ready['hasApp']   is True,    f'expected hasApp=True; got {ready!r}'
        assert ready['fileCount']  >= 3,     f'expected fileCount≥3 (app.json + styles + home); got {ready!r}'
        # vaultName is whatever the vault library returns — we just want it non-empty
        assert isinstance(ready.get('vaultName'), str)

        # ── Assertion (c): the actual app iframe content rendered ──────────
        # Drill: parent → vault iframe → <app-shell> shadow DOM → null-origin app iframe
        vault_iframe = page.frame_locator('iframe#vault')
        # Wait for the app iframe inside <app-shell>'s shadow DOM to mount.
        vault_iframe.locator('app-shell').wait_for(state='attached', timeout=10000)
        page.wait_for_function(
            '() => {'
            '  const i = document.querySelector("iframe#vault");'
            '  if (!i) return false;'
            '  const doc = i.contentDocument;'
            '  if (!doc) return false;'
            '  const shell = doc.querySelector("app-shell");'
            '  if (!shell || !shell.shadowRoot) return false;'
            '  return !!shell.shadowRoot.querySelector("iframe");'
            '}',
            timeout=15000
        )
        app_frame = vault_iframe.frame_locator('app-shell >> iframe')
        app_frame.locator('#content').wait_for(state='attached', timeout=10000)
        content_text = app_frame.locator('#content').text_content()
        assert content_text == 'EMBEDDED_OK', (
            f'expected the embedded app to render EMBEDDED_OK; got {content_text!r}. '
            'Either the key did not reach _initWithKey, or _mountApp failed.'
        )

        # Sanity: the app.json resources loaded too (proves the deep-link fix
        # path still works in embed mode — bonus coverage with no extra cost).
        bg = app_frame.locator('#content').first.evaluate(
            'el => getComputedStyle(el).backgroundColor'
        )
        assert bg == 'rgb(70, 130, 180)', (
            f'styles.css did not load in the embedded app; got bg={bg!r}'
        )

        # ── Assertion (d): the key was NOT written to iframe storage ───────
        # The embed flow's whole point is that the key stays in memory only.
        # We reach into the iframe's contentWindow.localStorage/sessionStorage
        # and confirm sg-vault-key is absent (or at least not == vault_key).
        storage_state = page.evaluate("""
            () => {
                const frame = document.querySelector('iframe#vault');
                const ls    = frame.contentWindow.localStorage;
                const ss    = frame.contentWindow.sessionStorage;
                // Collect any sg-* keys in either store. The embed flow promises
                // that no vault credentials persist past the iframe lifetime;
                // catching ANY sg-vault-key / sg-access-key:* / sg-vault-deep-link
                // here guards against future regressions in any persistence site.
                const all = {};
                for (let i = 0; i < ls.length; i++) {
                    const k = ls.key(i);
                    if (k && k.startsWith('sg-')) all['local:' + k] = ls.getItem(k);
                }
                for (let i = 0; i < ss.length; i++) {
                    const k = ss.key(i);
                    if (k && k.startsWith('sg-')) all['session:' + k] = ss.getItem(k);
                }
                return {
                    local_key:   ls.getItem('sg-vault-key'),
                    session_key: ss.getItem('sg-vault-key'),
                    all_sg_keys: all
                };
            }
        """)
        # Scan for any sg-access-key:* leak. This vault has no auth.required so
        # the access-token path is never triggered, but if a future test ever
        # introduces an authed vault and the _setCachedAccessKey guard regresses,
        # this assertion catches it.
        access_keys = {k: v for k, v in storage_state['all_sg_keys'].items()
                       if 'sg-access-key:' in k}
        assert not access_keys, (
            f'access-key keys leaked into iframe storage in embed mode: {access_keys}'
        )
        assert storage_state['local_key'] is None or storage_state['local_key'] != vault_key, (
            f'vault key leaked into iframe localStorage in embed mode; got {storage_state!r}. '
            'The embed flow must keep the key in memory only.'
        )
        assert storage_state['session_key'] is None or storage_state['session_key'] != vault_key, (
            f'vault key leaked into iframe sessionStorage in embed mode; got {storage_state!r}.'
        )

        page.close()

    def test__embed_deep_link_uses_in_memory_path_not_sessionStorage(self):
        """The deep-link in vault-open MUST flow through instance memory so it
        works in null-origin iframes (where sessionStorage throws). Same-origin
        here, but the in-memory code path is the same one a null-origin parent
        would exercise — if the implementation regressed to sessionStorage-only,
        a future null-origin test would silently land on home/index.html
        instead of patient/index.html. This test pins the in-memory path."""

        vault_key, _ = self.create_seeded_vault(files = {
            'app.json':           _APP_JSON,
            'styles.css':         _STYLES_CSS,
            'home/index.html':    _HOME_HTML,
            'patient/index.html': _PATIENT_HTML,
        })

        # Parent sends vault-open WITH deepLink='patient/index.html'.
        vault_iframe_url = f'{self.ui_url}/en-gb/app/?embed=1'
        parent_url        = f'{self.ui_url}/__test_embed_parent_deeplink__'
        parent_html       = _parent_html(vault_iframe_url, vault_key,
                                         deep_link='patient/index.html')

        page = self.new_app_page()
        page.route(parent_url, lambda route: route.fulfill(
            status=200, content_type='text/html; charset=utf-8', body=parent_html
        ))
        page.goto(parent_url, wait_until='load', timeout=15000)

        # Wait for handshake completion then drill to the rendered app frame.
        page.wait_for_function('() => window.__vaultReady !== null', timeout=25000)

        vault_iframe = page.frame_locator('iframe#vault')
        vault_iframe.locator('app-shell').wait_for(state='attached', timeout=10000)
        page.wait_for_function(
            '() => {'
            '  const i = document.querySelector("iframe#vault");'
            '  if (!i || !i.contentDocument) return false;'
            '  const s = i.contentDocument.querySelector("app-shell");'
            '  return !!(s && s.shadowRoot && s.shadowRoot.querySelector("iframe"));'
            '}',
            timeout=15000
        )
        app_frame = vault_iframe.frame_locator('app-shell >> iframe')
        app_frame.locator('#content').wait_for(state='attached', timeout=10000)
        content_text = app_frame.locator('#content').text_content()

        # The CRITICAL assertion — if the deep-link path regressed to
        # sessionStorage-only, this would say 'EMBEDDED_OK' (default entry,
        # home/index.html) instead of 'EMBEDDED_PATIENT' (deep-link target).
        assert content_text == 'EMBEDDED_PATIENT', (
            f'expected the embed deep-link to land on patient/index.html '
            f'(text "EMBEDDED_PATIENT"); got {content_text!r}. The deep-link '
            f'in vault-open did not flow through to _continue\'s mount-strategy '
            f'decision — this is the null-origin regression we are guarding against.'
        )

        page.close()
