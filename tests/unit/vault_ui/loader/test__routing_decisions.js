/* =================================================================================
   VaultLoader — Routing Decision Unit Tests
   Verifies VaultLoaderRouting without real navigation: mocks location and history
   to capture the decisions, then restores them after each suite.
   Run: node tests/unit/vault_ui/loader/test__routing_decisions.js
   ================================================================================= */

import { suite, assert, clearVaultStorage } from './helpers.js';
import './load-loader.js';

// ---------------------------------------------------------------------------
// Test mock: replace global location and history for routing tests.
// The routing functions use bare `location` and `history` which resolve to
// globalThis.location / globalThis.history (set on `global` in load-loader.js).
// ---------------------------------------------------------------------------
function makeMockNav() {
    return {
        replaced: null,
        replaceStateCalls: [],
        location: {
            hash: '', pathname: '/', search: '', replaced: null,
            replace(url) { this.replaced = url; }
        },
        history: {
            replaceState(state, title, url) {
                // capture the URL passed to replaceState
                this._mock.replaceStateCalls.push(url);
            }
        }
    };
}

function installMock(mock) {
    mock.history._mock = mock;
    global.location = mock.location;
    global.history  = mock.history;
}

function restoreMock(origLocation, origHistory) {
    global.location = origLocation;
    global.history  = origHistory;
}

// ---------------------------------------------------------------------------
// runRoot() — the only hash inbox
// ---------------------------------------------------------------------------
suite('VaultLoaderRouting.runRoot — no hash', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        clearVaultStorage();
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        mock.location.hash = '';
        installMock(mock);
    });
    after(() => restoreMock(origLocation, origHistory));

    test('redirects to /en-gb/', () => {
        VaultLoader.routing.runRoot();
        assert.equal(mock.location.replaced, '/en-gb/');
    });

    test('does not touch localStorage when there is no hash', () => {
        assert.equal(VaultLoader.storage.getCurrentKey(), null);
    });
});

suite('VaultLoaderRouting.runRoot — with hash token', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        clearVaultStorage();
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        mock.location.hash = '#apple-river-1234';
        installMock(mock);
    });
    after(() => {
        restoreMock(origLocation, origHistory);
        VaultLoader.storage.clearCurrentKey();
    });

    test('redirects to /en-gb/app (key saved to LS, no hash)', () => {
        VaultLoader.routing.runRoot();
        assert.equal(mock.location.replaced, '/en-gb/app');
    });

    test('saves token to localStorage before redirecting', () => {
        // runRoot was already called in previous test; re-call with fresh state.
        clearVaultStorage();
        mock.location.hash = '#apple-river-1234';
        VaultLoader.routing.runRoot();
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234');
    });
});

suite('VaultLoaderRouting.runRoot — hash with pipe deep-link', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        clearVaultStorage();
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        mock.location.hash = '#apple-river-1234|docs/README.md';
        installMock(mock);
    });
    after(() => {
        restoreMock(origLocation, origHistory);
        VaultLoader.storage.clearCurrentKey();
    });

    test('saves token part only and redirects to /en-gb/app (no hash)', () => {
        VaultLoader.routing.runRoot();
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234', 'deep-link suffix stripped from key');
        assert.equal(mock.location.replaced, '/en-gb/app', 'redirected to app (key saved to LS, no hash)');
    });
});

// ---------------------------------------------------------------------------
// runLanding() / runVault() / runPeek() — strip hash everywhere else
// ---------------------------------------------------------------------------
suite('VaultLoaderRouting.runLanding — strips hash', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        installMock(mock);
    });
    after(() => restoreMock(origLocation, origHistory));

    test('calls replaceState when hash is present', () => {
        mock.location.hash = '#apple-river-1234';
        mock.replaceStateCalls = [];
        VaultLoader.routing.runLanding();
        assert.equal(mock.replaceStateCalls.length, 1, 'replaceState called once');
    });

    test('does NOT call replaceState when hash is absent', () => {
        mock.location.hash = '';
        mock.replaceStateCalls = [];
        VaultLoader.routing.runLanding();
        assert.equal(mock.replaceStateCalls.length, 0, 'replaceState not called');
    });

    test('does NOT redirect (no location.replace call)', () => {
        mock.location.hash    = '#apple-river-1234';
        mock.location.replaced = null;
        VaultLoader.routing.runLanding();
        assert.equal(mock.location.replaced, null, 'no redirect');
    });
});

suite('VaultLoaderRouting.runVault — strips hash', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        mock.location.hash = '#stray-token-0000';
        installMock(mock);
    });
    after(() => restoreMock(origLocation, origHistory));

    test('strips hash via replaceState and does not redirect', () => {
        VaultLoader.routing.runVault();
        assert.equal(mock.replaceStateCalls.length, 1, 'replaceState called once');
        assert.equal(mock.location.replaced, null, 'no redirect');
    });
});

suite('VaultLoaderRouting.runPeek — strips hash', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    before(() => {
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        mock.location.hash = '#stray-token-0000';
        installMock(mock);
    });
    after(() => restoreMock(origLocation, origHistory));

    test('strips hash via replaceState and does not redirect', () => {
        VaultLoader.routing.runPeek();
        assert.equal(mock.replaceStateCalls.length, 1, 'replaceState called once');
        assert.equal(mock.location.replaced, null, 'no redirect');
    });
});

// ---------------------------------------------------------------------------
// Release pins — `@name` in the hash tail.
//
// The pin belongs in the LINK, not just localStorage: a pin held only in one
// browser dies on a new laptop or cleared storage — mid-demo, which is the exact
// failure release channels exist to prevent. These pin the grammar so that a
// pinned link keeps working, and keeps composing with deep links.
// ---------------------------------------------------------------------------
suite('VaultLoaderRouting.runRoot — release pins', ({ test, before, after }) => {
    let mock, origLocation, origHistory;
    const PIN_KEY = 'sg-vault-release-pin';
    before(() => {
        clearVaultStorage();
        origLocation = global.location;
        origHistory  = global.history;
        mock = makeMockNav();
        installMock(mock);
    });
    after(() => {
        restoreMock(origLocation, origHistory);
        VaultLoader.storage.clearCurrentKey();
        try { sessionStorage.removeItem(PIN_KEY); } catch (_) {}
    });

    const run = (hash) => {
        clearVaultStorage();
        try { sessionStorage.removeItem(PIN_KEY); } catch (_) {}
        mock.location.hash = hash;
        VaultLoader.routing.runRoot();
    };
    const pin  = () => { try { return sessionStorage.getItem(PIN_KEY); } catch (_) { return null; } };
    const deep = () => VaultLoader.routing.consumeDeepLink();

    test('a bare key stores no pin', () => {
        run('#apple-river-1234');
        assert.equal(pin(), null);
    });

    test('@name is extracted as the release pin', () => {
        run('#apple-river-1234|@v1-2');
        assert.equal(pin(), 'v1-2');
        assert.equal(VaultLoader.storage.getCurrentKey(), 'apple-river-1234');
    });

    test('the pin is NOT left in the deep link', () => {
        run('#apple-river-1234|@v1-2');
        assert.equal(deep(), '');
    });

    test('a pin composes with an app: deep link', () => {
        run('#apple-river-1234|@v1-2|app:index.html');
        assert.equal(pin(), 'v1-2');
        assert.equal(deep(), 'app:index.html');
    });

    test('order does not matter', () => {
        run('#apple-river-1234|app:index.html|@black-hat-demo');
        assert.equal(pin(), 'black-hat-demo');
        assert.equal(deep(), 'app:index.html');
    });

    test('a free-text release slug survives', () => {
        run('#apple-river-1234|@old-pilot');
        assert.equal(pin(), 'old-pilot');
    });

    test('a plain deep link still stores no pin', () => {
        run('#apple-river-1234|docs/README.md');
        assert.equal(pin(), null);
        assert.equal(deep(), 'docs/README.md');
    });

    test('a bare @ is ignored rather than pinning to nothing', () => {
        run('#apple-river-1234|@');
        assert.equal(pin(), null);
    });

    test('the redirect target is unchanged', () => {
        run('#apple-river-1234|@v1-2');
        assert.equal(mock.location.replaced, '/en-gb/app');
    });
});
