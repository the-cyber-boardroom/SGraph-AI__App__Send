/* =================================================================================
   SGraph Vault — Sync Operations
   v0.2.1 — push, pull, getAheadCount, getBehindCount

   Extends SGVault.prototype. Must load after sg-vault.js.

   Two-ref model:
     Named ref (ref-pid-muw-*) — published state, advances only on push()
     Clone ref (ref-pid-snw-*) — working state, advances on every _commit()

   Conflict model: fast-forward only. pull() refuses if clone has unpushed commits.
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

        // --- Push: fast-forward named branch ref to clone HEAD ------------------

        async push() {
            if (!this._cloneRefFileId) throw new Error('No clone branch initialised')
            if (!this.writable)        throw new Error('Read-only: no write key')
            await this._refManager.writeRef(this._refFileId, this._headCommitId)
            this._namedHeadId = this._headCommitId
        },

        // --- Behind count: new commits on named branch not yet in clone ----------

        async getBehindCount() {
            const serverNamedHead = await this._refManager.readRef(this._refFileId)
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

        async pull() {
            if (!this.writable) throw new Error('Read-only: no write key')

            if (this._headCommitId !== this._namedHeadId) {
                throw new Error('Cannot pull: you have unpushed local commits. Push first, then pull.')
            }

            const serverNamedHead = await this._refManager.readRef(this._refFileId)
            if (!serverNamedHead || serverNamedHead === this._headCommitId) return false

            this._namedHeadId  = serverNamedHead
            this._headCommitId = serverNamedHead

            await this._refManager.writeRef(this._cloneRefFileId, serverNamedHead)
            await this._loadTreeFromCommit(serverNamedHead)

            return true
        },

        // --- Three-way file-level merge -----------------------------------------------
        // Merges theirCommitId into the current working branch.
        // Fast-forwards if no local divergence; three-way file merge if diverged.
        // Returns: { merged: bool, fastForward: bool, conflicts: string[] }

        async merge(theirCommitId) {
            if (!this.writable)          throw new Error('Read-only: no write key')
            if (!this._cloneRefFileId)   throw new Error('No clone branch initialised')
            if (!theirCommitId)          throw new Error('No commit ID provided')

            if (this._headCommitId === theirCommitId) {
                return { merged: false, fastForward: false, conflicts: [], upToDate: true }
            }

            // Ensure all lazy sub-trees in memory are expanded before we flatten
            await this._loadAllSubTreesInMemory()

            const forkId = await this._findCommonAncestor(this._headCommitId, theirCommitId)

            // We are behind → fast-forward (no local divergence)
            if (this._headCommitId === forkId) {
                await this._loadTreeFromCommit(theirCommitId)
                await this._refManager.writeRef(this._cloneRefFileId, theirCommitId)
                this._headCommitId = theirCommitId
                this._namedHeadId  = theirCommitId
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

            const mergeMsg = conflicts.length > 0
                ? `Merge: ${conflicts.length} conflict(s) saved as _conflict copies`
                : 'Merge: auto-synced with published branch'
            await this._commitMerge(mergeMsg, theirCommitId)

            return { merged: true, fastForward: false, conflicts }
        },

        // --- Load all lazy sub-trees into in-memory tree ------------------------------

        async _loadAllSubTreesInMemory() {
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
                            content_hash: entry.content_hash
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
                            content_hash: entry.content_hash
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
                    size: entry.size | 0, content_hash: entry.content_hash || null
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
                content_hash: settingsHash, blob_id: settingsBlobId, tree_id: null
            })

            const treeId    = await this._commitManager.createTree(entries)
            const parentIds = [this._headCommitId, extraParentId].filter(Boolean)
            const commitId  = await this._commitManager.createCommit({
                parentIds, treeId, message, branchId: null
            })

            const targetRef = this._cloneRefFileId || this._refFileId
            await this._refManager.writeRef(targetRef, commitId)
            this._headCommitId = commitId
        }

    });
})();
