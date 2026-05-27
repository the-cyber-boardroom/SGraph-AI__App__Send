/* Unit tests — VaultLoaderStorage per-tab vault key + shared access token
   Run: node tests/unit/vault_ui/loader/test__storage_pertab.js

   Bug fix: the vault KEY must be per-tab (sessionStorage), while the ACCESS TOKEN is shared
   across tabs (localStorage). Simulates multiple tabs by swapping globalThis.sessionStorage
   while keeping one shared globalThis.localStorage. No jsdom. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

function makeStore() {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
}

globalThis.localStorage      = makeStore();                                   // shared across "tabs"
globalThis.sessionStorage    = makeStore();
globalThis.VaultLoaderEvents = { VAULT_KEY_SET: 'set', VAULT_KEY_CLEARED: 'clr' };

const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/vault-loader/vault-loader-storage.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'vault-loader-storage.js', displayErrors: true });
const S = globalThis.VaultLoaderStorage;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('\n[suite] VaultLoaderStorage — per-tab vault key, shared access token');

const sessA = makeStore(), sessB = makeStore();

// Tab A opens vault A
globalThis.sessionStorage = sessA;
S.setCurrentKey('apple-river-1234:av');
ok('setCurrentKey writes this tab (sessionStorage)', sessA.getItem('sg-vault-key') === 'apple-river-1234:av');
ok('setCurrentKey writes last-opened (localStorage)', globalThis.localStorage.getItem('sg-vault-key') === 'apple-river-1234:av');

// Tab B opens vault B
globalThis.sessionStorage = sessB;
S.setCurrentKey('berry-stone-5678:bv');

// Reload each tab — each keeps ITS OWN vault (the bug fix)
globalThis.sessionStorage = sessA;
ok('reload tab A → vault A (not clobbered by B)', S.getCurrentKey() === 'apple-river-1234:av');
globalThis.sessionStorage = sessB;
ok('reload tab B → vault B', S.getCurrentKey() === 'berry-stone-5678:bv');

// A brand-new tab (empty session) falls back to the last-opened key
globalThis.sessionStorage = makeStore();
ok('fresh tab → last-opened fallback (localStorage)', S.getCurrentKey() === 'berry-stone-5678:bv');

// Access TOKEN is shared across tabs (the intended behaviour)
globalThis.sessionStorage = sessA;
S.setAccessKey('tok-abc');
globalThis.sessionStorage = makeStore();   // a different tab, empty session
ok('access token shared across tabs (localStorage -saved)', S.getAccessKey() === 'tok-abc');

// clearCurrentKey removes both tiers
globalThis.sessionStorage = sessA;
S.clearCurrentKey();
ok('clear removes this tab session key', sessA.getItem('sg-vault-key') === null);
ok('clear removes the last-opened key', globalThis.localStorage.getItem('sg-vault-key') === null);

console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
