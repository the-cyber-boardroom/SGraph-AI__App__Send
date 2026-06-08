/* =================================================================================
   SGraph Vault Inbox — Checker  (Phase C2 — v0.33.5)

   The check-on-events detector. NO timers, NO start()/stop(). Dormant until the
   vault shell calls check(trigger) from an existing quasi-event (tab focus, refresh
   click, vault open, peer poke). This is the same model that drives the ref-behind
   check — see vault-shell._scheduleBehindCheck.

   On each check it runs one cheap metadata-only `list`, diffs against the per-anchor
   seen-set, and — only when the count or membership changed — emits on the internal
   vault bus (window.sgraphVault.events):

     inbox.new-messages  { total, per_anchor, entries, new_count, trigger, last_check }
                           entries is null unless config.auto_fetch is true.
     inbox.error         { code, message, http?, trigger }

   C2 emits to the INTERNAL bus only. C3 (the kernel→app event channel) fans these
   out to subscribed apps. Splitting the two means the kernel's own observability
   (debug pane, owner panel) works before any app subscribes.

   Duck-typed dependencies (kept decoupled so it is Node-testable with fakes):
     inbox      — anything with .list({include_content}) and .fetch({inbox,file_ids})
                  (an SGInbox instance in production).
     bus        — anything with .emit(name, payload).
     getConfig  — () => ({ enabled:bool, auto_fetch:bool }).
   ================================================================================= */

class SGInboxChecker {

    constructor(inbox, bus, getConfig) {
        this._inbox     = inbox
        this._bus       = bus
        this._getConfig = getConfig || (() => ({ enabled: false, auto_fetch: false }))
        this._seen      = new Map()                                              // anchor → Set<file_id>
        this._lastTotal = -1                                                     // -1 = never checked (first non-empty result always emits)
    }

    async check(trigger) {
        const cfg = this._getConfig() || {}
        if (!cfg.enabled) return                                                 // master switch off → no-op (and no network)

        let res
        try {
            res = await this._inbox.list({ include_content: false })            // cheap: metadata only, the hot path
        } catch (err) {
            this._emitError(err, trigger)
            return
        }

        const entries   = (res && res.entries) || []
        const perAnchor  = this._countByAnchor(entries)
        const newEntries = this._diff(entries)

        // Stay quiet unless something actually changed: a new file appeared, or the
        // total shifted (e.g. messages were processed/purged elsewhere).
        if (newEntries.length === 0 && this._lastTotal === entries.length) return
        this._lastTotal = entries.length

        let fetched = null
        if (cfg.auto_fetch && newEntries.length > 0) {
            fetched = await this._fetchNew(newEntries, trigger)
        }

        this._bus.emit('inbox.new-messages', {
            total      : entries.length ,
            per_anchor : perAnchor      ,
            entries    : fetched        ,                                        // null when auto_fetch is off
            new_count  : newEntries.length,
            trigger    : trigger        ,
            last_check : Date.now()
        })
        this._markSeen(entries)
    }

    // Reset the seen-set (e.g. on vault lock/switch) so the next open re-emits.
    reset() {
        this._seen.clear()
        this._lastTotal = -1
    }

    // --- internals --------------------------------------------------------------

    async _fetchNew(newEntries, trigger) {
        const fetched = []
        for (const [anchor, anchorEntries] of this._groupByAnchor(newEntries)) {
            const fileIds = anchorEntries.map(e => e.file_id)
            for (let i = 0; i < fileIds.length; i += 100) {                      // server caps a batch at 100 (INBOX_BATCH_MAX_FILE_IDS)
                const chunk = fileIds.slice(i, i + 100)
                try {
                    const fr = await this._inbox.fetch({ inbox: anchor, file_ids: chunk })
                    for (const f of (fr && fr.files) || []) {
                        fetched.push(Object.assign({ inbox: anchor }, f))
                    }
                } catch (err) {
                    this._emitError(err, trigger)                               // partial: surface the error, keep what we have (Q6 — partial)
                }
            }
        }
        return fetched
    }

    _emitError(err, trigger) {
        this._bus.emit('inbox.error', {
            code   : (err && err.code) || 'EUNKNOWN',
            message: String((err && err.message) || err),
            http   : err && err.http,
            trigger
        })
    }

    _diff(entries) {                                                            // entries whose file_id is not yet in the seen-set for its anchor
        const out = []
        for (const e of entries) {
            const set = this._seen.get(e.inbox)
            if (!set || !set.has(e.file_id)) out.push(e)
        }
        return out
    }

    _markSeen(entries) {
        const fresh = new Map()                                                 // rebuild so processed/purged ids drop out of the seen-set
        for (const e of entries) {
            if (!fresh.has(e.inbox)) fresh.set(e.inbox, new Set())
            fresh.get(e.inbox).add(e.file_id)
        }
        this._seen = fresh
    }

    _countByAnchor(entries) {
        const counts = {}
        for (const e of entries) counts[e.inbox] = (counts[e.inbox] || 0) + 1
        return counts
    }

    _groupByAnchor(entries) {
        const groups = new Map()
        for (const e of entries) {
            if (!groups.has(e.inbox)) groups.set(e.inbox, [])
            groups.get(e.inbox).push(e)
        }
        return groups
    }
}

if (typeof globalThis !== 'undefined') globalThis.SGInboxChecker = SGInboxChecker
