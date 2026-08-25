/* =================================================================================
   App-Iframe Permission Model — pure logic (no DOM, no bridge, no `this`)

   Loaded on /en-gb/app BEFORE app-shell.js. Also unit-tested in Node via
   runInThisContext (tests/unit/vault_ui/loader/test__app_permissions.js).

   Exposes globalThis.AppPermissions:
     normalizePath(raw)        — canonicalise a vault-relative path (collapse . / .. / //)
     hasVaultSegment(path)     — true if any path segment is '.vault' (the secret floor)
     isFloor(verb, path)       — non-grantable DENY for the iframe bridge (§3.4 of the spec)
     parsePermissions(appJson) — app.json.permissions → normalized { fs, vault }
     can(perm, verb, path)     — grant lookup (§3.2/3.3): read default-allow; mutate default-deny
     appId(bytes)              — SHA-256 hex of the canonical app.json bytes (consent-cache identity)

   Verbs: 'fs.read' 'fs.list' 'fs.write' 'fs.move' 'fs.delete' 'fs.mkdir'
          'vault.create' 'vault.createKey' 'vault.standalone' 'vault.seedFrom'
          'vault.openApp' 'vault.embedAccessToken' 'vault.unlink' 'vault.mount' 'vault.delete'
   ================================================================================= */

(function () {
    'use strict';

    // Phase 6 flips this to false (uniform default-deny). Until then, an app with no
    // explicit fs.read grant may still read (within the floor).
    var READ_DEFAULT = true;

    // Canonicalise a vault-relative path. NEVER trust upstream resolution: the bridge's
    // absolute-path branch (wPath.slice(1)) skips _resolvePath, so '..' can survive — we
    // re-collapse it here so the floor cannot be bypassed with '/x/../.vault/app.json'.
    function normalizePath(raw) {
        var s = String(raw == null ? '' : raw).replace(/\\/g, '/');
        if (s.charAt(0) === '/') s = s.slice(1);
        var parts = s.split('/'), out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (p === '' || p === '.') continue;
            if (p === '..') { if (out.length) out.pop(); continue; }
            out.push(p);
        }
        return out.join('/');
    }

    // True if any normalised segment is exactly '.vault' (case-insensitive). Covers nested
    // sub-vault '.vault/' folders too (e.g. customers/acme/.vault/owner/...).
    function hasVaultSegment(path) {
        var norm = normalizePath(path);
        if (!norm) return false;
        var parts = norm.split('/');
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].toLowerCase() === '.vault') return true;
        }
        return false;
    }

    // The non-grantable security floor. true ⇒ the verb on this path is unconditionally
    // DENIED for the iframe bridge, regardless of any grant.
    //   read / list             → deny anything under a '.vault' segment
    //   write/move/delete/mkdir  → deny '.vault/**' AND the legacy root 'app.json'
    function isFloor(verb, path) {
        var norm = normalizePath(path);
        if (hasVaultSegment(norm)) return true;
        var mutating = (verb === 'write' || verb === 'move' || verb === 'delete' || verb === 'mkdir');
        if (mutating && norm.toLowerCase() === 'app.json') return true;
        return false;
    }

    // Normalise a single grant value: true | false | string[] (entries: prefix when
    // trailing '/', else exact file). Anything malformed ⇒ false (deny).
    function _grant(v) {
        if (v === true) return true;
        if (Array.isArray(v)) {
            var out = [];
            for (var i = 0; i < v.length; i++) {
                if (typeof v[i] === 'string' && v[i]) {
                    var isPrefix = /\/$/.test(v[i]);
                    out.push(normalizePath(v[i]) + (isPrefix ? '/' : ''));
                }
            }
            return out;
        }
        return false;
    }

    // Parse app.json.permissions into a normalised shape. Defensive: missing/junk blocks
    // collapse to deny-all-mutations (reads still follow READ_DEFAULT). `fs.read` absent is
    // kept as undefined so `can` can apply the default; present-but-false denies reads.
    // Consent policy per verb (how the HUD confirmation behaves). Declared by the app's author
    // in app.json — the same trust boundary as the grants themselves. Values:
    //   'always' — re-confirm every time (default for createKey/delete; never cached)
    //   'once'   — prompt once per (vault, app, verb), then remember
    //   'auto'   — never prompt (trust the grant alone). For high-privilege verbs this is a
    //              deliberate "I trust this app" choice by whoever authored the manifest.
    // Anything malformed → undefined (callers fall back to the per-verb default).
    function _consentPolicy(c) {
        var out = {};
        if (c && typeof c === 'object') {
            for (var k in c) {
                if (!Object.prototype.hasOwnProperty.call(c, k)) continue;
                var v = c[k];
                if (v === 'always' || v === 'once' || v === 'auto') out[k] = v;
            }
        }
        return out;
    }

    function parsePermissions(appJson) {
        var p     = (appJson && appJson.permissions) || {};
        var fs    = (p.fs    && typeof p.fs    === 'object') ? p.fs    : {};
        var vault = (p.vault && typeof p.vault === 'object') ? p.vault : {};
        var append = (p.append && typeof p.append === 'object') ? p.append : {};
        var llm    = (p.llm    && typeof p.llm    === 'object') ? p.llm    : {};
        return {
            consent: _consentPolicy(p.consent),
            fs: {
                read:  ('read' in fs) ? _grant(fs.read) : undefined,
                write:  _grant(fs.write),
                move:   _grant(fs.move),
                'delete': _grant(fs['delete']),
                mkdir:  _grant(fs.mkdir)
            },
            vault: {
                create:           _grant(vault.create),      // read-through create (existing)
                createKey:        _grant(vault.createKey),   // create + RETURN key / getKey (stronger; path-grant)
                standalone:       vault.standalone === true,   // allow create with no parent link (bool)
                seedFrom:         _grant(vault.seedFrom),    // source paths/refs allowed as seedFrom (path-grant)
                openApp:          vault.openApp === true,       // allow sg.vault.openApp (bool)
                embedAccessToken: vault.embedAccessToken === true, // embed a backend access token in a vault (bool)
                unlink:           _grant(vault.unlink),
                mount:            _grant(vault.mount),       // ViV Phase 2: parent → child kernel spawn
                notify:           vault.notify === true,       // cross-vault peer wake (sg.vault.notify) — bool, default-deny
                'delete':         vault['delete'] === true     // bool only (always consent-gated)
            },
            // Append transport (sg.append.*) — all booleans, default-deny. Not path-scoped:
            // append anchors are server-held, not vault paths. The kernel holds the keys and
            // attaches the gate headers; these grants decide which verbs an app may call.
            append: {
                configure:     append.configure     === true,
                write:         append.write         === true,
                list:          append.list          === true,
                read:          append.read          === true,   // fetch ciphertext
                markProcessed: append.markProcessed === true,
                purge:         append.purge         === true
            },
            // externalLinks (bool, default-deny). When TRUE the app frame is granted
            // allow-popups + allow-popups-to-escape-sandbox so external <a href> links
            // open as real new tabs via in-frame window.open (frictionless). When FALSE
            // (default) the frame gets NEITHER token; external clicks are routed to the
            // host, which opens them after a one-click user confirm (no escape-sandbox).
            // Default-deny is the least-privilege posture: escape-sandbox is opt-in only.
            externalLinks: (p.externalLinks === true),

            // downloads (bool, default-deny). When TRUE sg.vfs.download saves without a
            // per-file confirm. When FALSE (default) each download surfaces a one-click
            // HUD confirm naming the file and size. Either way the save itself runs in
            // the HOST document (real origin) — the app frame never needs allow-downloads.
            downloads: (p.downloads === true),

            // LLM access (sg.llm.*) — all booleans, default-deny. These declare INTENT
            // only. The capability is the INTERSECTION of this and the vault admin's
            // `.vault/llm/config.json` (key, allowed models, spend caps): an app that
            // declares chat in a vault with no key gets ENOKEY, and a configured vault
            // grants nothing to an app that didn't declare it. Deliberately NO limits
            // here — a cap the app author sets is not a cap.
            // `listen` (microphone) is its OWN grant, never implied by `chat`: recording a
            // room is a categorically different act from sending text, and an app that can
            // talk to a model should not thereby be able to open a microphone.
            llm: {
                chat  : llm.chat   === true,
                models: llm.models === true,
                usage : llm.usage  === true,
                listen: llm.listen === true
            },

            // network (bool, default-deny) — the CSP escape hatch. App frames are served with
            // `<meta http-equiv="Content-Security-Policy" content="connect-src blob: data:">`
            // (no network hosts reachable), so the postMessage bridge is the only way out and
            // everything that leaves the frame is permission-checked. TRUE omits that meta for
            // apps that genuinely need to call a third-party API directly, and the HUD then
            // shows a standing "direct network access" chip so the exception is never silent.
            // Enforced in app-shell._buildVfsBridgeScript (the CSP is prefixed to the injected
            // bridge, which AppFrameBootstrap puts first in <head> on all four srcdoc paths).
            network: (p.network === true)
        };
    }

    function _match(grant, path) {
        if (grant === true) return true;
        if (!Array.isArray(grant)) return false;
        var norm = normalizePath(path);
        for (var i = 0; i < grant.length; i++) {
            var e = grant[i];
            if (e.charAt(e.length - 1) === '/') {
                var pfx = e.slice(0, -1);
                if (norm === pfx || norm.indexOf(pfx + '/') === 0) return true;
            } else if (norm === e) {
                return true;
            }
        }
        return false;
    }

    // Grant lookup. perm = parsePermissions(appJson). Does NOT consult the floor or the
    // consent cache — callers combine: allow = !isFloor(verb,path) && can(perm,verb,path) [&& consent].
    function can(perm, verb, path) {
        perm = perm || parsePermissions(null);
        var dot = verb.indexOf('.');
        if (dot === -1) return false;
        var grp = verb.slice(0, dot), act = verb.slice(dot + 1);

        if (grp === 'fs') {
            if (act === 'read' || act === 'list') {
                var g = perm.fs.read;
                if (g === undefined) return READ_DEFAULT;
                return _match(g, path);
            }
            return _match(perm.fs[act], path);
        }
        if (grp === 'vault') {
            if (act === 'delete')           return perm.vault['delete'] === true;
            if (act === 'standalone')       return perm.vault.standalone === true;
            if (act === 'openApp')          return perm.vault.openApp === true;
            if (act === 'embedAccessToken') return perm.vault.embedAccessToken === true;
            if (act === 'notify')           return perm.vault.notify === true;
            return _match(perm.vault[act], path);   // create, createKey, seedFrom, unlink, mount
        }
        if (grp === 'append') {
            return !!(perm.append && perm.append[act] === true);   // all booleans, default-deny
        }
        if (grp === 'llm') {
            return !!(perm.llm && perm.llm[act] === true);         // all booleans, default-deny
        }
        return false;
    }

    // SHA-256 hex of the canonical app.json bytes — the per-app consent-cache identity (A4).
    // Editing the manifest changes the id, so prior consent is re-asked. Async (Web Crypto).
    async function appId(bytes) {
        var buf;
        if (bytes instanceof ArrayBuffer) buf = bytes;
        else if (bytes && bytes.buffer)   buf = bytes.buffer;
        else                               buf = new TextEncoder().encode(String(bytes == null ? '' : bytes)).buffer;
        var digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
        var b = new Uint8Array(digest), hex = '';
        for (var i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, '0');
        return hex;
    }

    globalThis.AppPermissions = {
        normalizePath:    normalizePath,
        hasVaultSegment:  hasVaultSegment,
        isFloor:          isFloor,
        parsePermissions: parsePermissions,
        can:              can,
        appId:            appId,
        get READ_DEFAULT() { return READ_DEFAULT; }
    };
})();
