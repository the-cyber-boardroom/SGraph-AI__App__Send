"""
Browser-level integration harness for the vault UI.

Boots three things, then exposes them to tests via class attributes:

    cls.api_url       — User Lambda FastAPI server (real HTTP, in-memory storage)
                        e.g. http://127.0.0.1:54321
    cls.access_token  — pre-generated access token for the API
    cls.write_key     — pre-generated write key (the FastAPI test server's expected
                        global write key; sgit uses this for the local backend)
    cls.ui_url        — static HTTP server serving the vault UI bundle
                        (mimics tests/e2e/vault_ui/fixtures/vault-server.js)
    cls.browser       — Playwright headless Chromium (use new_app_page() per test)

Pattern: subclass BrowserHarnessTestCase, call self.new_app_page() to get a Page
already configured with window.SG_ENDPOINT pointed at the local backend.

Why Python (not Node Playwright): the FastAPI test-server helpers live in the
project's Python package; importing them directly is cleaner than bridging
Python ↔ Node subprocesses. The same harness can drive sgit-ai (CLI) and the
browser side-by-side from one pytest case.
"""

import http.server
import socket
import threading
from pathlib import Path
from unittest import TestCase

from playwright.sync_api import sync_playwright
from sgraph_ai_app_send.lambda__user.testing.Send__User_Lambda__Test_Server import (
    setup__send_user_lambda__test_server,
)

# Repo root → sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/
REPO_ROOT = Path(__file__).resolve().parents[4]
UI_ROOT   = REPO_ROOT / 'sgraph_ai_app_send__ui__vault' / 'v0' / 'v0.2' / 'v0.2.3'


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class _SilentHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler, with the per-request log noise muted so test
    output stays readable. Path resolution otherwise inherits the standard
    "/path/" → "/path/index.html" fallback that vault-server.js also does."""

    def log_message(self, *args, **kw):
        pass


def _start_ui_server(root: Path):
    """Return (server, port, thread). Stop via server.shutdown()."""
    port = _find_free_port()
    factory = lambda *a, **kw: _SilentHandler(*a, directory=str(root), **kw)
    server  = http.server.ThreadingHTTPServer(('127.0.0.1', port), factory)
    thread  = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, port, thread


class BrowserHarnessTestCase(TestCase):
    """Subclass to get FastAPI + UI server + Playwright auto-managed in
    setUpClass / tearDownClass. Each test method calls self.new_app_page()
    to get a fresh Page configured for the local backend."""

    @classmethod
    def setUpClass(cls):
        # 1. FastAPI backend (real HTTP, in-memory storage). ~100 ms.
        cls._api_ctx     = setup__send_user_lambda__test_server()
        cls._api_objs    = cls._api_ctx.__enter__()
        cls.api_url      = cls._api_objs.server_url
        cls.access_token = cls._api_objs.access_token
        cls.write_key    = cls._api_objs.write_key

        # 2. UI static-file server. Serves the vault UI bundle (v0.2.3) on a
        # random port — no path rewrites needed for /en-gb/app/ (the directory
        # has an index.html so SimpleHTTPRequestHandler resolves it).
        cls._ui_server, ui_port, _ = _start_ui_server(UI_ROOT)
        cls.ui_url = f'http://127.0.0.1:{ui_port}'

        # 3. Headless Chromium via Playwright.
        cls._pw      = sync_playwright().start()
        cls.browser  = cls._pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        # Best-effort teardown — close everything regardless of individual failures.
        errors = []
        try: cls.browser.close()
        except Exception as e: errors.append(('browser', e))
        try: cls._pw.stop()
        except Exception as e: errors.append(('playwright', e))
        try: cls._ui_server.shutdown()
        except Exception as e: errors.append(('ui_server', e))
        try: cls._api_ctx.__exit__(None, None, None)
        except Exception as e: errors.append(('api_server', e))
        if errors:
            print(f'[harness] teardown errors: {errors}')

    def new_app_page(self, init_script: str = ''):
        """Open a new browser page with window.SG_ENDPOINT pre-configured to
        point at the local FastAPI backend. The UI reads SG_ENDPOINT first
        in app-shell._sendEndpoint, so this swap is non-invasive — the UI
        bundle itself is unchanged.

        A fresh BrowserContext is used per page so add_init_script + cookie
        state are isolated between tests. ignore_https_errors=True accepts
        the certs of the two hardcoded external scripts the bundle still
        loads (dev.tools.sgraph.ai/sg-layout, dev.send.sgraph.ai/sg-print) —
        Playwright's bundled Chromium trusts a smaller CA bundle than the
        system, and these are dev-only legitimate certs."""
        ctx  = self.browser.new_context(ignore_https_errors=True)
        page = ctx.new_page()
        # add_init_script runs BEFORE the page's own scripts on every navigation,
        # so any history.replaceState / fetch / etc. sees SG_ENDPOINT already set.
        page.add_init_script(f"window.SG_ENDPOINT = {self.api_url!r};")
        if init_script:
            page.add_init_script(init_script)
        # Track the context so the test can close it (or rely on Playwright
        # cleanup on browser close — which is what tearDownClass does).
        return page
