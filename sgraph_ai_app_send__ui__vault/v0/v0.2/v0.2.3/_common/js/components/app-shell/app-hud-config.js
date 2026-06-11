/* =================================================================================
   SGraph App — HUD Config Resolver (app-hud-config)

   Pure, DOM-free resolver for the `app.json` `hud.*` schema:
       hud.mode  ∈ {'full', 'minimal', 'hidden', 'none'}   (default 'full')
       hud.show.<flag>: boolean                        (granular overrides on top of
                                                        the mode's defaults)

   Loaded BEFORE app-hud.js in /en-gb/app/index.html; AppHud._resolveHudCfg
   delegates to this module.

   ── Sovereignty rail (NOT configurable, NOT here) ──
   Consent prompts always render, the hidden-mode escape pill is always present,
   and the user-side localStorage['sg-app-force-show-hud']='1' override is read
   by the page script BEFORE calling applyHudConfig. None of those are mediated by
   this module — they're guarantees of the host, not knobs.

   NOTE on 'none' vs 'hidden': both hide the chrome row, but 'hidden' keeps the
   corner "× Exit app" escape pill (a visible clue that this is a vault app),
   whereas 'none' shows NOTHING — the app is visually indistinguishable from a
   standalone page and the only way back to the vault is to edit the URL. Use
   'none' deliberately (e.g. a patient-facing form) where any chrome would break
   the illusion. Consent prompts still render in BOTH modes (sovereignty rail).

   See library/guides/vault-html/AUTHORING.md → "Configuring the host chrome".
   ================================================================================= */

(function () {
    'use strict';

    // Per-mode defaults for the show.* flags.
    var DEFAULTS_FULL = {
        vaultName:  true,  appTitle:  true,  openVault:  true,  copyLink: true,
        print:      true,  debug:     true,  activity:   true,
        navBar:     true,  navArrows: true,  navPath:    true,  navRefresh: true,
        navHome:    true
    };

    var DEFAULTS_MINIMAL = {
        // openVault stays ON in minimal: a stripped HUD still needs a visible way back
        // to the vault file browser (otherwise the user must know to edit the URL).
        // activity (the read/write meter) is a power-user surface — off in minimal.
        vaultName:  true,  appTitle:  true,  openVault:  true,  copyLink: false,
        print:      false, debug:     false, activity:   false,
        navBar:     false, navArrows: false, navPath:    false, navRefresh: false,
        navHome:    false
    };

    var AppHudConfig = {

        // Resolve a possibly-undefined hud config from app.json into a complete one.
        // Output shape: { mode: 'full'|'minimal'|'hidden', show: {<flag>: bool, …} }
        //
        // - Unknown / missing `mode` falls back to 'full' (forgiving — apps should
        //   never get a bricked HUD just because they typo'd the mode).
        // - 'hidden' and 'none' resolve with show defaults from 'full' so that IF the
        //   user override force-shows the HUD, every button is on by default —
        //   minimal-style stripping only applies to 'minimal' mode. The actual hiding
        //   for hidden/none is enforced by the consumer (AppHud.applyHudConfig) keying
        //   off mode.
        // - show.* entries explicitly set to `false` override the defaults; entries
        //   set to `true` are also honoured (so apps can opt-in to flags that the
        //   mode would default off).
        resolve: function (input) {
            input = input || {};
            var rawMode = input.mode;
            var mode = (rawMode === 'hidden' || rawMode === 'minimal'
                     || rawMode === 'none'   || rawMode === 'full')
                ? rawMode
                : 'full';
            var defaults = (mode === 'minimal') ? DEFAULTS_MINIMAL : DEFAULTS_FULL;
            var show = Object.assign({}, defaults, (input.show || {}));
            return { mode: mode, show: show };
        }
    };

    if (typeof globalThis !== 'undefined') globalThis.AppHudConfig = AppHudConfig;
    if (typeof window     !== 'undefined') window.AppHudConfig    = AppHudConfig;
})();
