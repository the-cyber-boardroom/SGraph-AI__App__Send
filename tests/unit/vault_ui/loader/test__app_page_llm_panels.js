/* AI Chat on /en-gb/app/ (SG/App) — the shared LlmPanels host + the page wiring (jsdom).
   Run: node tests/unit/vault_ui/loader/test__app_page_llm_panels.js

   Two pages now mount the same chat panel — /vault (vault-shell) and /app (SG/App) — off
   one module, because the bookkeeping has a trap that is invisible in review and already
   shipped once: sg-layout DETACHES a panel's element before it emits `panel:closed`, so a
   handler that re-queries the DOM finds nothing, parks nothing, and orphans the element.
   `test__vault_shell_llm_panels.js` pins that through vault-shell; this file pins the
   module directly in the /app host shape (where the parking bay IS the host element) and
   guards the page wiring, which has its own trap:

     `layout.setLayout(cfg)` REBUILDS THE TREE and unmounts everything not in the config.

   The AI panels are added with addPanel(), so they are not in `_layoutCfg` — toggling the
   debug pane would destroy the transcript unless the page parks them first and re-shows
   them after. That is a two-line mistake with no visible symptom until someone loses a
   conversation, so it is asserted from source. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;

const VBASE = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/';
const load  = (f) => new Function(readFileSync(VBASE + '_common/js/' + f, 'utf8')).call(window);
load('lib/sg-llm/llm-panels.js');
const LlmPanels = globalThis.LlmPanels;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// sg-layout, reduced to the behaviour that matters: detach first, announce after; and a
// setLayout() that unmounts everything, as the real one does.
function makeLayout() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const subs = [];
    let seq = 0;
    el.__tabs = new Map();
    el.events = { on: (n, fn) => { if (n === 'panel:closed') subs.push(fn); } };
    el.addPanel = ({ el: p, title }) => { const id = 'p' + (++seq); el.__tabs.set(id, p); el.appendChild(p); el.__titles = (el.__titles || []).concat(title); return id; };
    el.removePanel = (id) => {
        const p = el.__tabs.get(id); if (!p) return;
        el.__tabs.delete(id);
        if (p.parentNode === el) el.removeChild(p);   // detach…
        subs.forEach((fn) => fn({ id }));             // …then announce
    };
    el.focusPanel = (id) => { el.__focused = id; };
    el.setLayout = () => {                            // the destructive rebuild
        Array.from(el.__tabs.values()).forEach((p) => { if (p.parentNode === el) el.removeChild(p); });
        el.__tabs.clear();
    };
    return el;
}

// The /app shape: ONE element is both the light-DOM home and the parking bay.
function makeHost(layout) {
    const host = document.createElement('div');
    host.hidden = true;
    host.innerHTML = '<vault-llm-chat></vault-llm-chat><vault-llm-requests hidden></vault-llm-requests>';
    document.body.appendChild(host);
    return LlmPanels.create({
        host, sidebar: () => host,
        getLayout: () => Promise.resolve(layout)
    });
}

console.log('\n[suite] LlmPanels — mount, close, reopen (the /app host shape)');
{
    const layout = makeLayout();
    const panels = makeHost(layout);
    const chat   = panels.el('chat');

    ok('the chat element is found',      !!chat && chat.tagName.toLowerCase() === 'vault-llm-chat');
    const first = await panels.show('chat', '✨ AI Chat');
    ok('it mounts into the layout',      first === chat && layout.__tabs.size === 1);
    ok('…titled for the tab bar',        layout.__titles[0] === '✨ AI Chat');
    ok('…and is visible',                chat.hidden === false);
    ok('isOpen reports it',              panels.isOpen('chat') === true);

    const id = panels.panels.chat.id;
    layout.removePanel(id);                            // the layout's own ✕

    ok('closing forgets the record',     !panels.isOpen('chat'));
    ok('…the element is parked, not lost', chat.parentNode !== null);
    ok('…in the parking bay',            chat.parentNode.hasAttribute('hidden') || chat.parentNode.hidden);
    ok('…hidden',                        chat.hidden === true);

    const again = await panels.show('chat', '✨ AI Chat');
    ok('reopening returns the SAME element (transcript survives)', again === chat);
    ok('…visible again',                 chat.hidden === false);
    ok('…mounted again',                 layout.__tabs.size === 1);
}

console.log('\n[suite] LlmPanels — an already-open panel is focused, never mounted twice');
{
    const layout = makeLayout();
    const panels = makeHost(layout);
    await panels.show('chat', 'AI');
    const id = panels.panels.chat.id;
    await panels.show('chat', 'AI');
    ok('one panel only',        layout.__tabs.size === 1);
    ok('same id',               panels.panels.chat.id === id);
    ok('it was focused',        layout.__focused === id);
}

console.log('\n[suite] LlmPanels — detachAll survives a destructive setLayout');
{
    /* This is the debug-pane toggle. Without the park/re-show the transcript is gone. */
    const layout = makeLayout();
    const panels = makeHost(layout);
    const chat   = panels.el('chat');

    await panels.show('chat', 'AI');
    chat.dataset.transcript = 'a conversation worth keeping';

    const reopen = panels.detachAll();
    ok('detachAll reports what was open',  reopen.length === 1 && reopen[0] === 'chat');
    ok('…and parks it before the rebuild', chat.parentNode !== layout);

    layout.setLayout();                                // would have destroyed it
    ok('the element survived the rebuild', chat.parentNode !== null);
    ok('…with its state',                  chat.dataset.transcript === 'a conversation worth keeping');

    const back = await panels.show('chat', 'AI');
    ok('and it goes straight back',        back === chat && layout.__tabs.size === 1);
}

console.log('\n[suite] LlmPanels — no layout at all falls back to the parking bay');
{
    const panels = LlmPanels.create({
        host: (() => { const h = document.createElement('div'); h.hidden = true;
                       h.innerHTML = '<vault-llm-chat></vault-llm-chat>';
                       document.body.appendChild(h); return h; })(),
        sidebar: function () { return this.host; },
        getLayout: () => Promise.resolve(null)
    });
    // sidebar() above intentionally returns undefined (no `this`) — the panel must not
    // throw when a host gives it nothing to fall back to.
    let err = null, res;
    try { res = await panels.show('chat', 'AI'); } catch (e) { err = e; }
    ok('a missing fallback container does not throw', err === null, err && err.message);
    ok('…it just reports nothing was shown',          res === null);
}

console.log('\n[suite] the /app page is actually wired up');
{
    const html = readFileSync(VBASE + 'en-gb/app/index.html', 'utf8');

    ok('loads the shared panel host',   /lib\/sg-llm\/llm-panels\.js/.test(html));
    ok('loads the chat component',      /components\/vault-llm-chat\/vault-llm-chat\.js/.test(html));
    ok('loads the requests component',  /components\/vault-llm-requests\/vault-llm-requests\.js/.test(html));
    ok('has a light-DOM parking bay',   /id="llm-host"/.test(html));
    ok('…holding both elements',
        /<vault-llm-chat><\/vault-llm-chat>/.test(html) && /<vault-llm-requests/.test(html));

    // Load order: the components must be defined before the page script builds panels.
    ok('llm-panels loads before the page body',
        html.indexOf('llm-panels.js') < html.indexOf('id="llm-host"'));

    ok('the HUD button opens it',       /app-hud:llm/.test(html));
    ok("the panel's own ✕ closes it",   /vault-llm-close/.test(html));
    ok('the requests panel is wired',   /vault-llm-requests-open/.test(html));
    ok('the vault is handed to the chat', /setVault/.test(html));

    // The trap: setLayout() unmounts everything not in _layoutCfg.
    const toggle = html.slice(html.indexOf("app-debug:toggle"));
    const parkAt = toggle.indexOf('detachAll');
    const setAt  = toggle.indexOf('setLayout(_layoutCfg)');
    ok('the debug toggle parks the AI panels', parkAt !== -1);
    ok('…BEFORE it rebuilds the layout',       parkAt !== -1 && setAt !== -1 && parkAt < setAt);
    ok('…and re-shows whatever was open',      /reopen\.forEach/.test(toggle));
}

console.log('\n[suite] the HUD carries the button, and apps can turn it off');
{
    const hud = readFileSync(VBASE + '_common/js/components/app-shell/app-hud.js', 'utf8');
    ok('the AI button exists',              /class="hud-llm-btn"/.test(hud));
    ok('…is gated by a hud show flag',      /data-hud-el="llm"/.test(hud));
    ok('…and emits app-hud:llm',            /app-hud:llm/.test(hud));

    load('components/app-shell/app-hud-config.js');
    const Cfg = globalThis.AppHudConfig;
    ok('full mode shows it',                Cfg.resolve({ mode: 'full' }).show.llm === true);
    ok('minimal mode hides it (host chrome, like activity)',
        Cfg.resolve({ mode: 'minimal' }).show.llm === false);
    ok('an app can force it on in minimal',
        Cfg.resolve({ mode: 'minimal', show: { llm: true } }).show.llm === true);
    ok('an app can turn it off in full',
        Cfg.resolve({ mode: 'full', show: { llm: false } }).show.llm === false);
}

console.log('\n[suite] app-shell hands the vault to host chrome on ready');
{
    const shell = readFileSync(VBASE + '_common/js/components/app-shell/app-shell.js', 'utf8');
    const dispatchAt = shell.indexOf("new CustomEvent('app-shell:ready'");
    const ready = shell.slice(dispatchAt, dispatchAt + 900);
    ok('found the ready dispatch', dispatchAt !== -1);
    ok('the ready event carries the vault', /vault: this\._vault/.test(ready));

    // The same event is forwarded to a parent window in embed mode. That forwarder must
    // keep copying NAMED fields — postMessage'ing the whole detail would now push a live
    // vault object (and its keys) at another origin.
    const fwd = shell.slice(shell.indexOf('_embedReadyHandler = function'),
                            shell.indexOf('_embedReadyHandler = function') + 900);
    ok('the embed forwarder still copies named fields only',
        /vaultName: detail\.vaultName/.test(fwd) && !/postMessage\(detail/.test(fwd));
    ok('…and never forwards the vault',     !/vault: detail\.vault/.test(fwd));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
