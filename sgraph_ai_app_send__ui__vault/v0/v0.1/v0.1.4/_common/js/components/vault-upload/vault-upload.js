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

    _onDrop(e) {
        e.preventDefault()
        this._dropArea.classList.remove('active')
        const files = e.dataTransfer?.files
        if (files && files.length > 0) this._addFiles(files)
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

        for (let i = 0; i < this._queue.length; i++) {
            const item = this._queue[i]
            if (item.status !== 'pending') continue

            item.status = 'active'
            this._renderQueue()

            try {
                // Read file
                this._setProgress(0, this.t('vault.upload.encrypting'))
                const arrayBuffer = await this._readFile(item.file)

                // Encrypt + upload via vault
                this._setProgress(50, this.t('vault.upload.uploading'))
                await this._vault.addFile(this._targetPath, item.file.name, new Uint8Array(arrayBuffer))

                item.status = 'done'
                this._setProgress(100, this.t('vault.upload.success', { name: item.file.name }))

                this.emit('vault-file-added', {
                    fileName:   item.file.name,
                    folderPath: this._targetPath
                })

            } catch (err) {
                item.status = 'error'
                this._setProgress(0, this.t('vault.upload.failed', { error: err.message }))
            }

            this._renderQueue()
        }

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
