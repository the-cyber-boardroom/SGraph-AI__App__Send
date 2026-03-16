/* =================================================================================
   SGraph Vault — Browser Component
   v0.1.0 — File/folder table with breadcrumb, sort, drag-drop, CRUD
   ================================================================================= */

class VaultBrowser extends VaultComponent {

    constructor() {
        super()
        this._vault        = null
        this._currentPath  = '/'
        this._sortField    = 'name'
        this._sortAsc      = true
        this._deleteTarget = null
        this._draggingItem = null  // { name, type } for internal drag
    }

    set vault(v) {
        this._vault = v
        if (this._isReady) this.refresh()
    }

    get vault() { return this._vault }

    bindElements() {
        this._breadcrumb     = this.$('#breadcrumb')
        this._fileList       = this.$('#file-list')
        this._emptyState     = this.$('#empty-state')
        this._statusBar      = this.$('#status-bar')
        this._newFolderBtn   = this.$('#new-folder-btn')
        this._uploadBtn      = this.$('#upload-btn')
        this._newFolderForm  = this.$('#new-folder-form')
        this._newFolderName  = this.$('#new-folder-name')
        this._newFolderOk    = this.$('#new-folder-ok')
        this._newFolderCancel = this.$('#new-folder-cancel')
        this._dropZone       = this.$('#drop-zone')
        this._deleteConfirm  = this.$('#delete-confirm')
        this._deleteMsg      = this.$('#delete-confirm-msg')
        this._deleteYes      = this.$('#delete-yes')
        this._deleteNo       = this.$('#delete-no')
    }

    setupEventListeners() {
        this.addTrackedListener(this._newFolderBtn,    'click',   this._onNewFolderToggle)
        this.addTrackedListener(this._newFolderOk,     'click',   this._onNewFolderCreate)
        this.addTrackedListener(this._newFolderCancel,  'click',   this._onNewFolderCancel)
        this.addTrackedListener(this._newFolderName,   'keydown', this._onNewFolderKey)
        this.addTrackedListener(this._uploadBtn,       'click',   this._onUploadClick)
        this.addTrackedListener(this.$('#sort-name'),   'click',   () => this._setSort('name'))
        this.addTrackedListener(this.$('#sort-size'),   'click',   () => this._setSort('size'))
        this.addTrackedListener(this._deleteYes,       'click',   this._onDeleteConfirm)
        this.addTrackedListener(this._deleteNo,        'click',   this._onDeleteCancel)

        // Drag and drop
        const host = this.shadowRoot.host
        this.addTrackedListener(host, 'dragenter', this._onDragEnter)
        this.addTrackedListener(host, 'dragover',  this._onDragOver)
        this.addTrackedListener(host, 'dragleave', this._onDragLeave)
        this.addTrackedListener(host, 'drop',      this._onDrop)
    }

    // --- Rendering -------------------------------------------------------------

    refresh() {
        if (!this._vault) return
        this._renderBreadcrumb()
        this._renderFileList()
        this._renderStatusBar()
    }

    _renderBreadcrumb() {
        const parts = this._currentPath.split('/').filter(Boolean)
        let html = `<a data-path="/">${this.t('vault.browser.root')}</a>`
        let accumulated = ''
        for (const part of parts) {
            accumulated += '/' + part
            html += `<span class="sep">/</span><a data-path="${this.escapeHtml(accumulated)}">${this.escapeHtml(part)}</a>`
        }
        this._breadcrumb.innerHTML = html
        this._breadcrumb.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                this._currentPath = a.getAttribute('data-path') || '/'
                this.refresh()
            })
        })
    }

    _renderFileList() {
        const items = this._vault.listFolder(this._currentPath)
        if (!items || items.length === 0) {
            this._fileList.innerHTML = ''
            this._emptyState.hidden = false
            return
        }
        this._emptyState.hidden = true

        const sorted = this._sortItems(items)
        this._fileList.innerHTML = sorted.map(item => {
            const isFolder = item.type === 'folder'
            const icon     = isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4'
            const typeLabel = isFolder ? this.t('vault.browser.folder') : this.t('vault.browser.file')
            const size     = isFolder ? '--' : VaultHelpers.formatBytes(item.size)
            const date     = '--'
            const rowClass = isFolder ? 'vault-browser__row vault-browser__row--folder' : 'vault-browser__row'

            return `
                <tr class="${rowClass}" data-name="${this.escapeHtml(item.name)}" data-type="${item.type}" draggable="true">
                    <td class="vault-browser__td"><span class="icon">${icon}</span>${this.escapeHtml(item.name)}</td>
                    <td class="vault-browser__td">${typeLabel}</td>
                    <td class="vault-browser__td">${size}</td>
                    <td class="vault-browser__td">${date}</td>
                    <td class="vault-browser__td vault-browser__td--actions">
                        ${isFolder ? '' : '<button class="action-btn" data-action="download" title="Download">\u2B07</button>'}
                        <button class="action-btn action-btn--danger" data-action="delete" title="Delete">\u2715</button>
                    </td>
                </tr>
            `
        }).join('')

        // Bind row clicks
        this._fileList.querySelectorAll('.vault-browser__row--folder').forEach(row => {
            row.addEventListener('dblclick', () => {
                const name = row.getAttribute('data-name')
                this._currentPath = this._currentPath === '/'
                    ? '/' + name
                    : this._currentPath + '/' + name
                this.refresh()
            })
        })

        // Bind drag source on all rows
        this._fileList.querySelectorAll('tr[draggable]').forEach(row => {
            const name = row.getAttribute('data-name')
            const type = row.getAttribute('data-type')

            row.addEventListener('dragstart', (e) => {
                this._draggingItem = { name, type }
                row.classList.add('vault-browser__row--dragging')
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('application/x-vault-item', JSON.stringify({ name, type }))
            })
            row.addEventListener('dragend', () => {
                row.classList.remove('vault-browser__row--dragging')
                this._draggingItem = null
                this._fileList.querySelectorAll('.vault-browser__row--drop-target').forEach(n =>
                    n.classList.remove('vault-browser__row--drop-target')
                )
            })

            // Folder rows are drop targets
            if (type === 'folder') {
                row.addEventListener('dragover', (e) => {
                    if (!this._draggingItem) return
                    if (this._draggingItem.name === name) return  // can't drop on self
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    row.classList.add('vault-browser__row--drop-target')
                })
                row.addEventListener('dragleave', () => {
                    row.classList.remove('vault-browser__row--drop-target')
                })
                row.addEventListener('drop', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    row.classList.remove('vault-browser__row--drop-target')
                    if (!this._draggingItem) return
                    const destPath = this._currentPath === '/'
                        ? '/' + name
                        : this._currentPath + '/' + name
                    this._emitMoveRequest(this._draggingItem, destPath)
                    this._draggingItem = null
                })
            }
        })

        // Bind action buttons
        this._fileList.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const row    = btn.closest('tr')
                const name   = row.getAttribute('data-name')
                const type   = row.getAttribute('data-type')
                const action = btn.getAttribute('data-action')
                if (action === 'download') this._onDownload(name)
                if (action === 'delete')   this._onDeleteRequest(name, type)
            })
        })
    }

    _renderStatusBar() {
        const stats = this._vault.getStats()
        this._statusBar.textContent = this.t('vault.stats.summary', {
            folders: stats.folders,
            files:   stats.files,
            size:    VaultHelpers.formatBytes(stats.totalSize)
        })
    }

    // --- Sorting ---------------------------------------------------------------

    _sortItems(items) {
        const sorted = [...items]

        // Folders first
        sorted.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1
            if (a.type !== 'folder' && b.type === 'folder') return 1

            let cmp = 0
            if (this._sortField === 'name') {
                cmp = a.name.localeCompare(b.name)
            } else if (this._sortField === 'size') {
                cmp = (a.size || 0) - (b.size || 0)
            }
            return this._sortAsc ? cmp : -cmp
        })

        return sorted
    }

    _setSort(field) {
        if (this._sortField === field) {
            this._sortAsc = !this._sortAsc
        } else {
            this._sortField = field
            this._sortAsc   = true
        }
        this._renderFileList()
    }

    // --- New Folder ------------------------------------------------------------

    _onNewFolderToggle() {
        this._newFolderForm.hidden = false
        this._newFolderName.value  = ''
        this._newFolderName.focus()
    }

    _onNewFolderCancel() {
        this._newFolderForm.hidden = true
    }

    _onNewFolderKey(e) {
        if (e.key === 'Enter')  this._onNewFolderCreate()
        if (e.key === 'Escape') this._onNewFolderCancel()
    }

    async _onNewFolderCreate() {
        const name = this._newFolderName.value.trim()
        if (!name) return

        try {
            const path = this._currentPath === '/'
                ? '/' + name
                : this._currentPath + '/' + name
            await this._vault.createFolder(path)
            this._newFolderForm.hidden = true
            this.refresh()
        } catch (err) {
            this._newFolderName.style.borderColor = 'var(--danger)'
            setTimeout(() => { this._newFolderName.style.borderColor = '' }, 2000)
        }
    }

    // --- Upload ----------------------------------------------------------------

    _onUploadClick() {
        this.emit('vault-upload-request', { path: this._currentPath })
    }

    // --- Download --------------------------------------------------------------

    async _onDownload(fileName) {
        try {
            const data = await this._vault.getFile(this._currentPath, fileName)
            const blob = new Blob([data])
            const url  = URL.createObjectURL(blob)
            const a    = document.createElement('a')
            a.href     = url
            a.download = fileName
            a.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            this.emit('vault-error', { message: err.message })
        }
    }

    // --- Delete ----------------------------------------------------------------

    _onDeleteRequest(name, type) {
        this._deleteTarget = { name, type }
        this._deleteMsg.textContent = this.t('vault.browser.delete_confirm', { name })
        this._deleteConfirm.hidden = false
    }

    async _onDeleteConfirm() {
        if (!this._deleteTarget) return
        const { name, type } = this._deleteTarget

        try {
            if (type === 'folder') {
                const folderPath = this._currentPath === '/'
                    ? '/' + name
                    : this._currentPath + '/' + name
                await this._vault.removeFolder(folderPath)
            } else {
                await this._vault.removeFile(this._currentPath, name)
            }
            this._deleteTarget = null
            this._deleteConfirm.hidden = true
            this.refresh()
            this._updateVaultKey()
        } catch (err) {
            this.emit('vault-error', { message: err.message })
        }
    }

    _onDeleteCancel() {
        this._deleteTarget = null
        this._deleteConfirm.hidden = true
    }

    // --- Drag and Drop ---------------------------------------------------------

    _onDragEnter(e) {
        // Only show upload drop zone for external file drags (not internal moves)
        if (this._draggingItem) return
        e.preventDefault()
        this._dropZone.hidden = false
    }

    _onDragOver(e) {
        e.preventDefault()
    }

    _onDragLeave(e) {
        if (!this.shadowRoot.host.contains(e.relatedTarget)) {
            this._dropZone.hidden = true
        }
    }

    async _onDrop(e) {
        e.preventDefault()
        this._dropZone.hidden = true

        // If this is an internal drag, ignore (handled by row drop targets)
        if (this._draggingItem) return

        const files = e.dataTransfer?.files
        if (!files || files.length === 0) return

        for (const file of files) {
            this.emit('vault-upload-file', {
                path: this._currentPath,
                file
            })
        }
    }

    _emitMoveRequest(item, destFolderPath) {
        if (item.type === 'file') {
            this.emit('file-move-request', {
                fileName:      item.name,
                srcFolderPath: this._currentPath,
                destFolderPath
            })
        } else {
            const srcPath = this._currentPath === '/'
                ? '/' + item.name
                : this._currentPath + '/' + item.name
            this.emit('folder-move-request', {
                srcPath,
                destParentPath: destFolderPath
            })
        }
    }

    // --- Vault Key Update ------------------------------------------------------

    _updateVaultKey() {
        this.emit('vault-key-changed', {})
    }

    // --- Public API ------------------------------------------------------------

    navigateTo(path) {
        this._currentPath = path || '/'
        this.refresh()
    }
}

customElements.define('vault-browser', VaultBrowser)
