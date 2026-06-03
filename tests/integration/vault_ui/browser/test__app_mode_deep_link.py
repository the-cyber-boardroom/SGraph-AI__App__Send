"""End-to-end integration test for the 2026-05-31 deep-link bug fix.

Scenario the user reported (now characterised + pinned):
    /en-gb/app/#patient/index.html  →  page loaded but unstyled (CSS never
                                       applied, JS resources never executed).

Pre-fix behaviour: _continue() routed any deep-link other than the default
app.json entry through _mountVaultFile (bare single-file view, NO resources).
Post-fix: HTML deep-links in app vaults route through _mountApp with
app.json.entry overridden, so the app's CSS/JS still load.

What this test does:
   1. Boots the User Lambda FastAPI server + UI static server + Chromium
      (via BrowserHarnessTestCase).
   2. Uses the sgit-ai CLI to create + push a vault to the local backend.
      The vault contains:
        app.json          — entry='home/index.html', resources.css=['styles.css']
        styles.css        — distinctive rule on .beacon (rgb(0, 255, 0))
        home/index.html   — default entry; posts sg-app-ready
        patient/index.html — deep-link target; same shape as home
   3. Drives Chromium to /en-gb/app/#patient/index.html with the vault key
      pre-seeded in localStorage (simulating a return visit).
   4. Asserts:
        a) The app iframe mounted patient/index.html (not home/index.html).
        b) The .beacon element has the CSS rule applied — the bug-fix anchor.
           Pre-fix the bare _mountVaultFile would have rendered the page
           without app.json.resources loaded, so the computed background
           would default to rgba(0,0,0,0).
"""

import json

from _browser_harness import BrowserHarnessTestCase


# -------------------------------------------------------------------------------
# Test fixtures (the pages we seed into the vault)
# -------------------------------------------------------------------------------

# Distinctive style. Pre-fix the deep-link rendered without resources, so
# `.beacon` would have the default (transparent) background.
_STYLES_CSS = '.beacon { background: rgb(0, 255, 0); color: rgb(255, 255, 255); padding: 10px; }'

_APP_JSON = json.dumps({
    'entry':     'home/index.html',
    'present':   True,
    'auto_open': True,
    'title':     'Pilot App',
    'resources': { 'css': ['styles.css'], 'js': [] },
})


def _page_html(label: str) -> str:
    """A minimal vault HTML page that posts sg-app-ready (so the host hides
    its loading overlay) and includes a .beacon div the test asserts on."""
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        f'<title>{label}</title></head><body>'
        f'<div class="beacon" id="page-label">{label}</div>'
        '<script>'
        'try { window.parent && window.parent.postMessage({type:"sg-app-ready"}, "*"); }'
        'catch(_){}'
        '</script>'
        '</body></html>'
    )


# -------------------------------------------------------------------------------
# Tests
# -------------------------------------------------------------------------------

class test__app_mode_deep_link(BrowserHarnessTestCase):

    def test__patient_deep_link_routes_through_app_mount_and_loads_css(self):
        # ----- seed a real vault on the local backend via sgit -----
        vault_key, _ = self.create_seeded_vault(
            files = {
                'app.json':           _APP_JSON,
                'styles.css':         _STYLES_CSS,
                'home/index.html':    _page_html('HOME'),
                'patient/index.html': _page_html('PATIENT'),
            }
        )

        # ----- open the app via the deep-link, with the vault key pre-saved -----
        # (Simulates a return visit: the saved-key flow on /en-gb/app/.)
        page = self.new_app_page(
            init_script = (
                f"localStorage.setItem('sg-vault-key', {vault_key!r});"
            )
        )

        # Capture console + page errors so test failures can be diagnosed without
        # running headed Chromium.
        console_msgs = []
        page_errors  = []
        page.on('console', lambda msg: console_msgs.append(f'[{msg.type}] {msg.text}'))
        page.on('pageerror', lambda exc: page_errors.append(str(exc)))

        page.goto(f'{self.ui_url}/en-gb/app/#patient/index.html',
                  wait_until='load', timeout=15000)

        # Wait for the app iframe to appear inside <app-shell>. The shell mounts
        # the iframe asynchronously after the vault fetch + decryption + parse.
        try:
            page.wait_for_function(
                "() => !!document.querySelector('app-shell')?.shadowRoot?.querySelector('iframe')",
                timeout=20000
            )
        except Exception:
            # Surface what the browser saw so the failure is actionable.
            print('\n--- browser console ---')
            for m in console_msgs: print(m)
            print('\n--- page errors ---')
            for e in page_errors: print(e)
            print(f'\n--- url at failure ---\n{page.url}')
            raise

        # Reach into the iframe. The app frame is null-origin srcdoc (ViV
        # Phase 3 / Phase 4) — Playwright pierces shadow DOM and resolves the
        # srcdoc frame correctly via frame_locator.
        iframe = page.frame_locator('app-shell >> iframe')

        # Wait for the beacon to render — handles the async DOMContentLoaded
        # timing inside the srcdoc.
        iframe.locator('#page-label').wait_for(state='attached', timeout=10000)

        # ASSERT 1: the deep-link landed on patient/index.html (not the
        # app.json default of home/index.html). This proves _continue's
        # mount-strategy decision honoured the deep-link.
        label = iframe.locator('#page-label').text_content()
        assert label == 'PATIENT', (
            f'expected PATIENT page (deep-link target); got {label!r} — '
            'deep-link did not override app.json.entry'
        )

        # ASSERT 2: THE BUG-FIX ANCHOR — styles.css loaded and the rule applied.
        # Pre-fix _mountVaultFile would have rendered the page bare, so the
        # computed background would be the default rgba(0, 0, 0, 0).
        bg = iframe.locator('.beacon').first.evaluate(
            'el => getComputedStyle(el).backgroundColor'
        )
        assert bg == 'rgb(0, 255, 0)', (
            f'styles.css did not load — computed .beacon background is {bg!r}, '
            'expected rgb(0, 255, 0). This is the bug the 2026-05-31 fix '
            "addresses: deep-links to HTML files weren't loading the app's "
            'resources because the code routed through _mountVaultFile '
            '(bare file view) instead of _mountApp (which loads resources).'
        )

        page.close()
