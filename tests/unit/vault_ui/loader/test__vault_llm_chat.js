/* vault-llm-chat — mount smoke + context-set / status rendering (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_llm_chat.js

   Why this exists: a component that is valid JS but throws on connectedCallback or on
   its first state update looks fine to `node --check` and only fails in a browser.
   This mounts the real element, drives the public API, and asserts the DOM — the same
   class of guard added for the app-shell bridge builder.

   Contract change (multi-file chat): the panel no longer owns its own visibility — it
   is an sg-layout panel and the layout shows/hides it — and context is an EXPLICIT SET
   built by addContextFile(), not "whatever file is on screen". The old auto-context
   silently went stale: send-browse's _openFileTab returns early when a file's tab is
   already open, so nothing re-announced the file and the chat kept talking about the
   first one it ever saw. setContextFile() now only records a hint for the empty state. */

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
load('lib/sg-llm/vault-llm-log.js');
global.SGLlmConfig  = window.SGLlmConfig  = globalThis.SGLlmConfig;
global.SGLlm        = window.SGLlm        = globalThis.SGLlm;
global.VaultLlmLog  = window.VaultLlmLog  = globalThis.VaultLlmLog;
load('components/vault-llm-chat/vault-llm-chat.js');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const mount = () => {
    const el = document.createElement('vault-llm-chat');
    document.body.appendChild(el);          // triggers connectedCallback
    return el;
};
const ctxText = (el) => el.shadowRoot.querySelector('.vlc-ctx').textContent;

console.log('\n[suite] vault-llm-chat — mounts without throwing');
{
    let el, err;
    try { el = mount(); } catch (e) { err = e; }
    ok('connectedCallback does not throw', !err, err && err.message);
    ok('shadow root is populated', !!el && !!el.shadowRoot.querySelector('.vlc-panel'));
    ok('has an input and a send button',
        !!el.shadowRoot.querySelector('.vlc-in') && !!el.shadowRoot.querySelector('.vlc-send'));
    ok('reports unavailable before a vault is set', el.isAvailable() === false);
    ok('starts with an empty context set', el.contextFiles().length === 0);
}

console.log('\n[suite] vault-llm-chat — the layout owns visibility, not the panel');
{
    const el = mount();
    ok('panel is visible when mounted (sg-layout shows/hides it)',
        el.shadowRoot.querySelector('.vlc-panel').hidden === false);

    let closed = 0;
    el.addEventListener('vault-llm-close', () => { closed++; });
    el.close();
    ok('close() asks the host to remove the panel', closed === 1);
    ok('close() does NOT hide the panel itself',
        el.shadowRoot.querySelector('.vlc-panel').hidden === false);

    let reqs = 0;
    el.addEventListener('vault-llm-requests-open', () => { reqs++; });
    el.shadowRoot.querySelector('.vlc-reqs').dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('the ledger button asks the host to open the requests pane', reqs === 1);
}

console.log('\n[suite] vault-llm-chat — a chat with no files is a first-class state');
{
    const el = mount();
    ok('empty set says so plainly', /No files attached/.test(ctxText(el)));
    ok('empty set explains how to attach', /Add to chat/.test(ctxText(el)));
    ok('no "add the file you are viewing" button before anything is viewed',
        !el.shadowRoot.querySelector('.vlc-add-viewing'));

    // setContextFile records the VIEWED file — it must never attach by itself.
    el.setContextFile({ path: 'docs/report.md', text: 'hello' });
    ok('viewing a file does not attach it', el.contextFiles().length === 0);
    ok('viewing offers a one-click attach', !!el.shadowRoot.querySelector('.vlc-add-viewing'));

    el.shadowRoot.querySelector('.vlc-add-viewing').dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('the one-click attach adds the viewed file', el.contextFiles().length === 1);

    // With no files at all, the request still builds — just with no file context.
    const el2 = mount();
    ok('no files → no context messages', el2._contextMessages().length === 0);
}

console.log('\n[suite] vault-llm-chat — the context set: add, replace, remove, clear');
{
    const el = mount();
    el.addContextFile({ path: 'a.md', text: 'aaa' });
    el.addContextFile({ path: 'b.md', text: 'bbbb' });
    ok('two files attach', el.contextFiles().length === 2);
    ok('both paths render as chips', /a\.md/.test(ctxText(el)) && /b\.md/.test(ctxText(el)));
    ok('a per-file char count is shown', /3/.test(ctxText(el)) && /4/.test(ctxText(el)));
    ok('a total is shown', /2 files/.test(ctxText(el)));

    const r = el.addContextFile({ path: 'a.md', text: 'aaaaaaa' });
    ok('re-adding a path REPLACES rather than duplicates', el.contextFiles().length === 2);
    ok('replacement is reported', r.replaced === true);
    ok('replacement refreshes the text the model will see',
        el._files.find((f) => f.path === 'a.md').text === 'aaaaaaa');

    el.removeContextFile('a.md');
    ok('removeContextFile drops just that file', el.contextFiles().length === 1 && !/a\.md/.test(ctxText(el)));

    // The chip's × is the user-facing route to the same thing.
    el.addContextFile({ path: 'c.md', text: 'c' });
    const x = el.shadowRoot.querySelector('[data-del="c.md"]');
    ok('each chip carries a remove control', !!x);
    x.dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('clicking a chip × removes that file', !el.contextFiles().some((f) => f.path === 'c.md'));

    el.addContextFile({ path: 'd.md', text: 'd' });
    el.shadowRoot.querySelector('.vlc-clear').dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('clear all empties the set', el.contextFiles().length === 0);
    ok('clearing returns to the empty state copy', /No files attached/.test(ctxText(el)));

    ok('removing an absent path is a no-op', (() => {
        el.addContextFile({ path: 'z.md', text: 'z' });
        el.removeContextFile('nope.md');
        return el.contextFiles().length === 1;
    })());
}

console.log('\n[suite] vault-llm-chat — binaries, escaping, limits');
{
    const el = mount();
    el.addContextFile({ path: 'img.png', text: null });
    ok('a binary attaches as a name', el.contextFiles().length === 1);
    ok('a binary is flagged in the chip', /binary/.test(ctxText(el)));
    ok('a binary contributes NO context message', el._contextMessages().length === 0);
    ok('a binary explains itself in the status',
        /bytes are not sent/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    el.addContextFile({ path: '<img src=x onerror=alert(1)>.md', text: 'a' });
    ok('path is HTML-escaped, not injected', el.shadowRoot.querySelector('.vlc-ctx').querySelector('img') === null);

    const el2 = mount();
    for (let i = 0; i < 25; i++) el2.addContextFile({ path: 'f' + i + '.md', text: 'x' });
    ok('the attachment count is capped', el2.contextFiles().length === 20);
    ok('hitting the cap is announced', /limit reached/i.test(el2.shadowRoot.querySelector('.vlc-status').textContent));
    ok('at the cap, replacing an ALREADY-attached file still works',
        el2.addContextFile({ path: 'f0.md', text: 'updated' }).added === true);
}

console.log('\n[suite] vault-llm-chat — context messages share one budget honestly');
{
    const el = mount();
    el.addContextFile({ path: 'one.md', text: 'hello' });
    let msgs = el._contextMessages();
    ok('one file → one system message', msgs.length === 1);
    ok('the message names the file', /vault file: one\.md/.test(msgs[0].content));
    ok('a small file is not marked truncated', !/TRUNCATED/.test(msgs[0].content));

    // Two big files must SHARE the budget, not each take it — otherwise attaching a
    // second file quietly doubles the prompt (and the bill).
    el.addContextFile({ path: 'two.md', text: 'y'.repeat(30000) });
    el.addContextFile({ path: 'three.md', text: 'z'.repeat(30000) });
    msgs = el._contextMessages();
    ok('every text file contributes a message', msgs.length === 3);
    const total = msgs.reduce((n, m) => n + m.content.length, 0);
    ok('the combined context stays near the budget, not 3× it', total < 24000 + 2000, 'total=' + total);
    ok('an over-budget file says TRUNCATED in its own text',
        msgs.filter((m) => /TRUNCATED/.test(m.content)).length === 2);
    ok('the header warns the set was trimmed', /trimmed to/.test(ctxText(el)));
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
    el._model   = 'anthropic/x';        // set by setVault/_refreshModels in the real flow
    el._renderStatus(); el._renderHead();
    ok('available → status clears', el.shadowRoot.querySelector('.vlc-status').textContent === '');
    ok('available → the active model is shown', el.shadowRoot.querySelector('.vlc-model').textContent === 'anthropic/x');
    ok('isAvailable() true once a session resolves', el.isAvailable() === true);
}

console.log('\n[suite] vault-llm-chat — request parameters (temp / top-p / max tokens)');
{
    const el = mount();
    el._session = { ok: true, model: 'm', policy: SGLlmConfig.parse({ limits: { maxTokensPerCall: 4000 } }) };

    const bar = el.shadowRoot.querySelector('.vlc-parambar');
    ok('a params bar exists', !!bar);
    ok('it is collapsed by default', bar.hidden === true);
    el.toggleParams();
    ok('the ⚙ button reveals it', bar.hidden === false);

    ok('params default to null (provider/policy defaults, not a hard-coded 0.7)',
        el._params.temperature === null && el._params.topP === null && el._params.maxTokens === null);
    ok('the policy cap is shown as the max-token placeholder',
        el.shadowRoot.querySelector('.vlc-p-maxtok').placeholder === '4000');

    const set = (sel, v) => {
        const i = el.shadowRoot.querySelector(sel);
        i.value = String(v);
        i.dispatchEvent(new window.Event('change'));
    };
    set('.vlc-p-temp', 0.2);
    set('.vlc-p-topp', 0.9);
    set('.vlc-p-maxtok', 1500);
    ok('temperature is captured', el._params.temperature === 0.2);
    ok('top-p is captured', el._params.topP === 0.9);
    ok('max tokens is captured', el._params.maxTokens === 1500);
    ok('the effective values are summarised', /temp 0\.2/.test(el.shadowRoot.querySelector('.vlc-p-note').textContent));

    // A per-session control must never be a way around the vault's own ceiling.
    set('.vlc-p-maxtok', 999999);
    ok('max tokens is CLAMPED to the vault policy', el._params.maxTokens === 4000);
    ok('the clamp is stated, not silent', /capped by policy/.test(el.shadowRoot.querySelector('.vlc-p-note').textContent));

    set('.vlc-p-temp', '');
    ok('a blank field means "provider default", not 0', el._params.temperature === null);

    el.resetParams();
    ok('reset clears every override',
        el._params.temperature === null && el._params.topP === null && el._params.maxTokens === null);
    ok('reset clears the inputs too', el.shadowRoot.querySelector('.vlc-p-maxtok').value === '');
}

console.log('\n[suite] vault-llm-chat — a stale "no key" session re-resolves on open');
{
    const el = mount();
    let resolves = 0;
    // A vault whose key only becomes readable on the SECOND resolve — the shape of both
    // "key added in Settings since open" and the lazy-subtree bug.
    el._vault = { marker: 'v' };
    el.setVault = async function (v) {
        resolves++;
        this._vault = v;
        this._session = (resolves > 1) ? { ok: true, model: 'm', policy: SGLlmConfig.parse({}) }
                                       : { ok: false, reason: 'ENOKEY', policy: SGLlmConfig.parse({}) };
    };
    await el.setVault(el._vault);
    ok('starts unavailable', el.isAvailable() === false);
    el.open();
    await new Promise((r) => setTimeout(r, 0));
    ok('open() re-resolved availability', resolves === 2);
    ok('the panel is now usable without a page reload', el.isAvailable() === true);

    // …and it must NOT re-resolve on every open once it is working (no wasted work).
    const before = resolves;
    el.open();
    await new Promise((r) => setTimeout(r, 0));
    ok('an available session is not re-resolved', resolves === before);
}

console.log('\n[suite] vault-llm-chat — voice input (the surface you can actually test)');
{
    const el = mount();
    const mic = el.shadowRoot.querySelector('.vlc-mic');
    ok('a mic button exists in the composer', !!mic);
    ok('it is not recording to start with', !mic.classList.contains('vlc-mic--rec'));

    // No SGVoice loaded on the page at all → say so, do not throw.
    const savedVoice = globalThis.SGVoice;
    globalThis.SGVoice = undefined; window.SGVoice = undefined;
    el._session = { ok: true, model: 'm', policy: SGLlmConfig.parse({}) };
    await el.toggleVoice();
    ok('a page without the voice module explains itself',
        /not loaded/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    // No microphone (the insecure-context / no-device case).
    globalThis.SGVoice = window.SGVoice = { available: () => ({ ok: false, reason: 'EINSECURE' }) };
    await el.toggleVoice();
    ok('an insecure page says why', /secure \(https\)/.test(el.shadowRoot.querySelector('.vlc-status').textContent));
    globalThis.SGVoice.available = () => ({ ok: false, reason: 'ENOMIC' });
    await el.toggleVoice();
    ok('no device says why', /No microphone/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    // Happy path: record → stop → transcribe → the text is SENT as a chat message.
    let stopped = 0, sent = null;
    globalThis.SGVoice = window.SGVoice = {
        available: () => ({ ok: true, reason: null }),
        start: async () => ({ fake: 'session' }),
        stop: async () => { stopped++; return { data: 'AAAA', format: 'm4a', bytes: 10, durationMs: 1200 }; },
        transcribeWith: async () => ({ text: 'what is risk four', model: 'm', id: 'g', cost: {} })
    };
    el._send = function () { sent = this.shadowRoot.querySelector('.vlc-in').value; };

    await el.toggleVoice();
    ok('recording starts', el._recording === true);
    ok('the mic button shows the recording state', mic.classList.contains('vlc-mic--rec'));
    ok('the live microphone is stated in words, not just an icon',
        /Recording — your microphone is on/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    await el.toggleVoice();          // second tap = stop & send
    ok('recording stops', el._recording === false);
    ok('the recorder was stopped', stopped === 1);
    ok('the transcript is placed in the input', el.shadowRoot.querySelector('.vlc-in').value === 'what is risk four');
    ok('…and sent as a chat message', sent === 'what is risk four');

    // Cancel must release the device, not merely hide the UI.
    stopped = 0;
    await el.toggleVoice();
    await el._stopVoice(true);
    ok('cancelling still stops the recorder (releases the mic)', stopped === 1);
    ok('cancelling sends nothing', sent === 'what is risk four');

    // An empty transcript must not send an empty message.
    sent = null;
    globalThis.SGVoice.transcribeWith = async () => ({ text: '   ', model: 'm' });
    await el.toggleVoice();
    await el.toggleVoice();
    ok('silence does not send an empty message', sent === null);
    ok('…and says nothing was heard', /Nothing was heard/.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    // A failed transcription surfaces rather than vanishing.
    globalThis.SGVoice.transcribeWith = async () => { throw Object.assign(new Error('Session spend cap reached'), { code: 'EBUDGET' }); };
    await el.toggleVoice();
    await el.toggleVoice();
    ok('a failure is reported to the user', /Voice failed: Session spend cap/.test(el.shadowRoot.querySelector('.vlc-status').textContent));
    ok('and recording is not left stuck on', el._recording === false);

    globalThis.SGVoice = window.SGVoice = savedVoice;
}

console.log('\n[suite] vault-llm-chat — model selection (regression: model:null → upstream 404)');
{
    const el = mount();
    const sel = el.shadowRoot.querySelector('.vlc-model-sel');
    ok('a model picker exists', !!sel);
    ok('picker is hidden until models are known', sel.hidden === true);

    // A vault whose config has NO default model — the exact state from the bug report.
    el._session = { ok: true, model: null, policy: SGLlmConfig.parse({ models: { allow: ['*'] } }), client: {
        models: async () => [{ id: 'anthropic/claude-x' }, { id: 'zz/other' }]
    } };
    await el._refreshModels();
    ok('a model is resolved despite no configured default', el._model === 'anthropic/claude-x');
    ok('picker is revealed and populated', sel.hidden === false && sel.options.length === 2);
    ok('picker selects the resolved model', sel.value === 'anthropic/claude-x');
    ok('auto-pick is announced, not silent',
        /no default set/i.test(el.shadowRoot.querySelector('.vlc-status').textContent));

    // Changing the picker changes the model used for the next call.
    sel.value = 'zz/other';
    sel.dispatchEvent(new window.Event('change'));
    ok('changing the picker updates the active model', el._model === 'zz/other');
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
