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
        },

        // Decide how to mount a vault on initial open, given the deep-link captured at
        // _init time (e.g. /en-gb/app/#patient/index.html → 'patient/index.html') and
        // the parsed app.json from the vault.
        //
        // **REGRESSION TEST ANCHOR (2026-05-31 deep-link-loses-resources bug):**
        // Pre-fix, a deep-link to any HTML file other than the default entry sent the
        // user to _mountVaultFile (bare single-file view, no app.json resources),
        // which is why /en-gb/app/#patient/index.html rendered unstyled — the file
        // loaded, but the app's CSS/JS never did. The fix: when the deep-link is an
        // HTML/HTM file AND the vault has an app.json, route through the app mount
        // path with the deep-link overriding app.json.entry. Non-HTML deep-links
        // (images, markdown, json) still go through _mountVaultFile because the app
        // mount path is HTML-only.
        //
        // Pure: no `this`, no DOM. Returns one of:
        //   { strategy: 'app',      appJson }    — call _mountApp(appJson, resources)
        //   { strategy: 'file',     filePath }   — call _mountVaultFile(filePath)
        //   { strategy: 'redirect' }             — no app, no file → redirect to /vault/
        //
        // opts:
        //   deepPath — the file path requested via /#path (or '' if none)
        //   appJson  — parsed app.json (or null if the vault has none)
        decideMountStrategy: function (opts) {
            opts = opts || {};
            var deepPath = String(opts.deepPath || '');
            var appJson  = opts.appJson || null;
            var deepPathIsHtml = deepPath.length > 0 &&
                (deepPath.lastIndexOf('.html') === deepPath.length - 5 ||
                 deepPath.lastIndexOf('.htm')  === deepPath.length - 4);

            // Deep-link to an HTML file + vault has an app → app mount, deep-linked
            // file as entry. The app's CSS/JS still load because we go through the
            // full _mountApp path (vs the bare _mountVaultFile).
            if (deepPath && appJson && deepPathIsHtml) {
                return {
                    strategy: 'app',
                    appJson:  Object.assign({}, appJson, { entry: deepPath })
                };
            }
            // Deep-link to a non-HTML file → bare file view (resources don't apply
            // to images / markdown / json anyway).
            if (deepPath && !deepPathIsHtml) {
                return { strategy: 'file', filePath: deepPath };
            }
            // Deep-link to HTML but no app.json → bare file view (no resources to
            // load anyway, and we can't construct a synthetic app.json that wouldn't
            // mislead downstream code about what resources to fetch).
            if (deepPath && !appJson) {
                return { strategy: 'file', filePath: deepPath };
            }
            // No deep-link: regular app mount if there's an app.json, redirect to the
            // vault UI otherwise.
            if (appJson) {
                return { strategy: 'app', appJson: appJson };
            }
            return { strategy: 'redirect' };
        },

        // Resolve a per-folder app.json into the manifest to mount when an HTML file in a
        // sub-folder is opened "as an app". Pure: no `this`, no DOM, no I/O.
        //
        //   folderJson — the parsed app.json found NEXT TO the opened file
        //   folder     — the folder path (e.g. "tools/release-tester")
        //   deepPath   — the HTML file the user opened (e.g. "tools/release-tester/index.html")
        //
        // Rules:
        //   - entry = deepPath (honour the file the user actually opened, not folderJson.entry).
        //   - resources (css/js) resolve RELATIVE TO THE FOLDER: a bare "style.css" →
        //     "{folder}/style.css"; a leading-slash "/shared/x.css" is treated as vault-absolute
        //     (leading slash stripped). So a folder app.json can use folder-relative paths.
        //   - every other field (permissions, host_events, auth, hud, title, …) is preserved
        //     verbatim — the folder app is its OWN app with its OWN policy.
        resolveFolderManifest: function (folderJson, folder, deepPath) {
            folderJson = folderJson || {};
            var rel = function (p) {
                if (!p) return p;
                p = String(p);
                return p.charAt(0) === '/' ? p.slice(1) : folder + '/' + p;
            };
            var out = Object.assign({}, folderJson);
            out.entry = deepPath;
            if (folderJson.resources) {
                out.resources = {
                    css: (folderJson.resources.css || []).map(rel),
                    js:  (folderJson.resources.js  || []).map(rel)
                };
            }
            return out;
        }
    };

    if (typeof globalThis !== 'undefined') globalThis.AppNavHelpers = AppNavHelpers;
    if (typeof window     !== 'undefined') window.AppNavHelpers    = AppNavHelpers;
})();
