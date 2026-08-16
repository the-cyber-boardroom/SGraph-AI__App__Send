/* =================================================================================
   SGraph Vault — Embed Receiver (shared, one implementation for BOTH shells)

   The child-side half of the embed handshake (see embed-protocol.js for the wire
   format and rationale). Extracted from app-shell._initEmbed so /en-gb/app/ and
   /en-gb/vault/ run the SAME receiver instead of drifting copies — the fate that
   already befell credential parsing.

   Sequence (child perspective):
     1. start() posts { sg:'vault-embed-ready', v:1 } to the parent.
     2. One-shot listener waits for { sg:'vault-open', key, mode?, deepLink? }.
        First VALID message wins; the listener is removed immediately so a
        misbehaving parent cannot re-key the vault mid-session. Every message is
        gated by EmbedProtocol.validateSource (event.source === window.parent,
        plus origin check when ?parent=<origin> was given).
     3. Caller opens the vault with parsed.key, then calls notifyReady(info) to
        post { sg:'vault-ready', ... } back.

   Null-origin lessons already baked into the app-shell original and preserved:
     - targetOrigin falls back to '*' when no ?parent origin was specified (a
       null-origin parent has origin "null"; replying to "null" throws).
     - window.parent access is try/caught (pathological sandboxed-top cases).
     - NOTHING here touches storage — the key stays in instance memory; callers
       must not persist it (pass noPersist to VaultLoader / skip the LS write).

   Pure/DOM-free apart from the injected `win` — node-testable with a stub window
   (tests/unit/vault_ui/loader/test__embed_receiver.js).

   Depends on: EmbedProtocol (embed-protocol.js — load first).
   ================================================================================= */

(function () {
    'use strict';

    // start({ win?, search?, onOpen }) → { targetOrigin, expectedParent, notifyReady, stop }
    //   win:    window-like object (defaults to window; injectable for tests)
    //   search: location.search override (defaults to win.location.search)
    //   onOpen: called ONCE with the parsed {key, mode, deepLink} open message.
    //           Async errors are the caller's to handle (open flow owns its UI).
    function start(opts) {
        opts = opts || {};
        var win            = opts.win || window;
        var search         = (typeof opts.search === 'string') ? opts.search
                           : (win.location ? win.location.search : '');
        var expectedParent = EmbedProtocol.getExpectedParentOrigin(search);
        var targetOrigin   = expectedParent || '*';

        // Ready ping. try/catch: win.parent may throw in pathological setups
        // (sandboxed top-level page with no parent, etc.).
        try {
            win.parent.postMessage(EmbedProtocol.readyMessage(), targetOrigin);
        } catch (_) {}

        var handler = function (event) {
            if (!EmbedProtocol.validateSource(event, expectedParent, win.parent)) return;
            var parsed = EmbedProtocol.parseOpenMessage(event.data);
            if (!parsed) return;

            win.removeEventListener('message', handler);
            handler = null;

            if (opts.onOpen) opts.onOpen(parsed);
        };
        win.addEventListener('message', handler);

        return {
            targetOrigin:   targetOrigin,
            expectedParent: expectedParent,

            // Post vault-ready to the parent (call once the surface is interactive).
            notifyReady: function (info) {
                try {
                    win.parent.postMessage(EmbedProtocol.vaultReadyMessage(info), targetOrigin);
                } catch (_) {}
            },

            // Post vault-error to the parent (call when the open FAILS, so its
            // mount() rejects with the real reason instead of the 14s timeout).
            notifyError: function (message) {
                try {
                    win.parent.postMessage(EmbedProtocol.vaultErrorMessage(message), targetOrigin);
                } catch (_) {}
            },

            // Remove the open listener if it is still armed (e.g. teardown before
            // any valid message arrived).
            stop: function () {
                if (handler) { win.removeEventListener('message', handler); handler = null; }
            }
        };
    }

    var EmbedReceiver = { start: start };
    if (typeof window     !== 'undefined') window.EmbedReceiver     = EmbedReceiver;
    if (typeof globalThis !== 'undefined') globalThis.EmbedReceiver = EmbedReceiver;
})();
