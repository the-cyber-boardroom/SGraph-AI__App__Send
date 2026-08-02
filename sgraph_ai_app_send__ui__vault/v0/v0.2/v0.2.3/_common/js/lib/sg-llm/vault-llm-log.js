/* =================================================================================
   VaultLlmLog — the session ledger of every LLM request

   One append-only list of calls, each carrying the upstream generation id so a cost
   can be reconciled later (OpenRouter bills per generation id; `GET /generation?id=`
   is the authoritative figure and lands a beat AFTER the stream ends).

   Why a store and not component state: the chat panel makes the calls, the requests
   pane renders them, and both are independent sg-layout panels that can be opened,
   closed and re-created at will. Neither may own the data. Closing the chat must not
   lose the bill.

   Cost honesty is the whole point of this file:
     - `cost` is null until something tells us a number;
     - `estimated: true` means it came from token counts × the model's list price;
     - `estimated: false` means upstream told us what it actually charged.
   `totals()` keeps those two buckets SEPARATE so a UI can never render a guess as a
   bill. An estimate and an invoice are different claims about money.

   Pure + DOM-free: unit-tested in Node via runInThisContext
   (tests/unit/vault_ui/loader/test__vault_llm_log.js).

   API:
     add(rec)            → entry            (status defaults to 'pending')
     update(key, patch)  → entry | null     (key is the LOCAL key, stable from birth)
     get(key)            → entry | null
     list()              → entry[]          (copy — callers cannot corrupt the ledger)
     totals()            → {...}
     clear()             → void
     subscribe(fn)       → unsubscribe fn
     toJSON() / toCsv()  → export for external reconciliation
   ================================================================================= */

(function () {
    'use strict';

    var MAX_ENTRIES = 500;                       // ring cap: a long session must not eat the tab

    var _entries = [];
    var _subs    = [];
    var _seq     = 0;

    function _emit() {
        for (var i = 0; i < _subs.length; i++) {
            try { _subs[i](_entries); } catch (_) { /* a bad subscriber never breaks the ledger */ }
        }
    }

    function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

    // A request is born the moment it is SENT, not when it returns — otherwise an
    // in-flight call is invisible and a failed one never appears at all.
    function add(rec) {
        var r = rec || {};
        _seq += 1;
        var entry = {
            seq        : _seq,
            key        : 'r' + _seq,                   // local handle: stable before any upstream id exists
            id         : r.id || null,                 // upstream generation id — the cost handle
            model      : r.model || null,
            ts         : r.ts || Date.now(),
            status     : r.status || 'pending',        // pending | ok | error | aborted
            files      : Array.isArray(r.files) ? r.files.slice() : [],
            promptChars: _num(r.promptChars) || 0,
            usage      : r.usage || {},
            cost       : _num(r.cost),
            costSource : r.costSource || null,
            estimated  : r.estimated !== false,        // assume estimate until proven otherwise
            latencyMs  : _num(r.latencyMs),
            error      : r.error || null
        };
        _entries.push(entry);
        if (_entries.length > MAX_ENTRIES) _entries.splice(0, _entries.length - MAX_ENTRIES);
        _emit();
        return entry;
    }

    function get(key) {
        for (var i = 0; i < _entries.length; i++) if (_entries[i].key === key) return _entries[i];
        return null;
    }

    // Patch in place. Used twice per call: once when the stream ends (estimate), once
    // when reconcileCost lands the real figure.
    function update(key, patch) {
        var e = get(key);
        if (!e) return null;
        var p = patch || {};
        for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) e[k] = p[k]; }
        _emit();
        return e;
    }

    function list() { return _entries.slice(); }

    // Two cost buckets, never summed into one number by this function. `totalCost` is
    // the sum a UI may show as "spend so far", but `estimatedCost`/`billedCost` let it
    // say HOW MUCH of that is actually known — which is the difference between a
    // number a user can trust and one they can't.
    function totals() {
        var t = {
            calls: _entries.length, ok: 0, pending: 0, errors: 0, aborted: 0,
            billedCost: 0, estimatedCost: 0, totalCost: 0,
            costedCalls: 0, uncostedCalls: 0,
            promptTokens: 0, completionTokens: 0, totalTokens: 0,
            files: 0
        };
        var seen = {};
        for (var i = 0; i < _entries.length; i++) {
            var e = _entries[i];
            if (e.status === 'ok')            t.ok++;
            else if (e.status === 'pending')  t.pending++;
            else if (e.status === 'error')    t.errors++;
            else if (e.status === 'aborted')  t.aborted++;

            if (typeof e.cost === 'number') {
                t.costedCalls++;
                if (e.estimated) t.estimatedCost += e.cost; else t.billedCost += e.cost;
            } else if (e.status !== 'pending') {
                t.uncostedCalls++;                      // finished but nobody ever told us a price
            }

            var u = e.usage || {};
            if (typeof u.prompt_tokens     === 'number') t.promptTokens     += u.prompt_tokens;
            if (typeof u.completion_tokens === 'number') t.completionTokens += u.completion_tokens;

            for (var f = 0; f < e.files.length; f++) {
                if (!seen[e.files[f]]) { seen[e.files[f]] = 1; t.files++; }
            }
        }
        t.totalCost   = t.billedCost + t.estimatedCost;
        t.totalTokens = t.promptTokens + t.completionTokens;
        return t;
    }

    function clear() { _entries = []; _seq = 0; _emit(); }

    function subscribe(fn) {
        if (typeof fn !== 'function') return function () {};
        _subs.push(fn);
        return function () { _subs = _subs.filter(function (f) { return f !== fn; }); };
    }

    function toJSON() { return JSON.stringify({ entries: list(), totals: totals() }, null, 2); }

    // CSV so a finance-minded human can reconcile against an OpenRouter statement:
    // the generation id is the join key on their side.
    function toCsv() {
        var head = 'seq,generation_id,model,timestamp,status,cost_usd,cost_source,estimated,prompt_tokens,completion_tokens,latency_ms,files';
        var rows = _entries.map(function (e) {
            var u = e.usage || {};
            return [
                e.seq,
                e.id || '',
                e.model || '',
                new Date(e.ts).toISOString(),
                e.status,
                (typeof e.cost === 'number') ? e.cost.toFixed(6) : '',
                e.costSource || '',
                e.estimated ? 'yes' : 'no',
                (typeof u.prompt_tokens     === 'number') ? u.prompt_tokens     : '',
                (typeof u.completion_tokens === 'number') ? u.completion_tokens : '',
                (typeof e.latencyMs === 'number') ? e.latencyMs : '',
                '"' + e.files.join(' ').replace(/"/g, '""') + '"'
            ].join(',');
        });
        return [head].concat(rows).join('\n');
    }

    var API = { add: add, get: get, update: update, list: list, totals: totals,
                clear: clear, subscribe: subscribe, toJSON: toJSON, toCsv: toCsv,
                MAX_ENTRIES: MAX_ENTRIES };

    globalThis.VaultLlmLog = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { VaultLlmLog: API };  // node tests
})();
