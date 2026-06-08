/* Unit tests — SGInboxChecker (Phase C2, v0.33.5)
   Run: node tests/unit/vault_ui/loader/test__sg_inbox_checker.js

   No deps. Sources the browser global-scope module via runInThisContext. The checker
   is duck-typed, so we drive it with a fake inbox (scripted list/fetch) and a fake bus
   (records emits) — no DOM, no network, no mocks of our own code. */

import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

const MOD = new URL(
    '../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/lib/sg-inbox/sg-inbox-checker.js',
    import.meta.url
);
runInThisContext(readFileSync(fileURLToPath(MOD), 'utf8'), { filename: 'sg-inbox-checker.js', displayErrors: true });
const SGInboxChecker = globalThis.SGInboxChecker;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

function entry(inbox, file_id) { return { inbox, file_id, received: 1 }; }

// Fake inbox: list returns whatever the script's current `entries` is; fetch returns
// content for the requested ids. Records calls for assertions.
function fakeInbox() {
    const state = { entries: [], listCalls: 0, fetchCalls: [], failList: null, failFetch: null };
    return {
        state,
        async list({ include_content } = {}) {
            state.listCalls++;
            if (state.failList) throw state.failList;
            return { status: 'ok', entries: state.entries.slice(), truncated: false, _included: !!include_content };
        },
        async fetch({ inbox, file_ids }) {
            state.fetchCalls.push({ inbox, file_ids });
            if (state.failFetch) throw state.failFetch;
            return { status: 'ok', files: file_ids.map(id => ({ file_id: id, size: 3, content: 'QUJD' })), missing: [] };
        }
    };
}

function fakeBus() {
    const events = [];
    return { events, emit: (name, payload) => events.push({ name, payload }) };
}

const coded = (code, http) => { const e = new Error(code); e.code = code; if (http) e.http = http; return e; };

async function main() {
    console.log('\n[suite] SGInboxChecker — disabled config is a no-op');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        inbox.state.entries = [entry('h1', '001')];
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: false, auto_fetch: false }));
        await ck.check('vault-open');
        ok('disabled → no list call (no network)', inbox.state.listCalls === 0);
        ok('disabled → no events', bus.events.length === 0);
    }

    console.log('\n[suite] SGInboxChecker — emits on count delta only');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: true, auto_fetch: false }));

        inbox.state.entries = [entry('h1', '001'), entry('h1', '002')];
        await ck.check('vault-open');
        ok('first check with entries emits inbox.new-messages', bus.events.length === 1 && bus.events[0].name === 'inbox.new-messages');
        ok('payload.total counts all entries', bus.events[0].payload.total === 2);
        ok('payload.per_anchor groups by anchor', bus.events[0].payload.per_anchor.h1 === 2);
        ok('payload.new_count = 2 on first sight', bus.events[0].payload.new_count === 2);
        ok('payload.entries null when auto_fetch off', bus.events[0].payload.entries === null);
        ok('payload carries the trigger', bus.events[0].payload.trigger === 'vault-open');

        await ck.check('focus');
        ok('identical second check is silent (no delta)', bus.events.length === 1);

        inbox.state.entries.push(entry('h2', '009'));
        await ck.check('focus');
        ok('new entry on a new anchor emits again', bus.events.length === 2);
        ok('second emit new_count = 1 (only the fresh one)', bus.events[1].payload.new_count === 1);
        ok('second emit total = 3', bus.events[1].payload.total === 3);
    }

    console.log('\n[suite] SGInboxChecker — count shrink (processed/purged) re-emits');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: true, auto_fetch: false }));
        inbox.state.entries = [entry('h1', '001'), entry('h1', '002')];
        await ck.check('open');
        inbox.state.entries = [entry('h1', '002')];                              // 001 processed elsewhere
        await ck.check('focus');
        ok('total shrink emits (count changed)', bus.events.length === 2 && bus.events[1].payload.total === 1);

        // After the shrink, 001 reappearing should be seen as NEW again (seen-set rebuilt).
        inbox.state.entries = [entry('h1', '001'), entry('h1', '002')];
        await ck.check('focus');
        ok('re-arrived id counts as new after being dropped', bus.events[2].payload.new_count === 1);
    }

    console.log('\n[suite] SGInboxChecker — auto_fetch pulls ciphertext');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: true, auto_fetch: true }));
        inbox.state.entries = [entry('h1', '001'), entry('h2', '009')];
        await ck.check('open');
        ok('auto_fetch issues a fetch per anchor', inbox.state.fetchCalls.length === 2);
        const ev = bus.events[0].payload;
        ok('emitted entries include fetched content', Array.isArray(ev.entries) && ev.entries.length === 2);
        ok('fetched entry carries its anchor', ev.entries.every(e => e.inbox === 'h1' || e.inbox === 'h2'));
        ok('fetched entry carries content', ev.entries[0].content === 'QUJD');
    }

    console.log('\n[suite] SGInboxChecker — error paths emit inbox.error');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        inbox.state.failList = coded('EPERM', 403);
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: true, auto_fetch: false }));
        await ck.check('focus');
        ok('list failure emits inbox.error', bus.events.length === 1 && bus.events[0].name === 'inbox.error');
        ok('error carries code', bus.events[0].payload.code === 'EPERM');
        ok('error carries http status', bus.events[0].payload.http === 403);
        ok('error carries trigger', bus.events[0].payload.trigger === 'focus');

        // auto_fetch partial failure: list ok, fetch throws → error emitted, no new-messages crash
        const inbox2 = fakeInbox(); const bus2 = fakeBus();
        inbox2.state.entries = [entry('h1', '001')];
        inbox2.state.failFetch = coded('EUNREACH');
        const ck2 = new SGInboxChecker(inbox2, bus2, () => ({ enabled: true, auto_fetch: true }));
        await ck2.check('open');
        const names = bus2.events.map(e => e.name);
        ok('fetch failure emits inbox.error', names.includes('inbox.error'));
        ok('still emits new-messages (partial)', names.includes('inbox.new-messages'));
    }

    console.log('\n[suite] SGInboxChecker — reset() re-arms the seen-set');
    {
        const inbox = fakeInbox(); const bus = fakeBus();
        const ck = new SGInboxChecker(inbox, bus, () => ({ enabled: true, auto_fetch: false }));
        inbox.state.entries = [entry('h1', '001')];
        await ck.check('open');
        ok('initial emit', bus.events.length === 1);
        ck.reset();
        await ck.check('reopen');
        ok('after reset the same entry re-emits', bus.events.length === 2 && bus.events[1].payload.new_count === 1);
    }

    console.log(`\n  ${pass} pass, ${fail} fail`);
    if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
