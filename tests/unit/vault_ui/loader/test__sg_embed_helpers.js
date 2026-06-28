/* Unit tests — SgEmbed (pure helpers behind sg.vault.embed)
   Run: node tests/unit/vault_ui/loader/test__sg_embed_helpers.js

   These pin the SECURITY-critical sandbox minimisation and the src-building rules.
   The same functions are injected verbatim into the app bridge (app-shell.js
   _embedHelperSrc via Function.toString), so what's tested here is what ships. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
runInThisContext(
    readFileSync(fileURLToPath(new URL(ROOT + 'sg-embed-helpers.js', import.meta.url)), 'utf8'),
    { filename: 'sg-embed-helpers.js', displayErrors: true }
);
const E = globalThis.SgEmbed;

let pass = 0, fail = 0;
function ok(name, cond, info) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else      { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); }
}

console.log('\n[suite] SgEmbed.sanitizeSandbox — minimal privileges (security)');
{
    ok('default (no extras) → allow-scripts only',
        E.sanitizeSandbox() === 'allow-scripts');
    ok('empty array → allow-scripts only',
        E.sanitizeSandbox([]) === 'allow-scripts');

    // The two dangerous tokens must NEVER appear, even when explicitly requested.
    const esc = E.sanitizeSandbox(['popups-to-escape-sandbox']);
    ok('REFUSES allow-popups-to-escape-sandbox', !/escape-sandbox/.test(esc), esc);
    const so = E.sanitizeSandbox(['same-origin']);
    ok('REFUSES allow-same-origin', !/same-origin/.test(so), so);
    const both = E.sanitizeSandbox(['allow-same-origin', 'allow-popups-to-escape-sandbox', 'top-navigation']);
    ok('REFUSES same-origin + escape-sandbox + top-navigation together → allow-scripts only',
        both === 'allow-scripts', both);

    // Narrow opt-ins ARE honoured (with or without the allow- prefix).
    ok('opt-in downloads → allow-scripts allow-downloads',
        E.sanitizeSandbox(['downloads']) === 'allow-scripts allow-downloads');
    ok('opt-in accepts allow- prefix too',
        E.sanitizeSandbox(['allow-downloads']) === 'allow-scripts allow-downloads');
    const multi = E.sanitizeSandbox(['popups', 'downloads', 'forms', 'modals']);
    ok('multiple safe opt-ins all kept', /allow-popups/.test(multi) && /allow-downloads/.test(multi) && /allow-forms/.test(multi) && /allow-modals/.test(multi));
    ok('allow-scripts always first/present', multi.split(' ')[0] === 'allow-scripts');

    // Unknown junk is dropped; no duplicates.
    ok('unknown token dropped', E.sanitizeSandbox(['bogus-token']) === 'allow-scripts');
    ok('duplicate opt-in deduped', E.sanitizeSandbox(['downloads', 'downloads']) === 'allow-scripts allow-downloads');
}

console.log('\n[suite] SgEmbed.buildEmbedSrc — ?embed=1, parent omitted when opaque');
{
    const host = 'https://dev.vault.sgraph.ai';
    // Real-origin parent → include &parent.
    const real = E.buildEmbedSrc(host, false, { parentOrigin: 'https://console.example' });
    ok('app surface path + embed=1', /\/en-gb\/app\/\?embed=1/.test(real));
    ok('real origin → &parent included + encoded',
        real.includes('&parent=' + encodeURIComponent('https://console.example')), real);

    // Opaque parent → MUST omit &parent (parent=null hangs the handshake).
    const opaque = E.buildEmbedSrc(host, true, { parentOrigin: 'null' });
    ok('null origin → NO &parent', !/[?&]parent=/.test(opaque), opaque);
    ok('null origin still has embed=1', /\?embed=1/.test(opaque));

    // surface routing + trailing-slash host normalisation.
    ok('surface:"vault" → /en-gb/vault/',
        /\/en-gb\/vault\/\?embed=1/.test(E.buildEmbedSrc(host, true, { surface: 'vault' })));
    ok('trailing slashes on host trimmed',
        E.buildEmbedSrc('https://x.dev///', true, {}) === 'https://x.dev/en-gb/app/?embed=1');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
