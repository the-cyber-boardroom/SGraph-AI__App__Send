/* =================================================================================
   SGit Performance Harness — Benchmark Scenarios

   Each scenario defines:
     id         — unique string
     label      — display name
     description
     toggleHints — which optimisations materially affect this scenario
     expectedBaseline  — { requests } for sanity-check display
     expectedOptimised — { requests } for target display (from SGit CLI reply)
     setup(setup)    — optional: bring vault to known state
     run(vault, send) — perform the operation; metrics captured via events on send
   ================================================================================= */

const SCENARIOS = [

    // ── cold-open ────────────────────────────────────────────────────────────
    {
        id: 'cold-open',
        label: 'Cold open',
        description: 'Open vault from scratch. Measures branch-index read, named-ref read, clone-ref read (404 on new), tree load.',
        toggleHints: ['localCloneRef', 'singleBranch'],
        expectedBaseline:  { requests: 5 },
        expectedOptimised: { requests: 3 },

        async setup() {},

        async run(vault, send) {
            // vault was already opened by openPair() — the open itself IS the scenario.
            // We just return here; the metric is captured from the open() calls.
        }
    },

    // ── pull-up-to-date ──────────────────────────────────────────────────────
    {
        id: 'pull-up-to-date',
        label: 'Pull (up-to-date)',
        description: 'Pull when local already matches remote. Should be 1 ref read, no object fetches, no write.',
        toggleHints: ['refTTLCache'],
        expectedBaseline:  { requests: 1 },
        expectedOptimised: { requests: 1 },

        async setup() {},

        async run(vault) {
            // pull() checks if we are behind; if not, returns false immediately
            await vault.pull()
        }
    },

    // ── single-save ──────────────────────────────────────────────────────────
    {
        id: 'single-save',
        label: 'Single-file save + push',
        description: 'Write one small file: blob write + tree write + commit write + clone-ref write + named-ref write = 5 writes. batchPush fuses both ref writes into one batch.',
        toggleHints: ['batchPush'],
        expectedBaseline:  { requests: 5 },
        expectedOptimised: { requests: 4 },  // 3 obj writes + 1 batch for 2 refs

        async setup(setup) {
            // Ensure vault has at least one file so the tree is non-trivial
        },

        async run(vault) {
            const data = new TextEncoder().encode(`perf-test-${Date.now()}-${'a'.repeat(128)}`)
            await vault.addFile('/', `perf-${Date.now()}.txt`, data)
            await vault.push()
        }
    },

    // ── burst-save-3 ─────────────────────────────────────────────────────────
    {
        id: 'burst-save-3',
        label: 'Burst saves (3)',
        description: 'Three back-to-back file writes. Exercises ref-cache win: with refTTLCache the same named-ref pointer need not be re-read between saves.',
        toggleHints: ['batchPush', 'refTTLCache'],
        expectedBaseline:  { requests: 15 },
        expectedOptimised: { requests: 12 },

        async setup() {},

        async run(vault) {
            for (let i = 0; i < 3; i++) {
                const data = new TextEncoder().encode(`burst-${i}-${Date.now()}`)
                await vault.addFile('/', `burst-${i}-${Date.now()}.txt`, data)
                await vault.push()
            }
        }
    },

    // ── status-check ─────────────────────────────────────────────────────────
    {
        id: 'status-check',
        label: 'Status check (×2)',
        description: 'Run getBehindCount twice in quick succession. Baseline: 2×2 ref reads = 4. With refTTLCache the second call is cache-only = 2 reads.',
        toggleHints: ['refTTLCache'],
        expectedBaseline:  { requests: 4 },
        expectedOptimised: { requests: 2 },

        async setup() {},

        async run(vault) {
            await vault.getBehindCount()
            await vault.getBehindCount()  // second call — hits cache if refTTLCache is on
        }
    },

    // ── subtree-expand-deep ──────────────────────────────────────────────────
    {
        id: 'subtree-expand-deep',
        label: 'Subtree expand (deep)',
        description: 'Expand a 3-level deep tree. subtreeFanout prefetches sibling lazy sub-trees in parallel rather than one-at-a-time.',
        toggleHints: ['subtreeFanout'],
        expectedBaseline:  { requests: 4 },  // each lazy node fetched sequentially
        expectedOptimised: { requests: 4 },  // same count but parallel (wall-clock win)
        note: 'Request count is unchanged; the win is lower wall-clock time from parallel fetches.',

        async setup(setup) {
            // Ensure deep tree exists — create if not already there
        },

        async run(vault) {
            // Trigger lazy subtree loads by expanding alpha/sub
            if (vault.listFolder) {
                const lvl1 = vault.listFolder('/alpha')
                if (lvl1) {
                    await vault.loadSubTreeOnDemand('/alpha/sub')
                }
            }
        }
    }
]

// Quick lookup by id
const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map(s => [s.id, s]))
