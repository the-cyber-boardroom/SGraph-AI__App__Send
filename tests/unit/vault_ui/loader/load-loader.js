/* =================================================================================
   load-loader.js — Sources the vault-loader browser scripts into the Node.js test
   environment by running them in the current V8 context (via vm.runInThisContext).

   Sets up a jsdom browser environment on globalThis BEFORE loading, so the scripts
   can reference localStorage, sessionStorage, location, history, and sgraphVault
   as bare names (same as they would in a real browser).

   Import this file (once, as a side-effect) before any test that uses VaultLoader.
   ================================================================================= */

import { readFileSync }         from 'node:fs';
import { fileURLToPath, URL }   from 'node:url';
import { runInThisContext }      from 'node:vm';
import { JSDOM }                 from 'jsdom';

// --- Browser environment setup --------------------------------------------------

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://dev.vault.sgraph.ai/'
});

// Expose jsdom objects as Node.js globals so bare names work in runInThisContext.
// globalThis === global in Node.js — setting global.X makes X accessible as a
// bare name in runInThisContext'd scripts.
global.window        = dom.window;
global.document      = dom.window.document;
global.localStorage  = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.location      = dom.window.location;
global.history       = dom.window.history;

// Stub EventBus (full bus not needed for unit tests; log for inspection).
global.sgraphVault = {
    events: {
        _log: [],
        emit(name, detail) { this._log.push({ name, detail }); },
        clearLog() { this._log = []; }
    }
};

// --- Source the vault-loader files ----------------------------------------------

const LOADER = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/vault-loader/',
    import.meta.url
);

function load(file) {
    const path = fileURLToPath(new URL(file, LOADER));
    runInThisContext(readFileSync(path, 'utf8'), { filename: file, displayErrors: true });
}

// Load in dependency order
load('vault-loader-events.js');
load('vault-loader-storage.js');
load('vault-loader-format.js');
load('vault-loader-recent.js');
load('vault-loader-routing.js');
load('vault-loader.js');
