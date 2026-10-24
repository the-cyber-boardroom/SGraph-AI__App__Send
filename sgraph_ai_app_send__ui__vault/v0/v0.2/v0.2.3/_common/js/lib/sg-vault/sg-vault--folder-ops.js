/* =================================================================================
   SGraph Vault — Folder Operations
   v0.2.1 — createFolder, listFolder, removeFolder, renameFolder, moveFolder,
             loadSubTreeOnDemand, loadAllSubTrees (bulk, level by level), needsLoading

   Extends SGVault.prototype. Must load after sg-vault.js.
   ================================================================================= */

(function() {
    'use strict';

    Object.assign(SGVault.prototype, {

        async createFolder(folderPath) {
            const parts      = folderPath.split('/').filter(Boolean)
            const name       = parts.pop()
            const parentPath = '/' + parts.join('/')
            const parent     = this._findNode(parentPath)
            if (!parent || parent.type !== 'folder') {
                throw new Error(`Parent folder not found: ${parentPath}`)
            }
            if (parent.children[name]) throw new Error(`Already exists: ${name}`)
            parent.children[name] = { type: 'folder', children: {} }
            this._markDirty(parentPath)
            await this._commit(`Create folder ${name}`)
        },

        listFolder(folderPath) {
            const node = this._findNode(folderPath)
            if (!node || node.type !== 'folder') return null
            return Object.entries(node.children).map(([name, entry]) => ({
                name,
                type:         entry.type,
                size:         entry.size || 0,
                content_hash: entry.content_hash || null,
                content_type: entry.content_type || null,
                large:        !!entry.large,
                blob_id:      entry.blob_id || null
            }))
        },

        async removeFolder(folderPath) {
            const parts      = folderPath.split('/').filter(Boolean)
            const name       = parts.pop()
            const parentPath = '/' + parts.join('/')
            const parent     = this._findNode(parentPath)
            if (!parent || parent.type !== 'folder') throw new Error(`Parent folder not found`)
            if (!parent.children[name]) throw new Error(`Folder not found: ${name}`)
            delete parent.children[name]
            this._markDirty(parentPath)
            await this._commit(`Remove folder ${name}`)
        },

        async renameFolder(folderPath, newName) {
            const parts      = folderPath.split('/').filter(Boolean)
            const oldName    = parts.pop()
            const parentPath = '/' + parts.join('/')
            const parent     = this._findNode(parentPath)
            if (!parent || parent.type !== 'folder') throw new Error(`Parent folder not found`)
            if (!parent.children[oldName]) throw new Error(`Folder not found: ${oldName}`)
            if (parent.children[newName]) throw new Error(`Already exists: ${newName}`)
            parent.children[newName] = parent.children[oldName]
            delete parent.children[oldName]
            this._markDirty(parentPath)
            await this._commit(`Rename folder ${oldName} to ${newName}`)
        },

        async moveFolder(srcPath, destParentPath) {
            const srcParts      = srcPath.split('/').filter(Boolean)
            const folderName    = srcParts.pop()
            const srcParentPath = '/' + srcParts.join('/')
            if (srcParentPath === destParentPath) return

            const srcParent  = this._findNode(srcParentPath)
            if (!srcParent || srcParent.type !== 'folder') throw new Error(`Source parent not found`)
            const folderNode = srcParent.children[folderName]
            if (!folderNode || folderNode.type !== 'folder') throw new Error(`Folder not found: ${folderName}`)

            if (destParentPath === srcPath || destParentPath.startsWith(srcPath + '/')) {
                throw new Error(`Cannot move folder into itself`)
            }

            const destParent = this._findNode(destParentPath)
            if (!destParent || destParent.type !== 'folder') throw new Error(`Destination folder not found: ${destParentPath}`)
            if (destParent.children[folderName]) throw new Error(`Already exists in destination: ${folderName}`)

            destParent.children[folderName] = folderNode
            delete srcParent.children[folderName]
            this._markDirty(srcParentPath)
            this._markDirty(destParentPath)
            await this._commit(`Move folder ${folderName}`)
        },

        // --- Lazy Sub-Tree Loading (called by UI when folder is expanded) --------

        async loadSubTreeOnDemand(folderPath) {
            const node = this._findNode(folderPath)
            if (!node || node.type !== 'folder') return false
            if (node._loaded !== false || !node._tree_id) return false

            const subTree = await this._commitManager.loadTree(node._tree_id)
            this._applySubTree(node, subTree)
            return true
        },

        // Fill a lazy folder node from its decrypted tree object.
        _applySubTree(node, subTree) {
            for (const entry of subTree.entries) {
                if (entry.tree_id) {
                    node.children[entry.name] = {
                        type: 'folder', children: {}, _tree_id: entry.tree_id, _loaded: false
                    }
                } else {
                    node.children[entry.name] = {
                        type: 'file', blob_id: entry.blob_id,
                        size: entry.size || 0, content_hash: entry.content_hash || null,
                        content_type: entry.content_type || null, large: !!entry.large
                    }
                }
            }
            node._cleanTreeId = node._tree_id   // save for reuse in _buildTreeEntries if unmodified
            node._loaded      = true
            node._dirty       = false
            delete node._tree_id
        },

        // --- Load EVERY lazy sub-tree, in bulk, as a streaming walk ------------------------
        // The shells expand the whole tree on open. Doing that one folder at a time cost one
        // GET per folder object: 7,800 requests and ten minutes on a vault with 25,000 files.
        // This is the sgit CLI's tree walk ("Walking trees: fetching N tree(s)") with one
        // improvement: instead of finishing a level before starting the next, a pool of
        // workers keeps `concurrency` batch POSTs in flight the whole time. Each worker takes
        // up to `chunk` pending tree ids, fetches them in one POST (bare/data reads, 50 ids),
        // decrypts them in parallel, inserts the children and queues the folders it found.
        // A tree id shared by several folders is fetched once. Immutable objects land in the
        // block cache, so a second open of the same vault reads them locally.
        //   opts.onProgress({ folders, pending }) after every chunk; opts.chunk / opts.concurrency
        // Returns { folders, requests, failed } — folders = trees loaded by this call; failed =
        // [{ tree_id, reason }] for folders that could NOT be loaded and stay lazy (they render
        // empty until a reload). The walk never throws for a missing tree: a vault that is 99 %
        // loaded is better shown than not shown, but the caller must surface `failed`.
        // Concurrent calls share one walk (the shells and the app page both call this on open).

        async loadAllSubTrees(opts) {
            if (this._bulkLoad) return this._bulkLoad
            this._bulkLoad = this._loadAllSubTreesNow(opts || {}).finally(() => { this._bulkLoad = null })
            return this._bulkLoad
        },

        async _loadAllSubTreesNow(opts) {
            const CHUNK = opts.chunk       || SGVaultObjectStore.BATCH_CHUNK
            const CONC  = opts.concurrency || SGVaultObjectStore.BATCH_CONCURRENCY

            const pending = []                                       // lazy folder nodes not yet requested
            const byId    = new Map()                                // tree id → [nodes waiting for it]
            const enqueue = (node) => {
                if (!byId.has(node._tree_id)) { byId.set(node._tree_id, []); pending.push(node._tree_id) }
                byId.get(node._tree_id).push(node)
            }
            const collect = (node) => {
                for (const child of Object.values(node.children || {})) {
                    if (child.type !== 'folder') continue
                    if (child._loaded === false && child._tree_id) enqueue(child)
                    else collect(child)
                }
            }
            collect(this._tree['/'])

            let folders = 0, requests = 0, inFlight = 0, active = 0
            const failures = new Map()
            const report = () => { if (opts.onProgress) { try { opts.onProgress({ folders, pending: pending.length + inFlight, failed: failures.size }) } catch (_) {} } }

            const take = () => pending.splice(0, CHUNK)
            // `active` counts RUNNING tasks (fetch + parse + enqueue), not ids: a worker must not
            // decide "nothing left" while another worker is still parsing a chunk whose folders
            // it has not queued yet (that mistake serialised the whole walk: one worker survived).
            const run  = async (ids) => {
              active++; inFlight += ids.length; requests++
              try {
                const ciphers = await this._objectStore.batchLoad(ids, { chunk: CHUNK, concurrency: 1, failures })
                inFlight -= ids.length
                await Promise.all(ids.map(async (id) => {
                    const ct = ciphers.get(id)
                    if (!ct) { if (!failures.has(id)) failures.set(id, 'missing'); return }   // stays lazy
                    let tree
                    try { tree = await this._commitManager.parseTree(ct) } catch (e) { failures.set(id, 'undecryptable: ' + (e && e.message)); return }
                    for (const node of byId.get(id) || []) {
                        if (node._loaded !== false) continue
                        this._applySubTree(node, tree)
                        folders++
                        for (const child of Object.values(node.children)) {
                            if (child.type === 'folder' && child._loaded === false && child._tree_id) enqueue(child)
                        }
                    }
                    byId.delete(id)
                }))
              } finally { active-- }
              report()
            }

            // Worker pool: a worker fetches whatever is pending (up to one chunk), and idles briefly
            // while other workers' results may still add to the queue. The walk ends when the queue
            // is empty and nothing is in flight.
            const sleep = (ms) => new Promise(r => setTimeout(r, ms))
            const worker = async () => {
                for (;;) {
                    if (pending.length) { await run(take()); continue }
                    if (!active) return
                    await sleep(15)
                }
            }
            await Promise.all(Array.from({ length: Math.max(1, CONC) }, worker))
            const failed = Array.from(failures, ([tree_id, reason]) => ({ tree_id, reason }))
            if (failed.length) console.warn(`[sg-vault] loadAllSubTrees: ${failed.length} folder(s) could not be loaded and stay empty`, failed.slice(0, 5))
            return { folders, requests, failed }
        },

        needsLoading(folderPath) {
            const node = this._findNode(folderPath)
            return node && node.type === 'folder' && node._loaded === false && !!node._tree_id
        }

    });
})();
