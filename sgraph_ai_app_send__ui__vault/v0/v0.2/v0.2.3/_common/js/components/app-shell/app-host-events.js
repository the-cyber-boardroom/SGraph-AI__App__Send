/* =================================================================================
   AppHostEvents — the kernel→app event allowlist  (Phase C3 — v0.33.5)

   The permission model has two halves:
     • AppPermissions  — OUTBOUND capability: what the app may CALL (sg.vfs.*, sg.inbox.*).
     • AppHostEvents   — INBOUND capability: what the kernel may PUSH to the app (sg.on).

   They are deliberately separate top-level fields in app.json with distinct shapes,
   because they answer different questions. host_events is a flat map of
   { "<event-name>": true|false }; the kernel filters every outgoing push through it.

   Contract (mirrors AppPermissions' pure, DOM-free, Node-testable shape):
     parse(appJson)        → Set<string> of allowed event names (default-deny: empty set
                             when host_events is absent).
     allows(set, name)     → boolean.

   Rules:
     • Default-deny. An app that omits host_events receives NO kernel pushes.
     • Only entries whose value is exactly `true` are allowed (false / truthy-but-not-true
       are ignored — explicit opt-in only).
     • Event names must be enumerated by EXACT name. No wildcards in the allowlist
       ("*" is rejected) — keeps the audit surface explicit. (An app may still subscribe
       to "*" via sg.on to observe everything it is ALREADY allowed to receive; the
       allowlist itself never contains "*".)
     • Names must match ^[a-z][a-z0-9._-]*$ — lowercase, dotted namespaces (inbox.new-messages).

   Subscribing via sg.on for a name not in the allowlist is a silent no-op (never an
   error) — deliberately indistinguishable from "no such event ever fired", so a hostile
   app cannot probe which event names are real/allowed.
   ================================================================================= */

;(function () {
    'use strict';

    var NAME_RE = /^[a-z][a-z0-9._-]*$/;

    function parse(appJson) {
        var out = new Set();
        var he  = appJson && appJson.host_events;
        if (!he || typeof he !== 'object') return out;
        var keys = Object.keys(he);
        for (var i = 0; i < keys.length; i++) {
            var name = keys[i];
            if (he[name] !== true) continue;          // explicit opt-in only
            if (name === '*') continue;               // no wildcard in the allowlist
            if (!NAME_RE.test(name)) continue;        // reject malformed names
            out.add(name);
        }
        return out;
    }

    function allows(allowed, name) {
        return !!(allowed && typeof allowed.has === 'function' && allowed.has(name));
    }

    globalThis.AppHostEvents = { parse: parse, allows: allows };
})();
