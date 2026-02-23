/* =============================================================================
   SGraph Send Admin Console — Key Registry API Extension
   v0.1.3 — Extends adminAPI with key discovery endpoints

   Endpoints:
     POST   /keys/publish          — publish a public key
     GET    /keys/lookup/{code}    — lookup key by code
     DELETE /keys/unpublish/{code} — unpublish a key
     GET    /keys/list             — list all published keys
     GET    /keys/log              — get transparency log
   ============================================================================= */

(function() {
    'use strict';

    // Extend the global adminAPI singleton with key methods.
    // adminAPI is defined in v0.1.0/js/admin-api.js (loaded before this file).

    adminAPI.publishKey = function(publicKeyPEM, signingKeyPEM) {
        return this._post('/keys/publish', {
            public_key_pem  : publicKeyPEM,
            signing_key_pem : signingKeyPEM || ''
        });
    };

    adminAPI.lookupKey = function(code) {
        code = code.toLowerCase().replace(/\s/g, '');
        return this._get(`/keys/lookup/${encodeURIComponent(code)}`);
    };

    adminAPI.unpublishKey = function(code) {
        code = code.toLowerCase().replace(/\s/g, '');
        return this._request(`/keys/unpublish/${encodeURIComponent(code)}`, {
            method: 'DELETE'
        });
    };

    adminAPI.listKeys = function() {
        return this._get('/keys/list');
    };

    adminAPI.getKeyLog = function() {
        return this._get('/keys/log');
    };

})();
