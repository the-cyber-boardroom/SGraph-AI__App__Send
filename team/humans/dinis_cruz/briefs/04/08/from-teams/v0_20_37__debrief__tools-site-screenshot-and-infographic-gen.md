# Debrief: Tools Site Screenshot & Infographic Generator

**Version:** v0.20.37 | **Date:** 2026-04-08 | **Role:** QA (Explorer team)
**Session type:** Claude.ai web chat with computer use
**Follows:** `v0_20_37__debrief__qa-browser-automation-in-claude-session.md`

---

## Summary

This session **confirmed Playwright can screenshot `dev.tools.sgraph.ai` via the egress proxy**, solving the key blocker from the previous session. The critical fix was passing proxy credentials through Playwright's native `proxy=` launch option rather than `--proxy-server` CLI arg. The infographic generator page loads successfully but **cannot connect to OpenRouter** because `openrouter.ai` is not in the egress allowlist.

---

## What Was Done

### 1. Full Environment Setup (same as previous session)

All three repos cloned, venv created, deps installed, Playwright Chromium installed. ~2 min total. Used the copy-paste setup script from the previous debrief — worked without changes.

### 2. Tools Site Screenshot — ✅ SUCCESS

**URL:** `https://dev.tools.sgraph.ai/`
**Page title:** "tools.sgraph.ai — Browser-Based Privacy Tools"
**Status:** 200

The domain was added to the allowlist between sessions (confirmed in previous debrief). `curl` worked immediately but Playwright timed out on first attempt — Chromium does not inherit `HTTPS_PROXY` env vars automatically.

#### The Fix: Playwright Proxy Config

```python
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

proxy_url = os.environ.get('HTTPS_PROXY')
parsed = urlparse(proxy_url)

browser = p.chromium.launch(
    headless=True,
    proxy={
        'server':   f'http://{parsed.hostname}:{parsed.port}',
        'username': parsed.username,
        'password': parsed.password,
    }
)
```

**What doesn't work:**
- `--proxy-server={full_url}` → `ERR_NO_SUPPORTED_PROXIES` (Chromium CLI arg doesn't support embedded auth)
- No proxy config at all → timeout (Chromium ignores `HTTPS_PROXY` env var)

### 3. Infographic Generator Page — ✅ Loads, ❌ Cannot Connect

**URL:** `https://dev.tools.sgraph.ai/en-gb/infographic-gen/`
**Page title:** "Infographic Generator — tools.sgraph.ai"
**Status:** 200

**Page elements discovered:**
- `#api-key` — password input for OpenRouter key
- "Connect" button — validates key against OpenRouter API
- Template buttons: Executive Summary, Architecture, Timeline, Comparison, Process Flow, Stats Dashboard, Mind Map, Key Points, etc.
- Main textarea: "Describe your infographic…"
- Direction textarea (optional)
- File upload input (document mode)
- Advanced settings, model tabs, Stop/Send controls

**API key was filled and Connect clicked**, but the validation call to `https://openrouter.ai/api/v1/models` failed:

```
FAILED: https://openrouter.ai/api/v1/models reason=net::ERR_TUNNEL_CONNECTION_FAILED
```

**Root cause:** `openrouter.ai` is not in the egress allowlist.

---

## Key Learnings

### Playwright Proxy Pattern (reusable)

This is the canonical pattern for any Playwright session that needs external network access in a Claude.ai container:

```python
import os
from urllib.parse import urlparse

proxy_url = os.environ.get('HTTPS_PROXY')
parsed = urlparse(proxy_url)

PROXY_CONFIG = {
    'server':   f'http://{parsed.hostname}:{parsed.port}',
    'username': parsed.username,
    'password': parsed.password,
}

# Use in launch:
browser = playwright.chromium.launch(headless=True, proxy=PROXY_CONFIG)
```

### Egress Allowlist Status

| Domain | Status | Notes |
|--------|--------|-------|
| `dev.tools.sgraph.ai` | ✅ Allowed | Added between sessions, works this session |
| `dev.send.sgraph.ai` | ✅ Allowed | Was already allowed |
| `send.sgraph.ai` | ✅ Allowed | Was already allowed |
| `openrouter.ai` | ❌ Blocked | **Needs adding** for infographic gen |

---

## Action Required Before Next Session

**Add `openrouter.ai` to the egress allowlist.** The infographic generator's Connect button calls `https://openrouter.ai/api/v1/models` to validate the key, and then will call `https://openrouter.ai/api/v1/chat/completions` (or similar) for generation. Both need to be reachable.

---

## Setup Script for Next Session (updated)

```bash
# Clone repos
cd /home/claude
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send
git clone https://github.com/the-cyber-boardroom/SG_Send__QA
git clone https://github.com/the-cyber-boardroom/SGraph-AI__Tools

# Setup venv + deps
python3.12 -m venv /tmp/venv312
/tmp/venv312/bin/pip install -e /home/claude/SGraph-AI__App__Send --no-deps
/tmp/venv312/bin/pip install cryptography playwright==1.56.0 fastapi uvicorn \
  pillow pytest pytest-asyncio httpx osbot_playwright osbot_fast_api_serverless \
  mgraph-ai-service-cache memory_fs fastapi_mcp issues-fs-cli
/tmp/venv312/bin/python -m playwright install --with-deps chromium
/tmp/venv312/bin/pip install -e /home/claude/SG_Send__QA --no-deps
```

### Playwright Helper (save as `/home/claude/pw_helpers.py`)

```python
import os
from urllib.parse import urlparse

def get_proxy_config():
    """Parse container egress proxy for Playwright."""
    proxy_url = os.environ.get('HTTPS_PROXY')
    if not proxy_url:
        return None
    parsed = urlparse(proxy_url)
    return {
        'server':   f'http://{parsed.hostname}:{parsed.port}',
        'username': parsed.username,
        'password': parsed.password,
    }
```

---

## Recommended Next Steps (for next session)

1. **Create infographic** — with `openrouter.ai` allowlisted, fill key, connect, and generate an infographic end-to-end
2. **Screenshot the generation flow** — capture each step (connect → template select → prompt → generation → result)
3. **Run broader QA suite** — access gate, combined link, folder upload tests (carried over from previous debrief)
4. **Screenshot `send.sgraph.ai`** — production screenshots for comparison (carried over)
5. **Screenshot `dev.send.sgraph.ai`** — dev environment screenshots

---

*QA Explorer Session Debrief — SGraph Send v0.20.37 — 2026-04-08*
