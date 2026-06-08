/* Unit tests — VaultSubvaultsView (/vault debug "Sub-vaults" pane view-model)
   Run: node tests/unit/vault_ui/loader/test__vault_subvaults_view.js

   Shapes the CompositeDataSource._mounts value set (read-through *.link.json sub-vaults)
   into display rows for the vault-shell debug pane. No mocks — feeds the exact mount
   shapes composite-data-source.js produces. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/_common/js/components/vault-subvaults-panel/';
{
    const p = new URL(ROOT + 'vault-subvaults-view.js', import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: 'vault-subvaults-view.js', displayErrors: true });
}
const V = globalThis.VaultSubvaultsView;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

function fixture() {
    return [
        { linkPath: 'subvaults/patient-sam.link.json', mountPath: 'subvaults/patient-sam', nodeName: 'patient-sam',
          status: 'mounted', access: 'ro',
          child: { getFileList: () => [ { path: 'data/a.json', dir: false }, { path: 'data', dir: true }, { path: 'b.md', dir: false } ] } },
        { linkPath: 'subvaults/patient-alex.link.json', mountPath: 'subvaults/patient-alex', nodeName: 'patient-alex',
          status: 'collapsed', access: 'ro', child: null },
        { linkPath: 'subvaults/locked.link.json', mountPath: 'subvaults/locked', nodeName: 'locked',
          status: 'locked', access: 'ro', child: null },
        { linkPath: 'subvaults/broken.link.json', mountPath: 'subvaults/broken', nodeName: 'broken',
          status: 'error', access: 'rw', child: null, error: new Error('bad key') }
    ];
}

console.log('\n[suite] VaultSubvaultsView — rows');
{
    const r = V.rows(fixture());
    ok('one row per mount', r.length === 4);
    ok('sorted by mountPath', r[0].mountPath === 'subvaults/broken' && r[3].mountPath === 'subvaults/patient-sam');
    const sam = r.find(x => x.nodeName === 'patient-sam');
    ok('mounted → status label "open"', sam.statusLabel === 'open' && sam.statusClass === 'ok');
    ok('mounted child file count (dirs excluded)', sam.fileCount === 2);
    const alex = r.find(x => x.nodeName === 'patient-alex');
    ok('collapsed → "not opened" + pending + null fileCount', alex.statusLabel === 'not opened' && alex.statusClass === 'pending' && alex.fileCount === null);
    const locked = r.find(x => x.nodeName === 'locked');
    ok('locked → err class', locked.statusClass === 'err' && locked.statusLabel === 'locked');
    const broken = r.find(x => x.nodeName === 'broken');
    ok('error surfaces message', broken.error === 'bad key' && broken.statusClass === 'err');
    ok('access label ro→read-only', alex.accessLabel === 'read-only');
    ok('access label rw→read-write', broken.accessLabel === 'read-write');
}

console.log('\n[suite] VaultSubvaultsView — summary');
{
    const s = V.summary(fixture());
    ok('total', s.total === 4);
    ok('open', s.open === 1);
    ok('collapsed', s.collapsed === 1);
    ok('locked', s.locked === 1);
    ok('errors', s.errors === 1);
}

console.log('\n[suite] VaultSubvaultsView — empty / guards');
{
    ok('empty → empty rows', V.rows([]).length === 0 && V.rows().length === 0);
    const b = V.build();
    ok('build(undefined) safe', b.rows.length === 0 && b.summary.total === 0);
    // missing fields fall back gracefully
    const r = V.rows([{ mountPath: 'm/x' }]);
    ok('nodeName falls back to last mountPath segment', r[0].nodeName === 'x');
    ok('status defaults to collapsed', r[0].status === 'collapsed' && r[0].statusLabel === 'not opened');
}

console.log('\n[suite] VaultSubvaultsView — chip (in-tree badge, §3.3)');
{
    const m = V.chip('mounted', 'ro');
    ok('mounted → ● connected, ok', m.symbol === '●' && m.state === 'connected' && m.cls === 'ok' && m.access === 'ro');
    const c = V.chip('collapsed', 'ro');
    ok('collapsed → ○ no state, pending', c.symbol === '○' && c.state === '' && c.cls === 'pending');
    const l = V.chip('locked', 'ro');
    ok('locked → 🔒 err, no access shown', l.cls === 'err' && l.state === 'locked' && l.access === '');
    const e = V.chip('error', 'rw');
    ok('error → ⚠ err', e.cls === 'err' && e.state === 'error');
    ok('defaults: chip(undefined) → collapsed/pending', V.chip().cls === 'pending' && V.chip().symbol === '○');
    ok('chipText composes symbol+access+state', V.chipText('mounted', 'ro') === '● ro · connected');
    ok('chipText locked omits empty access', V.chipText('locked', 'ro') === '🔒 · locked');
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail');
if (fail) process.exitCode = 1;
