/* =============================================================================
   SgEmbed — pure helpers for sg.vault.embed()  (DOM-free, node-testable)

   Two security-/correctness-critical pure functions. They are unit-tested
   (tests/unit/vault_ui/loader/test__sg_embed_helpers.js) AND injected verbatim
   into the app bridge via Function.prototype.toString() in app-shell.js's
   _buildVfsBridgeScript — so the code that ships in the iframe IS the code under
   test (no second copy to drift).

   sanitizeSandbox(extras) → minimal sandbox attribute string
     - ALWAYS starts from 'allow-scripts' (all the handshake + render need).
     - NEVER includes 'allow-same-origin' (would dissolve the opaque-origin /
       no-storage boundary the whole vault-in-vault design relies on) or
       'allow-popups-to-escape-sandbox' (would let arbitrary vault content open a
       FULL-privilege, unsandboxed window — the embedded frame renders HTML apps
       authored by whoever shared the vault, not just SG's chrome).
     - Narrow, explicit opt-ins only: forms / popups / downloads / modals.
       Anything else (incl. the two dangerous tokens) is dropped.

   buildEmbedSrc(host, originIsNull, opts) → the iframe src URL
     - Uses ?embed=1 (postMessage handshake), never /#<key> (storage flow).
     - Omits &parent when the embedding app is itself opaque-origin: sending
       parent=null makes the vault reply to targetOrigin "null", which throws in
       postMessage and is swallowed → the handshake hangs forever.
   ============================================================================= */

(function () {
    'use strict';

    // Self-contained (no closure refs) so they survive Function.toString() injection.
    function sanitizeSandbox(extras) {
        var SAFE = { forms: 1, popups: 1, downloads: 1, modals: 1 };
        var out  = ['allow-scripts'];
        (extras || []).forEach(function (t) {
            t = String(t).replace(/^allow-/, '');
            var tok = 'allow-' + t;
            if (SAFE[t] && out.indexOf(tok) < 0) out.push(tok);
        });
        return out.join(' ');
    }

    function buildEmbedSrc(host, originIsNull, opts) {
        opts = opts || {};
        host = String(host || '').replace(/\/+$/, '');
        var path = (opts.surface === 'vault') ? '/en-gb/vault/' : '/en-gb/app/';
        var src  = host + path + '?embed=1';
        if (!originIsNull && opts.parentOrigin) {
            src += '&parent=' + encodeURIComponent(opts.parentOrigin);
        }
        return src;
    }

    var SgEmbed = { sanitizeSandbox: sanitizeSandbox, buildEmbedSrc: buildEmbedSrc };
    if (typeof window     !== 'undefined') window.SgEmbed     = SgEmbed;
    if (typeof globalThis !== 'undefined') globalThis.SgEmbed = SgEmbed;
})();
