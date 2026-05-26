/* =================================================================================
   VaultLoader — Routing Head-Script Logic
   Implements the four routing entry points as single-call functions suitable for
   inline <script> head blocks on each surface.

   Routing table (final design):
     /                   no hash  → redirect to /en-gb/
     /#token             has hash → save token to LS → redirect to /en-gb/app (no hash)
     /#token|path        has hash with pipe → save deep-link to sessionStorage
                                              → redirect to /en-gb/app (no hash)
     /en-gb/app          no hash  → app-shell reads key from LS → check app.json
                                    → if app: run it; if no app: redirect to /en-gb/vault/
     /en-gb/app#path     hash = file path (NOT vault key) → app-shell saves app:path
                                    deep-link → reads key from LS → opens vault
                                    → if app.json: run app; if no app.json: redirect
                                      to /en-gb/vault/ (deep-link kept so vault opens file)
     /en-gb/             any hash → strip (discard) → render landing
     /en-gb/vault        any hash → strip (discard) → auto-load from LS
     /en-gb/vault/peek   any hash → strip (discard) → render peek page

   REMOVED:
     /en-gb/app#vault-key  — no longer supported; use /#vault-key instead
     /en-gb/vault/app#path — no longer supported; use /en-gb/app#path instead

   Rules:
     1. Root (/) is the only hash inbox for vault tokens.
     2. Root redirect always goes to /en-gb/app with NO hash (key saved to LS).
     3. /en-gb/app hash is a file path (for App Mode), not a vault key.
        Vault key ALWAYS comes from localStorage.
     4. Deep-link path (part after |) is saved to sessionStorage key
        'sg-vault-deep-link' so the vault/app-shell can restore it after mount.

   Load order: after vault-loader-storage.js.
   ================================================================================= */

;(function () {
    'use strict';

    var _DEEP_LINK_KEY = 'sg-vault-deep-link';

    function _hasHash() {
        var h = location.hash;
        return !!(h && h !== '#');
    }

    function _stripHash() {
        if (_hasHash()) {
            history.replaceState(null, '', location.pathname + location.search);
        }
    }

    function _extractToken() {
        try {
            return decodeURIComponent(location.hash.slice(1)).split('|')[0].toLowerCase().trim();
        } catch (_) { return ''; }
    }

    function _saveDeepLink(raw) {
        // raw is everything AFTER the first | in the hash (already decoded).
        // app: prefix = open in App Mode. Plain path = open file tab only.
        try {
            if (raw) sessionStorage.setItem(_DEEP_LINK_KEY, raw);
            else      sessionStorage.removeItem(_DEEP_LINK_KEY);
        } catch (_) {}
    }

    // Called from root (/) head script — the only hash inbox.
    // Supports:
    //   /#vault-key              → save key to LS → redirect to /en-gb/app (no hash)
    //   /#vault-key|path         → save key + plain deep-link → redirect to /en-gb/app
    //   /#vault-key|app:path     → save key + app: deep-link → redirect to /en-gb/app
    // app-shell reads key from LS (hash on /en-gb/app is a file path, not a key).
    function runRoot() {
        if (_hasHash()) {
            var raw    = '';
            try { raw = decodeURIComponent(location.hash.slice(1)); } catch (_) {}
            var pipeIdx = raw.indexOf('|');
            var token   = (pipeIdx === -1 ? raw : raw.slice(0, pipeIdx)).toLowerCase().trim();
            var deep    = pipeIdx === -1 ? '' : raw.slice(pipeIdx + 1).trim();
            if (token) VaultLoaderStorage.setCurrentKey(token);
            _saveDeepLink(deep);
            // Redirect to app page with NO hash — key is now in localStorage.
            // app-shell reads key from LS; hash on /en-gb/app is a file path, not a key.
            location.replace('/en-gb/app');
        } else {
            location.replace('/en-gb/');
        }
    }

    // Called from /en-gb/ head script — strip any stray hash, render landing.
    function runLanding() { _stripHash(); }

    // Called from /en-gb/vault (and /en-gb/vault/*) head script.
    // Strips any hash — vault always reads key from localStorage.
    // /en-gb/vault/app is no longer a special route; use /en-gb/app#path instead.
    function runVault() {
        _stripHash();
    }

    // Called from /en-gb/vault/peek head script — strip hash, render peek page.
    function runPeek() { _stripHash(); }

    // Read and consume the saved deep link (one-shot: clears sessionStorage).
    // Returns the raw string (e.g. 'app:path/to/file', 'path/to/file', or '').
    function consumeDeepLink() {
        try {
            var v = sessionStorage.getItem(_DEEP_LINK_KEY) || '';
            sessionStorage.removeItem(_DEEP_LINK_KEY);
            return v;
        } catch (_) { return ''; }
    }

    globalThis.VaultLoaderRouting = {
        runRoot:         runRoot,
        runLanding:      runLanding,
        runVault:        runVault,
        runPeek:         runPeek,
        consumeDeepLink: consumeDeepLink
    };
}());
