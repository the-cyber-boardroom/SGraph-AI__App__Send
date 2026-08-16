/* =================================================================================
   SGraph Vault — Embed Protocol

   Pure, DOM-free helpers for opening a vault inside an iframe via postMessage
   instead of the URL hash + localStorage flow. Loaded BEFORE app-shell.js in
   /en-gb/app/index.html.

   ── Why ──
   The URL-hash flow has three issues for the nested-iframe case (vault inside
   an App Iframe inside another origin):
     1. localStorage at dev.vault.sgraph.ai is PARTITIONED by top-level origin in
        modern browsers (Chrome / Safari / Firefox storage partitioning). Writing
        a key from inside one embed leaks the key into that partition past the
        embed's lifetime.
     2. The key appears in the iframe's URL (briefly) and in navigation history.
     3. The parent has no structured way to know "vault is opened" or "navigation
        happened" — it has to watch for iframe load events across redirects.

   ── How ──
   Two-message handshake. Vault is the responder; parent drives:

     Parent                                Vault iframe (?embed=1[&parent=<origin>])
       │   <iframe src=".../app/?embed=1">                                     │
       │ ───────────────────────────────────────────────────────────────────→  │
       │                                                                      │
       │                              { sg: 'vault-embed-ready', v: 1 }       │
       │ ←──────────────────────────────────────────────────────────────────── │
       │                                                                      │
       │  { sg: 'vault-open', key, mode?: 'app'|'vault'|'auto', deepLink? }   │
       │ ───────────────────────────────────────────────────────────────────→  │
       │                                                                      │
       │         { sg: 'vault-ready', vaultName, fileCount, hasApp }           │
       │ ←──────────────────────────────────────────────────────────────────── │

   ── Security ──
   • Key is in memory only during the embed session. Not written to localStorage
     in embed mode (sessionStorage is also avoided for the key — the deep-link
     uses sessionStorage because the existing _continue() reader reads from there,
     but it's not a secret).
   • Vault validates event.source === window.parent on every inbound message
     (rejects sibling-frame messages).
   • Vault validates event.origin against ?parent=<origin> if specified. When
     parent is omitted, the vault accepts from any origin (matches the
     null-origin App Iframe case where event.origin === "null").
   • Parent should send vault-open with targetOrigin = vault's origin (not '*')
     so the key isn't leaked into a wrong-origin iframe by a confused-deputy bug.

   ================================================================================= */

(function () {
    'use strict';

    var PROTOCOL_VERSION = 1;

    var EmbedProtocol = {

        PROTOCOL_VERSION: PROTOCOL_VERSION,

        // Is this page running in embed mode? Reads ?embed=1 from the URL.
        // Pure: caller passes the search string for testability.
        isEmbedMode: function (search) {
            search = (typeof search === 'string') ? search
                   : (typeof window !== 'undefined' ? window.location.search : '');
            try { return new URLSearchParams(search).get('embed') === '1'; }
            catch (_) { return false; }
        },

        // Expected parent origin (passed by the embedder so the vault can validate
        // every inbound postMessage's origin). Returns '' if not specified — in
        // which case any origin is accepted (vault still enforces event.source ===
        // window.parent, so siblings are rejected regardless).
        getExpectedParentOrigin: function (search) {
            search = (typeof search === 'string') ? search
                   : (typeof window !== 'undefined' ? window.location.search : '');
            try { return new URLSearchParams(search).get('parent') || ''; }
            catch (_) { return ''; }
        },

        // Validate an incoming postMessage. Returns true if accepted.
        //   - event.source must === parentWindow (rejects siblings + cousins)
        //   - if expectedParent is non-empty, event.origin must match it
        //   - if expectedParent is '' the origin is not checked (looser; works
        //     for null-origin App Iframe parents whose origin is "null")
        validateSource: function (event, expectedParent, parentWindow) {
            if (!event) return false;
            if (parentWindow && event.source !== parentWindow) return false;
            if (expectedParent && event.origin !== expectedParent) return false;
            return true;
        },

        // Parse an inbound 'vault-open' message. Returns {key, mode, deepLink}
        // or null if the message doesn't match the protocol shape.
        parseOpenMessage: function (data) {
            if (!data || typeof data !== 'object') return null;
            if (data.sg !== 'vault-open') return null;
            if (typeof data.key !== 'string' || data.key.length === 0) return null;
            var mode = (data.mode === 'app' || data.mode === 'vault' || data.mode === 'auto')
                ? data.mode : 'auto';
            var deepLink = (typeof data.deepLink === 'string') ? data.deepLink : '';
            return { key: data.key, mode: mode, deepLink: deepLink };
        },

        // Build the vault-embed-ready message (vault → parent).
        readyMessage: function () {
            return { sg: 'vault-embed-ready', v: PROTOCOL_VERSION };
        },

        // Build the vault-ready message (vault → parent) once the vault is mounted.
        vaultReadyMessage: function (info) {
            info = info || {};
            return {
                sg:        'vault-ready',
                vaultName: String(info.vaultName || ''),
                fileCount: (info.fileCount | 0),
                hasApp:    !!info.hasApp
            };
        },

        // Build the vault-error message (vault → parent) when the open FAILS. The
        // parent's mount() already handles {sg:'vault-error'} — without this the
        // only failure signal is its generic 14s handshake timeout.
        vaultErrorMessage: function (message) {
            return { sg: 'vault-error', message: String(message || 'vault error') };
        }
    };

    if (typeof globalThis !== 'undefined') globalThis.EmbedProtocol = EmbedProtocol;
    if (typeof window     !== 'undefined') window.EmbedProtocol    = EmbedProtocol;
})();
