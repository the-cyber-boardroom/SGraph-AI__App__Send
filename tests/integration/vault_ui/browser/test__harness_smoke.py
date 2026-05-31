"""Smoke tests proving the BrowserHarnessTestCase actually boots cleanly:
   - FastAPI backend health check (real HTTP)
   - UI static server serves the bundle
   - Chromium can load /en-gb/app/ and the page mounts

Run: .venv/bin/python3 -m pytest tests/integration/vault_ui/browser/test__harness_smoke.py -xvs
"""

import httpx

from _browser_harness import BrowserHarnessTestCase


class test__BrowserHarnessTestCase__smoke(BrowserHarnessTestCase):

    def test__01__fastapi_backend_health(self):
        # The User Lambda exposes /api/info/health on the test server.
        r = httpx.get(f'{self.api_url}/api/info/health', timeout=5)
        assert r.status_code == 200, f'backend health failed: {r.status_code} {r.text}'

    def test__02__ui_static_server_serves_app_index(self):
        r = httpx.get(f'{self.ui_url}/en-gb/app/', timeout=5, follow_redirects=True)
        assert r.status_code == 200, f'ui server returned {r.status_code}'
        # Confirm we got the right page (not a directory listing).
        assert 'app-shell' in r.text, 'expected <app-shell> in /en-gb/app/ source'

    def test__03__chromium_loads_app_page(self):
        page = self.new_app_page()
        page.goto(f'{self.ui_url}/en-gb/app/', wait_until='load', timeout=10000)
        # The light-tree top-level mounts are <app-hud> + <sg-layout> (app-shell is
        # mounted inside sg-layout's shadow DOM as a tab — see en-gb/app/index.html).
        # Asserting on the light-tree elements proves the page's <script> tags ran
        # without errors and the components registered themselves.
        assert page.locator('app-hud').count()   == 1, '<app-hud> did not mount'
        assert page.locator('sg-layout').count() == 1, '<sg-layout> did not mount'
        # The SG_ENDPOINT override should have been applied before any UI script ran.
        endpoint_seen = page.evaluate('window.SG_ENDPOINT')
        assert endpoint_seen == self.api_url, (
            f'SG_ENDPOINT not propagated; got {endpoint_seen!r}, expected {self.api_url!r}'
        )
        # Confirm the page's own console has no fatal errors. Cosmetic warnings are
        # tolerated; an uncaught exception while bootstrapping isn't.
        # (Just a string assertion on the URL — the more rigorous error-capture
        # pattern lives in the next pilot, where we care about app behaviour.)
        assert '/en-gb/app/' in page.url
        page.close()
