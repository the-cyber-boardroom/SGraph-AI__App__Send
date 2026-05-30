/* =================================================================================
   SGraph App — Navigation Helpers (app-shell-nav-helpers)

   Pure, DOM-free helpers extracted from app-shell.js so the navigation rules can
   be unit-tested in Node. Loaded BEFORE app-shell.js in /en-gb/app/index.html;
   app-shell delegates to these helpers from `_resolvePath`, `_navigateToPath`,
   and the recent-pages 'jump' handler.

   The same RULES are also encoded inline in the iframe-side bridge script
   (`_buildVfsBridgeScript`) — that's an unavoidable copy because the bridge is
   injected as a string and can't reference parent globals. When the bridge
   builder gets extracted (planned follow-up), it will assert against these
   helpers as its source of truth.

   ── Rule history (so we don't regress) ──
   • 2026-05-30: shouldInterceptVaultHtmlHref must strip ?query and #fragment
     before the .html/.htm extension check. Pre-fix, "page.html#section" looked
     like it ended in "section" and fell through to a real GET (403 on the
     static host). Pinned by test__app_shell_nav_helpers.js.
   • 2026-05-30: resolveNavigation MUST honour alreadyResolved=true by skipping
     the htmlDir prefix. Pre-fix, back/forward from a deep dir double-prefixed
     the (already vault-absolute) history entry. Pinned likewise.
   ================================================================================= */

(function () {
    'use strict';

    var AppNavHelpers = {

        // Vault-relative path resolver. `base` is the current page's directory
        // (e.g. "home/") with a trailing slash; `href` is the link target. Rules:
        //   - leading "/" → vault-absolute, slash stripped
        //   - no base   → href returned as-is
        //   - "." / ".." collapsed against `base`
        // Pure: no `this`, no DOM, no globals.
        resolvePath: function (base, href) {
            if (typeof href !== 'string') return '';
            if (href.charAt(0) === '/') return href.slice(1);
            if (!base) return href;
            var parts    = (base + href).split('/');
            var resolved = [];
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p === '..')      { if (resolved.length) resolved.pop(); }
                else if (p !== '.')  { resolved.push(p); }
            }
            return resolved.join('/');
        },

        // Split "path#fragment" → { pathPart, fragment } where fragment is "" if absent.
        // No leading '#' in fragment. Pure.
        splitHrefFragment: function (href) {
            href = String(href || '');
            var i = href.indexOf('#');
            if (i < 0) return { pathPart: href, fragment: '' };
            return { pathPart: href.slice(0, i), fragment: href.slice(i + 1) };
        },

        // Does this href (clicked inside an app iframe) represent an in-vault HTML
        // page that the bridge should intercept and forward to the parent? Returns
        // true for relative *.html/.htm (with or without ?query / #fragment);
        // false for external (http://, //), in-page (#anchor), mailto:, javascript:,
        // and non-html. Pure.
        //
        // **REGRESSION TEST ANCHOR (2026-05-30 hash-link fix):** the path portion
        // must be split from ?/# BEFORE the extension check.
        shouldInterceptVaultHtmlHref: function (href) {
            if (!href || typeof href !== 'string') return false;
            if (href.charAt(0) === '#') return false;
            if (href.indexOf('mailto:')    === 0) return false;
            if (href.indexOf('javascript:') === 0) return false;
            if (href.indexOf('http://')    === 0) return false;
            if (href.indexOf('https://')   === 0) return false;
            if (href.indexOf('//')         === 0) return false;
            var hp = href.split('?')[0].split('#')[0];
            return hp.length > 0 && (hp.lastIndexOf('.html') === hp.length - 5
                                  || hp.lastIndexOf('.htm')  === hp.length - 4);
        },

        // The navigation decision: given a click-target href, the current page's
        // htmlDir, and whether the caller asserts the path is already vault-absolute
        // (back/forward/recent-jump pass true; bridge-intercepted clicks pass false),
        // return the resolved vault path and the fragment to scroll to.
        //
        // **REGRESSION TEST ANCHOR (2026-05-30 path-doubling fix):** when
        // alreadyResolved is true, pathPart is returned as-is. Re-running
        // resolvePath against the current htmlDir would prefix the (already-absolute)
        // history entry a second time.
        //
        // opts:
        //   href            — the link target ("home/index.html", "page.html#sect", …)
        //   htmlDir         — current page's directory ("shared/test-lab/" or "")
        //   alreadyResolved — bool; true for history navigation, false otherwise
        // returns { resolved, fragment }
        resolveNavigation: function (opts) {
            opts = opts || {};
            var href            = String(opts.href || '');
            var htmlDir         = String(opts.htmlDir || '');
            var alreadyResolved = (opts.alreadyResolved === true);
            var split    = AppNavHelpers.splitHrefFragment(href);
            var resolved = alreadyResolved
                ? split.pathPart
                : AppNavHelpers.resolvePath(htmlDir, split.pathPart);
            return { resolved: resolved, fragment: split.fragment };
        }
    };

    if (typeof globalThis !== 'undefined') globalThis.AppNavHelpers = AppNavHelpers;
    if (typeof window     !== 'undefined') window.AppNavHelpers    = AppNavHelpers;
})();
