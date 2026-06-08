/* =================================================================================
   SGraph Vault — View Mode (Desktop ⇄ Mobile viewport toggle)
   v0.2.4 — phone-first responsive + persistent "Desktop view" escape hatch

   Dinis's model: "desktop is the canonical layout; mobile is a skin you can shed."
   Two composable mechanisms deliver this:

     1. Responsive @media rules (each component, floor = 390px) give a phone-first
        skin by DEFAULT — viewport stays width=device-width so the layout viewport
        is the phone's real width and the @media (max-width: 600px) rules fire.

     2. This toggle is the escape hatch. Switching to "desktop" rewrites the
        viewport meta to a fixed wide layout (width=1280). The browser then
        fits-to-width — i.e. starts the page zoomed out showing the FULL desktop
        layout (small fonts ok) — and the phone @media rules stop matching because
        the layout viewport is now 1280px. The user pinch-zooms from there.

   The choice is persisted PER-DEVICE in localStorage (sticky once chosen), so a
   returning user lands in whichever mode they last picked on this device.

   Loaded synchronously in <head> (before <body> renders) so the correct viewport
   is applied on first paint — no layout flash.

   Public API (window.SGVaultViewMode):
     .getMode()      -> 'mobile' | 'desktop'
     .isDesktop()    -> boolean
     .setMode(mode)  -> applies + persists + emits 'sg-vault-view-mode-changed'
     .toggle()       -> flips between mobile and desktop
   Emits on document: 'sg-vault-view-mode-changed' { detail: { mode } }
   ================================================================================= */

(function () {
    'use strict';

    var STORAGE_KEY   = 'sg-vault-view-mode';
    var DESKTOP_WIDTH = 1280;
    var MOBILE_META   = 'width=device-width, initial-scale=1';
    // Fixed wide layout; omit initial-scale so the browser fits-to-width (zoomed out).
    // user-scalable=yes is the default but stated for clarity (pinch must work).
    var DESKTOP_META  = 'width=' + DESKTOP_WIDTH + ', user-scalable=yes';

    // Embedded (iframe) instances must NOT fight the parent for the viewport — the
    // parent page owns it. We still expose a safe no-op-ish API so callers don't crash.
    var IS_EMBEDDED = (function () { try { return window.top !== window.self; } catch (_) { return true; } })();

    function _readMode() {
        try {
            var v = localStorage.getItem(STORAGE_KEY);
            return v === 'desktop' ? 'desktop' : 'mobile';
        } catch (_) { return 'mobile'; }
    }

    function _persist(mode) {
        try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
    }

    function _viewportMeta() {
        var m = document.querySelector('meta[name="viewport"]');
        if (!m) {
            m = document.createElement('meta');
            m.setAttribute('name', 'viewport');
            (document.head || document.documentElement).appendChild(m);
        }
        return m;
    }

    function _applyToDOM(mode) {
        if (IS_EMBEDDED) return;            // parent controls the viewport when embedded
        _viewportMeta().setAttribute('content', mode === 'desktop' ? DESKTOP_META : MOBILE_META);
        var de = document.documentElement;
        if (de) {
            de.classList.toggle('sg-view-desktop', mode === 'desktop');
            de.classList.toggle('sg-view-mobile',  mode !== 'desktop');
            de.setAttribute('data-sg-view', mode);
        }
    }

    var _current = _readMode();

    var API = {
        getMode:   function () { return _current; },
        isDesktop: function () { return _current === 'desktop'; },
        setMode:   function (mode) {
            mode = (mode === 'desktop') ? 'desktop' : 'mobile';
            _current = mode;
            _persist(mode);
            _applyToDOM(mode);
            try {
                document.dispatchEvent(new CustomEvent('sg-vault-view-mode-changed', { detail: { mode: mode } }));
            } catch (_) {}
            return mode;
        },
        toggle:    function () { return API.setMode(_current === 'desktop' ? 'mobile' : 'desktop'); }
    };

    // Apply the stored mode immediately (head-time) so first paint is correct.
    _applyToDOM(_current);

    window.SGVaultViewMode = API;
})();
