/* vault-llm-chat — mount smoke + context/status rendering (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_llm_chat.js

   Why this exists: a component that is valid JS but throws on connectedCallback or on
   its first state update looks fine to `node --check` and only fails in a browser.
   This mounts the real element, drives the public API, and asserts the DOM — the same
   class of guard added for the app-shell bridge builder. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
load('lib/sg-llm/sg-llm-config.js');
load('lib/sg-llm/sg-llm.js');
global.SGLlmConfig = window.SGLlmConfig = globalThis.SGLlmConfig;
global.SGLlm       = window.SGLlm       = globalThis.SGLlm;
load('components/vault-llm-chat/vault-llm-chat.js');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const mount = () => {
    const el = document.createElement('vault-llm-chat');
    document.body.appendChild(el);          // triggers connectedCallback
    return el;
};

console.log('\n[suite] vault-llm-chat — mounts without throwing');
{
    let el, err;
    try { el = mount(); } catch (e) { err = e; }
    ok('connectedCallback does not throw', !err, err && err.message);
    ok('shadow root is populated', !!el && !!el.shadowRoot.querySelector('.vlc-panel'));
    ok('starts hidden', el.shadowRoot.querySelector('.vlc-panel').hidden === true);
    ok('has an input and a send button',
        !!el.shadowRoot.querySelector('.vlc-in') && !!el.shadowRoot.querySelector('.vlc-send'));
    ok('reports unavailable before a vault is set', el.isAvailable() === false);
}

console.log('\n[suite] vault-llm-chat — open/close');
{
    const el = mount();
    el.open();
    ok('open() reveals the panel', el.shadowRoot.querySelector('.vlc-panel').hidden === false);
    el.close();
    ok('close() hides it', el.shadowRoot.querySelector('.vlc-panel').hidden === true);
    el.toggle();
    ok('toggle() from hidden opens', el.shadowRoot.querySelector('.vlc-panel').hidden === false);
}

console.log('\n[suite] vault-llm-chat — context file rendering');
{
    const el = mount();
    el.setContextFile(null);
    ok('no file → prompts the user to open one', /No file selected/.test(el.shadowRoot.querySelector('.vlc-ctx').textContent));

    el.setContextFile({ path: 'docs/report.md', text: 'hello world' });
    const ctx = el.shadowRoot.querySelector('.vlc-ctx');
    ok('file path is shown', /docs\/report\.md/.test(ctx.textContent));
    ok('char count is shown', /11 chars/.test(ctx.textContent), ctx.textContent);

    el.setContextFile({ path: 'img.png', text: null });
    ok('binary is named but flagged not-sent', /binary, not sent/.test(el.shadowRoot.querySelector('.vlc-ctx').textContent));

    el.setContextFile({ path: 'big.txt', text: 'x'.repeat(30000) });
    ok('oversized context announces truncation', /truncated/.test(el.shadowRoot.querySelector('.vlc-ctx').textContent));

    // Path is model-controlled only insofar as it comes from the vault; still escaped.
    el.setContextFile({ path: '<img src=x onerror=alert(1)>.md', text: 'a' });
    ok('path is HTML-escaped, not injected',
        el.shadowRoot.querySelector('.vlc-ctx').querySelector('img') === null);
}

console.log('\n[suite] vault-llm-chat — unavailability is explained, not silent');
{
    const el = mount();
    el._session = { ok: false, reason: 'ENOKEY' };
    el._renderStatus();
    ok('ENOKEY points at Settings', /Settings/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    el._session = { ok: false, reason: 'EREADONLY', message: 'owner-sealed' };
    el._renderStatus();
    ok('EREADONLY shows its message', /owner-sealed/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    el._session = { ok: true, model: 'anthropic/x', policy: SGLlmConfig.parse({}) };
    el._renderStatus(); el._renderHead();
    ok('available → status clears', el.shadowRoot.querySelector('.vlc-status').textContent === '');
    ok('available → model is shown', el.shadowRoot.querySelector('.vlc-model').textContent === 'anthropic/x');
    ok('isAvailable() true once a session resolves', el.isAvailable() === true);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
