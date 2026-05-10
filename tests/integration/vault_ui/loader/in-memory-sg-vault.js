/* =================================================================================
   In-memory SGVault + SGSend stubs for integration tests.
   Loaded via runInThisContext so globalThis refs resolve correctly.

   SGVault._seed(key, name) — pre-populate the store (simulates an existing vault).
   SGVault._reset()         — clear the store between tests.
   ================================================================================= */

;(function () {
    'use strict';

    var _store = new Map();

    function _FakeSGSend(opts) {
        this.endpoint = (opts && opts.endpoint) || 'https://integration.test.local';
        this.token    = (opts && opts.token)    || '';
    }

    var _FakeSGVault = {
        _store: _store,

        open: function (sgSend, vaultKey) {
            return new Promise(function (resolve, reject) {
                var data = _store.get(vaultKey);
                if (!data) {
                    reject(new Error('Vault not found (404): "' + vaultKey + '"'));
                } else {
                    resolve({ name: data.name, _key: vaultKey });
                }
            });
        },

        createFromToken: function (sgSend, simpleToken, opts) {
            return new Promise(function (resolve) {
                var name = (opts && opts.name) || simpleToken;
                _store.set(simpleToken, { name: name });
                resolve({ name: name, _key: simpleToken });
            });
        },

        _seed: function (vaultKey, name) {
            _store.set(vaultKey, { name: name || vaultKey });
        },

        _reset: function () {
            _store.clear();
        }
    };

    globalThis.SGSend  = _FakeSGSend;
    globalThis.SGVault = _FakeSGVault;
}());
