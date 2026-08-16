/* =================================================================================
   load-integration.js — Sets up a jsdom browser environment, loads SGVault/SGSend
   stubs, then sources all vault-loader browser scripts into the current V8 context.

   Import this file once (as a side-effect) before any integration test that uses
   VaultLoader. It extends the unit-test load-loader.js with:
     - SGSend / SGVault in-memory stubs (no network, no Web Crypto)
     - sgraphVault.events.on() support (so listener-based code paths fire correctly)
   ================================================================================= */

import { readFileSync }       from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { runInThisContext }   from 'node:vm';
import { JSDOM }              from 'jsdom';

// --- Browser environment -------------------------------------------------------

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://dev.vault.sgraph.ai/'
});

global.window         = dom.window;
global.document       = dom.window.document;
global.localStorage   = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.location       = dom.window.location;
global.history        = dom.window.history;

// Full event stub — emit() + on() so vault-status-bar-style listeners work.
global.sgraphVault = {
    events: {
        _log:       [],
        _listeners: {},
        emit(name, detail) {
            this._log.push({ name, detail });
            (this._listeners[name] || []).forEach(fn => { try { fn(detail); } catch (_) {} });
        },
        on(name, fn) {
            (this._listeners[name] = this._listeners[name] || []).push(fn);
        },
        off(name, fn) {
            if (this._listeners[name]) {
                this._listeners[name] = this._listeners[name].filter(f => f !== fn);
            }
        },
        clearLog()  { this._log = []; }
    }
};

// --- File loader helpers -------------------------------------------------------

const LOADER_DIR = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/vault-loader/',
    import.meta.url
);
const THIS_DIR   = new URL('./', import.meta.url);

function loadFrom(baseUrl, file) {
    const path = fileURLToPath(new URL(file, baseUrl));
    runInThisContext(readFileSync(path, 'utf8'), { filename: file, displayErrors: true });
}

// --- Load SGVault/SGSend stubs first (vault-loader.js calls them at runtime) ---

loadFrom(THIS_DIR, 'in-memory-sg-vault.js');

// Real crypto lib (Node's WebCrypto backs crypto.subtle): the loader's read-key
// open path (formats 4/6) derives the RO capability triple at runtime via
// SGVaultCrypto.deriveReadOnlyCreds.
const SG_VAULT_LIB_DIR = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-vault/',
    import.meta.url
);
loadFrom(SG_VAULT_LIB_DIR, 'sg-vault-crypto.js');
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');

// --- Load vault-loader modules in dependency order ----------------------------

loadFrom(LOADER_DIR, 'vault-loader-events.js');
loadFrom(LOADER_DIR, 'vault-loader-storage.js');
loadFrom(LOADER_DIR, 'vault-loader-format.js');
loadFrom(LOADER_DIR, 'vault-loader-recent.js');
loadFrom(LOADER_DIR, 'vault-loader-routing.js');
loadFrom(LOADER_DIR, 'vault-loader.js');
