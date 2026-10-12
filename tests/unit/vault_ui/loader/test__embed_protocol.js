/* Unit tests — EmbedProtocol (pure helpers for the iframe-embed vault open flow)
   Run: node tests/unit/vault_ui/loader/test__embed_protocol.js

   Pins the message-shape contract documented in embed-protocol.js. A regression
   in any of these would break the vault → parent and parent → vault handshakes
   silently (no error thrown — the messages would just be ignored). */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'embed-protocol.js', import.meta.url)), 'utf8'),
    { filename: 'embed-protocol.js', displayErrors: true }
);
const E = globalThis.EmbedProtocol;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('\n[suite] EmbedProtocol — isEmbedMode');
{
    ok('IM1 ?embed=1 → true',                       E.isEmbedMode('?embed=1') === true);
    ok('IM2 ?embed=1&parent=...x → true',           E.isEmbedMode('?embed=1&parent=https://acme') === true);
    ok('IM3 ?other=1 → false',                      E.isEmbedMode('?other=1') === false);
    ok('IM4 empty → false',                         E.isEmbedMode('') === false);
    ok('IM5 ?embed=true (string, not "1") → false', E.isEmbedMode('?embed=true') === false);
    ok('IM6 ?embed=0 → false',                      E.isEmbedMode('?embed=0') === false);
}

console.log('\n[suite] EmbedProtocol — getExpectedParentOrigin');
{
    ok('EP1 ?parent=https://acme.example → "https://acme.example"',
        E.getExpectedParentOrigin('?embed=1&parent=https://acme.example') === 'https://acme.example');
    ok('EP2 no parent param → ""',
        E.getExpectedParentOrigin('?embed=1') === '');
    ok('EP3 ?parent=null (literal) → "null" (null-origin App Iframe)',
        E.getExpectedParentOrigin('?embed=1&parent=null') === 'null');
    ok('EP4 empty search → ""',
        E.getExpectedParentOrigin('') === '');
}

console.log('\n[suite] EmbedProtocol — validateSource');
{
    var fakeParent  = { _id: 'parent' };
    var fakeSibling = { _id: 'sibling' };

    ok('VS1 source matches parent + no expectedParent → accept',
        E.validateSource({ source: fakeParent, origin: 'https://anything.example' }, '', fakeParent) === true);

    ok('VS2 source is a sibling → reject',
        E.validateSource({ source: fakeSibling, origin: 'https://anything.example' }, '', fakeParent) === false);

    ok('VS3 source matches parent + origin matches expected → accept',
        E.validateSource({ source: fakeParent, origin: 'https://acme.example' }, 'https://acme.example', fakeParent) === true);

    ok('VS4 source matches parent + origin does NOT match → reject',
        E.validateSource({ source: fakeParent, origin: 'https://evil.example' }, 'https://acme.example', fakeParent) === false);

    ok('VS5 null-origin App Iframe parent: expectedParent="null" + origin="null" → accept',
        E.validateSource({ source: fakeParent, origin: 'null' }, 'null', fakeParent) === true);

    ok('VS6 missing event → reject',
        E.validateSource(null, '', fakeParent) === false);

    ok('VS7 missing source on event → reject (parent check fails)',
        E.validateSource({ origin: 'https://x' }, '', fakeParent) === false);

    ok('VS8 no parentWindow passed → skips source check (looser, accepts)',
        E.validateSource({ source: fakeSibling, origin: 'https://acme' }, 'https://acme', null) === true);
}

console.log('\n[suite] EmbedProtocol — parseOpenMessage');
{
    ok('PM1 well-formed minimum → {key, mode:auto, deepLink:""}',
        eq(E.parseOpenMessage({ sg: 'vault-open', key: 'abc:def' }),
           { key: 'abc:def', mode: 'auto', deepLink: '' }));

    ok('PM2 with mode=app + deepLink',
        eq(E.parseOpenMessage({ sg: 'vault-open', key: 'k', mode: 'app', deepLink: 'patient/index.html' }),
           { key: 'k', mode: 'app', deepLink: 'patient/index.html' }));

    ok('PM3 with mode=vault',
        E.parseOpenMessage({ sg: 'vault-open', key: 'k', mode: 'vault' }).mode === 'vault');

    ok('PM4 unknown mode → defaults to "auto" (forgiving)',
        E.parseOpenMessage({ sg: 'vault-open', key: 'k', mode: 'bogus' }).mode === 'auto');

    ok('PM5 missing sg field → null',
        E.parseOpenMessage({ key: 'k' }) === null);

    ok('PM6 wrong sg value → null',
        E.parseOpenMessage({ sg: 'vault-close', key: 'k' }) === null);

    ok('PM7 missing key → null',
        E.parseOpenMessage({ sg: 'vault-open' }) === null);

    ok('PM8 empty-string key → null',
        E.parseOpenMessage({ sg: 'vault-open', key: '' }) === null);

    ok('PM9 non-string key → null',
        E.parseOpenMessage({ sg: 'vault-open', key: 42 }) === null);

    ok('PM10 null data → null',
        E.parseOpenMessage(null) === null);

    ok('PM11 string data (not an object) → null (the protocol is structured only)',
        E.parseOpenMessage('vault-open') === null);

    ok('PM12 array data → null',
        E.parseOpenMessage(['vault-open', 'k']) === null);

    ok('PM13 non-string deepLink → empty string (the field is dropped, not the message)',
        E.parseOpenMessage({ sg: 'vault-open', key: 'k', deepLink: 42 }).deepLink === '');
}

console.log('\n[suite] EmbedProtocol — readyMessage / vaultReadyMessage shapes');
{
    ok('R1 readyMessage shape',
        eq(E.readyMessage(), { sg: 'vault-embed-ready', v: 1 }));

    ok('R2 readyMessage.v matches PROTOCOL_VERSION constant',
        E.readyMessage().v === E.PROTOCOL_VERSION);

    ok('R3 vaultReadyMessage with all fields',
        eq(E.vaultReadyMessage({ vaultName: 'Demo', fileCount: 7, hasApp: true }),
           { sg: 'vault-ready', vaultName: 'Demo', fileCount: 7, hasApp: true }));

    ok('R4 vaultReadyMessage with empty info → safe defaults',
        eq(E.vaultReadyMessage(),
           { sg: 'vault-ready', vaultName: '', fileCount: 0, hasApp: false }));

    ok('R5 vaultReadyMessage coerces fileCount to integer',
        E.vaultReadyMessage({ fileCount: 3.7 }).fileCount === 3);

    ok('R6 vaultReadyMessage coerces hasApp to boolean',
        E.vaultReadyMessage({ hasApp: 'truthy' }).hasApp === true
        && E.vaultReadyMessage({ hasApp: 0 }).hasApp === false);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
