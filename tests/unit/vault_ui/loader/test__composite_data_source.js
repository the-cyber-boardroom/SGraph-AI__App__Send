/* Unit tests — CompositeDataSource (inline sub-vault splice, Phase 0)
   Run: node tests/unit/vault_ui/loader/test__composite_data_source.js

   Verifies the splice logic (the hard part) with stub data sources + an injected
   vaultOpener — no browser, no real vault. Sources the browser globals via
   runInThisContext, the same pattern as the other vault KATs. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const VAULT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
function load(rel) {
    const p = fileURLToPath(new URL(VAULT + rel, import.meta.url));
    runInThisContext(readFileSync(p, 'utf8'), { filename: rel, displayErrors: true });
}

globalThis.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();

// --- stub VaultDataSource: a fake over an in-memory {tree, list, bytes} spec ----
class FakeDS {
    constructor(spec, accessKey) { this._spec = spec; this._accessKey = accessKey; this.writable = !!accessKey; this.onTreeChanged = null; if (spec && spec._vault) this._vault = spec._vault; }
    getTree()            { return this._spec.tree; }
    getFileList()        { return this._spec.list; }
    async getFileBytes(p){ const norm = String(p).replace(/^\//, ''); if (!(norm in this._spec.bytes)) throw new Error('ENOENT ' + norm); return this._spec.bytes[norm]; }
    async loadAllSubTrees(){ return; }
    async loadFolder()   { return; }
    getOrigName()        { return 'fake'; }
    getOrigSize()        { return 0; }
}
globalThis.VaultDataSource = FakeDS;          // composite does `new VaultDataSource(childVault, null)`
globalThis.SGVault = { open: async () => { throw new Error('should not be called (vaultOpener injected)'); } };

load('lib/links/vault-links.js');
load('adapters/composite-data-source.js');
runInThisContext('globalThis.CompositeDataSource = CompositeDataSource; globalThis.VaultLinks = VaultLinks;');
const { CompositeDataSource } = globalThis;

const enc = s => new TextEncoder().encode(s);

// --- ROOT vault: a folder `subvaults/` holding `acme.link.json` + a normal file ----
const linkBytes = enc(JSON.stringify({ vault_id: 'childvault', ref_id: 'lk-1', label: 'ACME Demo' }));
const rootSpec = {
    _vault: { _sgSend: {} },
    tree: { name: '', children: {
        subvaults: { name: 'subvaults', children: {}, files: [
            { path: 'subvaults/acme.link.json', name: 'subvaults/acme.link.json', size: linkBytes.length }
        ] }
    }, files: [ { path: 'readme.md', name: 'readme.md', size: 3 } ] },
    list: [
        { path: 'readme.md', name: 'readme.md', dir: false, size: 3 },
        { path: 'subvaults/', name: 'subvaults/', dir: true, size: 0 },
        { path: 'subvaults/acme.link.json', name: 'subvaults/acme.link.json', dir: false, size: linkBytes.length }
    ],
    bytes: { 'readme.md': enc('hi\n'), 'subvaults/acme.link.json': linkBytes }
};
// --- CHILD vault contents (returned by the injected opener) ----
const childSpec = {
    tree: { name: '', children: {
        assets: { name: 'assets', children: {}, files: [ { path: 'assets/logo.png', name: 'assets/logo.png', size: 4 } ] }
    }, files: [ { path: 'health.md', name: 'health.md', size: 9 } ] },
    list: [
        { path: 'health.md', name: 'health.md', dir: false, size: 9 },
        { path: 'assets/', name: 'assets/', dir: true, size: 0 },
        { path: 'assets/logo.png', name: 'assets/logo.png', dir: false, size: 4 }
    ],
    bytes: { 'health.md': enc('score: 87'), 'assets/logo.png': enc('PNG!') }
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const findChild = (tree, name) => tree.children[name];

(async () => {
    console.log('\n[suite] CompositeDataSource — inline sub-vault splice');

    let promptCalls = 0;
    let openerKey = null;
    const root = new FakeDS(rootSpec, 'access-token');   // root writable
    const comp = new CompositeDataSource(root, {
        keyProvider: async () => { promptCalls++; return 'apple-river-1234'; },
        vaultOpener: async (key) => { openerKey = key; return { _childData: true }; }
    });
    // route the injected child vault → childSpec via the stub VaultDataSource
    globalThis.VaultDataSource = function (childVault, accessKey) { return new FakeDS(childSpec, accessKey); };

    await comp.scan();

    // 1. scan registers the vault link as a mount
    ok('scan: one mount registered', comp._mounts.size === 1);

    // 2. getTree: raw link file hidden; mount appears as a lazy sub-vault folder
    let tree = comp.getTree();
    const sv = findChild(tree, 'subvaults');
    ok('getTree: subvaults folder present', !!sv);
    const acme = sv && findChild(sv, 'acme');
    ok('getTree: mount node "acme" present', !!acme);
    ok('getTree: mount is _subvault',        !!acme && acme._subvault === true);
    ok('getTree: mount is _lazy (collapsed)', !!acme && acme._lazy === true);
    ok('getTree: mount _folderPath',         !!acme && acme._folderPath === '/subvaults/acme');
    ok('getTree: mount carries _linkPath (move + edit)', !!acme && acme._linkPath === 'subvaults/acme.link.json');
    ok('getTree: link file NOT shown as a file', sv && sv.files.every(f => !/\.link\.json$/.test(f.path)));

    // 3. getFileList hides the raw link file, adds the mount dir
    let list = comp.getFileList();
    ok('getFileList: link file hidden',  list.every(e => !/acme\.link\.json$/.test(e.path)));
    ok('getFileList: mount dir present', list.some(e => e.path === 'subvaults/acme/' && e.dir));
    ok('getFileList: root file kept',    list.some(e => e.path === 'readme.md'));

    // 3b. BRIDGE INVARIANT (app-side sg.vfs read/list of a sub-vault):
    //     while collapsed, an inner file is ABSENT from the flat list — so a naive strict-match
    //     pre-check (as the app-shell VFS bridge used to do) would ENOENT before auto-open.
    //     The bridge fix keys off _mountForPath(path) → loadFolder(path) to open the covering
    //     mount first, after which the inner file appears (asserted post-mount at step 8).
    ok('collapsed: inner file absent from flat list', !comp.getFileList().some(e => e.path === 'subvaults/acme/health.md'));
    ok('_mountForPath finds the covering mount (bridge ensureMountOpen key)',
       !!comp._mountForPath('subvaults/acme/health.md') && comp._mountForPath('readme.md') === null);

    // 4. getFileBytes of a root file → root
    ok('getFileBytes: root file routes to root', new TextDecoder().decode(await comp.getFileBytes('readme.md')) === 'hi\n');

    // 5. loadFolder opens the child read-only (via keyProvider + opener)
    await comp.loadFolder('/subvaults/acme');
    ok('loadFolder: keyProvider used (no stored key)', promptCalls === 1);
    ok('loadFolder: opener got the prompted key',      openerKey === 'apple-river-1234');
    const m = comp._mounts.get('subvaults/acme');
    ok('loadFolder: mount status mounted', m && m.status === 'mounted');
    ok('loadFolder: child opened READ-ONLY (accessKey null)', m && m.child && m.child.writable === false);

    // 6. after mount: getTree splices child tree (prefixed) under the mount
    tree = comp.getTree();
    const acme2 = findChild(findChild(tree, 'subvaults'), 'acme');
    ok('getTree(mounted): not lazy anymore', acme2 && !acme2._lazy);
    ok('getTree(mounted): still _subvault',  acme2 && acme2._subvault === true);
    ok('getTree(mounted): child file prefixed', acme2 && acme2.files.some(f => f.path === 'subvaults/acme/health.md'));
    ok('getTree(mounted): child folder spliced', acme2 && !!acme2.children.assets);

    // 7. getFileBytes routes a mounted path to the child (strips prefix)
    ok('getFileBytes: mounted file routes to child', new TextDecoder().decode(await comp.getFileBytes('subvaults/acme/health.md')) === 'score: 87');
    ok('getFileBytes: nested mounted file', new TextDecoder().decode(await comp.getFileBytes('subvaults/acme/assets/logo.png')) === 'PNG!');

    // 8. getFileList(mounted): child files appear prefixed
    list = comp.getFileList();
    ok('getFileList(mounted): child file prefixed', list.some(e => e.path === 'subvaults/acme/health.md'));

    // 9. write gate delegates to root
    ok('writable delegates to root', comp.writable === true);

    // 10. locked when no key available
    globalThis.VaultDataSource = function (cv, ak) { return new FakeDS(childSpec, ak); };
    const root2 = new FakeDS(rootSpec, null);
    const comp2 = new CompositeDataSource(root2, { keyProvider: async () => null, vaultOpener: async () => ({}) });
    await comp2.scan();
    let threw = false;
    try { await comp2.loadFolder('/subvaults/acme'); } catch (_) { threw = true; }
    ok('loadFolder: locks + throws when no key', threw && comp2._mounts.get('subvaults/acme').status === 'locked');

    // 11. owner ro-record → opens read-only SILENTLY (no prompt) via openReadOnly
    globalThis.VaultDataSource = function (cv, ak) { return new FakeDS(childSpec, ak); };
    const roLinks = enc(JSON.stringify({ 'lk-1': { type: 'vault', read_key: 'RK', ref_file_id: 'RF', vault_id: 'childvault' } }));
    const parentVault = {
        _sgSend: {},
        needsLoading() { return false; },
        async loadSubTreeOnDemand() {},
        async getFile(folder, name) {
            if (String(folder).replace(/^\//, '') === '.vault/owner' && name === 'ro-links.json') return roLinks;
            throw new Error('ENOENT');
        }
    };
    const root3 = new FakeDS({ _vault: parentVault, tree: rootSpec.tree, list: rootSpec.list, bytes: rootSpec.bytes });
    let roArgs = null, prompt3 = 0;
    const comp3 = new CompositeDataSource(root3, {
        keyProvider:   async () => { prompt3++; return 'should-not-be-used'; },
        vaultOpenerRO: async (vid, rk, rf) => { roArgs = { vid, rk, rf }; return { _child: true }; }
    });
    await comp3.scan();
    await comp3.loadFolder('/subvaults/acme');
    ok('ro-record: opened via openReadOnly (read_key/ref_file_id)', !!roArgs && roArgs.rk === 'RK' && roArgs.rf === 'RF');
    ok('ro-record: vault_id from record', roArgs && roArgs.vid === 'childvault');
    ok('ro-record: NO prompt (silent open)', prompt3 === 0);
    ok('ro-record: mount mounted read-only', comp3._mounts.get('subvaults/acme').status === 'mounted');

    // 11b. transparency: reading a path under a collapsed mount AUTO-OPENS it (no expand, no prompt)
    globalThis.VaultDataSource = function (cv, ak) { return new FakeDS(childSpec, ak); };
    let promptB = 0, roArgsB = null;
    const comp3b = new CompositeDataSource(
        new FakeDS({ _vault: parentVault, tree: rootSpec.tree, list: rootSpec.list, bytes: rootSpec.bytes }),
        { keyProvider: async () => { promptB++; return null; },
          vaultOpenerRO: async (vid, rk, rf) => { roArgsB = { vid, rk, rf }; return { _child: true }; } });
    await comp3b.scan();
    const ab = await comp3b.getFileBytes('subvaults/acme/health.md');   // no loadFolder first
    ok('transparency: read auto-opens the sub-vault (no expand)', new TextDecoder().decode(ab) === 'score: 87');
    ok('transparency: auto-open used the ro-record (no prompt)', promptB === 0 && !!roArgsB);

    // 12. external-resource link → resource leaf (NOT a vault mount)
    const resBytes = enc(JSON.stringify({ ref_id: 'lk-vid', type: 'video', url: 'https://youtu.be/xyz', label: 'Intro video' }));
    const rootSpecR = {
        _vault: { _sgSend: {} },
        tree: { name: '', children: {}, files: [
            { path: 'intro.link.json', name: 'intro.link.json', size: resBytes.length },
            { path: 'readme.md', name: 'readme.md', size: 3 }
        ] },
        list: [
            { path: 'readme.md', name: 'readme.md', dir: false, size: 3 },
            { path: 'intro.link.json', name: 'intro.link.json', dir: false, size: resBytes.length }
        ],
        bytes: { 'intro.link.json': resBytes, 'readme.md': enc('hi\n') }
    };
    const compR = new CompositeDataSource(new FakeDS(rootSpecR), {});
    await compR.scan();
    ok('resource: registered (1 resource, 0 mounts)', compR._resources.size === 1 && compR._mounts.size === 0);
    const rtree = compR.getTree();
    const leaf = rtree.files.find(f => f._resource);
    ok('getTree: resource rendered as a leaf', !!leaf);
    ok('getTree: resource type = video', leaf && leaf._resourceType === 'video');
    ok('getTree: resource provider = youtube', leaf && leaf._provider === 'youtube');
    ok('getTree: resource url carried', leaf && leaf._url === 'https://youtu.be/xyz');
    ok('getTree: .link.json not shown as a plain file (only as the resource leaf)', rtree.files.every(f => f._resource || !/\.link\.json$/.test(f.path)));
    ok('getFileList: raw resource link hidden', compR.getFileList().every(e => !/intro\.link\.json$/.test(e.path)));
    ok('getFileList: normal file kept', compR.getFileList().some(e => e.path === 'readme.md'));

    // ── identity delegation (`_vault` getter) ──
    // Regression guard for the editor-preview parity bug: send-browse--v0.3.2.js reads
    // `self.dataSource._vault.vaultId` to populate sg.app.vaultId. When the composite wraps
    // the root, that access was undefined → sg.app.vaultId fell to '' (header showed "?").
    // The getter delegates to _root._vault so the composite is transparent for identity.
    console.log('\n[suite] CompositeDataSource — identity delegation (`_vault` getter)');
    const sentinel = { _vaultId: 'identity123', name: 'demo' };
    const rootWithVault = new FakeDS({ _vault: sentinel, tree: { name:'', children:{}, files:[] }, list:[], bytes:{} }, null);
    const compIdent = new CompositeDataSource(rootWithVault, {});
    ok('delegates _vault to _root._vault', compIdent._vault === sentinel);
    ok('delegated _vault carries _vaultId', compIdent._vault && compIdent._vault._vaultId === 'identity123');
    const rootNoVault = new FakeDS({ tree: { name:'', children:{}, files:[] }, list:[], bytes:{} }, null);
    delete rootNoVault._vault;   // simulate a root without _vault
    const compNo = new CompositeDataSource(rootNoVault, {});
    ok('returns undefined when root has no _vault (no throw)', compNo._vault === undefined);

    // ── Step 0 of the 07 Sep architect analysis: the read-only guard was an ACCIDENT ──
    // Every mutation used to be a blind pass-through to the root with the path unchanged;
    // it "failed" only because the virtual mount folder does not exist in the root. These
    // two suites pin the explicit refusal and the silent-corruption case it prevents.
    console.log('\n[suite] mutations at/under a mount are refused (EMOUNT_RO) — nothing reaches the root');
    {
        const writes = [];
        class RecordingRoot extends FakeDS {
            async saveFile(f, n)       { writes.push(['saveFile', f, n]); }
            async deleteFile(f, n)     { writes.push(['deleteFile', f, n]); }
            async renameFile(f, o, n)  { writes.push(['renameFile', f, o, n]); }
            async createFolder(p)      { writes.push(['createFolder', p]); }
            async deleteFolder(p)      { writes.push(['deleteFolder', p]); }
            async renameFolder(p, n)   { writes.push(['renameFolder', p, n]); }
            async moveFile(s, n, d)    { writes.push(['moveFile', s, n, d]); }
            async moveFolder(s, d)     { writes.push(['moveFolder', s, d]); }
        }
        const root = new RecordingRoot(rootSpec, 'token');                       // WRITABLE parent
        const comp = new CompositeDataSource(root, { vaultOpenerRO: async () => ({}), keyProvider: async () => 'k', vaultOpener: async () => ({}) });
        await comp.scan();                                                        // mount registered, NOT opened
        const refused = async (label, fn) => { let code = null; try { await fn(); } catch (e) { code = e.code; } ok(label + ' → EMOUNT_RO', code === 'EMOUNT_RO'); };
        await refused('saveFile in the mount root',        () => comp.saveFile('/subvaults/acme', 'x.md', enc('a')));
        await refused('saveFile in a mount sub-folder',    () => comp.saveFile('/subvaults/acme/assets', 'x.md', enc('a')));
        await refused('deleteFile in the mount',           () => comp.deleteFile('/subvaults/acme', 'x.md'));
        await refused('renameFile in the mount',           () => comp.renameFile('/subvaults/acme', 'x.md', 'y.md'));
        await refused('createFolder in the mount',         () => comp.createFolder('/subvaults/acme/new'));
        await refused('deleteFolder = the mount root',     () => comp.deleteFolder('/subvaults/acme'));
        await refused('renameFolder = the mount root',     () => comp.renameFolder('/subvaults/acme', 'other'));
        await refused('moveFile INTO a mount',             () => comp.moveFile('/', 'readme.md', '/subvaults/acme'));
        await refused('moveFile OUT of a mount',           () => comp.moveFile('/subvaults/acme', 'x.md', '/'));
        await refused('moveFolder INTO a mount',           () => comp.moveFolder('/docs', '/subvaults/acme'));
        await refused('moveFolder OF the mount root',      () => comp.moveFolder('/subvaults/acme', '/'));
        ok('a LOCKED (unopened) mount still refuses — it is not the parent\'s folder', comp._mounts.get('subvaults/acme').status !== 'mounted');
        ok('NOTHING reached the root data source',         writes.length === 0);
        await comp.saveFile('/', 'readme.md', enc('hi'));
        await comp.createFolder('/docs');
        await comp.saveFile('/subvaults', 'acme.link.json', enc('{}'));         // editing the LINK FILE is a root op
        ok('mutations outside mounts still pass through (incl. the link file itself)',
           writes.length === 3 && writes.map(w => w[0]).join(',') === 'saveFile,createFolder,saveFile');
    }

    console.log('\n[suite] a REAL parent folder at a mount path cannot shadow the mount (the corruption case)');
    {
        // Parent holds BOTH `subvaults/acme.link.json` AND a real folder `subvaults/acme/` with a file.
        const shadow = JSON.parse(JSON.stringify({ tree: rootSpec.tree, list: rootSpec.list }));
        shadow.tree.children.subvaults.children.acme = { name: 'acme', children: {}, files: [ { path: 'subvaults/acme/stale.md', name: 'subvaults/acme/stale.md', size: 5 } ] };
        shadow.list.push({ path: 'subvaults/acme/', name: 'subvaults/acme/', dir: true, size: 0 },
                         { path: 'subvaults/acme/stale.md', name: 'subvaults/acme/stale.md', dir: false, size: 5 });
        shadow.bytes = rootSpec.bytes; shadow._vault = rootSpec._vault;
        const writes = [];
        class RecordingRoot extends FakeDS { async saveFile(f, n) { writes.push([f, n]); } }
        const root = new RecordingRoot(shadow, 'token');
        const comp = new CompositeDataSource(root, { vaultOpenerRO: async () => ({}), keyProvider: async () => 'k', vaultOpener: async () => ({}) });
        await comp.scan();
        const node = comp.getTree().children.subvaults.children.acme;
        ok('tree keeps the MOUNT node, the real folder does not replace it', node && node._subvault === true);
        ok('the conflict is surfaced for the UI',                          node && node._conflict === 'shadowed-by-folder');
        ok('getFileList hides the shadowed parent entries',                !comp.getFileList().some(e => /subvaults\/acme\/(stale\.md)?$/.test(e.path) && e.size === 5));
        ok('getFileList still lists the mount folder itself once',         comp.getFileList().filter(e => e.path === 'subvaults/acme/').length === 1);
        let code = null; try { await comp.saveFile('/subvaults/acme', 'report.md', enc('collector output')); } catch (e) { code = e.code; }
        ok('write into the shadowed mount is REFUSED (EMOUNT_RO)',          code === 'EMOUNT_RO');
        ok('and NOTHING landed in the parent',                              writes.length === 0);
    }

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
