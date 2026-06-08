/* Unit tests — SgReplCore (thin SG-API REPL parse + format, ViV pack §3.4)
   Run: node tests/unit/vault_ui/loader/test__sg_repl_core.js */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/app-shell/';
{
    const p = new URL(ROOT + 'sg-repl-core.js', import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'sg-repl-core.js', displayErrors: true });
}
const R = globalThis.SgReplCore;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

console.log('\n[suite] SgReplCore — parse');
{
    ok('empty line → {empty}', R.parse('   ').empty === true);
    ok('vfs.list with path', (() => { const p = R.parse('vfs.list data/'); return p.cmd === 'vfs.list' && p.args[0] === 'data/'; })());
    ok('ls alias → vfs.list', R.parse('ls').cmd === 'vfs.list');
    ok('cat alias → vfs.read', R.parse('cat a.txt').cmd === 'vfs.read');
    ok('rm alias → vfs.delete', R.parse('rm a.txt').cmd === 'vfs.delete');
    ok('log alias → broker.log', R.parse('log').cmd === 'broker.log');
    ok('? alias → help', R.parse('?').cmd === 'help');
    ok('case-insensitive command', R.parse('VFS.LIST').cmd === 'vfs.list');
    ok('mounts (no args)', R.parse('mounts').cmd === 'mounts' && R.parse('mounts').args.length === 0);

    const w = R.parse('vfs.write data/x.json {"a":1, "b":2}');
    ok('write splits path + verbatim text (spaces preserved)', w.cmd === 'vfs.write' && w.args[0] === 'data/x.json' && w.args[1] === '{"a":1, "b":2}');

    ok('read without path → error', !!R.parse('cat').error);
    ok('write without path → error', !!R.parse('write').error);
    ok('delete without path → error', !!R.parse('rm').error);
    ok('unknown command → error', /unknown command/.test(R.parse('sudo rm -rf /').error || ''));
}

console.log('\n[suite] SgReplCore — normPath');
{
    ok('strips leading slash', R.normPath('/data/x') === 'data/x');
    ok('collapses trailing slash', R.normPath('data/') === 'data');
    ok('root stays', R.normPath('/') === '');
}

console.log('\n[suite] SgReplCore — formatList');
{
    const entries = [
        { path: 'roster.json', dir: false, size: 1536 },
        { path: 'data/reviews.json', dir: false, size: 3174 },
        { path: 'data/baseline.json', dir: false, size: 1843 },
        { path: 'links/patient-acme.link.json', dir: false, size: 200 }
    ];
    const root = R.formatList(entries, '');
    ok('root lists dirs first then files', root.split('\n')[0].endsWith('/'));
    ok('root shows folders data/ and links/', /data\//.test(root) && /links\//.test(root));
    ok('root shows roster.json with size', /roster\.json\s+1\.5 KB/.test(root));
    ok('no duplicate dir rows', (root.match(/data\//g) || []).length === 1);

    const sub = R.formatList(entries, 'data/');
    ok('subfolder lists only its children', /reviews\.json/.test(sub) && /baseline\.json/.test(sub) && !/roster/.test(sub));
    ok('empty folder message', /\(empty/.test(R.formatList(entries, 'nope/')));
}

console.log('\n[suite] SgReplCore — formatMounts / formatLog');
{
    ok('no mounts message', /no kernel mounts/.test(R.formatMounts([])));
    const m = R.formatMounts([{ mountId: 'm-acme', ref: 'acme', prefix: 'mounts/acme', label: 'Acme Clinic', isolation: 'isolated', custody: 'parent-held' }]);
    ok('mount row shows label + custody + prefix', /Acme Clinic/.test(m) && /parent-held/.test(m) && /mounts\/acme/.test(m));

    ok('empty log message', /broker log empty/.test(R.formatLog([])));
    const l = R.formatLog([{ op: 'write', path: 'mounts/acme/data/reviews.json', decision: 'ask', result: 'ok' }]);
    ok('log row shows op/path/result', /write/.test(l) && /reviews\.json/.test(l) && /ok/.test(l));
}

console.log('\n[suite] SgReplCore — help');
{
    const h = R.help();
    ok('help lists the core commands', /vfs\.list/.test(h) && /vfs\.write/.test(h) && /mounts/.test(h) && /broker\.log/.test(h));
    ok('help states it is not a shell', /not a shell/.test(h));
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail');
if (fail) process.exitCode = 1;
