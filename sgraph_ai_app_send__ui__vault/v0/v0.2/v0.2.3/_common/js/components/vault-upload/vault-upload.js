/* =================================================================================
   SGraph Vault — Upload Component
   v0.1.3 — File upload with encrypt-and-upload flow
   ================================================================================= */

class VaultUpload extends VaultComponent {

    constructor() {
        super()
        this._vault       = null
        this._targetPath  = '/'
        this._queue       = []
        this._uploading   = false
    }

    set vault(v)      { this._vault = v }
    set targetPath(p) { this._targetPath = p || '/' }

    bindElements() {
        this._dropArea     = this.$('#drop-area')
        this._fileInput    = this.$('#file-input')
        this._browseLink   = this.$('#browse-link')
        this._queueEl      = this.$('#upload-queue')
        this._progressArea = this.$('#progress-area')
        this._progressFill = this.$('#progress-fill')
        this._progressLabel = this.$('#progress-label')
    }

    setupEventListeners() {
        this.addTrackedListener(this._browseLink, 'click',    () => this._fileInput.click())
        this.addTrackedListener(this._dropArea,   'click',    () => this._fileInput.click())
        this.addTrackedListener(this._fileInput,  'change',   this._onFilesSelected)
        this.addTrackedListener(this._dropArea,   'dragover', (e) => { e.preventDefault(); this._dropArea.classList.add('active') })
        this.addTrackedListener(this._dropArea,   'dragleave', () => this._dropArea.classList.remove('active'))
        this.addTrackedListener(this._dropArea,   'drop',     this._onDrop)
    }

    async _onDrop(e) {
        e.preventDefault()
        this._dropArea.classList.remove('active')

        // Use DataTransferItemList when available to support folder drops
        const items = e.dataTransfer?.items
        if (items && items.length > 0) {
            const entries = []
            for (const item of items) {
                if (item.webkitGetAsEntry) {
                    const entry = item.webkitGetAsEntry()
                    if (entry) entries.push(entry)
                }
            }
            if (entries.length > 0) {
                const files = await this._collectFromEntries(entries)
                if (files.length > 0) this._addFiles(files)
                return
            }
        }

        // Fallback: plain FileList (no folder support)
        const files = e.dataTransfer?.files
        if (files && files.length > 0) this._addFiles(files)
    }

    // Recursively collect all File objects from a list of FileSystemEntry objects
    async _collectFromEntries(entries) {
        const files = []
        const readEntry = (entry) => new Promise((resolve) => {
            if (entry.isFile) {
                entry.file((f) => { files.push(f); resolve(); }, () => resolve())
            } else if (entry.isDirectory) {
                const reader = entry.createReader()
                const readBatch = () => {
                    reader.readEntries(async (batch) => {
                        if (!batch || batch.length === 0) { resolve(); return }
                        for (const child of batch) await readEntry(child)
                        readBatch()  // readEntries may return partial batches
                    }, () => resolve())
                }
                readBatch()
            } else {
                resolve()
            }
        })
        for (const entry of entries) await readEntry(entry)
        return files
    }

    _onFilesSelected() {
        const files = this._fileInput.files
        if (files && files.length > 0) this._addFiles(files)
    }

    _addFiles(fileList) {
        for (const file of fileList) {
            this._queue.push({ file, status: 'pending' })
        }
        this._renderQueue()
        if (!this._uploading) this._processQueue()
    }

    _renderQueue() {
        this._queueEl.innerHTML = this._queue.map((item, i) => {
            const icon = item.status === 'done'    ? '\u2705'
                       : item.status === 'error'   ? '\u274C'
                       : item.status === 'active'  ? '\u23F3'
                       : '\u2022'
            return `
                <div class="vault-upload__queue-item">
                    <span class="status-icon">${icon}</span>
                    <span class="name">${this.escapeHtml(item.file.name)}</span>
                    <span class="size">${VaultHelpers.formatBytes(item.file.size)}</span>
                </div>
            `
        }).join('')
    }

    async _processQueue() {
        this._uploading = true
        this._progressArea.hidden = false

        // Collect all pending items to process as a single batch commit
        const pending = this._queue.filter(i => i.status === 'pending')
        if (pending.length === 0) { this._uploading = false; return }

        // Mark all as active
        pending.forEach(i => { i.status = 'active' })
        this._renderQueue()

        // Step 1: Read all files into memory
        this._setProgress(0, this.t('vault.upload.encrypting'))
        const batchItems = []
        for (const item of pending) {
            try {
                const arrayBuffer = await this._readFile(item.file)
                batchItems.push({
                    folderPath: this._targetPath,
                    fileName:   item.file.name,
                    fileData:   new Uint8Array(arrayBuffer),
                    _queueItem: item
                })
            } catch (err) {
                item.status = 'error'
                this._setProgress(0, this.t('vault.upload.failed', { error: err.message }))
            }
        }

        // Step 2: Encrypt, upload, and commit all files in a single batch
        if (batchItems.length > 0) {
            this._setProgress(50, this.t('vault.upload.uploading'))
            try {
                await this._vault.addFiles(batchItems.map(b => ({
                    folderPath: b.folderPath,
                    fileName:   b.fileName,
                    fileData:   b.fileData
                })))

                batchItems.forEach(b => { b._queueItem.status = 'done' })
                const successMsg = batchItems.length === 1
                    ? this.t('vault.upload.success', { name: batchItems[0].fileName })
                    : `Uploaded ${batchItems.length} files`
                this._setProgress(100, successMsg)

                // Emit one event to signal the tree changed
                this.emit('vault-file-added', {
                    fileNames:  batchItems.map(b => b.fileName),
                    folderPath: this._targetPath
                })

            } catch (err) {
                batchItems.forEach(b => { b._queueItem.status = 'error' })
                this._setProgress(0, this.t('vault.upload.failed', { error: err.message }))
            }
        }

        this._renderQueue()
        this._uploading = false

        // Clear completed items after a short delay
        setTimeout(() => {
            this._queue = this._queue.filter(i => i.status !== 'done')
            this._renderQueue()
            if (this._queue.length === 0) {
                this._progressArea.hidden = true
            }
        }, 2000)
    }

    _readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload  = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.readAsArrayBuffer(file)
        })
    }

    _setProgress(pct, label) {
        this._progressFill.style.width = pct + '%'
        this._progressLabel.textContent = label
    }

    // --- Public: upload a single file programmatically -------------------------

    async uploadFile(file, path) {
        if (path !== undefined) this._targetPath = path || '/'
        this._addFiles([file])
    }
}

customElements.define('vault-upload', VaultUpload)
