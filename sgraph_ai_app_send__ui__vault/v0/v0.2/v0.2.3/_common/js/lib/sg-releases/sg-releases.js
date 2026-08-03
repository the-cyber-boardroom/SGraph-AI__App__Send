/* =================================================================================
   SGReleases — named release channels for a vault ("pin a version")

   A vault already contains every version of itself: the SGit commit DAG is immutable
   and content-addressed. This module is the SELECTION layer over it — a curated map of
   human names to commit ids, plus the rule for deciding which one an open should get.

   The config lives at `.vault/releases.json`, inside the permission floor, so a vault
   app can neither read nor tamper with it. That is deliberate: which version you are
   running is a decision for the host and the person holding the vault, not for the code
   being versioned.

   ── The rule that is easy to get wrong ──────────────────────────────────────────
   The release MAP is always read at HEAD; only the CONTENT is pinned. If the map were
   read at the pinned commit, pinning to v1.0 would freeze the release list to whatever
   v1.0 knew about — and there would be no way to see, or return to, anything newer.

   Pure + DOM-free: unit-tested in Node
   (tests/unit/vault_ui/loader/test__sg_releases.js).

   API:
     parse(raw)                → normalised config (junk collapses to "no releases")
     serialize(cfg)            → plain object for writing back
     find(cfg, name)           → release | null      (case-insensitive; name or slug)
     slug(name)                → url-safe token
     resolve(opts)             → { live, name, commit, label, source, error }
     isDuplicateName(cfg, n)   → bool                (uniqueness is enforced at write time)
   ================================================================================= */

(function () {
    'use strict';

    var FILE   = 'releases.json';
    var FOLDER = '/.vault';
    var SCHEMA = 'sg-releases/v1';

    // Names are FREE TEXT by design — "Black Hat demo" is more useful to an audience than
    // "v1.2" — but they also have to survive a URL. slug() is the URL form; both the raw
    // name and its slug resolve to the same release, so `#key|@black-hat-demo` works.
    function slug(name) {
        return String(name == null ? '' : name)
            .toLowerCase().trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function _str(v) { return (typeof v === 'string' && v.trim()) ? v.trim() : null; }

    // Anything malformed collapses to "no releases" rather than throwing: a corrupt
    // config must not brick a vault that would otherwise open fine.
    function parse(raw) {
        var o   = (raw && typeof raw === 'object') ? raw : {};
        var arr = Array.isArray(o.releases) ? o.releases : [];
        var out = [];
        var seen = {};
        for (var i = 0; i < arr.length; i++) {
            var r = arr[i];
            if (!r || typeof r !== 'object') continue;
            var name   = _str(r.name);
            var commit = _str(r.commit);
            if (!name || !commit) continue;                 // both are required to mean anything
            var k = name.toLowerCase();
            if (seen[k]) continue;                           // first wins; uniqueness is a write-time rule
            seen[k] = 1;
            out.push({
                name   : name,
                commit : commit,
                label  : _str(r.label),
                notes  : _str(r.notes),
                created: _str(r.created)
            });
        }
        return {
            schema     : SCHEMA,
            'default'  : _str(o['default']),
            allowLive  : o.allowLive !== false,              // default true
            releases   : out
        };
    }

    function serialize(cfg) {
        var c = parse(cfg);
        var o = { schema: SCHEMA, allowLive: c.allowLive, releases: c.releases };
        if (c['default']) o['default'] = c['default'];
        return o;
    }

    function hasReleases(cfg) {
        return !!(cfg && cfg.releases && cfg.releases.length);
    }

    function find(cfg, name) {
        if (!hasReleases(cfg) || !name) return null;
        var want = String(name).toLowerCase().trim();
        var wantSlug = slug(name);
        for (var i = 0; i < cfg.releases.length; i++) {
            var r = cfg.releases[i];
            if (r.name.toLowerCase() === want) return r;
            if (slug(r.name) === wantSlug)     return r;
        }
        return null;
    }

    function isDuplicateName(cfg, name) { return !!find(cfg, name); }

    // Decide what this open should show.
    //
    //   opts = { config, urlPin, storedPin, isOwner }
    //
    // Order — first that resolves wins:
    //   1. urlPin     — an explicit request in the link. Beats everything: a pinned link
    //                   must show the same thing on every device, forever.
    //   2. storedPin  — a choice this user made HERE, earlier. Only ever set by an explicit
    //                   selection, so a plain reload of a vault nobody pinned shows latest.
    //   3. default    — the owner's choice FOR OTHERS. Skipped for the owner, otherwise
    //                   "why aren't my pushes showing up?" becomes a standing confusion.
    //   4. live HEAD  — today's behaviour, and what an unconfigured vault always gets.
    //
    // A named pin that no longer exists resolves to LIVE with an `error` — never silently.
    // Serving different content than the link asked for is the exact failure this feature
    // exists to prevent, so it has to be visible.
    function resolve(opts) {
        var o    = opts || {};
        var cfg  = o.config;
        var live = { live: true, name: null, commit: null, label: null, source: 'live', error: null };
        if (!hasReleases(cfg)) return live;

        function pick(name, source) {
            var r = find(cfg, name);
            if (!r) return null;
            return { live: false, name: r.name, commit: r.commit, label: r.label, source: source, error: null };
        }

        if (o.urlPin) {
            if (String(o.urlPin).toLowerCase() === 'live') return { live: true, name: null, commit: null, label: null, source: 'url', error: null };
            var u = pick(o.urlPin, 'url');
            if (u) return u;
            return { live: true, name: null, commit: null, label: null, source: 'live',
                     error: 'Release "' + o.urlPin + '" is not published — showing the latest version.' };
        }

        if (o.storedPin) {
            if (String(o.storedPin).toLowerCase() === 'live') return { live: true, name: null, commit: null, label: null, source: 'stored', error: null };
            var s = pick(o.storedPin, 'stored');
            if (s) return s;
            // A stored choice that has since been unpublished is stale, not an error worth
            // shouting about — drop to the normal resolution and let `default` (or live) win.
        }

        if (!o.isOwner && cfg['default']) {
            var d = pick(cfg['default'], 'default');
            if (d) return d;
        }

        return live;
    }

    var API = {
        FILE: FILE, FOLDER: FOLDER, SCHEMA: SCHEMA,
        parse: parse, serialize: serialize, find: find, slug: slug,
        hasReleases: hasReleases, isDuplicateName: isDuplicateName, resolve: resolve
    };

    globalThis.SGReleases = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { SGReleases: API };  // node tests
})();
