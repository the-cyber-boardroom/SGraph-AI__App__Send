/* Guards the Settings panel's credential display in READ-ONLY sessions — the bug
   where a vault opened WITH a read key showed 'Read Key: (unavailable)' (the
   imported CryptoKey is non-extractable BY DESIGN, so exportKey throws; the hex
   must be recovered from the vaultKey string instead), the RO credential was
   labelled 'Vault Key' with the owner warning, and the rename Save button stayed
   live in a session that cannot write.

   Run: node tests/unit/vault_ui/loader/test__vault_settings_readonly.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';
import { JSDOM }            from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://dev.vault.sgraph.ai/' });
global.window         = dom.window;
global.document       = dom.window.document;
global.HTMLElement    = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.CustomEvent    = dom.window.CustomEvent;
// global.navigator is a getter-only prop in Node 22 — the component only touches
// navigator.clipboard on copy clicks, which this test never exercises.
global.sgraphVault    = { events: { emit() {}, on() {}, off() {} }, messages: { success() {}, error() {} } };
global.VaultHelpers   = { formatBytes: (n) => String(n) };   // stats footer only

const BASE = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel) {
    const p = fileURLToPath(new URL(BASE + rel, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: rel, displayErrors: true });
}
load('lib/sg-vault/sg-vault-crypto.js');
runInThisContext('globalThis.SGVaultCrypto = SGVaultCrypto;');
load('components/vault-settings/vault-settings.js');

const RK  = 'abcdef0123456789'.repeat(4);
const VID = '4bshby5n';

function makeElement() {
    const el = document.createElement('vault-settings');
    document.body.appendChild(el);
    el._refreshLlm = async () => {};                      // LLM pane is out of scope here
    return el;
}

function makeRoVault() {
    return {
        name: 'Untitled Vault',
        _passphrase: null,
        _writeKey:   null,
        _readKey:    {},                                   // not a CryptoKey → exportKey throws, like non-extractable
        _vaultId:    VID,
        writable:    false,
        listFolder:  () => [],
        getStats:    () => ({ files: 0, folders: 0, commits: 0, totalSize: 0 })
    };
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const val = (el, sel) => { const i = el.shadowRoot.querySelector(sel); return i ? i.value : null; };

(async () => {
    console.log('\n[suite] vault-settings — read-key RO session shows the credential it was opened with');
    {
        const el = makeElement();
        el.setVault(makeRoVault(), RK + ':' + VID, '');
        await el.refresh();

        ok('Read Key shows the hex (NOT unavailable)',    val(el, '.vset-readkey-input') === RK);
        ok('vault id populated',                          val(el, '.vset-vaultid-input') === VID);
        ok('Copy-both shows readkey:vaultid',             val(el, '.vset-rokey-input') === RK + ':' + VID);
        ok('sgit clone command populated',                val(el, '.vset-roclone-input') === `sgit clone "${RK}:${VID}"`);
        ok('key section relabelled for RO',               /read-only key/i.test(el.shadowRoot.querySelector('.vset-key-label').textContent));
        ok('warning scoped to read (cannot write)',       /cannot write/i.test(el.shadowRoot.querySelector('.vset-key-hint').textContent));
        ok('rename Save disabled in RO session',          el.shadowRoot.querySelector('.vset-save-name').disabled === true);
    }

    console.log('\n[suite] vault-settings — owner session unchanged');
    {
        const el    = makeElement();
        const vault = makeRoVault();
        vault._passphrase = 'my-pass';
        vault._writeKey   = 'f'.repeat(64);
        vault.writable    = true;
        const keyBytes    = Uint8Array.from(RK.match(/../g).map(h => parseInt(h, 16)));
        vault._readKey    = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
        el.setVault(vault, 'my-pass:' + VID, '');
        await el.refresh();

        ok('Read Key exported from the CryptoKey',        val(el, '.vset-readkey-input') === RK);
        ok('key section still labelled Vault Key',        el.shadowRoot.querySelector('.vset-key-label').textContent === 'Vault Key');
        ok('owner warning unchanged',                     /access all files/i.test(el.shadowRoot.querySelector('.vset-key-hint').textContent));
        ok('rename Save enabled',                         el.shadowRoot.querySelector('.vset-save-name').disabled === false);
    }

    console.log('\n[suite] vault-settings — ro-token session (hex never retained) stays unavailable');
    {
        const el = makeElement();
        el.setVault(makeRoVault(), 'ro-apple-river-1234', '');
        await el.refresh();

        ok('Read Key legitimately unavailable',           val(el, '.vset-readkey-input') === '(unavailable)');
        ok('key section relabelled for RO',               /read-only key/i.test(el.shadowRoot.querySelector('.vset-key-label').textContent));
        ok('rename Save disabled',                        el.shadowRoot.querySelector('.vset-save-name').disabled === true);
    }

    console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
