/* Unit tests — VaultAccess (single access facade: root local + mounts via relay)
   Run: node tests/unit/vault_ui/loader/test__vault_access.js
   No deps. Sources the browser global via runInThisContext. Stubs a root data source
   and a relay; asserts read/write routing (root vs relay) and the rw/ro/cross-mount gates. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const LIB = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/adapters/vault-access.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(LIB), 'utf8'), { filename: 'vault-access.js', displayErrors: true });
runInThisContext('globalThis.VaultAccess = VaultAccess;');
const { VaultAccess } = globalThis;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

// stub root data source: records calls, serves bytes from a map
function makeRoot(writable) {
    const calls = [];
    return {
        writable, _accessKey: writable ? 'k' : null, _vault: { id: 'root' }, onTreeChanged: null, calls,
        getTree()              { return { name: '', children: {}, files: [] }; },
        getFileList()          { return [{ path: 'a.txt', dir: false, size: 1 }]; },
        async loadAllSubTrees(){ },
        async getFileBytes(p)  { calls.push(['read-root', p]); return new Uint8Array([1]); },
        async loadFolder(p)    { calls.push(['loadFolder-root', p]); },
        async saveFile(f, n, b){ calls.push(['save-root', f, n, b]); return { ok: true, root: true }; },
        async deleteFile(f, n) { calls.push(['del-root', f, n]); return { ok: true }; },
        async createFolder(p)  { calls.push(['mkdir-root', p]); },
        async deleteFolder(p)  { calls.push(['rmdir-root', p]); },
        async renameFile(f,o,n){ calls.push(['rename-root', f, o, n]); },
        async renameFolder(o,n){ calls.push(['renameFolder-root', o, n]); },
        async moveFile(a, b)   { calls.push(['move-root', a, b]); },
        async moveFolder(a, b) { calls.push(['moveFolder-root', a, b]); }
    };
}
// stub relay: records (op,args)
function makeRelay() {
    const calls = [];
    return { calls, async relay(op, args) { calls.push([op, args]); return { ok: true, relayed: true, op, path: args.path }; } };
}

console.log('\n[suite] VaultAccess — routing root vs relay');

(async () => {
    // mount table: an rw mount and an ro mount
    const mounts = () => [
        { mountPath: 'mounts/rw', access: 'rw' },
        { mountPath: 'mounts/ro', access: 'ro' }
    ];

    // 1. root writes go to root
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('notes', 'x.txt', new Uint8Array([9]));
        ok('root write → root.saveFile', root.calls.some(c => c[0] === 'save-root'));
        ok('root write did NOT hit relay', relay.calls.length === 0);
        ok('writableAt(root path) follows root.writable', va.writableAt('notes/x.txt') === true);
    }

    // 2. rw mount write goes to relay
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        const res = await va.saveFile('mounts/rw/data', 'r.json', new Uint8Array([7]));
        ok('rw mount write → relay write', relay.calls.some(c => c[0] === 'write' && c[1].path === 'mounts/rw/data/r.json'));
        ok('rw mount write did NOT hit root', !root.calls.some(c => c[0] === 'save-root'));
        ok('rw mount write returns relay result', res && res.relayed === true);
        ok('writableAt(rw mount) true when relay present', va.writableAt('mounts/rw/data/r.json') === true);
    }

    // 3. ro mount write is refused (EREADONLY), never touches root or relay
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        let code = null;
        try { await va.saveFile('mounts/ro/data', 'x', new Uint8Array([1])); } catch (e) { code = e.code; }
        ok('ro mount write throws EREADONLY', code === 'EREADONLY');
        ok('ro mount write touched neither root nor relay', root.calls.length === 0 && relay.calls.length === 0);
        ok('writableAt(ro mount) false', va.writableAt('mounts/ro/data/x') === false);
    }

    // 4. rw mount but NO relay wired → EUNREACH
    {
        const root = makeRoot(true);
        const va = new VaultAccess(root, { mounts });   // no relay
        let code = null;
        try { await va.saveFile('mounts/rw/data', 'x', new Uint8Array([1])); } catch (e) { code = e.code; }
        ok('rw mount with no relay throws EUNREACH', code === 'EUNREACH');
        ok('writableAt(rw mount) false when no relay', va.writableAt('mounts/rw/data/x') === false);
    }

    // 5. reads: root reads local; rw mount reads via relay; ro mount reads via root (composite)
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.getFileBytes('a.txt');
        ok('root read → root.getFileBytes', root.calls.some(c => c[0] === 'read-root' && c[1] === 'a.txt'));
        await va.getFileBytes('mounts/rw/data/r.json');
        ok('rw mount read → relay read', relay.calls.some(c => c[0] === 'read' && c[1].path === 'mounts/rw/data/r.json'));
        const before = root.calls.length;
        await va.getFileBytes('mounts/ro/data/x');
        ok('ro mount read → root (composite read-through)', root.calls.length === before + 1);
    }

    // 6. delete / createFolder route like writes
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.deleteFile('mounts/rw', 'gone.txt');
        ok('rw mount delete → relay delete', relay.calls.some(c => c[0] === 'delete' && c[1].path === 'mounts/rw/gone.txt'));
        await va.createFolder('mounts/rw/newdir');
        ok('rw mount mkdir → relay mkdir', relay.calls.some(c => c[0] === 'mkdir' && c[1].path === 'mounts/rw/newdir'));
        await va.deleteFile('notes', 'gone.txt');
        ok('root delete → root', root.calls.some(c => c[0] === 'del-root'));
    }

    // 7. cross-boundary move/rename rejected (ECROSSMOUNT)
    {
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        let c1 = null; try { await va.moveFile('notes/a', 'mounts/rw/a'); } catch (e) { c1 = e.code; }
        ok('move root→mount throws ECROSSMOUNT', c1 === 'ECROSSMOUNT');
        let c2 = null; try { await va.moveFile('mounts/rw/a', 'mounts/ro/a'); } catch (e) { c2 = e.code; }
        ok('move mount→other-mount throws ECROSSMOUNT', c2 === 'ECROSSMOUNT');
        // same-mount rw move → relay
        await va.moveFile('mounts/rw/a', 'mounts/rw/b');
        ok('same rw-mount move → relay move', relay.calls.some(c => c[0] === 'move' && c[1].path === 'mounts/rw/a' && c[1].to === 'mounts/rw/b'));
        // root→root move → root
        await va.moveFile('notes/a', 'notes/b');
        ok('root→root move → root', root.calls.some(c => c[0] === 'move-root'));
    }

    // 8. read-only root: root write refused via root's own gate (no mount)
    {
        const root = makeRoot(false), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        ok('writableAt(root) false on read-only root', va.writableAt('notes/x') === false);
    }

    // 9. fallback mount resolution via root._mountForPath when no mounts fn given
    {
        const root = makeRoot(true);
        root._mountForPath = (p) => (String(p).replace(/^\//,'').startsWith('sub/') ? { mountPath: 'sub', access: 'ro' } : null);
        const va = new VaultAccess(root, {});   // no mounts fn, no relay
        let code = null; try { await va.saveFile('sub', 'x', new Uint8Array([1])); } catch (e) { code = e.code; }
        ok('mount resolved via root._mountForPath (ro → EREADONLY)', code === 'EREADONLY');
    }

    // 10. onTreeChanged chains through root
    {
        const root = makeRoot(true);
        let fired = 0;
        const va = new VaultAccess(root, {});
        va.onTreeChanged = () => { fired++; };
        root.onTreeChanged();   // simulate root bubbling a change
        ok('onTreeChanged bubbles from root through facade', fired === 1);
    }

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
