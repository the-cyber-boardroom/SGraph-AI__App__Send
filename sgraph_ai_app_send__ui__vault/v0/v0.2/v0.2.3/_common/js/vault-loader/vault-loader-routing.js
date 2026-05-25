/* =================================================================================
   VaultLoader — Routing Head-Script Logic
   Implements the four routing entry points as single-call functions suitable for
   inline <script> head blocks on each surface.

   Routing table (final design):
     /                   no hash  → redirect to /en-gb/
     /#token             has hash → save token to LS → redirect to /en-gb/app#token
     /#token|path        has hash with pipe → also save deep-link to sessionStorage
     /#token|app:path    app: prefix → open vault via app-shell (requires app.json)
     /en-gb/app          has hash → app-shell opens vault; redirects to /en-gb/vault/ if no app.json
                                    (clears sg-vault-deep-link before redirect so vault doesn't try App Mode)
     /en-gb/             any hash → strip (discard) → render landing
     /en-gb/vault        any hash → strip (discard) → auto-load from LS
     /en-gb/vault/app    hash = file path → open that file in App Mode (preferred URL for "Open as App")
                                    key must already be in localStorage (vault was open in another tab)
     /en-gb/vault/peek   any hash → strip (discard) → render peek page

   Rules:
     1. Root (/) is the only hash inbox for vault tokens.
     2. Root routing target is driven by hash PRESENCE only (not content):
        with hash → /en-gb/app#token (app-shell is the canonical entry point)
        without   → /en-gb/ (user is exploring; let them pick from the list)
     3. Deep-link path (part after |) is saved to sessionStorage key
        'sg-vault-deep-link' so the vault shell can restore it after mount.
        The app: prefix signals App Mode activation.
     4. /en-gb/vault/app is the preferred URL for "Open as App" from the vault UI.
        The hash is the file path; key must already be in localStorage.
        The path is saved as 'sg-vault-deep-link' with the app: prefix.
        Use this instead of /#token|app:path — the app-shell route expects an
        app.json; without one it redirects to /en-gb/vault/ and the stale
        deep-link causes "App did not signal ready" in sg-app-banner.

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
    //   /#vault-key              → open vault (via app-shell)
    //   /#vault-key|path         → open vault + deep-link to file
    //   /#vault-key|app:path     → open vault + file in App Mode
    function runRoot() {
        if (_hasHash()) {
            var raw    = '';
            try { raw = decodeURIComponent(location.hash.slice(1)); } catch (_) {}
            var pipeIdx = raw.indexOf('|');
            var token   = (pipeIdx === -1 ? raw : raw.slice(0, pipeIdx)).toLowerCase().trim();
            var deep    = pipeIdx === -1 ? '' : raw.slice(pipeIdx + 1).trim();
            if (token) VaultLoaderStorage.setCurrentKey(token);
            _saveDeepLink(deep);
            // Go directly to app page with the key in the hash.
            // app-shell will open the vault, check for app.json, and redirect
            // back to /en-gb/vault/ if no app.json is found.
            location.replace('/en-gb/app' + (token ? '#' + token : ''));
        } else {
            location.replace('/en-gb/');
        }
    }

    // Called from /en-gb/ head script — strip any stray hash, render landing.
    function runLanding() { _stripHash(); }

    // Called from /en-gb/vault (and /en-gb/vault/*) head script.
    // Special case: if the path ends with /app, treat the hash as an App Mode
    // file path (bookmark-friendly URL, vault key from localStorage).
    //   /en-gb/vault/app#path/to/file  →  open file in App Mode
    //   /en-gb/vault/app#/path/to/file →  leading slash is stripped
    function runVault() {
        var pathname = location.pathname.replace(/\/$/, '');
        if (pathname.endsWith('/app') && _hasHash()) {
            var path = location.hash.slice(1).replace(/^\//, '');
            if (path) _saveDeepLink('app:' + path);
        }
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
