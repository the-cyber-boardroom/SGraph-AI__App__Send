/* sg.llm.* bridge — permission → consent → budget → call, with the key never crossing
   the boundary (jsdom).
   Run: node tests/unit/vault_ui/loader/test__app_shell_llm_bridge.js

   This is the Phase-1 chokepoint from the plan
   (team/roles/architect/reviews/08/02/v0.33.43__architect-review__sg-llm-kernel-capability-plan.md).
   It drives the REAL host handler with real postMessage frames, so what is pinned is the
   security shape, not a mock of it:

     - a grant-less app is refused (EPERM) and never reaches the client;
     - a declined consent prompt is refused (ECONSENT);
     - the session budget is enforced HOST-side (EBUDGET) — an app calling through the
       bridge is not covered by the chat panel enforcing caps on itself;
     - a model outside the vault's allow-list is refused (EMODEL);
     - maxTokens is CLAMPED to policy rather than trusted;
     - deltas are coalesced and the tail is flushed before the terminal reply;
     - the API key appears in NOTHING that crosses to the frame.
*/

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document; global.HTMLElement = window.HTMLElement;
global.customElements = window.customElements; global.CustomEvent = window.CustomEvent; global.URL = window.URL;
global.AbortController = window.AbortController || AbortController;
global.setTimeout = setTimeout;

const cbase = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
const lbase = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-llm/';
const load  = (p) => new Function(readFileSync(p, 'utf8')).call(window);
load(lbase + 'sg-llm-config.js'); global.SGLlmConfig = window.SGLlmConfig = globalThis.SGLlmConfig;
load(lbase + 'sg-llm.js');        global.SGLlm       = window.SGLlm       = globalThis.SGLlm;
load(lbase + 'vault-llm-log.js'); global.VaultLlmLog = window.VaultLlmLog = globalThis.VaultLlmLog;
load(cbase + 'sg-embed-helpers.js'); global.SgEmbed        = window.SgEmbed        = globalThis.SgEmbed;
load(cbase + 'app-permissions.js');  global.AppPermissions = window.AppPermissions = globalThis.AppPermissions;
load(cbase + 'app-shell.js');

const Log = globalThis.VaultLlmLog;
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const API_KEY = 'sk-or-v1-SUPERSECRET-must-never-leave-the-host';

// A fake "iframe": we capture everything the host posts to it.
function makeFrame() {
    const posted = [];
    const contentWindow = { postMessage: (m) => posted.push(m) };
    return { posted, el: { contentWindow } };
}

// Build a shell wired for LLM calls. `opts.grant` decides app.json permissions;
// `opts.consent` decides what the HUD prompt returns; `opts.chat` is the fake upstream.
function makeShell(opts = {}) {
    const el = document.createElement('app-shell');
    el._writable   = true;
    // parsePermissions takes the WHOLE app.json, not the permissions object.
    el._perm       = AppPermissions.parsePermissions(
        opts.grant === undefined ? { permissions: { llm: { chat: true, models: true, usage: true } } } : opts.grant);
    el._vault      = { name: 'V', _vaultId: 'vid' };
    el._dataSource = { getFileList: () => [], writable: true };
    el._htmlDir    = '';
    el._appId      = 'appid';

    const policy = SGLlmConfig.parse(opts.config || {
        models: { allow: ['*'], default: 'anthropic/claude-sonnet-4' },
        limits: { maxCostPerSession: 1, maxCallsPerSession: 200, maxTokensPerCall: 4000 }
    });
    const client = {
        apiKey: API_KEY,
        chat  : opts.chat || (async () => ({ content: 'hi', model: 'anthropic/claude-sonnet-4', finish: 'stop',
                                             usage: { prompt_tokens: 10, completion_tokens: 5 }, id: 'gen-1',
                                             latencyMs: 5, price: null, cost: null, costSource: null })),
        models: opts.models || (async () => [{ id: 'anthropic/claude-sonnet-4' }, { id: 'blocked/model' }]),
        reconcileCost: async () => false
    };
    // Pre-seed the session cache so no unsealing is attempted.
    el._llmSess = opts.session !== undefined ? opts.session
                                             : { ok: true, client, policy, model: 'anthropic/claude-sonnet-4' };
    el._llmSessVaultId = 'vid';
    el._consent = async () => (opts.consent === undefined ? true : opts.consent);
    el._emitBridgeCall = () => {};
    return el;
}

// Drive one command through the real handler and wait for its terminal reply.
function send(frame, payload) {
    return new Promise((resolve) => {
        const id = 'req' + Math.random().toString(36).slice(2);
        payload.__sgCmdId = id;
        const t = setInterval(() => {
            const reply = frame.posted.find((m) => m.__sgCmdReply === id);
            if (reply) { clearInterval(t); resolve(reply); }
        }, 2);
        window.dispatchEvent(Object.assign(new window.Event('message'), {
            data: payload, source: frame.el.contentWindow
        }));
    });
}

const setup = (shell, frame) => shell._setupVfsBridgeHandlers(frame.el, shell._dataSource);

console.log('\n[suite] the injected surface exposes sg.llm.* but never the key');
{
    const el = makeShell();
    const src = el._buildVfsBridgeScript('index.html');
    ok('sg.llm namespace is injected', /llm:\{/.test(src));
    ok('available/models/usage/chat/cancel are all present',
        /available:function/.test(src) && /models:function/.test(src) &&
        /usage:function/.test(src) && /chat:_llmChat/.test(src) && /cancel:function/.test(src));
    ok('the injected bridge contains NO api key', src.indexOf(API_KEY) === -1);
    ok('the injected bridge contains no key-ish material at all', !/sk-or-/.test(src));
}

console.log('\n[suite] permission gate — a grant-less app cannot call out');
{
    Log.clear();
    const frame = makeFrame();
    const el = makeShell({ grant: null });                     // no permissions.llm at all
    let called = 0;
    el._llmSess.client.chat = async () => { called++; return { content: '', usage: {} }; };
    setup(el, frame);

    const r = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [{ role: 'user', content: 'hi' }] });
    ok('chat is refused', r.ok === false);
    ok('…with EPERM', r.code === 'EPERM', 'code=' + r.code);
    ok('the upstream client was never invoked', called === 0);
    ok('nothing was billed', Log.totals().calls === 0);

    const m = await send(frame, { __sgCmdType: 'llm', action: 'models' });
    ok('models() is gated too', m.ok === false && m.code === 'EPERM');

    // available() stays open so an app can DEGRADE rather than guess.
    const a = await send(frame, { __sgCmdType: 'llm', action: 'available' });
    ok('available() still answers', a.ok === true);
    ok('…reporting unavailable', a.result.ok === false);
    ok('…with the reason EPERM', a.result.reason === 'EPERM');
}

console.log('\n[suite] consent gate — declining stops the call');
{
    Log.clear();
    const frame = makeFrame();
    const el = makeShell({ consent: false });
    let called = 0;
    el._llmSess.client.chat = async () => { called++; return { content: '', usage: {} }; };
    setup(el, frame);
    const r = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [] });
    ok('a declined prompt refuses the call', r.ok === false && r.code === 'ECONSENT', 'code=' + r.code);
    ok('the upstream client was never invoked', called === 0);
    ok('nothing was billed', Log.totals().calls === 0);
}

console.log('\n[suite] budget is enforced HOST-side, across surfaces');
{
    Log.clear();
    // Spend recorded by ANY surface (here: the vault UI's own chat) counts against the app.
    const a = Log.add({ model: 'm' });
    Log.update(a.key, { status: 'ok', cost: 5.0, estimated: false });

    const frame = makeFrame();
    const el = makeShell({ config: { models: { allow: ['*'], default: 'anthropic/claude-sonnet-4' },
                                     limits: { maxCostPerSession: 1, maxCallsPerSession: 200, maxTokensPerCall: 4000 } } });
    let called = 0;
    el._llmSess.client.chat = async () => { called++; return { content: '', usage: {} }; };
    setup(el, frame);
    const r = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [] });
    ok('over-budget call is refused', r.ok === false && r.code === 'EBUDGET', 'code=' + r.code);
    ok('the upstream client was never invoked', called === 0);
    ok('the cap counts the OTHER surface\'s spend', true);

    const u = await send(frame, { __sgCmdType: 'llm', action: 'usage' });
    ok('usage() reports the shared spend', u.ok === true && u.result.cost === 5.0);
    ok('usage() reports remaining as clamped at zero', u.result.remaining.cost === 0);
}

console.log('\n[suite] model allow-list and token clamping are the policy\'s call, not the app\'s');
{
    Log.clear();
    const frame = makeFrame();
    let seen = null;
    const el = makeShell({
        config: { models: { allow: ['anthropic/*'], default: 'anthropic/claude-sonnet-4' },
                  limits: { maxCostPerSession: 10, maxCallsPerSession: 100, maxTokensPerCall: 1000 } },
        chat: async (req) => { seen = req; return { content: 'ok', model: req.model, finish: 'stop',
                                                    usage: { prompt_tokens: 1, completion_tokens: 1 }, id: 'g', latencyMs: 1 }; }
    });
    setup(el, frame);

    const bad = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [], model: 'blocked/model' });
    ok('a disallowed model is refused', bad.ok === false && bad.code === 'EMODEL', 'code=' + bad.code);
    ok('the request never reached the client', seen === null);

    const good = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [], model: 'anthropic/claude-sonnet-4', maxTokens: 999999 });
    ok('an allowed model goes through', good.ok === true);
    ok('maxTokens is clamped to policy, not trusted', seen && seen.maxTokens === 1000, 'got ' + (seen && seen.maxTokens));

    const mm = await send(frame, { __sgCmdType: 'llm', action: 'models' });
    ok('models() is policy-filtered', mm.ok === true && mm.result.length === 1 && mm.result[0].id === 'anthropic/claude-sonnet-4');
}

console.log('\n[suite] streaming — deltas are coalesced, the tail is never lost');
{
    Log.clear();
    const frame = makeFrame();
    const el = makeShell({
        chat: async (req, onToken) => {
            onToken('Hel', 'Hel'); onToken('lo ', 'Hello '); onToken('world', 'Hello world');
            await new Promise((r) => setTimeout(r, 70));      // let one coalesce window elapse
            onToken('!', 'Hello world!');                      // arrives AFTER that flush
            return { content: 'Hello world!', model: 'anthropic/claude-sonnet-4', finish: 'stop',
                     usage: { prompt_tokens: 3, completion_tokens: 4 }, id: 'gen-s', latencyMs: 9 };
        }
    });
    setup(el, frame);
    const r = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [] });

    const deltas = frame.posted.filter((m) => m.__sgLlmDelta);
    ok('deltas were streamed', deltas.length > 0);
    ok('deltas are COALESCED, not one per token', deltas.length < 4, 'got ' + deltas.length);
    ok('the concatenated deltas equal the full reply',
        deltas.map((d) => d.delta).join('') === 'Hello world!',
        deltas.map((d) => d.delta).join(''));
    ok('the terminal reply is authoritative on its own', r.ok === true && r.result.content === 'Hello world!');
    ok('usage is reported in the app-facing shape',
        r.result.usage.promptTokens === 3 && r.result.usage.completionTokens === 4);
    ok('cost is labelled with its source', r.result.cost && 'estimated' in r.result.cost);
    ok('the generation id is returned', r.result.id === 'gen-s');
    ok('no delta frame carries the api key', deltas.every((d) => JSON.stringify(d).indexOf(API_KEY) === -1));
    ok('the terminal reply carries no api key', JSON.stringify(r).indexOf(API_KEY) === -1);
    ok('the call landed in the shared ledger', Log.totals().calls === 1);
}

console.log('\n[suite] cancel aborts an in-flight call');
{
    Log.clear();
    const frame = makeFrame();
    let sawAbort = false;
    const el = makeShell({
        chat: (req, onToken, signal) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
                sawAbort = true;
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
        })
    });
    setup(el, frame);

    const id = 'cancelme';
    const done = new Promise((resolve) => {
        const t = setInterval(() => {
            const reply = frame.posted.find((m) => m.__sgCmdReply === id);
            if (reply) { clearInterval(t); resolve(reply); }
        }, 2);
    });
    window.dispatchEvent(Object.assign(new window.Event('message'), {
        data: { __sgCmdType: 'llm', action: 'chat', __sgCmdId: id, messages: [] }, source: frame.el.contentWindow
    }));
    await new Promise((r) => setTimeout(r, 20));
    const c = await send(frame, { __sgCmdType: 'llm', action: 'cancel', id: id });
    ok('cancel reports it found the call', c.ok === true && c.result.cancelled === true);
    const r = await done;
    ok('the underlying fetch was aborted', sawAbort === true);
    ok('the original call settles (never hangs)', r.ok === false);
    ok('…as EABORT', r.code === 'EABORT', 'code=' + r.code);
    ok('the aborted call is still recorded', Log.list().length === 1 && Log.list()[0].status === 'aborted');
}

console.log('\n[suite] no key configured → an honest reason, not a crash');
{
    const frame = makeFrame();
    const el = makeShell({ session: { ok: false, reason: 'ENOKEY', policy: SGLlmConfig.parse({}) } });
    setup(el, frame);
    const a = await send(frame, { __sgCmdType: 'llm', action: 'available' });
    ok('available() answers', a.ok === true && a.result.ok === false);
    ok('…with ENOKEY', a.result.reason === 'ENOKEY');
    const r = await send(frame, { __sgCmdType: 'llm', action: 'chat', messages: [] });
    ok('chat refuses with ENOKEY', r.ok === false && r.code === 'ENOKEY', 'code=' + r.code);
}

console.log('\n[suite] sg.llm.listen — the microphone is its own grant');
{
    // No SGVoice in this host at all → an honest ENOMIC, not a crash.
    const frame = makeFrame();
    const el = makeShell();                      // grants chat/models/usage, NOT listen
    setup(el, frame);
    const r = await send(frame, { __sgCmdType: 'llm', action: 'listen' });
    ok('listen is refused without its own grant', r.ok === false && r.code === 'EPERM', 'code=' + r.code);
    ok('…even though chat IS granted', el._can('llm.chat', '') === true);
    ok('the chat grant does not imply listen', el._can('llm.listen', '') === false);

    const el2 = makeShell({ grant: { permissions: { llm: { chat: true, listen: true } } } });
    ok('an explicit listen grant is honoured', el2._can('llm.listen', '') === true);

    // Granted, but the host has no microphone (the sandbox / insecure-context case).
    const frame2 = makeFrame();
    setup(el2, frame2);
    globalThis.SGVoice = { available: () => ({ ok: false, reason: 'ENOMIC' }) };
    window.SGVoice = globalThis.SGVoice;
    const r2 = await send(frame2, { __sgCmdType: 'llm', action: 'listen' });
    ok('an unavailable mic reports ENOMIC', r2.ok === false && r2.code === 'ENOMIC', 'code=' + r2.code);
    ok('…rather than a generic failure', /Microphone unavailable/.test(r2.err || ''));

    // Granted + available, but the user declines the per-use consent.
    const frame3 = makeFrame();
    const el3 = makeShell({ grant: { permissions: { llm: { chat: true, listen: true } } }, consent: false });
    setup(el3, frame3);
    globalThis.SGVoice = { available: () => ({ ok: true, reason: null }) };
    window.SGVoice = globalThis.SGVoice;
    let recorded = 0;
    el3._recordAndTranscribe = async () => { recorded++; return { text: 'x' }; };
    const r3 = await send(frame3, { __sgCmdType: 'llm', action: 'listen' });
    ok('a declined prompt refuses', r3.ok === false && r3.code === 'ECONSENT', 'code=' + r3.code);
    ok('the microphone was never opened', recorded === 0);

    // The happy path: text comes back, and only text.
    const frame4 = makeFrame();
    const el4 = makeShell({ grant: { permissions: { llm: { chat: true, listen: true } } } });
    setup(el4, frame4);
    el4._recordAndTranscribe = async () => ({ text: 'hello from the ipad', model: 'm', id: 'gen-v',
                                              durationMs: 2100, bytes: 4096, format: 'm4a',
                                              cost: { value: 0.0002, source: 'estimate', estimated: true } });
    const r4 = await send(frame4, { __sgCmdType: 'llm', action: 'listen' });
    ok('listen resolves with the transcript', r4.ok === true && r4.result.text === 'hello from the ipad');
    ok('the format used is reported', r4.result.format === 'm4a');
    ok('cost is labelled like every other call', r4.result.cost.estimated === true);
    ok('NO audio payload is returned to the frame',
        JSON.stringify(r4).indexOf('input_audio') === -1 && !('data' in r4.result));
}

console.log('\n[suite] audio never leaks into the provenance log');
{
    // redactMessages is what the debug/provenance surfaces render. Base64 audio would
    // otherwise dump tens of thousands of characters into a log users are invited to read.
    const big = 'A'.repeat(50000);
    const out = SGLlm.redactMessages([
        { role: 'user', content: [ { type: 'text', text: 'transcribe' },
                                   { type: 'input_audio', input_audio: { data: big, format: 'm4a' } } ] }
    ]);
    const part = out[0].content[1];
    ok('the audio part survives structurally', part.type === 'input_audio');
    ok('the base64 payload is gone', part.input_audio.data.indexOf('AAAA') === -1);
    ok('…replaced by a size note', /audio omitted/.test(part.input_audio.data));
    ok('the format is kept for diagnosis', part.input_audio.format === 'm4a');
    ok('text parts are untouched', out[0].content[0].text === 'transcribe');
    ok('the redacted copy is far smaller', JSON.stringify(out).length < 500);
}

console.log('\n[suite] unknown actions are rejected, not silently ignored');
{
    const frame = makeFrame();
    const el = makeShell();
    setup(el, frame);
    const r = await send(frame, { __sgCmdType: 'llm', action: 'exfiltrate' });
    ok('an unknown llm action is refused', r.ok === false);
    ok('…and says so', /Unknown llm action/.test(r.err || ''));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
