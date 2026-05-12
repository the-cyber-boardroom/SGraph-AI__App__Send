// SGraph Send — Performance Tool — Run Store
// Persists every run (single scenario or batch) to localStorage so we can
// compare results before/after backend changes. A "run" is one invocation of
// runScenarios — the unit a user clicks "Run" on. Multiple scenarios inside
// one run are kept together; loops across the same set are also one run.

(function (global) {
  'use strict';

  const KEY_RUNS    = 'sg-perf:runs';
  const KEY_LABELS  = 'sg-perf:run-labels';
  const MAX_RUNS    = 50;          // cap to avoid blowing the 5MB localStorage budget

  function safeGet(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.error('localStorage write failed', e); return false; }
  }

  function nowMs() { return Date.now(); }
  function randomId(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  // Slim down a run for storage: drop noisy fields, keep timing + status.
  function compactStep(step) {
    return {
      label:       step.label,
      duration_ms: step.duration_ms,
      status:      step.status,
      bytes_in:    step.bytes_in,
      bytes_out:   step.bytes_out,
      ok:          step.ok,
      error:       step.error || null,
    };
  }
  function compactResult(r) {
    return {
      run_id:        r.run_id,
      scenario_id:   r.scenario_id,
      scenario_name: r.scenario_name,
      ok:            r.ok,
      wall_ms:       r.wall_ms,
      summary:       r.summary,
      steps:        (r.steps || []).map(compactStep),
      note:          r.note || null,
      error:         r.error || null,
      ts:            r.ts,
    };
  }

  const RunStore = {

    // Create a new run record. results = array of scenario result rows.
    save(results, meta) {
      if (!Array.isArray(results) || results.length === 0) return null;
      const run = {
        id:            'run-' + nowMs() + '-' + randomId(6),
        ts:            nowMs(),
        label:         (meta && meta.label) || '',
        host:          location.host,
        base_url:      (meta && meta.base_url) || '',
        tool_version: 'v0.1.0',
        token_hint:    (meta && meta.token_hint) || '',   // first 4 chars of token, for context
        scenarios:     [...new Set(results.map(r => r.scenario_id))],
        ok_count:      results.filter(r => r.ok).length,
        fail_count:    results.filter(r => !r.ok).length,
        wall_ms_total: results.reduce((a, r) => a + (r.wall_ms || 0), 0),
        results:       results.map(compactResult),
      };
      const all = this.list();
      all.unshift(run);
      if (all.length > MAX_RUNS) all.length = MAX_RUNS;
      safeSet(KEY_RUNS, all);
      return run;
    },

    list() {
      return safeGet(KEY_RUNS, []);
    },

    get(runId) {
      return this.list().find(r => r.id === runId) || null;
    },

    remove(runId) {
      safeSet(KEY_RUNS, this.list().filter(r => r.id !== runId));
    },

    relabel(runId, label) {
      const all = this.list();
      const next = all.map(r => r.id === runId ? { ...r, label } : r);
      safeSet(KEY_RUNS, next);
    },

    clearAll() {
      try { localStorage.removeItem(KEY_RUNS); } catch {}
    },

    // ------------------------------------------------------------- compare ---
    // Build a comparison between two runs keyed by scenario_id.
    // Returns rows: { scenario_id, scenario_name, a_ms, b_ms, delta_ms, delta_pct, a_ok, b_ok }
    compare(runIdA, runIdB) {
      const a = this.get(runIdA);
      const b = this.get(runIdB);
      if (!a || !b) return null;

      // Average wall_ms per scenario in each run (in case the same scenario was looped).
      function aggregate(run) {
        const out = {};
        run.results.forEach(r => {
          const cur = out[r.scenario_id] || { count: 0, sum: 0, ok: true, name: r.scenario_name };
          cur.count += 1;
          cur.sum   += (r.summary && r.summary.total_ms) || r.wall_ms || 0;
          cur.ok    = cur.ok && r.ok;
          out[r.scenario_id] = cur;
        });
        Object.keys(out).forEach(k => { out[k].avg = out[k].sum / out[k].count; });
        return out;
      }
      const aggA = aggregate(a);
      const aggB = aggregate(b);

      const allKeys = new Set([...Object.keys(aggA), ...Object.keys(aggB)]);
      const rows = [];
      allKeys.forEach(scenario_id => {
        const A = aggA[scenario_id];
        const B = aggB[scenario_id];
        const a_ms = A ? A.avg : null;
        const b_ms = B ? B.avg : null;
        let delta_ms = null, delta_pct = null;
        if (a_ms != null && b_ms != null) {
          delta_ms  = b_ms - a_ms;
          delta_pct = a_ms === 0 ? 0 : (delta_ms / a_ms) * 100;
        }
        rows.push({
          scenario_id,
          scenario_name: (A && A.name) || (B && B.name) || scenario_id,
          a_ms, b_ms, delta_ms, delta_pct,
          a_ok: A ? A.ok : null,
          b_ok: B ? B.ok : null,
          a_runs: A ? A.count : 0,
          b_runs: B ? B.count : 0,
        });
      });
      rows.sort((x, y) => x.scenario_id.localeCompare(y.scenario_id));
      return { runA: a, runB: b, rows };
    },

    // Storage-usage estimate (for the footer warning).
    storageStats() {
      try {
        const raw = localStorage.getItem(KEY_RUNS) || '';
        return { runs: this.list().length, bytes: new Blob([raw]).size };
      } catch { return { runs: 0, bytes: 0 }; }
    },
  };

  global.RunStore = RunStore;
})(window);
