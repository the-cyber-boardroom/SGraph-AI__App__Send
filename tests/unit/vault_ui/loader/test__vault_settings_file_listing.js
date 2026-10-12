/* Guards the SYNTHETIC .vault-settings.json listing in VaultDataSource — the file
   that names the vault lives in vault._settings (parsed OUT of the commit tree by
   sg-vault._loadTreeFromCommit), so without the synthetic entry it was invisible
   in the Files tree even though it defines the vault's title.

   Run: node tests/unit/vault_ui/loader/test__vault_settings_file_listing.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;                       // the module registers on window
const SRC = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/adapters/vault-data-source.js', import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'vault-data-source.js', displayErrors: true });
runInThisContext('globalThis.VaultDataSource = VaultDataSource;');
const { VaultDataSource } = globalThis;

function makeVault(extraRootChildren) {
    return {
        _settings: { vault_name: 'SGit.ai | Website', vault_id: 'abcd1234', version: 3 },
        _tree: { '/': { type: 'folder', children: Object.assign({
            'index.html': { type: 'file', size: 120 },
            'docs':       { type: 'folder', children: {} }
        }, extraRootChildren || {}) } },
        needsLoading: () => false,
        _findNode:    () => null
    };
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

console.log('\n[suite] VaultDataSource — .vault-settings.json is listed synthetically');
{
    const ds   = new VaultDataSource(makeVault(), 'token');
    const tree = ds.getTree();
    const vs   = tree.files.find(f => f.name === '.vault-settings.json');
    ok('getTree lists .vault-settings.json at root', !!vs);
    ok('synthetic entry carries the serialized size', vs && vs.size > 0);
    ok('regular files still listed',                  tree.files.some(f => f.name === 'index.html'));

    const list = ds.getFileList();
    const row  = list.filter(f => f.path === '.vault-settings.json');
    ok('getFileList lists it exactly once (non-dir)', row.length === 1 && row[0].dir === false);
}

console.log('\n[suite] VaultDataSource — no duplicate when a legacy REAL entry exists');
{
    const ds   = new VaultDataSource(makeVault({ '.vault-settings.json': { type: 'file', size: 90 } }), 'token');
    ok('getTree has exactly one entry',     ds.getTree().files.filter(f => f.name === '.vault-settings.json').length === 1);
    ok('getFileList has exactly one entry', ds.getFileList().filter(f => f.path === '.vault-settings.json').length === 1);
}

console.log('\n[suite] VaultDataSource — settings record cannot be deleted or renamed');
{
    const ds = new VaultDataSource(makeVault(), 'token');
    let msg = '';
    await ds.deleteFile('/', '.vault-settings.json').catch(e => { msg = e.message; });
    ok('delete refused with a descriptive error', /settings record/.test(msg));
    msg = '';
    await ds.renameFile('/', '.vault-settings.json', 'x.json').catch(e => { msg = e.message; });
    ok('rename refused with a descriptive error', /settings record/.test(msg));
}

console.log('\n[suite] VaultDataSource — getFileBytes serves the settings JSON');
{
    const ds    = new VaultDataSource(makeVault(), 'token');
    const bytes = await ds.getFileBytes('.vault-settings.json');
    const json  = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
    ok('served from vault._settings', json.vault_name === 'SGit.ai | Website');
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail\n');
process.exit(fail === 0 ? 0 : 1);
