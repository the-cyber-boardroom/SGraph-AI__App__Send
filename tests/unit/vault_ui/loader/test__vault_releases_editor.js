/* vault-releases-editor — publish / edit / remove versions (jsdom).
   Run: node tests/unit/vault_ui/loader/test__vault_releases_editor.js

   The editor is small CRUD, but three behaviours are worth pinning because getting them
   wrong is silent rather than loud:
     - a RENAME must carry the `default` with it, or the default points at a name that no
       longer exists and every new viewer quietly drops to Live;
     - removing a release must clear a default that referenced it, for the same reason;
     - uniqueness is enforced HERE, because the parser keeps the first duplicate — a
       second "v1.2" would look like the publish silently did nothing.
   Plus: removal confirms INLINE (no window.confirm), and a read-only session can read
   the list but cannot change it. */

import { readFileSync } from 'node:fs';
import { JSDOM }        from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent;

const base = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const load = (f) => new Function(readFileSync(base + f, 'utf8')).call(window);
load('lib/sg-releases/sg-releases.js');
global.SGReleases = window.SGReleases = globalThis.SGReleases;
load('components/vault-releases-editor/vault-releases-editor.js');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// A vault whose `.vault/` folder we can inspect after a write.
function makeVault(initial) {
    const files = {};
    if (initial) files[SGReleases.FILE] = new TextEncoder().encode(JSON.stringify(initial));
    return {
        _headCommitId: 'c_head',
        pushed: 0,
        written: () => (files[SGReleases.FILE]
            ? JSON.parse(new TextDecoder().decode(files[SGReleases.FILE])) : null),
        needsLoading: () => false,
        async loadSubTreeOnDemand() { return false; },
        listFolder(p) {
            if (p !== '/.vault') return null;
            return Object.keys(files).map((name) => ({ name, type: 'file' }));
        },
        async getFile(folder, name) {
            if (!files[name]) throw new Error('ENOENT');
            return files[name];
        },
        async addFile(folder, name, bytes)    { files[name] = bytes; },
        async updateFile(folder, name, bytes) { files[name] = bytes; },
        async createFolder() {},
        async push() { this.pushed++; },
        async logCommits() {
            return [
                { id: 'c_head', message: 'latest work', timestamp_ms: 1754200000000, parents: ['c_old'] },
                { id: 'c_old',  message: 'earlier',     timestamp_ms: 1754100000000, parents: [] }
            ];
        }
    };
}

const mount = async (vault, writable = true) => {
    const el = document.createElement('vault-releases-editor');
    document.body.appendChild(el);
    await el.setContext({ vault, vaultKey: 'pass:vid', writable });
    return el;
};
const q    = (el, s) => el.shadowRoot.querySelector(s);
const txt  = (el)    => el.shadowRoot.textContent;
const click = (el, s) => q(el, s).dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('\n[suite] empty state — it explains WHY you would publish');
{
    const v  = makeVault(null);
    const el = await mount(v);
    ok('mounts without throwing', !!el.shadowRoot);
    ok('says nothing is published', /No versions published yet/.test(txt(el)));
    ok('explains the consequence of not publishing', /changes every time you push/.test(txt(el)));
    ok('offers a publish form', !!q(el, '.vre-publish'));
    ok('the commit picker is populated from history', q(el, '.vre-n-commit').options.length === 2);
    ok('the newest commit is preselected', q(el, '.vre-n-commit').value === 'c_head');
}

console.log('\n[suite] publish');
{
    const v  = makeVault(null);
    const el = await mount(v);
    q(el, '.vre-n-name').value  = 'v1.2';
    q(el, '.vre-n-label').value = 'Black Hat demo';
    q(el, '.vre-n-notes').value = 'stable narration';
    click(el, '.vre-publish');
    await new Promise((r) => setTimeout(r, 0));

    const w = v.written();
    ok('the config is written', !!w);
    ok('the schema is stamped', w.schema === 'sg-releases/v1');
    ok('the release is recorded', w.releases.length === 1 && w.releases[0].name === 'v1.2');
    ok('the label is kept', w.releases[0].label === 'Black Hat demo');
    ok('the commit is the picked one', w.releases[0].commit === 'c_head');
    ok('a created timestamp is stamped', !!w.releases[0].created);
    ok('it was pushed, not just committed locally', v.pushed === 1);
    ok('the row now renders', /Black Hat demo/.test(txt(el)));
    // The link is built from the NAME (the stable identifier), not the display label —
    // renaming is an explicit act, relabelling must not silently break existing links.
    ok('a pinned share link is offered', /\|@v1-2/.test(q(el, '.vre-link input').value));
    ok('…built from the name, not the label', !/black-hat-demo/.test(q(el, '.vre-link input').value));
}

console.log('\n[suite] uniqueness is enforced here (the parser would silently keep the first)');
{
    const v  = makeVault({ releases: [{ name: 'v1.2', commit: 'c_old' }] });
    const el = await mount(v);
    q(el, '.vre-n-name').value = 'V1.2';                 // different case, same name
    click(el, '.vre-publish');
    await new Promise((r) => setTimeout(r, 0));
    ok('a duplicate name is refused', /already exists/.test(q(el, '.vre-status').textContent));
    ok('nothing was written', v.pushed === 0);

    q(el, '.vre-n-name').value = '';
    click(el, '.vre-publish');
    await new Promise((r) => setTimeout(r, 0));
    ok('an empty name is refused', /Give the version a name/.test(q(el, '.vre-status').textContent));
}

console.log('\n[suite] default — set, and carried through a rename');
{
    const v  = makeVault({ releases: [{ name: 'v1.1', commit: 'c_old' }, { name: 'v1.0', commit: 'c_x' }] });
    const el = await mount(v);
    click(el, '[data-default="v1.1"]');
    await new Promise((r) => setTimeout(r, 0));
    ok('the default is stored', v.written()['default'] === 'v1.1');
    ok('the row is badged', /default for others/.test(txt(el)));

    click(el, '[data-edit="v1.1"]');
    q(el, '.vre-e-name').value  = 'v1.1-final';
    q(el, '.vre-e-label').value = 'renamed';
    click(el, '[data-save="v1.1"]');
    await new Promise((r) => setTimeout(r, 0));

    const w = v.written();
    ok('the rename lands', w.releases.some((r) => r.name === 'v1.1-final'));
    ok('the old name is gone', !w.releases.some((r) => r.name === 'v1.1'));
    ok('the DEFAULT follows the rename', w['default'] === 'v1.1-final');
    ok('the commit is preserved across a rename',
        w.releases.find((r) => r.name === 'v1.1-final').commit === 'c_old');
    ok('the other release is untouched', w.releases.some((r) => r.name === 'v1.0'));
}

console.log('\n[suite] remove — inline confirm, never window.confirm');
{
    const realConfirm = window.confirm;
    window.confirm = global.confirm = () => { throw new Error('window.confirm must not be used'); };

    const v  = makeVault({ 'default': 'v1.2', releases: [{ name: 'v1.2', commit: 'c_head' }, { name: 'v1.0', commit: 'c_old' }] });
    const el = await mount(v);

    let threw = null;
    try { click(el, '[data-del="v1.2"]'); } catch (e) { threw = e; }
    ok('clicking Remove does not call window.confirm', !threw, threw && threw.message);
    ok('an inline confirm appears', /Stop publishing/.test(txt(el)));
    ok('it says the commit is not deleted', /commit is not deleted/.test(txt(el)));
    ok('it warns the default will be lost', /no default/.test(txt(el)));
    ok('nothing is removed yet', v.pushed === 0);

    click(el, '[data-delcancel="1"]');
    ok('cancel restores the row', /data-del/.test(el.shadowRoot.innerHTML));

    click(el, '[data-del="v1.2"]');
    click(el, '[data-delyes="v1.2"]');
    await new Promise((r) => setTimeout(r, 0));
    const w = v.written();
    ok('the release is removed', !w.releases.some((r) => r.name === 'v1.2'));
    ok('the dangling default is cleared', !w['default']);
    ok('the other release survives', w.releases.length === 1 && w.releases[0].name === 'v1.0');

    window.confirm = global.confirm = realConfirm;
}

console.log('\n[suite] allowLive toggle');
{
    const v  = makeVault({ releases: [{ name: 'v1', commit: 'c_head' }] });
    const el = await mount(v);
    const cb = q(el, '.vre-allowlive');
    ok('the toggle exists and defaults on', cb && cb.checked === true);
    cb.checked = false;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    ok('turning it off is persisted', v.written().allowLive === false);
}

console.log('\n[suite] read-only session — sees versions, cannot change them');
{
    const v  = makeVault({ releases: [{ name: 'v1.2', commit: 'c_head', label: 'demo' }] });
    const el = await mount(v, false);
    ok('published versions are listed', /demo/.test(txt(el)));
    ok('the share link is still offered', /\|@v1-2/.test(q(el, '.vre-link input').value));
    ok('no publish form', !q(el, '.vre-publish'));
    ok('no remove control', !q(el, '[data-del]'));
    ok('no edit control', !q(el, '[data-edit]'));
    ok('the reason is stated', /Read-only session/.test(q(el, '.vre-status').textContent));
}

console.log('\n[suite] escaping — names are user input');
{
    const v  = makeVault({ releases: [{ name: '<img src=x onerror=alert(1)>', commit: 'c' }] });
    const el = await mount(v);
    ok('a hostile name is escaped, not injected', el.shadowRoot.querySelector('img') === null);
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
