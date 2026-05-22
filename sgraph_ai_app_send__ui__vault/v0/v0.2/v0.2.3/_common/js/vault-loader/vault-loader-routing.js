/* =================================================================================
   VaultLoader — Routing Head-Script Logic
   Implements the four routing entry points as single-call functions suitable for
   inline <script> head blocks on each surface.

   Routing table (final design):
     /                   no hash  → redirect to /en-gb/
     /#token             has hash → save token to LS → redirect to /en-gb/vault
     /en-gb/             any hash → strip (discard) → render landing
     /en-gb/vault        any hash → strip (discard) → auto-load from LS
     /en-gb/vault/peek   any hash → strip (discard) → render peek page

   Two rules:
     1. Root (/) is the only hash inbox. All other surfaces strip hashes.
     2. Root routing target is driven by hash PRESENCE only (not content):
        with hash → /en-gb/vault (share-link recipient lands directly on vault)
        without   → /en-gb/ (user is exploring; let them pick from the list)

   Note: these functions implement the NEW design. They are wired up in Phase 2.
   Phase 1 adds them as a pure scaffold — existing callers are not modified yet.

   Load order: after vault-loader-storage.js.
   ================================================================================= */

;(function () {
    'use strict';

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

    // Called from root (/) head script — the only hash inbox.
    function runRoot() {
        if (_hasHash()) {
            var token = _extractToken();
            if (token) {
                VaultLoaderStorage.setCurrentKey(token);
                // Signal that this was a direct hash open — vault page uses this to
                // redirect to /en-gb/app when the vault has an app.json.
                try { sessionStorage.setItem('sg-vault-incoming-hash', '1'); } catch (_) {}
            }
            location.replace('/en-gb/vault');
        } else {
            location.replace('/en-gb/');
        }
    }

    // Called from /en-gb/ head script — strip any stray hash, render landing.
    function runLanding() { _stripHash(); }

    // Called from /en-gb/vault head script — strip hash, auto-load from LS follows.
    function runVault() { _stripHash(); }

    // Called from /en-gb/vault/peek head script — strip hash, render peek page.
    function runPeek() { _stripHash(); }

    globalThis.VaultLoaderRouting = {
        runRoot:    runRoot,
        runLanding: runLanding,
        runVault:   runVault,
        runPeek:    runPeek
    };
}());
