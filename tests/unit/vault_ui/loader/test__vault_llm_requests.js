/* vault-llm-requests — the cost ledger pane (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_llm_requests.js

   The pane is a pure consumer of VaultLlmLog, so what is worth guarding is not the
   arithmetic (test__vault_llm_log.js owns that) but the CLAIMS THE UI MAKES ABOUT
   MONEY: an estimate must be visibly an estimate, a reconciled figure must stop being
   one, and the generation id — the only handle that ties a row to a real invoice — must
   be on screen and copyable. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
load('lib/sg-llm/vault-llm-log.js');
global.VaultLlmLog = window.VaultLlmLog = globalThis.VaultLlmLog;
load('components/vault-llm-requests/vault-llm-requests.js');

const Log = globalThis.VaultLlmLog;
let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const mount = () => {
    const el = document.createElement('vault-llm-requests');
    document.body.appendChild(el);
    return el;
};
const txt = (el, sel) => el.shadowRoot.querySelector(sel).textContent;

console.log('\n[suite] vault-llm-requests — mounts and renders an empty ledger');
{
    Log.clear();
    let el, err;
    try { el = mount(); } catch (e) { err = e; }
    ok('connectedCallback does not throw', !err, err && err.message);
    ok('empty ledger explains itself', /No requests yet/.test(txt(el, '.vlr-body')));
    ok('no totals block when there is nothing to total', txt(el, '.vlr-totals') === '');
    el.remove();
}

console.log('\n[suite] vault-llm-requests — a row appears the moment a call is sent');
{
    Log.clear();
    const el = mount();
    const r = Log.add({ model: 'anthropic/claude-sonnet-4', files: ['index.html'], promptChars: 100 });
    ok('an in-flight call is already on screen', !!el.shadowRoot.querySelector('.vlr-row--pending'));
    ok('in-flight cost shows as unknown, not $0', /…/.test(txt(el, '.vlr-body')));
    ok('in-flight count is surfaced', /in flight/.test(txt(el, '.vlr-totals')));

    Log.update(r.key, {
        id: 'gen-abc123456789xyz', status: 'ok', latencyMs: 733,
        usage: { prompt_tokens: 900, completion_tokens: 100 },
        cost: 0.0021, costSource: 'estimate', estimated: true
    });
    ok('the row updates in place (still one row)', el.shadowRoot.querySelectorAll('.vlr-row').length === 1);
    ok('the generation id is displayed', /gen-abc123/.test(txt(el, '.vlr-body')));
    ok('the id is copyable', !!el.shadowRoot.querySelector('[data-copy-id="gen-abc123456789xyz"]'));
    ok('an estimate is marked with ~', /~\$/.test(txt(el, '.vlr-body')));
    ok('tokens are shown', /1,000/.test(txt(el, '.vlr-body')));
    ok('latency is shown', /733/.test(txt(el, '.vlr-body')));
    el.remove();
}

console.log('\n[suite] vault-llm-requests — estimates and bills are never conflated');
{
    Log.clear();
    const el = mount();
    const a = Log.add({ model: 'm' });
    Log.update(a.key, { id: 'g1', status: 'ok', cost: 0.01, costSource: 'estimate', estimated: true });
    ok('a pure-estimate total carries ~', /~\$0\.01/.test(txt(el, '.vlr-totals')));
    ok('billed shows as zero while everything is an estimate', /billed \$0/.test(txt(el, '.vlr-totals')));

    Log.update(a.key, { cost: 0.013, costSource: 'generation', estimated: false });
    ok('after reconciliation the total drops the ~',
        /\$0\.013/.test(txt(el, '.vlr-totals')) && !/~\$0\.013/.test(txt(el, '.vlr-totals')));
    ok('the reconciled amount moves into billed', /billed \$0\.013/.test(txt(el, '.vlr-totals')));
    ok('estimated falls back to zero', /estimated ~\$0/.test(txt(el, '.vlr-totals')));
    el.remove();
}

console.log('\n[suite] vault-llm-requests — failures are shown, not swallowed');
{
    Log.clear();
    const el = mount();
    const a = Log.add({ model: 'm' });
    Log.update(a.key, { status: 'error', error: 'OpenRouter 429: rate limited' });
    ok('a failed call gets a row', !!el.shadowRoot.querySelector('.vlr-row--error'));
    ok('the failure reason is visible', /rate limited/.test(txt(el, '.vlr-body')));
    ok('failures are counted in the totals', /1 failed/.test(txt(el, '.vlr-totals')));
    el.remove();
}

console.log('\n[suite] vault-llm-requests — file attribution and escaping');
{
    Log.clear();
    const el = mount();
    Log.add({ model: 'm', files: ['docs/report.md'] });
    ok('a single file is named', /report\.md/.test(txt(el, '.vlr-body')));
    Log.add({ model: 'm', files: ['a.md', 'b.md', 'c.md'] });
    ok('several files collapse to a count', /3 files/.test(txt(el, '.vlr-body')));
    Log.add({ model: 'm', files: [] });
    ok('a fileless call says so', /none/.test(txt(el, '.vlr-body')));

    Log.add({ model: '<img src=x onerror=alert(1)>', files: ['<script>.md'] });
    ok('model names are escaped, not injected', el.shadowRoot.querySelector('.vlr-body').querySelector('img') === null);
    ok('file names are escaped, not injected', el.shadowRoot.querySelector('.vlr-body').querySelector('script') === null);
    el.remove();
}

console.log('\n[suite] vault-llm-requests — clearing confirms INLINE, never via window.confirm');
{
    Log.clear();
    // If the component reaches for a native dialog, this throws and the suite fails.
    const realConfirm = window.confirm;
    window.confirm = global.confirm = () => { throw new Error('window.confirm must not be used'); };

    const el = mount();
    Log.add({ model: 'm' });
    const bar = el.shadowRoot.querySelector('.vlr-confirm');
    ok('an inline confirm bar exists', !!bar);
    ok('it is hidden until asked for', bar.hidden === true);

    let threw = null;
    try { el.shadowRoot.querySelector('.vlr-clear').dispatchEvent(new window.Event('click', { bubbles: true })); }
    catch (e) { threw = e; }
    ok('clicking Clear does not call window.confirm', !threw, threw && threw.message);
    ok('clicking Clear reveals the inline bar', bar.hidden === false);
    ok('the ledger is NOT cleared yet', Log.list().length === 1);
    ok('the bar explains that spend is not undone', /not undone/.test(bar.textContent));

    el.shadowRoot.querySelector('.vlr-confirm-no').dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('Cancel hides the bar', bar.hidden === true);
    ok('Cancel keeps the ledger', Log.list().length === 1);

    el.shadowRoot.querySelector('.vlr-clear').dispatchEvent(new window.Event('click', { bubbles: true }));
    el.shadowRoot.querySelector('.vlr-confirm-yes').dispatchEvent(new window.Event('click', { bubbles: true }));
    ok('confirming clears the ledger', Log.list().length === 0);
    ok('the bar closes afterwards', bar.hidden === true);

    window.confirm = global.confirm = realConfirm;
    el.remove();
}

console.log('\n[suite] vault-llm-requests — live updates only while mounted');
{
    Log.clear();
    const el = mount();
    Log.add({ model: 'm' });
    ok('mounted pane reflects a new call', el.shadowRoot.querySelectorAll('.vlr-row').length === 1);

    el.remove();                       // disconnectedCallback → unsubscribe
    Log.add({ model: 'm' });
    ok('an unmounted pane stops re-rendering', el.shadowRoot.querySelectorAll('.vlr-row').length === 1);

    document.body.appendChild(el);     // re-mount → re-subscribe + catch up
    ok('re-mounting catches up on what it missed', el.shadowRoot.querySelectorAll('.vlr-row').length === 2);
    ok('the ledger outlived the pane being closed', Log.list().length === 2);
    el.remove();
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
