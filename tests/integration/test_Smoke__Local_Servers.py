import os
import subprocess
import sys
import time
from unittest import TestCase

import httpx

ADMIN_PORT      = 10061
USER_PORT       = 10062
ADMIN_BASE_URL  = f"http://127.0.0.1:{ADMIN_PORT}"
USER_BASE_URL   = f"http://127.0.0.1:{USER_PORT}"

AUTH_KEY_NAME   = "key-name"
AUTH_KEY_VALUE  = "key-value"

PROJECT_ROOT    = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def wait_for_server(url, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            httpx.get(url, timeout=2)
            return True
        except (httpx.ConnectError, httpx.ReadError):
            pass
        time.sleep(0.3)
    return False


def start_uvicorn(module_path, port):
    env = os.environ.copy()
    env["FAST_API__AUTH__API_KEY__NAME"]  = AUTH_KEY_NAME
    env["FAST_API__AUTH__API_KEY__VALUE"] = AUTH_KEY_VALUE
    env["PYTHONPATH"]                    = PROJECT_ROOT

    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn",
         module_path,
         "--host", "127.0.0.1",
         "--port", str(port),
         "--log-level", "warning"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return proc


class test_Smoke__Local_Servers(TestCase):

    admin_process = None
    user_process  = None

    @classmethod
    def setUpClass(cls):
        cls.admin_process = start_uvicorn(
            "sgraph_ai_app_send.lambda__admin.lambda_function.lambda_handler__admin:app",
            ADMIN_PORT,
        )
        cls.user_process = start_uvicorn(
            "sgraph_ai_app_send.lambda__user.lambda_function.lambda_handler__user:app",
            USER_PORT,
        )

        admin_ready = wait_for_server(f"{ADMIN_BASE_URL}/openapi.json")
        user_ready  = wait_for_server(f"{USER_BASE_URL}/openapi.json")

        if not admin_ready or not user_ready:
            cls.tearDownClass()
            parts = []
            if not admin_ready:
                parts.append(f"Admin (port {ADMIN_PORT})")
            if not user_ready:
                parts.append(f"User (port {USER_PORT})")
            raise RuntimeError(f"Server(s) failed to start: {', '.join(parts)}")

    @classmethod
    def tearDownClass(cls):
        for proc in [cls.admin_process, cls.user_process]:
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()

    # --- User Lambda (no auth required) ---

    def test__user__anonymous__health(self):
        response = httpx.get(f"{USER_BASE_URL}/info/health")
        assert response.status_code == 200

    def test__user__anonymous__docs(self):
        response = httpx.get(f"{USER_BASE_URL}/docs")
        assert response.status_code == 200

    def test__user__anonymous__openapi(self):
        response = httpx.get(f"{USER_BASE_URL}/openapi.json")
        assert response.status_code == 200

    def test__user__anonymous__send_redirect(self):
        response = httpx.get(f"{USER_BASE_URL}/send", follow_redirects=False)
        assert response.status_code == 307

    def test__user__anonymous__send_page(self):
        response = httpx.get(f"{USER_BASE_URL}/send", follow_redirects=True)
        assert response.status_code == 200

    # --- Admin Lambda (auth required) ---

    def test__admin__anonymous__rejected(self):
        response = httpx.get(f"{ADMIN_BASE_URL}/info/health")
        assert response.status_code == 401

    def test__admin__auth_header__health(self):
        headers  = {AUTH_KEY_NAME: AUTH_KEY_VALUE}
        response = httpx.get(f"{ADMIN_BASE_URL}/info/health", headers=headers)
        assert response.status_code == 200

    def test__admin__auth_cookie__health(self):
        cookies  = httpx.Cookies()
        cookies.set(AUTH_KEY_NAME, AUTH_KEY_VALUE)
        response = httpx.get(f"{ADMIN_BASE_URL}/info/health", cookies=cookies)
        assert response.status_code == 200

    def test__admin__wrong_key__rejected(self):
        headers  = {AUTH_KEY_NAME: "wrong-value"}
        response = httpx.get(f"{ADMIN_BASE_URL}/info/health", headers=headers)
        assert response.status_code == 401

    def test__admin__auth_header__docs(self):
        headers  = {AUTH_KEY_NAME: AUTH_KEY_VALUE}
        response = httpx.get(f"{ADMIN_BASE_URL}/docs", headers=headers)
        assert response.status_code == 200

    def test__admin__auth_header__console_redirect(self):
        headers  = {AUTH_KEY_NAME: AUTH_KEY_VALUE}
        response = httpx.get(f"{ADMIN_BASE_URL}/admin", headers=headers, follow_redirects=False)
        assert response.status_code == 307
