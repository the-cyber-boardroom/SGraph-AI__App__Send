/* SGReleases — the release-resolution rules.
   Run: node tests/unit/vault_ui/loader/test__sg_releases.js

   The rules that carry the feature, and that are easy to get quietly wrong:
     - a URL pin beats everything (a shared link must show the same thing everywhere);
     - a stored pin only exists if the user EXPLICITLY chose, so an unpinned vault
       reloads to the latest version;
     - `default` binds other viewers but NOT the owner (otherwise "why aren't my pushes
       showing up?" becomes permanent);
     - a pin naming a release that no longer exists resolves to live WITH an error —
       never a silent substitution, which is the exact failure this feature prevents. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const SRC = fileURLToPath(new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-releases/sg-releases.js',
    import.meta.url));
runInThisContext(readFileSync(SRC, 'utf8'), { filename: 'sg-releases.js', displayErrors: true });
const R = globalThis.SGReleases;

let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (info ? ' — ' + info : '')); } };

const CFG = R.parse({
    schema: 'sg-releases/v1',
    'default': 'v1.1',
    releases: [
        { name: 'v1.2', commit: 'c12', label: 'Black Hat demo' },
        { name: 'v1.1', commit: 'c11' },
        { name: 'Old Pilot', commit: 'c10', label: 'first client' }
    ]
});

console.log('\n[suite] parse — junk collapses, it never throws');
{
    ok('a valid config keeps its releases', CFG.releases.length === 3);
    ok('allowLive defaults to true', CFG.allowLive === true);
    ok('allowLive:false is honoured', R.parse({ allowLive: false, releases: [] }).allowLive === false);
    ok('null → no releases', R.parse(null).releases.length === 0);
    ok('garbage → no releases', R.parse('nonsense').releases.length === 0);
    ok('entries without a commit are dropped', R.parse({ releases: [{ name: 'x' }] }).releases.length === 0);
    ok('entries without a name are dropped', R.parse({ releases: [{ commit: 'c' }] }).releases.length === 0);
    ok('duplicate names collapse to the first',
        R.parse({ releases: [{ name: 'v1', commit: 'a' }, { name: 'V1', commit: 'b' }] }).releases.length === 1);
    ok('hasReleases is false for an empty config', R.hasReleases(R.parse({})) === false);
    ok('array ORDER is preserved (it is the display order)',
        CFG.releases[0].name === 'v1.2' && CFG.releases[2].name === 'Old Pilot');
}

console.log('\n[suite] names — free text AND semver-ish, both addressable');
{
    ok('an exact semver-ish name resolves', R.find(CFG, 'v1.2').commit === 'c12');
    ok('name matching is case-insensitive', R.find(CFG, 'V1.2').commit === 'c12');
    ok('a free-text name resolves', R.find(CFG, 'Old Pilot').commit === 'c10');
    ok('its slug resolves too (URL form)', R.find(CFG, 'old-pilot').commit === 'c10');
    ok('slug() makes a URL-safe token', R.slug('Black Hat demo!') === 'black-hat-demo');
    ok('slug() of a semver-ish name is stable', R.slug('v1.2') === 'v1-2');
    ok('a semver name is reachable by its slug', R.find(CFG, 'v1-2').commit === 'c12');
    ok('an unknown name is null', R.find(CFG, 'nope') === null);
    ok('uniqueness can be checked before writing', R.isDuplicateName(CFG, 'V1.1') === true);
}

console.log('\n[suite] resolve — precedence: url > stored > default > live');
{
    const r1 = R.resolve({ config: CFG, isOwner: false });
    ok('no pins, other viewer → the default', r1.name === 'v1.1' && r1.source === 'default');
    ok('…and it is not live', r1.live === false);
    ok('…carrying the commit to mount', r1.commit === 'c11');

    const r2 = R.resolve({ config: CFG, isOwner: true });
    ok('OWNER ignores the default', r2.live === true, 'got ' + r2.name);
    ok('…so their own pushes are what they see', r2.source === 'live');

    const r3 = R.resolve({ config: CFG, isOwner: false, storedPin: 'v1.2' });
    ok('an explicit stored choice beats the default', r3.name === 'v1.2' && r3.source === 'stored');

    const r4 = R.resolve({ config: CFG, isOwner: true, storedPin: 'Old Pilot' });
    ok('a stored choice applies to the owner too', r4.name === 'Old Pilot' && r4.source === 'stored');

    const r5 = R.resolve({ config: CFG, isOwner: false, storedPin: 'v1.2', urlPin: 'v1.1' });
    ok('the URL beats a stored choice', r5.name === 'v1.1' && r5.source === 'url');

    const r6 = R.resolve({ config: CFG, isOwner: true, urlPin: 'old-pilot' });
    ok('a URL pin binds the owner too', r6.name === 'Old Pilot' && r6.source === 'url');
    ok('…because a shared link must be identical for everyone', r6.commit === 'c10');
}

console.log('\n[suite] resolve — "live" is a first-class explicit choice');
{
    ok('storedPin:"live" pins to live, overriding the default',
        R.resolve({ config: CFG, isOwner: false, storedPin: 'live' }).live === true);
    ok('urlPin:"live" does too',
        R.resolve({ config: CFG, isOwner: false, urlPin: 'live' }).live === true);
    ok('…and is reported as an explicit source',
        R.resolve({ config: CFG, isOwner: false, urlPin: 'live' }).source === 'url');
}

console.log('\n[suite] resolve — missing releases fail VISIBLY, never silently');
{
    const bad = R.resolve({ config: CFG, isOwner: false, urlPin: 'v9.9' });
    ok('an unknown URL pin falls back to live', bad.live === true);
    ok('…and reports an error', !!bad.error);
    ok('…naming the release that was asked for', /v9\.9/.test(bad.error));

    // A stored choice that was later unpublished is stale, not a shout-worthy error:
    // fall through to the normal order rather than nagging on every open.
    const stale = R.resolve({ config: CFG, isOwner: false, storedPin: 'gone' });
    ok('a stale stored pin falls through to the default', stale.name === 'v1.1');
    ok('…without raising an error', !stale.error);
}

console.log('\n[suite] resolve — a vault with no releases behaves exactly as today');
{
    const none = R.parse({});
    const r = R.resolve({ config: none, isOwner: false, urlPin: 'v1.2', storedPin: 'v1.1' });
    ok('no releases → live', r.live === true);
    ok('…even with pins present', r.source === 'live');
    ok('…and no error noise', !r.error);
    ok('null config → live', R.resolve({ config: null }).live === true);
    ok('empty opts → live', R.resolve({}).live === true);
}

console.log('\n[suite] serialize — round-trips what matters');
{
    const s = R.serialize(CFG);
    ok('schema is stamped', s.schema === 'sg-releases/v1');
    ok('default survives', s['default'] === 'v1.1');
    ok('releases survive in order', s.releases.length === 3 && s.releases[0].name === 'v1.2');
    ok('re-parsing is stable', R.parse(s).releases.length === 3);
    ok('a config with no default omits the key', !('default' in R.serialize({ releases: [{ name: 'a', commit: 'b' }] })));
}

console.log('\n' + (fail === 0 ? '✓' : '✗') + ' ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
