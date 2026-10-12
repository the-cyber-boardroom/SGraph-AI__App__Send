/* P0–P3 hardening of the sg.llm.* capability.
   Run: node tests/unit/vault_ui/loader/test__llm_hardening.js

   Each suite pins one finding from
   team/roles/architect/reviews/08/13/v0.33.47__architect-review__sg-llm-as-built-and-next-steps.md
   F1 egress CSP · F2 consent floors · F3 per-app budget · F4 network grant · F5 tool scope */

import { readFileSync }     from 'node:fs';
import { runInThisContext } from 'node:vm';
import { JSDOM }            from 'jsdom';

const V  = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/';
const rd = (f) => readFileSync(V + f, 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

// ── F2: consent floors (pure statics on AppShell) ────────────────────────────────
const { window } = new JSDOM('<!doctype html><html><body></body></html>');
global.window = window; global.document = window.document;
global.HTMLElement = window.HTMLElement; global.customElements = window.customElements;
global.CustomEvent = window.CustomEvent; global.URL = window.URL;
for (const f of ['components/app-shell/sg-embed-helpers.js', 'components/app-shell/app-permissions.js']) {
    new Function(rd(f)).call(window);
}
global.SgEmbed = window.SgEmbed = globalThis.SgEmbed;
const AppPermissions = global.AppPermissions = window.AppPermissions = globalThis.AppPermissions;
new Function(rd('components/app-shell/app-shell.js')).call(window);
const AppShell = window.customElements.get('app-shell');

console.log('\n[suite] F2 — app.json may only STRENGTHEN consent, never weaken it');
{
    const S = AppShell.strictestConsent;
    ok('always beats once',  S('once', 'always') === 'always');
    ok('always beats auto',  S('auto', 'always') === 'always');
    ok('once beats auto',    S('auto', 'once')   === 'once');
    ok('equal returns same', S('once', 'once')   === 'once');
    ok('a stricter manifest value is kept', S('always', 'once') === 'always');
    ok('malformed manifest value falls back to once', S('nonsense', 'once') === 'once');

    const F = AppShell.CONSENT_FLOOR;
    ok('llm.chat has a floor of once (auto impossible)', F['llm.chat'] === 'once');
    ok('llm.listen has a floor of always (microphone never cached)', F['llm.listen'] === 'always');

    // The actual inversion: an app declaring "auto" for a spending verb.
    ok('llm.chat: manifest auto is clamped to once', S('auto', F['llm.chat']) === 'once');
    ok('llm.listen: manifest auto is clamped to always', S('auto', F['llm.listen']) === 'always');
    ok('llm.listen: even "once" is raised to always', S('once', F['llm.listen']) === 'always');
    ok('verbs with no floor are unaffected (legacy behaviour kept)', F['vfs.write'] === undefined);
}

// ── F1/F4: CSP in the injected bridge ────────────────────────────────────────────
console.log('\n[suite] F1/F4 — frame egress is contained by default, opened only by permissions.network');
{
    const makeShell = (perm) => {
        const el = document.createElement('app-shell');
        el._writable = true; el._perm = perm;
        el._vault = { name: 'V', _vaultId: 'vid' };
        el._dataSource = { getFileList: () => [], writable: true };
        el._htmlDir = ''; el._appId = '';
        return el;
    };

    const dflt = makeShell(AppPermissions.parsePermissions(null))._buildVfsBridgeScript('index.html');
    ok('default: a CSP meta is emitted', /<meta http-equiv="Content-Security-Policy"/.test(dflt));
    ok('default: connect-src is locked to blob:/data:', /content="connect-src blob: data:"/.test(dflt));
    ok('CSP precedes the bridge script (governs the whole document)',
        dflt.indexOf('<meta http-equiv') < dflt.indexOf('<script>'));
    ok('no network host is reachable', !/connect-src[^"]*https?:/.test(dflt));
    // 'none' would break the print RPC, which fetches blob: URLs to inline images.
    ok("connect-src is NOT 'none' (print inlines blob: URLs)", !/connect-src 'none'/.test(dflt));

    const opened = makeShell(AppPermissions.parsePermissions({ permissions: { network: true } }))
                       ._buildVfsBridgeScript('index.html');
    ok('permissions.network omits the CSP (the escape hatch is real)',
        !/Content-Security-Policy/.test(opened));
    ok('…and the bridge itself still builds', /window\.sg\s*=\s*\{/.test(opened));

    ok('network grant parses', AppPermissions.parsePermissions({ permissions: { network: true } }).network === true);
    ok('network defaults to deny', AppPermissions.parsePermissions(null).network === false);
    ok('non-boolean network stays deny',
        AppPermissions.parsePermissions({ permissions: { network: 'yes' } }).network === false);
}

// ── F3: per-app budget attribution ───────────────────────────────────────────────
console.log('\n[suite] F3 — spend is attributed per app, so per-app caps are enforceable');
{
    runInThisContext(rd('lib/sg-llm/vault-llm-log.js'));
    const Log = globalThis.VaultLlmLog;
    Log.clear();
    Log.add({ model: 'm', status: 'ok', cost: 1.00, estimated: false, app: null });        // host chat
    Log.add({ model: 'm', status: 'ok', cost: 0.10, estimated: false, app: 'appA' });
    Log.add({ model: 'm', status: 'ok', cost: 0.02, estimated: false, app: 'appB' });

    ok('unfiltered totals cover the whole session (the display figure)',
        Math.abs(Log.totals().totalCost - 1.12) < 1e-9);
    ok('appA is billed only for its own call',
        Math.abs(Log.totals('appA').totalCost - 0.10) < 1e-9);
    ok('appB is billed only for its own call',
        Math.abs(Log.totals('appB').totalCost - 0.02) < 1e-9);
    ok('the host chat total excludes app spend',
        Math.abs(Log.totals(null).totalCost - 1.00) < 1e-9);
    ok('per-app call counts are independent', Log.totals('appA').calls === 1 && Log.totals('appB').calls === 1);

    // The bug this replaces: a $1 host-chat spend tripping a $0.50 app cap.
    const cap = 0.50;
    ok('an app is NOT blocked by the owner\'s own chat spend', Log.totals('appA').totalCost < cap);
    ok('…while the session total would have blocked it', Log.totals().totalCost > cap);
    ok('an unknown app starts at zero', Log.totals('never-ran').calls === 0);
    ok('entries record their app', Log.list().filter((e) => e.app === 'appA').length === 1);
    ok('host entries record app:null', Log.list().filter((e) => e.app === null).length === 1);
    Log.clear();
}

// ── F5: tool scope must be explicit ──────────────────────────────────────────────
console.log('\n[suite] F5 — an empty allow-list grants NOTHING (was: the whole vault)');
{
    runInThisContext(rd('lib/sg-llm/sg-llm-tools.js'));
    const T = globalThis.SGLlmTools;
    const grants = (allow) => T.parseGrants({ 'files.read': { enabled: true, allow: allow } });

    const unscoped = grants([]);
    ok('enabled + no allow → refused', T.pathAllowed(unscoped, 'files.read', 'docs/a.md').ok === false);
    ok('…with ENOSCOPE, distinct from a path miss',
        T.pathAllowed(unscoped, 'files.read', 'docs/a.md').code === 'ENOSCOPE');
    ok('…and the reason tells the admin what to do',
        /allow list/i.test(T.pathAllowed(unscoped, 'files.read', 'docs/a.md').reason));

    const scoped = grants(['docs/**']);
    ok('in-scope path is allowed', T.pathAllowed(scoped, 'files.read', 'docs/a.md').ok === true);
    ok('out-of-scope path is ESCOPE (not ENOSCOPE)',
        T.pathAllowed(scoped, 'files.read', 'secrets/x.md').code === 'ESCOPE');
    ok('the floor still wins over any allow-list',
        T.pathAllowed(grants(['**']), 'files.read', '.vault/llm/config.json').code === 'EPROTECTED');
    ok('traversal cannot escape the floor',
        T.pathAllowed(grants(['**']), 'files.read', 'docs/../.vault/llm/tools.json').code === 'EPROTECTED');
    ok('a disabled group reports EOFF before scope',
        T.pathAllowed(T.parseGrants({ 'files.read': { enabled: false, allow: ['**'] } }),
                      'files.read', 'docs/a.md').code === 'EOFF');
    ok('the session group is not path-scoped (no ENOSCOPE)',
        T.pathAllowed(T.parseGrants({ session: { enabled: true } }), 'session', '').ok === true);
    ok('the model is told when a group has no usable scope',
        / no paths configured/.test(T.compileTools(unscoped).map((t) => JSON.stringify(t)).join(' ')));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
