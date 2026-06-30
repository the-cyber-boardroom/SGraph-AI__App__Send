/* Unit tests — AppPermissions (app-iframe permission model: floor + grants)
   Run: node tests/unit/vault_ui/loader/test__app_permissions.js
   No deps. Sources the browser global-scope module via runInThisContext (same pattern
   as test__vault_links.js). Pure logic — no DOM, no bridge. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-permissions.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'app-permissions.js', displayErrors: true });
const AP = globalThis.AppPermissions;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function eq(name, a, b) { ok(name, a === b); }

console.log('\n[suite] AppPermissions — normalizePath');
eq('strips leading slash',          AP.normalizePath('/a/b'), 'a/b');
eq('collapses ..',                  AP.normalizePath('x/../y'), 'y');
eq('collapses absolute + ..',       AP.normalizePath('/x/../.vault/app.json'), '.vault/app.json');
eq('collapses double slash',        AP.normalizePath('a//b'), 'a/b');
eq('drops dot segments',            AP.normalizePath('./a/./b'), 'a/b');
eq('backslashes → slashes',         AP.normalizePath('a\\b'), 'a/b');
eq('over-pop is safe',              AP.normalizePath('../../x'), 'x');
eq('empty stays empty',             AP.normalizePath(''), '');

console.log('\n[suite] AppPermissions — hasVaultSegment / isFloor');
ok('root .vault is a vault segment',     AP.hasVaultSegment('.vault/app.json'));
ok('nested .vault is a vault segment',   AP.hasVaultSegment('customers/acme/.vault/owner/ro-links.json'));
ok('traversal into .vault detected',     AP.hasVaultSegment('/data/../.vault/x'));
ok('case-insensitive .Vault',            AP.hasVaultSegment('.Vault/x'));
ok('vault-notes is NOT a vault segment',  !AP.hasVaultSegment('vault-notes/x'));
ok('floor: read .vault denied',          AP.isFloor('read',  '.vault/app.json'));
ok('floor: write .vault denied',         AP.isFloor('write', 'customers/acme/.vault/owner/x'));
ok('floor: write legacy app.json denied', AP.isFloor('write', 'app.json'));
ok('floor: write /app.json (abs) denied', AP.isFloor('write', '/app.json'));
ok('floor: read app.json NOT floored',   !AP.isFloor('read',  'app.json'));   // only .vault reads floored; root app.json read allowed (host reads token, not the iframe path)
ok('floor: write data/app.json allowed',  !AP.isFloor('write', 'data/app.json'));
ok('floor: write data/x allowed',         !AP.isFloor('write', 'data/x.json'));

console.log('\n[suite] AppPermissions — parsePermissions + can');
const pNone   = AP.parsePermissions(null);
const pAll    = AP.parsePermissions({ permissions: { fs: { write: true, move: true } } });
const pScoped = AP.parsePermissions({ permissions: { fs: { read: ['pub/'], write: ['data/', 'out/result.json'] }, vault: { create: ['runs/'], delete: true } } });

// read default (no block) → allow
ok('read default-allow (no block)',       AP.can(pNone, 'fs.read', 'anything.txt'));
ok('list default-allow (no block)',       AP.can(pNone, 'fs.list', 'anyfolder'));
// mutate default-deny (no block)
ok('write default-deny (no block)',      !AP.can(pNone, 'fs.write', 'anything.txt'));
ok('move default-deny (no block)',       !AP.can(pNone, 'fs.move',  'a'));
ok('vault.create default-deny',          !AP.can(pNone, 'vault.create', 'runs/'));

// write:true → any path
ok('write:true allows any path',          AP.can(pAll, 'fs.write', 'deep/nested/x'));
ok('write:true still deny delete',       !AP.can(pAll, 'fs.delete', 'x'));   // delete not granted

// scoped write (prefix + exact)
ok('scoped write allows data/x',          AP.can(pScoped, 'fs.write', 'data/x.json'));
ok('scoped write allows data/ root',      AP.can(pScoped, 'fs.write', 'data'));
ok('scoped write denies out/x',          !AP.can(pScoped, 'fs.write', 'out/x.json'));
ok('scoped write allows exact file',      AP.can(pScoped, 'fs.write', 'out/result.json'));
// scoped read tightens the default
ok('scoped read allows pub/x',            AP.can(pScoped, 'fs.read', 'pub/logo.png'));
ok('scoped read denies private/x',       !AP.can(pScoped, 'fs.read', 'private/x'));   // read now restricted to the array
// vault scoping + bool delete
ok('vault.create scoped to runs/',        AP.can(pScoped, 'vault.create', 'runs/job1'));
ok('vault.create denies other parent',   !AP.can(pScoped, 'vault.create', 'elsewhere/x'));
ok('vault.delete bool true',              AP.can(pScoped, 'vault.delete', 'anything'));
ok('vault.delete bool false by default', !AP.can(pAll,    'vault.delete', 'anything'));

// defensive parse
const pJunk = AP.parsePermissions({ permissions: { fs: 'nope', vault: 42 } });
ok('junk block → mutations denied',      !AP.can(pJunk, 'fs.write', 'x'));
ok('junk block → reads still default',    AP.can(pJunk, 'fs.read',  'x'));

// externalLinks grant (Options C/D) — default-deny; gates escape-sandbox.
ok('externalLinks default false (no grant)',  AP.parsePermissions(null).externalLinks === false);
ok('externalLinks false when omitted',        AP.parsePermissions({ permissions: {} }).externalLinks === false);
ok('externalLinks true only when ===true',    AP.parsePermissions({ permissions: { externalLinks: true } }).externalLinks === true);
ok('externalLinks truthy-but-not-true → false (e.g. "yes")',
    AP.parsePermissions({ permissions: { externalLinks: 'yes' } }).externalLinks === false);

console.log(`\n[result] ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
