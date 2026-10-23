/* =================================================================================
   SGraph Vault — Sync Operations
   v0.2.1 — push, pull, getAheadCount, getBehindCount

   Extends SGVault.prototype. Must load after sg-vault.js.

   Two-ref model:
     Named ref (ref-pid-muw-*) — published state, advances only on push()
     Clone ref (ref-pid-snw-*) — working state, advances on every _commit()

   Conflict model: pull() is fast-forward only and refuses if the clone has unpushed commits;
   merge() does a three-way file-level merge; push() is compare-and-swap with one reconcile.
   sgit-ai 0.21 parity: rewind detection (EREWOUND), 'signatures-required' (ESIGNATURE),
   shared branch index registration after every push.
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        // --- Ahead count: commits on clone's first-parent path not yet on named branch
        // Uses BFS to check reachability first (handles merge commits where namedHead
        // appears as a second/merge parent rather than the first-parent chain).

        async getAheadCount() {
            if (!this._namedHeadId || this._headCommitId === this._namedHeadId) return 0

            // If namedHead is not reachable from cloneHead at all, we're diverged
            const named = this._namedHeadId
            const ahead = await this._isAncestor(named, this._headCommitId, 200)
            if (!ahead) return 0  // caller should use diverged detection separately

            // Count commits on first-parent path from clone until we reach namedHead
            let count  = 0
            let cursor = this._headCommitId
            const max  = 100

            while (cursor && cursor !== named && count < max) {
                count++
                try {
                    const commit = await this._commitManager.loadCommit(cursor)
                    cursor = commit.parents?.[0] || null
                } catch (_) { break }
            }

            return count
        },

        // Helper: batch-decrypt commits from raw ciphertext — returns Map<id, commit>
        // Uses objectStore.batchLoad() so immutable blocks are served from cache.
        async _batchLoadCommits(ids) {
            const result  = new Map()
            if (!ids || !ids.length) return result
            const ciphers = await this._objectStore.batchLoad(ids)
            await Promise.all(ids.map(async (id) => {
                const cipher = ciphers.get(id)
                if (!cipher) return
                try {
                    const plain  = await SGSendCrypto.decrypt(cipher, this._readKey)
                    result.set(id, JSON.parse(new TextDecoder().decode(plain)))
                } catch (_) {}
            }))
            return result
        },

        // Helper: true if ancestorId is reachable from headId following ALL parents.
        // Wave-BFS: loads an entire frontier in one batch request per level.
        async _isAncestor(ancestorId, headId, max = 200) {
            if (!ancestorId || !headId) return false
            if (ancestorId === headId) return true
            const seen = new Set([headId])
            let wave   = [headId]

            while (wave.length && seen.size < max) {
                const commits  = await this._batchLoadCommits(wave)
                const nextWave = []
                for (const id of wave) {
                    for (const p of (commits.get(id)?.parents || [])) {
                        if (p === ancestorId) return true
                        if (!seen.has(p)) { seen.add(p); nextWave.push(p) }
                    }
                }
                wave = nextWave
            }
            return false
        },

        // --- Push: publish clone HEAD on the named branch -----------------------------
        //
        // sgit-ai 0.21 parity. By default a push is compare-and-swap against the named ref
        // bytes this session last read: a push that loses a race never overwrites the winner.
        // On a CAS miss the server's head is read, classified (a REWOUND published branch is
        // refused unless opts.acceptRewind), merged into the clone (three-way, conflicts saved
        // as _conflict copies) and the push retried once; a second miss throws EDIVERGED with
        // the merge kept locally. Under 'signatures-required' an unsigned or unverifiable local
        // commit is refused BEFORE anything is sent (the CLI's L5). After the ref lands, this
        // device's public key and clone entry are registered in the shared branch index.
        //   opts.force        : blind write (the user's explicit "force publish"; the CLI's push --force)
        //   opts.acceptRewind : take a rewound remote head on a CAS miss (sgit pull --accept-rewind)

        async push(opts) {
            opts = opts || {}
            if (!this._cloneRefFileId) throw new Error('No clone branch initialised')
            if (!this.writable)        throw new Error('Read-only: no write key')
            if (this._objectStore.batching) throw new Error('push() cannot run inside a write batch')

            await this._refreshGateQuietly()
            try { await this._ensurePublicKey() } catch (err) { this._lastRegisterError = err }   // key file first: verifiers need it
            await this._requireSignaturesForPush()

            if (opts.force) {
                await this._refManager.writeRef(this._refFileId, this._headCommitId)
            } else {
                if (this._refManager.lastRawRef(this._refFileId) === undefined) await this._refManager.readRef(this._refFileId)
                let published = false
                for (let attempt = 0; attempt < 2 && !published; attempt++) {
                    try { await this._refManager.writeRefIfMatch(this._refFileId, this._headCommitId); published = true }
                    catch (err) {
                        if (!err || err.code !== 'ECAS') throw err
                        if (attempt === 1) { const e = new Error('push: the published branch keeps moving; your commits are kept locally, not published'); e.code = 'EDIVERGED'; throw e }
                        const serverHead = await this._refManager.readRef(this._refFileId)
                        if (serverHead && serverHead !== this._headCommitId) {
                            const r = await this.merge(serverHead, { publish: false, acceptRewind: !!opts.acceptRewind })
                            if (r.upToDate && serverHead !== this._headCommitId && !r.merged) {
                                // they are behind us: our head already descends from theirs — just retry the CAS
                            }
                        }
                    }
                }
            }
            this._namedHeadId = this._headCommitId
            this._recordAcceptedHead(this._headCommitId)
            try { await this._registerClone() } catch (err) { this._lastRegisterError = err }
        },

        // --- Push, compare-and-swap, single attempt ------------------------------------
        // Used by headless child kernels, which run their own reconcile loop (kernel-app-handlers).
        // Throws 'ECAS' when the named ref moved; the caller reconciles (merge) and retries.
        async pushIfMatch() {
            if (!this._cloneRefFileId) throw new Error('No clone branch initialised')
            if (!this.writable)        throw new Error('Read-only: no write key')
            try { await this._ensurePublicKey() } catch (err) { this._lastRegisterError = err }
            await this._requireSignaturesForPush()
            await this._refManager.writeRefIfMatch(this._refFileId, this._headCommitId)
            this._namedHeadId = this._headCommitId
            this._recordAcceptedHead(this._headCommitId)
            try { await this._registerClone() } catch (err) { this._lastRegisterError = err }
        },

        // Re-read the gate before a sync (one small read); a vault raised while this tab was
        // open is honoured from here on. Unavailable index = keep what we have.
        async _refreshGateQuietly() {
            try { await this._refreshBranchIndex() } catch (err) { if (err && err.code === 'EFORMAT') throw err }
        },

        // Under 'signatures-required', every local commit not yet on the named branch must verify.
        async _requireSignaturesForPush() {
            if (!this.requiresSignatures || !this._headCommitId || this._headCommitId === this._namedHeadId) return
            const held   = await this._localHistory(this._namedHeadId)
            const report = await this.verifyChain(this._headCommitId, { stopAt: held, anchorPrefix: SGVaultBranchIndex.sigAnchor(this._branchIndex) })
            if (report.firstFailure) {
                const [cid, status] = report.firstFailure
                const e = new Error(`this vault requires signed commits and your commit ${cid} is ${status}: it cannot be published. ` +
                                    (status === 'unsigned' ? 'This session has no signing key (read-only, private mode or an embedded app); open the vault in the SG/Vault app to sign.' : 'Ask the vault owner.'))
                e.code = 'ESIGNATURE'; e.commitId = cid; e.status = status; throw e
            }
        },

        // --- Behind count: new commits on named branch not yet in clone ----------

        async getBehindCount() {
            const serverNamedHead = await this._refManager.readRef(this._refFileId)
            try { if (serverNamedHead) await this._classifyRemoteHead(serverNamedHead) } catch (_) {}
            if (!serverNamedHead || serverNamedHead === this._namedHeadId) return 0

            let count  = 0
            let cursor = serverNamedHead
            const max  = 100

            while (cursor && cursor !== this._namedHeadId && count < max) {
                count++
                try {
                    const commit = await this._commitManager.loadCommit(cursor)
                    cursor = commit.parents?.[0] || null
                } catch (_) { break }
            }

            return count
        },

        // --- Pull: fast-forward clone to named branch HEAD (no merge) -----------

        // opts.acceptRewind: take a rewound published branch (after a deliberate force-push).
        async pull(opts) {
            opts = opts || {}
            if (!this.writable) throw new Error('Read-only: no write key')

            if (this._headCommitId !== this._namedHeadId) {
                throw new Error('Cannot pull: you have unpushed local commits. Push first, then pull.')
            }

            await this._refreshGateQuietly()
            const serverNamedHead = await this._refManager.readRef(this._refFileId)
            if (!serverNamedHead || serverNamedHead === this._headCommitId) return false

            await this._guardIncoming(serverNamedHead, this._headCommitId, opts)

            this._namedHeadId  = serverNamedHead
            this._headCommitId = serverNamedHead

            await this._refManager.writeRef(this._cloneRefFileId, serverNamedHead)
            await this._loadTreeFromCommit(serverNamedHead)
            this._recordAcceptedHead(serverNamedHead)

            return true
        },

        // The one rule (CLI review d3b8eef N2/N3): nothing accepts a remote head except
        // verify-then-accept. Rewind check first (nothing is fetched for a refused rewind),
        // then the signature policy on what is incoming.
        async _guardIncoming(incomingHead, heldHead, opts) {
            const status = await this._classifyRemoteHead(incomingHead)
            if (status === 'rewound') {
                if (!(opts && opts.acceptRewind)) {
                    const e = new Error(this.rewindMessage(incomingHead)); e.code = 'EREWOUND'; e.remoteHead = incomingHead; throw e
                }
                this._recordAcceptedHead(incomingHead)             // deliberately accepted: the new baseline (sgit pull --accept-rewind)
            }
            await this._requireSignatures(incomingHead, heldHead)
        },

        // --- Three-way file-level merge -----------------------------------------------
        // Merges theirCommitId into the current working branch.
        // Fast-forwards if no local divergence; three-way file merge if diverged.
        // Returns: { merged: bool, fastForward: bool, conflicts: string[] }

        // opts.publish === false → do NOT push after a three-way merge (the caller pushes,
        // e.g. with pushIfMatch). Default (undefined/true) keeps the shells' behaviour.
        async merge(theirCommitId, opts) {
            opts = opts || {}
            if (!this.writable)          throw new Error('Read-only: no write key')
            if (!this._cloneRefFileId)   throw new Error('No clone branch initialised')
            if (!theirCommitId)          throw new Error('No commit ID provided')

            if (this._headCommitId === theirCommitId) {
                return { merged: false, fastForward: false, conflicts: [], upToDate: true }
            }

            // Rewind + signature policy before anything is loaded or written (opts.checkRewind
            // === false skips the rewind rule for callers merging an arbitrary local commit).
            if (opts.checkRewind !== false) await this._guardIncoming(theirCommitId, this._headCommitId, opts)
            else await this._requireSignatures(theirCommitId, this._headCommitId)

            // Ensure all lazy sub-trees in memory are expanded before we flatten
            await this._loadAllSubTreesInMemory()

            const forkId = await this._findCommonAncestor(this._headCommitId, theirCommitId)

            // We are behind → fast-forward (no local divergence)
            if (this._headCommitId === forkId) {
                await this._loadTreeFromCommit(theirCommitId)
                await this._refManager.writeRef(this._cloneRefFileId, theirCommitId)
                this._headCommitId = theirCommitId
                this._namedHeadId  = theirCommitId
                this._recordAcceptedHead(theirCommitId)
                return { merged: true, fastForward: true, conflicts: [] }
            }

            // They are behind us → nothing to merge
            if (theirCommitId === forkId) {
                return { merged: false, fastForward: false, conflicts: [], upToDate: true }
            }

            // True divergence — three-way file-level merge
            const [baseFiles, oursFiles, theirsFiles] = await Promise.all([
                this._flattenCommitTree(forkId),
                Promise.resolve(this._flattenInMemoryTree()),
                this._flattenCommitTree(theirCommitId)
            ])

            const { mergedFiles, conflicts } = this._mergeFileMaps(baseFiles, oursFiles, theirsFiles)
            this._applyFileMap(mergedFiles)

            this._namedHeadId = theirCommitId
            this._recordAcceptedHead(theirCommitId)

            const mergeMsg = conflicts.length > 0
                ? `Merge: ${conflicts.length} conflict(s) saved as _conflict copies`
                : 'Merge: auto-synced with published branch'
            await this._commitMerge(mergeMsg, theirCommitId)

            // Publish the merge so the named (published) branch converges with the clone branch.
            // After a three-way merge the old published tip (theirCommitId) is a parent of the merge
            // commit, so push() is a fast-forward on the server — no published commits are lost.
            // Without this the merge lives only on the clone branch and a freshly-synced session /
            // `sgit pull` would land on a different commit than this browser. Best-effort: the merge
            // already succeeded locally; if the push fails (offline / race) the next sync's ahead-path
            // auto-push retries it.
            let published = false
            if (opts.publish !== false) {
                try { await this.push(); published = true } catch (_) { /* stays local; next sync publishes */ }
            }

            return { merged: true, fastForward: false, conflicts, published }
        },

        // --- Load all lazy sub-trees into in-memory tree ------------------------------

        async _loadAllSubTreesInMemory() {
            if (typeof this.loadAllSubTrees === 'function') { await this.loadAllSubTrees(); return }
            const loadNode = async (node, path) => {
                if (node._loaded === false && node._tree_id) {
                    await this.loadSubTreeOnDemand(path)
                    // Re-read node reference after load (loadSubTreeOnDemand mutates in place)
                    const reloaded = this._findNode(path)
                    if (reloaded) node = reloaded
                }
                for (const [name, child] of Object.entries(node.children || {})) {
                    if (child.type === 'folder') {
                        const childPath = path === '/' ? `/${name}` : `${path}/${name}`
                        await loadNode(child, childPath)
                    }
                }
            }
            await loadNode(this._tree['/'], '/')
        },

        // --- Find common ancestor (walks both chains, finds first overlap) ------------

        // --- Find common ancestor: wave-BFS over ALL parents (handles merge commits) -
        // Loads an entire BFS frontier per batch request instead of one commit at a time.

        async _findCommonAncestor(idA, idB) {
            if (!idA || !idB) return null
            if (idA === idB)  return idA

            // Phase 1: BFS from A — collect full reachability set (wave-batched)
            const reachableFromA = new Set([idA])
            let waveA = [idA]
            while (waveA.length && reachableFromA.size < 500) {
                const commits  = await this._batchLoadCommits(waveA)
                const nextWave = []
                for (const id of waveA) {
                    for (const p of (commits.get(id)?.parents || [])) {
                        if (!reachableFromA.has(p)) { reachableFromA.add(p); nextWave.push(p) }
                    }
                }
                waveA = nextWave
            }

            // Phase 2: BFS from B — return first commit reachable from A (wave-batched)
            const seenB = new Set()
            let waveB   = [idB]
            while (waveB.length && seenB.size < 500) {
                const toProcess = [...new Set(waveB)].filter(id => !seenB.has(id))
                if (!toProcess.length) break

                // Check intersection before loading this wave
                for (const id of toProcess) {
                    if (reachableFromA.has(id)) return id
                }

                const commits  = await this._batchLoadCommits(toProcess)
                const nextWave = new Set()
                for (const id of toProcess) {
                    seenB.add(id)
                    for (const p of (commits.get(id)?.parents || [])) {
                        if (!seenB.has(p)) nextWave.add(p)
                    }
                }
                waveB = [...nextWave]
            }
            return null
        },

        async _walkChainIds(headId, max = 100) {
            const ids  = []
            let cursor = headId
            while (cursor && ids.length < max) {
                ids.push(cursor)
                try {
                    const commit = await this._commitManager.loadCommit(cursor)
                    cursor = commit.parents?.[0] || null
                } catch (_) { break }
            }
            return ids
        },

        // --- Flatten a historical commit's tree to Map<path, entry> ------------------

        async _flattenCommitTree(commitId) {
            const commit = await this._commitManager.loadCommit(commitId)
            const tree   = await this._commitManager.loadTree(commit.tree_id)
            const files  = new Map()

            const walk = async (entries, prefix) => {
                for (const entry of entries) {
                    if (entry.name === '.vault-settings.json' || entry.name === '.vault-settings') continue
                    if (entry.tree_id) {
                        const subTree   = await this._commitManager.loadTree(entry.tree_id)
                        const subPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
                        await walk(subTree.entries, subPrefix)
                    } else if (entry.blob_id) {
                        const path = prefix ? `${prefix}/${entry.name}` : entry.name
                        files.set(path, {
                            blob_id:      entry.blob_id,
                            size:         entry.size,
                            content_hash: entry.content_hash,
                            content_type: entry.content_type || null,
                            large:        !!entry.large
                        })
                    }
                }
            }

            await walk(tree.entries, '')
            return files
        },

        // --- Flatten current in-memory tree to Map<path, entry> ----------------------

        _flattenInMemoryTree() {
            const files = new Map()
            const walk  = (node, prefix) => {
                for (const [name, entry] of Object.entries(node.children || {})) {
                    const path = prefix ? `${prefix}/${name}` : name
                    if (entry.type === 'folder') {
                        // Only walk loaded folders; skip lazy ones (untouched sub-trees
                        // are handled by the commit-tree flatten for base/theirs)
                        if (entry._loaded !== false) walk(entry, path)
                    } else if (entry.blob_id) {
                        files.set(path, {
                            blob_id:      entry.blob_id,
                            size:         entry.size,
                            content_hash: entry.content_hash,
                            content_type: entry.content_type || null,
                            large:        !!entry.large
                        })
                    }
                }
            }
            walk(this._tree['/'], '')
            return files
        },

        // --- Three-way file-level merge algorithm ------------------------------------
        // base/ours/theirs: Map<path, {blob_id, size, content_hash}>
        // Conflict resolution: keep ours as primary; save theirs as <name>_conflict.<ext>

        _mergeFileMaps(base, ours, theirs) {
            const allPaths = new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])
            const merged   = new Map()
            const conflicts = []

            for (const path of allPaths) {
                const b     = base.get(path)
                const o     = ours.get(path)
                const t     = theirs.get(path)
                const bHash = b?.content_hash || null
                const oHash = o?.content_hash || null
                const tHash = t?.content_hash || null

                if (oHash === tHash) {
                    // Both have same content (or both absent) — no difference
                    if (o) merged.set(path, o)
                    continue
                }
                if (oHash === bHash) {
                    // Ours unchanged from base → take theirs (they modified or deleted)
                    if (t) merged.set(path, t)
                    continue
                }
                if (tHash === bHash) {
                    // Theirs unchanged from base → take ours (we modified or deleted)
                    if (o) merged.set(path, o)
                    continue
                }

                // Both sides diverged from base on this file → conflict
                if (o) merged.set(path, o)   // keep ours as canonical
                if (t) {
                    // Save their version as a conflict copy
                    const dotIdx       = path.lastIndexOf('.')
                    const conflictPath = dotIdx > 0
                        ? path.slice(0, dotIdx) + '_conflict' + path.slice(dotIdx)
                        : path + '_conflict'
                    merged.set(conflictPath, t)
                    conflicts.push(path)
                }
            }

            return { mergedFiles: merged, conflicts }
        },

        // --- Rebuild in-memory tree from a flat file map -----------------------------

        _applyFileMap(fileMap) {
            this._tree['/'] = { type: 'folder', children: {} }

            for (const [path, entry] of fileMap) {
                const parts    = path.split('/')
                const fileName = parts.pop()
                let   node     = this._tree['/']
                for (const part of parts) {
                    if (part === '') continue
                    if (!node.children[part]) {
                        node.children[part] = { type: 'folder', children: {} }
                    }
                    node = node.children[part]
                }
                node.children[fileName] = {
                    type: 'file', blob_id: entry.blob_id,
                    size: entry.size | 0, content_hash: entry.content_hash || null,
                    content_type: entry.content_type || null, large: !!entry.large
                }
            }
        },

        // --- Merge commit with two parents -------------------------------------------

        async _commitMerge(message, extraParentId) {
            const entries = await this._buildTreeEntries(this._tree['/'])

            const settingsPlain     = new TextEncoder().encode(JSON.stringify(this._settings))
            const settingsEncrypted = await this._sgSend.encrypt(settingsPlain, this._readKey)
            const settingsBlobId    = await this._objectStore.store(settingsEncrypted)
            const settingsHash      = await this._commitManager.computeContentHash(settingsPlain)
            entries.push({
                name: '.vault-settings.json', size: settingsPlain.byteLength,
                content_hash: settingsHash, content_type: 'application/json', large: false,
                blob_id: settingsBlobId, tree_id: null
            })

            const treeId    = await this._commitManager.createTree(entries)
            const parentIds = [this._headCommitId, extraParentId].filter(Boolean)
            const commitId  = await this._commitManager.createCommit({
                parentIds, treeId, message, branchId: null, signer: this._signer
            })

            const targetRef = this._cloneRefFileId || this._refFileId
            await this._refManager.writeRef(targetRef, commitId)
            this._headCommitId = commitId
        }

    });
})();
