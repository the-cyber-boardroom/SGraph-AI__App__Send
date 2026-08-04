/* Nobody's unsaved work gets discarded by a background sync check.
   Run: node tests/unit/vault_ui/loader/test__no_auto_reload.js

   REAL INCIDENT: "I just lost data from inside the vault with one of these auto updates."

   Both hosts used to APPLY an upstream change the moment a background check noticed one:

     vault-shell._checkAndAutoSync  → vault.merge() then _mountBrowse()
     app-shell._checkBehind         → _syncViewToPublishedHead() then _remountCurrent()

   Both tear down the view. Whatever was in an open editor, a half-filled form, an app's
   in-memory state — gone, with no prompt and no undo, triggered by someone else pushing.

   Detection is worth keeping. Applying is the user's call. These are source-level
   assertions because the failure is an ORDERING one (detect → apply, with no gate in
   between) that no unit of the current behaviour would fail on: the merge itself works
   correctly, which is exactly why this shipped. */

import { readFileSync } from 'node:fs';

const V = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const read = (f) => readFileSync(V + f, 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

console.log('\n[suite] /vault — a background check notifies, it does not merge');
{
    const src = read('components/vault-shell/vault-shell.js');
    const fn  = src.slice(src.indexOf('async _checkAndAutoSync'),
                          src.indexOf('setAutoSync(enabled)'));
    ok('found _checkAndAutoSync', fn.length > 200);

    // The gate. Without it the merge runs on every check, as it used to.
    ok('the merge is behind an explicit opt-in flag', /if \(!this\._autoPullEnabled\)/.test(fn));
    const gateAt  = fn.indexOf('_autoPullEnabled');
    const mergeAt = fn.indexOf('this._vault.merge(');
    ok('…and the gate comes BEFORE the merge', gateAt !== -1 && mergeAt !== -1 && gateAt < mergeAt);
    // Match the CALL, not the name: the explanatory comment above mentions _mountBrowse
    // too, and a substring search happily reports the comment as the code.
    ok('…and before the remount', gateAt < fn.indexOf('await this._mountBrowse()'));

    // Detection still happens, so the banner can appear.
    ok('it still reads the published ref',   /readRef\(this\._vault\._refFileId\)/.test(fn));
    ok('…and refreshes the sync state',      /_refreshSyncState\(\)/.test(fn));
    ok('…and says a new version is there',   /New version available/.test(fn));

    // The default. A fresh browser has no localStorage key, and must not auto-pull.
    ok('the field defaults to false',        /this\._autoPullEnabled = false/.test(src));
    ok('an ABSENT setting means OFF, not ON',
        /const pull = localStorage\.getItem\('sg-vault-autopull'\)[\s\S]{0,120}pull === 'true'/.test(src));
    ok('auto-PUSH is untouched (it only preserves work)',
        /stored === null \? true : stored === 'true'/.test(src));

    // The click path already existed — this is the UI that was being skipped past.
    ok('the "Sync now" banner still runs the manual pull',
        /vs-sync-pull-btn'\)\) this\._onPull\(\)/.test(src));
}

console.log('\n[suite] /app — the same, on the HUD');
{
    const src = read('components/app-shell/app-shell.js');
    const fn  = src.slice(src.indexOf('async _checkBehind()'), src.indexOf('async applyPendingUpdate'));
    ok('found _checkBehind', fn.length > 200);

    ok('the live path no longer remounts',        !/_remountCurrent\(\)/.test(fn));
    ok('…nor fast-forwards the view',             !/_syncViewToPublishedHead/.test(fn));
    ok('it shows a HUD notice instead',           /showUpdate\(/.test(fn));
    ok('…with a fallback when the HUD is older',  /showMessage\('update-available'/.test(fn));
    ok('…and remembers what is pending',          /_pendingUpdateHead/.test(fn));

    // Applying still exists — behind the click.
    const apply = src.slice(src.indexOf('async applyPendingUpdate'), src.indexOf('async applyPendingUpdate') + 1200);
    ok('applyPendingUpdate does the work',
        /_syncViewToPublishedHead/.test(apply) && /_remountCurrent/.test(apply));
    ok('…and clears the notice afterwards',       /hideUpdate\(\)/.test(apply));
    ok('…and reports a failure rather than swallowing it', /update-failed/.test(apply));

    // The pinned-release branch was already correct — it must stay that way.
    ok('a pinned release still only surfaces, never drags forward',
        /release-newer/.test(fn) && /You are viewing/.test(fn));
}

console.log('\n[suite] the HUD chip exists and says what clicking costs');
{
    const hud = read('components/app-shell/app-hud.js');
    ok('the chip is in the chrome row',      /class="hud-update-btn"/.test(hud));
    ok('it starts hidden',                   /class="hud-update-btn" style="display:none"/.test(hud));
    ok('showUpdate/hideUpdate exist',        /showUpdate\(text, onApply\)/.test(hud) && /hideUpdate\(\)/.test(hud));
    ok('clicking runs the callback',         /hud-update-btn'\)\)/.test(hud) && /this\._onUpdate\(\)/.test(hud));
    // The cost of clicking is not a surprise the user discovers afterwards.
    ok('the tooltip warns that unsaved app state is lost',
        /anything unsaved in the app will be lost/i.test(hud));
    ok('it is amber, not red — an offer, not an error',
        /\.hud-update-btn \{[\s\S]{0,220}E9C445/.test(hud));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
