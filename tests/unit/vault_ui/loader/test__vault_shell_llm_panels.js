/* vault-shell — the AI panels survive being closed and can be reopened (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_shell_llm_panels.js

   THE BUG THIS PINS: closing the AI Chat panel — by sg-layout's tab ✕ or the panel's own
   ✕ — made the "✨ AI Chat" header button dead. Nothing happened, ever again, for the rest
   of the session.

   The cause is a real ordering detail in sg-layout, not a guess. Its `_closeTab` does:

       if (tab.el && tab.el.parentNode === this) this.removeChild(tab.el);   // detach FIRST
       …
       this._events.emit(SGL_EVENTS.PANEL_CLOSED, { id: tab.id });          // announce AFTER

   so by the time our `panel:closed` handler runs the element is already out of the
   document. `_llmEl()` re-queried the DOM (`this.querySelector('vault-llm-chat')`), found
   nothing, and parking silently no-opped — leaving the element orphaned with no path back.
   Every later lookup returned null, so `_showLlmPanel` bailed before it could mount
   anything.

   The fake sg-layout below reproduces that ordering exactly. If it ever stops detaching
   before emitting, these tests still pass — they assert the panel comes back, not how. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
load('lib/sg-llm/llm-panels.js');
global.LlmPanels = window.LlmPanels = globalThis.LlmPanels;
load('components/vault-shell/vault-shell.js');

// `_sgLayoutReady` awaits customElements.whenDefined('sg-layout') — without a definition
// that promise never settles and the test would hang rather than fail.
window.customElements.define('sg-layout', class extends window.HTMLElement {});

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// A stand-in for sg-layout carrying the one behaviour that matters: detach, THEN announce.
function makeLayout() {
    const el = document.createElement('sg-layout');
    document.body.appendChild(el);
    const subs = [];
    let seq = 0;
    el.__tabs = new Map();
    el.events = { on: (name, fn) => { if (name === 'panel:closed') subs.push(fn); } };
    el.addPanel = ({ el: panelEl, title }) => {
        const id = 'p' + (++seq);
        el.__tabs.set(id, panelEl);
        panelEl.slot = 'p-' + id;                     // what _mountExistingElement does
        el.__lastTitle = title;
        return id;
    };
    el.removePanel = (id) => {
        const panelEl = el.__tabs.get(id);
        if (!panelEl) return;
        el.__tabs.delete(id);
        if (panelEl.parentNode === el) el.removeChild(panelEl);   // ← detach first…
        subs.forEach((fn) => fn({ id }));                         // ← …announce after
    };
    el.focusPanel = (id) => { el.__focused = id; };
    // The user closing the panel from the layout's own tab bar.
    el.userCloseTab = (id) => el.removePanel(id);
    return el;
}

// A real VaultShell instance (its constructor runs), deliberately NOT appended: its
// connectedCallback wires the whole vault — sync timers, loading hooks, data sources —
// none of which these methods touch. Parking/mounting is asserted through parentNode
// rather than isConnected so nothing here depends on the shell being in the document.
function makeShell() {
    const shell = document.createElement('vault-shell');
    shell.innerHTML =
        '<div class="vs-llm-sidebar" hidden>' +
          '<vault-llm-chat></vault-llm-chat>' +
          '<vault-llm-requests hidden></vault-llm-requests>' +
        '</div>';
    shell._browse = { _sgLayout: makeLayout() };
    return shell;
}

console.log('\n[suite] the chat panel reopens after the LAYOUT tab ✕ closes it');
{
    const shell  = makeShell();
    const layout = shell._browse._sgLayout;
    const chat   = shell.querySelector('vault-llm-chat');

    const first = await shell._showLlmPanel('chat', 'AI Chat');
    ok('it mounts the first time',           first === chat);
    ok('…as a layout panel',                 layout.__tabs.size === 1);
    ok('…titled AI Chat',                    layout.__lastTitle === 'AI Chat');

    const id = shell._llmPanels.chat.id;
    layout.userCloseTab(id);                          // the ✕ on the layout tab

    ok('closing forgets the panel record',   !shell._llmPanels.chat);
    ok('…and the element is parked, not lost', !!chat.parentNode);
    ok('…hidden while parked',                 chat.hidden === true);
    ok('…back in the fallback sidebar',        chat.parentNode.classList.contains('vs-llm-sidebar'));

    // The header button. Before the fix this returned null and nothing appeared.
    const again = await shell._showLlmPanel('chat', 'AI Chat');
    ok('the AI Chat button brings it back',  again === chat);
    ok('…as the SAME element (transcript and attached files survive)', again === first);
    ok('…visible again',                     chat.hidden === false);
    ok('…mounted in the layout again',       layout.__tabs.size === 1);
}

console.log("\n[suite] …and after the panel's OWN ✕ closes it");
{
    const shell  = makeShell();
    const layout = shell._browse._sgLayout;
    const chat   = shell.querySelector('vault-llm-chat');

    await shell._showLlmPanel('chat', 'AI Chat');
    shell._closeLlmPanel('chat');                     // what `vault-llm-close` triggers

    ok('the panel is removed from the layout', layout.__tabs.size === 0);
    ok('the element is parked',
        chat.parentNode && chat.parentNode.classList.contains('vs-llm-sidebar') && chat.hidden === true);

    const again = await shell._showLlmPanel('chat', 'AI Chat');
    ok('reopening works',                      again === chat && chat.hidden === false);
}

console.log('\n[suite] open/close/open repeatedly — no leak, no dead button');
{
    const shell  = makeShell();
    const layout = shell._browse._sgLayout;
    const chat   = shell.querySelector('vault-llm-chat');

    for (let i = 0; i < 5; i++) {
        const el = await shell._showLlmPanel('chat', 'AI Chat');
        ok('cycle ' + (i + 1) + ' opens', el === chat && chat.hidden === false);
        layout.userCloseTab(shell._llmPanels.chat.id);
    }
    ok('no panels are left behind in the layout', layout.__tabs.size === 0);
}

console.log('\n[suite] an already-open panel is focused, not mounted twice');
{
    const shell  = makeShell();
    const layout = shell._browse._sgLayout;

    await shell._showLlmPanel('chat', 'AI Chat');
    const id = shell._llmPanels.chat.id;
    await shell._showLlmPanel('chat', 'AI Chat');

    ok('still exactly one panel', layout.__tabs.size === 1);
    ok('the id did not change',   shell._llmPanels.chat.id === id);
    ok('it was focused instead',  layout.__focused === id);
}

console.log('\n[suite] chat and requests are independent');
{
    const shell  = makeShell();
    const layout = shell._browse._sgLayout;
    const chat   = shell.querySelector('vault-llm-chat');
    const reqs   = shell.querySelector('vault-llm-requests');

    await shell._showLlmPanel('chat', 'AI Chat');
    await shell._showLlmPanel('requests', 'AI Requests');
    ok('both mount', layout.__tabs.size === 2);

    layout.userCloseTab(shell._llmPanels.chat.id);
    ok('closing chat leaves requests open',  !!shell._llmPanels.requests);
    ok('…and requests is still visible',     reqs.hidden === false);
    ok('…while chat is parked',              chat.hidden === true);

    // The sidebar must not be hidden out from under the panel still using it.
    ok('reopening chat still works', (await shell._showLlmPanel('chat', 'AI Chat')) === chat);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
