/* P4 batch — surfacing (A1/A2) and the six re-review defects (B1–B6).
   Run: node tests/unit/vault_ui/loader/test__llm_p4.js
   Each suite pins one item of
   team/comms/briefs/08/16/v0.33.47__brief__sg-llm-P4-surfacing-and-review-findings.md */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
for (const f of ['lib/sg-llm/sg-llm-config.js', 'lib/sg-llm/sg-llm.js', 'lib/sg-llm/vault-llm-log.js',
                 'lib/sg-llm/sg-vision.js', 'lib/sg-llm/sg-llm-tools.js']) load(f);
for (const g of ['SGLlmConfig', 'SGLlm', 'VaultLlmLog', 'SGVision', 'SGLlmTools']) {
    global[g] = window[g] = globalThis[g];
}
load('components/vault-llm-chat/vault-llm-chat.js');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const mount = () => {
    const el = document.createElement('vault-llm-chat');
    document.body.appendChild(el);
    return el;
};
const policy = (limits) => SGLlmConfig.parse({ models: { allow: ['*'], 'default': 'm/x' }, limits: limits || {} });
const session = (el, limits, chatFn) => {
    el._model   = 'm/x';
    el._session = { ok: true, model: 'm/x', policy: policy(limits),
                    client: { chat: chatFn || (async () => ({ content: 'hi', usage: {}, model: 'm/x' })),
                              reconcileCost: async () => false } };
};

console.log('\n[suite] B1 — the budget survives a panel remount (ledger, not instance state)');
{
    VaultLlmLog.clear();
    // Host spend recorded before this panel instance ever existed:
    VaultLlmLog.update(VaultLlmLog.add({ model: 'm' }).key, { status: 'ok', cost: 5.0, estimated: false });

    const el = mount();                                   // FRESH element — old counters would read 0
    let called = 0;
    session(el, { maxCostPerSession: 1 }, async () => { called++; return { content: 'x', usage: {} }; });
    el.shadowRoot.querySelector('.vlc-in').value = 'hello';
    await el._send();
    ok('a fresh panel still sees the session spend and refuses', called === 0);
    ok('…and says why', /spend cap/i.test(el.shadowRoot.querySelector('.vlc-log').textContent));
    ok('_hostTotals reads the ledger', Math.abs(el._hostTotals().cost - 5.0) < 1e-9);

    ok('the host figure excludes app spend', (() => {     // scoping still per-spender
        VaultLlmLog.update(VaultLlmLog.add({ model: 'm', app: 'someapp' }).key, { status: 'ok', cost: 9, estimated: false });
        return Math.abs(el._hostTotals().cost - 5.0) < 1e-9;
    })());
    VaultLlmLog.clear();
}

console.log('\n[suite] B5 — the cap is re-checked mid-turn, not only at the door');
{
    VaultLlmLog.clear();
    const el = mount();
    let calls = 0;
    // Every round costs $0.6 against a $1 cap: round 1 passes, round 2 must be refused.
    session(el, { maxCostPerSession: 1 }, async () => {
        calls++;
        VaultLlmLog.update(VaultLlmLog.add({ model: 'm' }).key, { status: 'ok', cost: 0.6, estimated: false });
        return { content: '', toolCalls: [{ id: 'c' + calls, name: 'read_file', args: { path: 'a.md' }, argsRaw: '{}' }], usage: {} };
    });
    el._grants = SGLlmTools.parseGrants({ 'files.read': { enabled: true, allow: ['**'] } });
    el._vault  = { writable: true, listFolder: () => [{ name: 'a.md', type: 'file', size: 1 }],
                   getFile: async () => new TextEncoder().encode('x') };
    el.shadowRoot.querySelector('.vlc-in').value = 'go';
    await el._send();
    // Threshold semantics: the call that CROSSES the cap completes (same as the bridge
    // path — a cap is checked before each call, so overshoot is bounded to ONE call,
    // against up to 9 before this fix).
    ok('the tool loop stopped at the cap instead of running 9 rounds', calls === 2, 'calls=' + calls);
    ok('the mid-turn stop is explained', /budget reached mid-turn/i.test(el.shadowRoot.querySelector('.vlc-log').textContent));
    VaultLlmLog.clear();
}

console.log('\n[suite] B2 — image parts leave the history after the turn');
{
    VaultLlmLog.clear();
    const el = mount();
    session(el);
    // The fake model must pass the vision pre-check, or _send refuses before history exists.
    el._modelMeta = [{ id: 'm/x', architecture: { modality: 'text+image->text' } }];
    el._images = [{ data: 'AAAA', mime: 'image/png', bytes: 4096, name: 'shot.png' }];
    el.shadowRoot.querySelector('.vlc-in').value = 'what is this?';
    await el._send();

    const msg = el._history.find((m) => m.role === 'user');
    ok('the stored history message is plain text again', typeof msg.content === 'string');
    ok('…keeping the question', /what is this\?/.test(msg.content));
    ok('…and a record that an image was attached', /1 image/.test(msg.content) && /shot\.png/.test(msg.content));
    ok('…but not the pixels', msg.content.indexOf('AAAA') === -1);
    ok('so the next request cannot re-bill the image',
        JSON.stringify(el._history).indexOf('image_url') === -1);
    VaultLlmLog.clear();
}

console.log('\n[suite] B4 — the context budget drops files instead of silently overshooting');
{
    const el = mount();
    for (let i = 0; i < 20; i++) el.addContextFile({ path: 'f' + i + '.md', text: 'x'.repeat(2000) });
    const msgs = el._contextMessages();
    const fileMsgs = msgs.filter((m) => /vault file:/.test(m.content));
    const note     = msgs.find((m) => /NOT included/.test(m.content));
    ok('only as many files as fit the budget are included', fileMsgs.length === 16, 'included=' + fileMsgs.length);
    ok('the exclusion is stated to the model, naming the files', !!note && /f19\.md/.test(note.content));
    ok('total context stays within the stated budget',
        fileMsgs.reduce((n, m) => n + m.content.length, 0) <= 24000 + fileMsgs.length * 200);
    ok('the chip row warns the user', /won't fit/.test(el.shadowRoot.querySelector('.vlc-ctx').textContent));
}

console.log('\n[suite] B3 — the tools bar can SCOPE a group, not only enable it');
{
    const el = mount();
    el._vault  = { writable: true };
    el._grants = SGLlmTools.parseGrants({ 'files.read': { enabled: true } });   // enabled, no scope
    el.toggleTools(true);

    const bar = el.shadowRoot.querySelector('.vlc-toolbar');
    const inp = bar.querySelector('input[data-scope="files.read"]');
    ok('a scope input exists for the path-scoped group', !!inp);
    ok('the session group gets no scope input (not path-scoped)', !bar.querySelector('input[data-scope="session"]'));
    ok('enabled-without-scope shows the refusal warning in the bar', /every call will be refused/.test(bar.textContent));

    const saved = [];
    const origSave = SGLlmTools.saveGrants;
    SGLlmTools.saveGrants = async (v, g) => { saved.push(JSON.parse(JSON.stringify(SGLlmTools.serializeGrants(g)))); };
    await el._setGroupScope('files.read', ' docs/** , *.md ,, ', inp);
    ok('globs are parsed and saved with the grant', saved.length === 1 &&
        saved[0]['files.read'].allow.join('|') === 'docs/**|*.md');
    ok('the warning clears once a scope exists', !/every call will be refused/.test(
        el.shadowRoot.querySelector('.vlc-toolbar').textContent));

    SGLlmTools.saveGrants = async () => { throw new Error('nope'); };
    const before = el._grants.groups['files.read'].allow.slice();
    await el._setGroupScope('files.read', 'other/**', el.shadowRoot.querySelector('input[data-scope="files.read"]'));
    ok('a failed save REVERTS the scope (no claimed refused authority)',
        el._grants.groups['files.read'].allow.join('|') === before.join('|'));
    SGLlmTools.saveGrants = origSave;
}

console.log('\n[suite] A1/A2 — the HUD: standing cost pill + AI lane on the meter');
{
    load('components/app-shell/app-hud.js');
    VaultLlmLog.clear();
    const hud = document.createElement('app-hud');
    document.body.appendChild(hud);

    const pill = hud.shadowRoot.querySelector('.hud-llm-cost');
    ok('the pill exists', !!pill);
    ok('…hidden while nothing has been spent', pill.style.display === 'none');

    VaultLlmLog.update(VaultLlmLog.add({ model: 'm' }).key, { status: 'ok', cost: 0.0123, estimated: false });
    ok('a ledger write reveals it via subscribe', pill.style.display !== 'none');
    ok('…showing the billed figure plainly', /\$0\.0123/.test(pill.textContent) && pill.textContent.indexOf('~') === -1);

    VaultLlmLog.update(VaultLlmLog.add({ model: 'm' }).key, { status: 'ok', cost: 0.5, estimated: true });
    ok('an estimate in the mix adds the ~ prefix', /~\$/.test(pill.textContent));
    VaultLlmLog.add({ model: 'm' });                       // pending
    ok('an in-flight call shows as …', /…/.test(pill.textContent));

    let ledgerOpens = 0;
    hud.addEventListener('app-hud:llm-ledger', () => ledgerOpens++);
    pill.dispatchEvent(new window.Event('click', { bubbles: true, composed: true }));
    ok('clicking the pill asks the page for the ledger pane', ledgerOpens === 1);

    hud._onBridgeCall({ method: 'llm.chat', ok: true });
    ok('llm.* now registers on the activity meter', hud._actA === 1);
    ok('…in its own lane, not as a file read', hud._actR === 0);
    ok('…and the chip shows it', /A1/.test(hud.shadowRoot.querySelector('.hud-activity-chip').textContent));
    hud._onBridgeCall({ method: 'state.get', ok: true });
    ok('non-file non-llm ops still stay off the meter', hud._actA === 1 && hud._actR === 0 && hud._actW === 0);
    VaultLlmLog.clear();
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
