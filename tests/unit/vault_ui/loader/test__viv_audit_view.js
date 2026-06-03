/* Unit tests — VivAuditView (ViV Phase 5.1, cross-kernel audit aggregation)
   Run: node tests/unit/vault_ui/loader/test__viv_audit_view.js

   VivAuditView aggregates the mount tables + broker logs of multiple kernels into one
   operator view, honouring monitoring consent: only 'top' and 'opt-in' sources expose
   a log; 'closed'/'unreachable' sources contribute mount rows + an explicit placeholder
   but NO log entries. Built on VivMountsView. No mocks — feeds the exact shapes
   KernelParent.list() / KernelBroker.log() / monitorChild() emit. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const ROOT = '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/';
function load(file) {
    const p = new URL(ROOT + file, import.meta.url);
    runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: file, displayErrors: true });
}
load('viv-mounts-view.js');   // sibling dependency
load('viv-audit-view.js');
const A = globalThis.VivAuditView;

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } }

// Two kernels: the top (own log) + one direct child that opted in, plus a child that
// declined monitoring and a child whose channel is down.
function fixture() {
    return [
        {
            kernelId: 'k-top', label: 'Top vault', monitor: 'top',
            mounts: [{ mountId: 'm-acme', ref: 'acme', prefix: 'mounts/acme/', label: 'Acme', custody: 'child-generated' }],
            entries: [
                { ts: 100, edge: 'k-top▶m-acme', mountId: 'm-acme', op: 'read',   path: 'a.md',      credentialClass: 'standing',      policy: 'auto', decision: 'allow', result: 'ok' },
                { ts: 300, edge: 'k-top▶m-acme', mountId: 'm-acme', op: 'delete', path: 'a.md',      credentialClass: 'perRequest-rw', policy: 'ask',  decision: 'deny',  result: 'ECONSENT' }
            ]
        },
        {
            kernelId: 'k-acme', label: 'Acme (opted in)', monitor: 'opt-in',
            mounts: [{ mountId: 'm-sub', ref: 'sub', prefix: 'mounts/sub/' }],
            entries: [
                { ts: 200, edge: 'k-acme▶m-sub', mountId: 'm-sub', op: 'write', path: 'x.json', credentialClass: 'perRequest-rw', policy: 'auto', decision: 'allow', result: 'ok' }
            ]
        },
        {
            kernelId: 'k-closed', label: 'Private child', monitor: 'closed',
            mounts: [{ mountId: 'm-priv', ref: 'priv', prefix: 'mounts/priv/' }],
            entries: [{ ts: 999, op: 'read', decision: 'allow', result: 'ok' }]   // must be IGNORED (closed)
        },
        {
            kernelId: 'k-down', label: 'Detached child', monitor: 'unreachable',
            mounts: [], entries: null
        }
    ];
}

console.log('\n[suite] VivAuditView — sourceRows (consent visibility)');
{
    const rows = A.sourceRows(fixture());
    ok('one row per source', rows.length === 4);
    ok('top source is available', rows[0].available === true && rows[0].placeholder === null);
    ok('opt-in source is available', rows[1].available === true && rows[1].placeholder === null);
    ok('closed source NOT available + placeholder', rows[2].available === false && /monitoring closed/.test(rows[2].placeholder));
    ok('closed source entryCount is 0 (its entries are hidden)', rows[2].entryCount === 0);
    ok('unreachable source has unreachable placeholder', /unreachable/.test(rows[3].placeholder));
    ok('mountCount surfaces per source', rows[0].mountCount === 1 && rows[3].mountCount === 0);
}

console.log('\n[suite] VivAuditView — allMounts (tagged by kernel)');
{
    const m = A.allMounts(fixture());
    ok('mounts from ALL sources incl. closed (mount table is parent-visible)', m.length === 3);
    ok('rows tagged with owning kernel', m[0].kernelId === 'k-top' && m[0].kernelLabel === 'Top vault');
    ok('closed child mount still listed', m.some(r => r.mountId === 'm-priv' && r.kernelId === 'k-closed'));
}

console.log('\n[suite] VivAuditView — allLog (consent-gated merge, newest-first)');
{
    const log = A.allLog(fixture());
    ok('only available sources contribute log rows (2+1=3)', log.length === 3);
    ok('closed source log entry is excluded', !log.some(r => r.ts === 999));
    ok('merged newest-first across kernels', log[0].ts === 300 && log[1].ts === 200 && log[2].ts === 100);
    ok('rows tagged with kernel', log.find(r => r.ts === 200).kernelId === 'k-acme');
}

console.log('\n[suite] VivAuditView — filterLog');
{
    const log = A.allLog(fixture());
    ok('filter by decision=deny', A.filterLog(log, { decision: 'deny' }).length === 1);
    ok('filter by op=write', A.filterLog(log, { op: 'write' }).length === 1);
    ok('filter by kernelId', A.filterLog(log, { kernelId: 'k-top' }).length === 2);
    ok('filter by result=ok', A.filterLog(log, { result: 'ok' }).length === 2);
    ok('combined criteria (kernel + op)', A.filterLog(log, { kernelId: 'k-top', op: 'read' }).length === 1);
    ok('empty criteria → all rows', A.filterLog(log, {}).length === 3);
}

console.log('\n[suite] VivAuditView — groupLog');
{
    const log = A.allLog(fixture());
    const byMount = A.groupLog(log, 'mount');
    ok('groups by mount', byMount.length === 2);
    ok('group buckets carry their rows', byMount.reduce((n, b) => n + b.rows.length, 0) === 3);
    const byDecision = A.groupLog(log, 'decision');
    ok('groups by decision (allow + deny)', byDecision.length === 2);
    let threw = false; try { A.groupLog(log, 'nope'); } catch (_) { threw = true; }
    ok('unknown dimension throws', threw);
}

console.log('\n[suite] VivAuditView — summary + facets');
{
    const agg = A.aggregate(fixture());
    ok('summary total over merged log', agg.summary.total === 3);
    ok('summary ok count', agg.summary.ok === 2);
    ok('summary denied count (deny/ECONSENT)', agg.summary.denied === 1);
    ok('summary kernel roll-up', agg.summary.kernels === 4 && agg.summary.available === 2 && agg.summary.closed === 1);
    const f = A.facets(agg.log);
    ok('facets enumerate ops', f.op.indexOf('read') !== -1 && f.op.indexOf('write') !== -1 && f.op.indexOf('delete') !== -1);
    ok('facets enumerate kernels', f.kernelId.indexOf('k-top') !== -1 && f.kernelId.indexOf('k-acme') !== -1);
    ok('facets exclude closed-kernel values', f.kernelId.indexOf('k-closed') === -1);
}

console.log('\n[suite] VivAuditView — empty / guards');
{
    const agg = A.aggregate([]);
    ok('empty sources → empty view', agg.sources.length === 0 && agg.mounts.length === 0 && agg.log.length === 0 && agg.summary.total === 0);
    ok('aggregate(undefined) is safe', A.aggregate().log.length === 0);
}

console.log('\n  ' + pass + ' pass, ' + fail + ' fail');
if (fail) process.exitCode = 1;
