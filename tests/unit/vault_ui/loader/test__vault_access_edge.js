/* Edge-case tests — VaultAccess (path routing, prefix boundaries, error propagation)
   Run: node tests/unit/vault_ui/loader/test__vault_access_edge.js

   Complements test__vault_access.js with adversarial paths and boundary conditions. No mocks
   beyond a recording root + recording relay (the real VaultAccess logic is exercised). */

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
async function throwsCode(fn, code) { try { await fn(); return false; } catch (e) { return e && e.code === code; } }

function makeRoot(writable) {
    const calls = [];
    return {
        writable, _accessKey: writable ? 'k' : null, _vault: { id: 'root' }, onTreeChanged: null, calls,
        getTree()              { return { name: '', children: {}, files: [] }; },
        getFileList()          { return []; },
        async loadAllSubTrees(){ },
        async getFileBytes(p)  { calls.push(['read-root', p]); return new Uint8Array([1]); },
        async loadFolder(p)    { calls.push(['loadFolder-root', p]); },
        async saveFile(f, n, b){ calls.push(['save-root', f, n]); return { ok: true, root: true }; },
        async deleteFile(f, n) { calls.push(['del-root', f, n]); return { ok: true }; },
        async createFolder(p)  { calls.push(['mkdir-root', p]); },
        async deleteFolder(p)  { calls.push(['rmdir-root', p]); },
        async renameFile(f,o,n){ calls.push(['rename-root', f, o, n]); },
        async renameFolder(o,n){ calls.push(['renameFolder-root', o, n]); },
        async moveFile(a, b)   { calls.push(['move-root', a, b]); },
        async moveFolder(a, b) { calls.push(['moveFolder-root', a, b]); }
    };
}
function makeRelay(behaviour) {
    const calls = [];
    return { calls, async relay(op, args) { calls.push([op, args]); if (behaviour) return behaviour(op, args); return { ok: true, relayed: true, op, path: args.path }; } };
}

console.log('\n[suite] VaultAccess — edge cases');

(async () => {
    // ── prefix boundary: a mount must NOT match a sibling sharing a name fragment ──
    {
        const mounts = () => [{ mountPath: 'mounts/a', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        // 'mounts/about/x' shares the 'mounts/a' fragment but is NOT under 'mounts/a/'
        await va.saveFile('mounts/about', 'x.txt', new Uint8Array([1]));
        ok('sibling sharing a name fragment routes to ROOT (not the mount)', root.calls.some(c => c[0] === 'save-root'));
        ok('sibling did NOT hit the relay', relay.calls.length === 0);
        // the mount path ITSELF matches
        await va.saveFile('mounts/a', 'y.txt', new Uint8Array([1]));
        ok('exact mountPath + child writes via relay', relay.calls.some(c => c[0] === 'write' && c[1].path === 'mounts/a/y.txt'));
    }

    // ── longest-prefix wins for nested mounts ──
    {
        const mounts = () => [
            { mountPath: 'm/a',     access: 'ro' },
            { mountPath: 'm/a/deep', access: 'rw' }
        ];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        // a path inside the deeper rw mount must use the rw (longest) match → relay, not EREADONLY
        await va.saveFile('m/a/deep/here', 'f', new Uint8Array([1]));
        ok('nested: longest-prefix rw mount wins over shorter ro ancestor', relay.calls.some(c => c[0] === 'write' && c[1].path === 'm/a/deep/here/f'));
        // a path only in the shorter ro mount is still read-only
        ok('shorter ro mount still ro for its own paths', await throwsCode(() => va.saveFile('m/a/shallow', 'f', new Uint8Array([1])), 'EREADONLY'));
        // longest-match also drives writableAt
        ok('writableAt picks the rw nested mount', va.writableAt('m/a/deep/x') === true);
        ok('writableAt picks the ro shallow mount', va.writableAt('m/a/x') === false);
    }

    // ── leading-slash / normalization invariance ──
    {
        const mounts = () => [{ mountPath: '/mounts/rw/', access: 'rw' }];   // mount table with slashes
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('/mounts/rw/data', 'a', new Uint8Array([1]));      // leading slash on path
        ok('leading/trailing slashes normalized on both mount + path', relay.calls.some(c => c[0] === 'write' && c[1].path === 'mounts/rw/data/a'));
        await va.getFileBytes('/mounts/rw/data/a');
        ok('read path normalized too', relay.calls.some(c => c[0] === 'read' && c[1].path === 'mounts/rw/data/a'));
    }

    // ── empty / root-level mountPath is ignored (never swallows the whole tree) ──
    {
        const mounts = () => [{ mountPath: '', access: 'rw' }, { mountPath: '/', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('anything', 'a', new Uint8Array([1]));
        ok('empty-string mountPath ignored → root write', root.calls.some(c => c[0] === 'save-root'));
        ok('empty-string mountPath did not relay', relay.calls.length === 0);
    }

    // ── malformed mount entries are skipped, not fatal ──
    {
        const mounts = () => [null, undefined, {}, { access: 'rw' }, { mountPath: 'mounts/ok', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('mounts/ok', 'a', new Uint8Array([1]));
        ok('malformed mount entries skipped; valid one still matched', relay.calls.some(c => c[0] === 'write' && c[1].path === 'mounts/ok/a'));
    }

    // ── mounts() throwing does not break routing (treated as no mounts) ──
    {
        const mounts = () => { throw new Error('mount table unavailable'); };
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('x', 'a', new Uint8Array([1]));
        ok('mounts() throwing → falls back to root write (no crash)', root.calls.some(c => c[0] === 'save-root'));
    }

    // ── relay errors PROPAGATE (a failed cross-vault write must not look like success) ──
    {
        const mounts = () => [{ mountPath: 'mounts/rw', access: 'rw' }];
        const root = makeRoot(true);
        const relay = makeRelay((op) => { const e = new Error('push failed'); e.code = 'EUNREACH'; throw e; });
        const va = new VaultAccess(root, { relay, mounts });
        ok('relay write failure propagates (EUNREACH, not silent ok)', await throwsCode(() => va.saveFile('mounts/rw', 'a', new Uint8Array([1])), 'EUNREACH'));
        ok('relay read failure propagates', await throwsCode(() => va.getFileBytes('mounts/rw/a'), 'EUNREACH'));
    }

    // ── relay 'read' result shapes are coerced to bytes ──
    {
        const mounts = () => [{ mountPath: 'mounts/rw', access: 'rw' }];
        const root = makeRoot(true);
        // relay returns an ArrayBuffer
        const relayAB = makeRelay(() => new Uint8Array([5, 6, 7]).buffer);
        let va = new VaultAccess(root, { relay: relayAB, mounts });
        let r = await va.getFileBytes('mounts/rw/a');
        ok('relay read ArrayBuffer → Uint8Array', r instanceof Uint8Array && r.length === 3 && r[0] === 5);
        // relay returns { data: Uint8Array }
        const relayWrapped = makeRelay(() => ({ data: new Uint8Array([9]) }));
        va = new VaultAccess(root, { relay: relayWrapped, mounts });
        r = await va.getFileBytes('mounts/rw/a');
        ok('relay read { data } unwrapped → Uint8Array', r instanceof Uint8Array && r[0] === 9);
        // relay returns a bare Uint8Array
        const relayBare = makeRelay(() => new Uint8Array([3]));
        va = new VaultAccess(root, { relay: relayBare, mounts });
        r = await va.getFileBytes('mounts/rw/a');
        ok('relay read bare Uint8Array passes through', r instanceof Uint8Array && r[0] === 3);
    }

    // ── deleteFolder / createFolder route to relay rmdir/mkdir for rw mounts ──
    {
        const mounts = () => [{ mountPath: 'mounts/rw', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.deleteFolder('mounts/rw/sub');
        ok('rw mount deleteFolder → relay rmdir', relay.calls.some(c => c[0] === 'rmdir' && c[1].path === 'mounts/rw/sub'));
        await va.createFolder('mounts/rw/sub2');
        ok('rw mount createFolder → relay mkdir', relay.calls.some(c => c[0] === 'mkdir' && c[1].path === 'mounts/rw/sub2'));
    }

    // ── rename within the same rw mount → relay; rename across boundary → ECROSSMOUNT ──
    {
        const mounts = () => [{ mountPath: 'mounts/rw', access: 'rw' }, { mountPath: 'mounts/rw2', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.renameFolder('mounts/rw/a', 'mounts/rw/b');
        ok('same rw-mount renameFolder → relay rename', relay.calls.some(c => c[0] === 'rename' && c[1].path === 'mounts/rw/a' && c[1].to === 'mounts/rw/b'));
        ok('renameFolder across two rw mounts → ECROSSMOUNT', await throwsCode(() => va.renameFolder('mounts/rw/a', 'mounts/rw2/a'), 'ECROSSMOUNT'));
        ok('moveFolder across rw mount → root → ECROSSMOUNT', await throwsCode(() => va.moveFolder('mounts/rw/a', 'plain/a'), 'ECROSSMOUNT'));
    }

    // ── read-only root: root-domain move refused via EREADONLY (root gate) ──
    {
        const root = makeRoot(false), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts: () => [] });
        ok('move within read-only root → EREADONLY', await throwsCode(() => va.moveFile('a', 'b'), 'EREADONLY'));
    }

    // ── _join edge cases via saveFile (folder '/', empty folder, nested name) ──
    {
        const mounts = () => [{ mountPath: 'mounts/rw', access: 'rw' }];
        const root = makeRoot(true), relay = makeRelay();
        const va = new VaultAccess(root, { relay, mounts });
        await va.saveFile('/', 'top.txt', new Uint8Array([1]));
        ok("saveFile at root folder '/' → root (path 'top.txt')", root.calls.some(c => c[0] === 'save-root'));
        await va.saveFile('mounts/rw/', 'x', new Uint8Array([1]));   // trailing slash on folder
        ok('saveFile with trailing-slash folder under rw mount → relay write mounts/rw/x', relay.calls.some(c => c[0] === 'write' && c[1].path === 'mounts/rw/x'));
    }

    // ── no mounts fn AND no root._mountForPath → everything is root ──
    {
        const root = makeRoot(true); delete root._mountForPath;
        const va = new VaultAccess(root, {});
        await va.saveFile('anything/at/all', 'a', new Uint8Array([1]));
        ok('no mount resolver at all → pure root passthrough', root.calls.some(c => c[0] === 'save-root'));
        ok('writableAt with no resolver follows root.writable', va.writableAt('x') === true);
    }

    console.log('  ' + pass + ' pass, ' + fail + ' fail\n');
    process.exit(fail === 0 ? 0 : 1);
})();
