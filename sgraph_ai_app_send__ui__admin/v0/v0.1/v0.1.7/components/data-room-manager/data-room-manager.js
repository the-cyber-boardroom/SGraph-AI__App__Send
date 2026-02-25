/* =============================================================================
   SGraph Send Admin Console — Data Room Manager Web Component
   v0.1.7 — Data room lifecycle management panel

   Features:
     - Room list table (name, owner, status, members, created)
     - Create room form (name, owner, description)
     - Room detail view (click to expand)
       - Members tab: list, add, remove members
       - Invites tab: create invite, show invite code
       - Audit tab: view audit trail
     - Archive room with confirmation

   Usage:
     <data-room-manager></data-room-manager>

   API calls (via adminAPI extensions in admin-api-rooms.js):
     GET  /rooms/list              — list all rooms
     POST /rooms/create            — create a new room
     GET  /rooms/lookup/{id}       — room detail
     POST /rooms/archive/{id}      — archive a room
     GET  /rooms/members/{id}      — list members
     POST /rooms/members-add/{id}  — add member
     DELETE /rooms/members-remove   — remove member
     POST /rooms/invite/{id}       — create invite
     GET  /rooms/audit/{id}        — audit trail
   ============================================================================= */

class DataRoomManager extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._rooms          = [];
        this._loading        = false;
        this._error          = null;
        this._selectedRoom   = null;       // room_id of expanded row
        this._roomDetail     = null;       // full lookup data
        this._showCreateForm = false;
        this._creating       = false;
        this._archiving      = null;       // room_id being archived (confirm state)

        // Detail tabs
        this._activeTab      = 'members';  // members | invites | audit
        this._members        = [];
        this._membersLoading = false;
        this._auditEvents    = [];
        this._auditLoading   = false;
        this._lastInvite     = null;       // last created invite result
        this._inviteCreating = false;
        this._enterRoomLink  = '';        // generated enter-room join link
        this._enterCreating  = false;
    }

    connectedCallback() {
        this.render();
    }

    // --- Public (called by shell) -------------------------------------------

    onActivated() {
        this.loadRooms();
    }

    // --- Data Loading -------------------------------------------------------

    async loadRooms() {
        this._loading = true;
        this._error   = null;
        this._renderList();

        try {
            const result  = await adminAPI.roomList();
            this._rooms   = result.rooms || [];
            this._loading = false;
        } catch (err) {
            this._loading = false;
            this._error   = err.message;
        }

        this._renderList();
    }

    async _loadRoomDetail(roomId) {
        try {
            this._roomDetail = await adminAPI.roomLookup(roomId);
        } catch (err) {
            this._roomDetail = { error: err.message };
        }
        this._renderDetail();
        this._loadTabData();
    }

    async _loadTabData() {
        if (this._activeTab === 'members') {
            await this._loadMembers();
        } else if (this._activeTab === 'audit') {
            await this._loadAudit();
        }
    }

    async _loadMembers() {
        if (!this._selectedRoom) return;
        this._membersLoading = true;
        this._renderDetail();

        try {
            const result = await adminAPI.roomMembers(this._selectedRoom);
            this._members        = result.members || [];
            this._membersLoading = false;
        } catch (err) {
            this._members        = [];
            this._membersLoading = false;
            this._error          = `Members: ${err.message}`;
        }
        this._renderDetail();
    }

    async _loadAudit() {
        if (!this._selectedRoom) return;
        this._auditLoading = true;
        this._renderDetail();

        try {
            const result = await adminAPI.roomAudit(this._selectedRoom);
            this._auditEvents  = result.events || [];
            this._auditLoading = false;
        } catch (err) {
            this._auditEvents  = [];
            this._auditLoading = false;
            this._error        = `Audit: ${err.message}`;
        }
        this._renderDetail();
    }

    // --- Create Room --------------------------------------------------------

    async _handleCreate(e) {
        e.preventDefault();
        const form = this.shadowRoot.querySelector('#create-form');
        if (!form) return;

        const name        = form.querySelector('#input-name').value.trim();
        const ownerUserId = form.querySelector('#input-owner').value.trim();
        const description = form.querySelector('#input-desc').value.trim();

        if (!name || !ownerUserId) return;

        this._creating = true;
        this._renderCreateForm();

        try {
            await adminAPI.roomCreate(name, ownerUserId, description);
            this._showCreateForm = false;
            this._creating       = false;
            await this.loadRooms();
        } catch (err) {
            this._creating = false;
            this._error    = `Create failed: ${err.message}`;
            this._renderCreateForm();
            this._renderError();
        }
    }

    // --- Archive Room -------------------------------------------------------

    async _handleArchive(roomId) {
        if (this._archiving === roomId) {
            try {
                await adminAPI.roomArchive(roomId);
                this._archiving    = null;
                this._selectedRoom = null;
                this._roomDetail   = null;
                await this.loadRooms();
            } catch (err) {
                this._archiving = null;
                this._error     = `Archive failed: ${err.message}`;
                this._renderList();
            }
            return;
        }
        this._archiving = roomId;
        this._renderList();

        setTimeout(() => {
            if (this._archiving === roomId) {
                this._archiving = null;
                this._renderList();
            }
        }, 3000);
    }

    // --- Add Member ---------------------------------------------------------

    async _handleAddMember(e) {
        e.preventDefault();
        const form = this.shadowRoot.querySelector('#add-member-form');
        if (!form || !this._selectedRoom || !this._roomDetail) return;

        const userId     = form.querySelector('#member-user-id').value.trim();
        const permission = form.querySelector('#member-permission').value;

        if (!userId) return;

        const owner = this._roomDetail.owner_user_id || '';

        try {
            await adminAPI.roomAddMember(this._selectedRoom, userId, permission, owner);
            form.querySelector('#member-user-id').value = '';
            await this._loadMembers();
        } catch (err) {
            this._error = `Add member: ${err.message}`;
            this._renderError();
        }
    }

    // --- Remove Member ------------------------------------------------------

    async _handleRemoveMember(userId) {
        if (!this._selectedRoom) return;
        try {
            await adminAPI.roomRemoveMember(this._selectedRoom, userId);
            await this._loadMembers();
        } catch (err) {
            this._error = `Remove member: ${err.message}`;
            this._renderError();
        }
    }

    // --- Create Invite ------------------------------------------------------

    async _handleCreateInvite(e) {
        e.preventDefault();
        const form = this.shadowRoot.querySelector('#create-invite-form');
        if (!form || !this._selectedRoom || !this._roomDetail) return;

        const permission = form.querySelector('#invite-permission').value;
        const maxUses    = parseInt(form.querySelector('#invite-max-uses').value, 10) || 1;
        const owner      = this._roomDetail.owner_user_id || '';

        this._inviteCreating = true;
        this._renderDetail();

        try {
            this._lastInvite     = await adminAPI.roomCreateInvite(this._selectedRoom, permission, owner, maxUses);
            this._inviteCreating = false;
        } catch (err) {
            this._inviteCreating = false;
            this._error          = `Create invite: ${err.message}`;
        }
        this._renderDetail();
    }

    // --- Enter Room (self-invite with room key) ----------------------------

    async _handleEnterRoom() {
        if (!this._selectedRoom || !this._roomDetail || this._enterCreating) return;

        this._enterCreating = true;
        this._enterRoomLink = '';
        this._renderDetail();

        try {
            const owner  = this._roomDetail.owner_user_id || 'admin';
            const result = await adminAPI.roomCreateInvite(this._selectedRoom, 'editor', owner, 1);

            if (result && result.invite_code) {
                // Generate a room key (32 random bytes → 64 hex chars)
                const bytes  = crypto.getRandomValues(new Uint8Array(32));
                const keyHex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

                // Build join URL: user lambda join page with code + key in hash
                const userBase = this._getUserLambdaUrl();
                this._enterRoomLink = `${userBase}/send/v0/v0.1/v0.1.8/join.html#${result.invite_code}::${keyHex}`;
            }
        } catch (err) {
            this._error = `Enter room: ${err.message}`;
        }

        this._enterCreating = false;
        this._renderDetail();
    }

    _getUserLambdaUrl() {
        // Explicit config
        if (window.sgraphAdmin && window.sgraphAdmin.userLambdaUrl) {
            return window.sgraphAdmin.userLambdaUrl;
        }
        const loc = window.location;
        // Production: admin.sgraph.ai → send.sgraph.ai
        if (loc.hostname.startsWith('admin.') && loc.hostname.includes('sgraph')) {
            return `${loc.protocol}//${loc.hostname.replace(/^admin\./, 'send.')}`;
        }
        // Dev: same origin
        return loc.origin;
    }

    // --- Row Selection ------------------------------------------------------

    _handleRowClick(roomId) {
        if (this._selectedRoom === roomId) {
            this._selectedRoom  = null;
            this._roomDetail    = null;
            this._members       = [];
            this._auditEvents   = [];
            this._lastInvite    = null;
            this._enterRoomLink = '';
        } else {
            this._selectedRoom  = roomId;
            this._activeTab     = 'members';
            this._lastInvite    = null;
            this._enterRoomLink = '';
            this._loadRoomDetail(roomId);
        }
        this._renderList();
    }

    _handleTabClick(tab) {
        this._activeTab = tab;
        this._loadTabData();
        this._renderDetail();
    }

    // --- Render (full) ------------------------------------------------------

    render() {
        this.shadowRoot.innerHTML = `
            <style>${DataRoomManager.styles}</style>
            <div class="drm">
                <div class="panel-header">
                    <h2 class="panel-header__title">Data Rooms</h2>
                    <div class="panel-header__actions">
                        <button class="btn btn--ghost btn--sm" id="btn-refresh" title="Refresh">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                                <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                        <button class="btn btn--primary btn--sm" id="btn-create">
                            + Create Room
                        </button>
                    </div>
                </div>
                <div id="error-container"></div>
                <div id="create-form-container"></div>
                <div id="list-container"></div>
            </div>
        `;

        this.shadowRoot.querySelector('#btn-refresh').addEventListener('click', () => this.loadRooms());
        this.shadowRoot.querySelector('#btn-create').addEventListener('click', () => {
            this._showCreateForm = !this._showCreateForm;
            this._renderCreateForm();
        });
    }

    // --- Render: Error ------------------------------------------------------

    _renderError() {
        const el = this.shadowRoot.querySelector('#error-container');
        if (!el) return;
        if (!this._error) { el.innerHTML = ''; return; }
        el.innerHTML = `
            <div class="error-bar">
                <span>${this._esc(this._error)}</span>
                <button class="btn btn--ghost btn--xs" id="btn-dismiss-error">Dismiss</button>
            </div>
        `;
        el.querySelector('#btn-dismiss-error').addEventListener('click', () => {
            this._error = null;
            this._renderError();
        });
    }

    // --- Render: Create Form ------------------------------------------------

    _renderCreateForm() {
        const el = this.shadowRoot.querySelector('#create-form-container');
        if (!el) return;
        if (!this._showCreateForm) { el.innerHTML = ''; return; }
        el.innerHTML = `
            <form class="create-form" id="create-form">
                <div class="create-form__title">Create New Data Room</div>
                <div class="create-form__fields">
                    <div class="field">
                        <label for="input-name">Room Name</label>
                        <input id="input-name" type="text" placeholder="e.g. Q1 Budget Review" required
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                    <div class="field">
                        <label for="input-owner">Owner User ID</label>
                        <input id="input-owner" type="text" placeholder="e.g. alice@example.com" required
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                    <div class="field">
                        <label for="input-desc">Description</label>
                        <input id="input-desc" type="text" placeholder="Optional description"
                               ${this._creating ? 'disabled' : ''}>
                    </div>
                </div>
                <div class="create-form__actions">
                    <button type="button" class="btn btn--ghost btn--sm" id="btn-cancel-create"
                            ${this._creating ? 'disabled' : ''}>Cancel</button>
                    <button type="submit" class="btn btn--primary btn--sm"
                            ${this._creating ? 'disabled' : ''}>
                        ${this._creating ? '<span class="spinner"></span> Creating...' : 'Create'}
                    </button>
                </div>
            </form>
        `;

        el.querySelector('#create-form').addEventListener('submit', (e) => this._handleCreate(e));
        el.querySelector('#btn-cancel-create').addEventListener('click', () => {
            this._showCreateForm = false;
            this._renderCreateForm();
        });
    }

    // --- Render: Room List --------------------------------------------------

    _renderList() {
        const el = this.shadowRoot.querySelector('#list-container');
        if (!el) return;

        if (this._loading && this._rooms.length === 0) {
            el.innerHTML = `
                <div class="loading">
                    <span class="spinner"></span>
                    <span>Loading rooms...</span>
                </div>
            `;
            return;
        }

        if (!this._loading && this._rooms.length === 0 && !this._error) {
            el.innerHTML = `
                <div class="empty">
                    <div class="empty__text">No data rooms created yet</div>
                    <div class="empty__hint">Create a room to get started</div>
                </div>
            `;
            return;
        }

        const rows = this._rooms.map(r => this._renderRow(r)).join('');

        el.innerHTML = `
            <table class="room-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Owner</th>
                        <th>Status</th>
                        <th>Members</th>
                        <th>Created</th>
                        <th class="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ${this._loading ? '<div class="loading loading--inline"><span class="spinner"></span></div>' : ''}
        `;

        this._renderError();

        // Wire row clicks
        el.querySelectorAll('.room-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._handleRowClick(row.dataset.room);
            });
        });

        // Wire archive buttons
        el.querySelectorAll('.btn-archive').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleArchive(btn.dataset.room);
            });
        });

        // Wire detail tabs
        el.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleTabClick(btn.dataset.tab);
            });
        });

        // Wire add-member form
        const addMemberForm = el.querySelector('#add-member-form');
        if (addMemberForm) {
            addMemberForm.addEventListener('submit', (e) => this._handleAddMember(e));
        }

        // Wire remove-member buttons
        el.querySelectorAll('.btn-remove-member').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleRemoveMember(btn.dataset.user);
            });
        });

        // Wire create-invite form
        const inviteForm = el.querySelector('#create-invite-form');
        if (inviteForm) {
            inviteForm.addEventListener('submit', (e) => this._handleCreateInvite(e));
        }
    }

    _renderRow(room) {
        const roomId      = room.room_id       || '';
        const name        = room.name          || 'Unnamed';
        const owner       = room.owner_user_id || '-';
        const status      = room.status        || 'unknown';
        const memberCount = room.member_count   ?? 0;
        const created     = room.created       || '';
        const isSelected  = this._selectedRoom === roomId;
        const isArchiving = this._archiving    === roomId;
        const isActive    = status === 'active';

        const createdDate = created ? new Date(created).toLocaleDateString() : '-';

        return `
            <tr class="room-row ${isSelected ? 'room-row--selected' : ''}" data-room="${this._attr(roomId)}">
                <td class="col-name">
                    <span class="room-name">${this._esc(name)}</span>
                </td>
                <td class="col-owner">
                    <span class="owner-id">${this._esc(owner)}</span>
                </td>
                <td>
                    <span class="status-badge status-badge--${status}">${status}</span>
                </td>
                <td class="col-members">${memberCount}</td>
                <td class="col-created">${createdDate}</td>
                <td class="col-actions">
                    ${isActive ? `
                        <button class="btn btn--danger btn--xs btn-archive" data-room="${this._attr(roomId)}">
                            ${isArchiving ? 'Confirm Archive?' : 'Archive'}
                        </button>
                    ` : ''}
                </td>
            </tr>
            ${isSelected ? `
                <tr class="detail-row">
                    <td colspan="6" id="inline-detail">
                        ${this._renderInlineDetail()}
                    </td>
                </tr>
            ` : ''}
        `;
    }

    // --- Render: Room Detail (inline) ---------------------------------------

    _renderInlineDetail() {
        if (!this._roomDetail) {
            return '<div class="loading loading--sm"><span class="spinner"></span> Loading detail...</div>';
        }
        if (this._roomDetail.error) {
            return `<div class="error-bar">${this._esc(this._roomDetail.error)}</div>`;
        }

        const d = this._roomDetail;
        const tabs = ['members', 'invites', 'audit'];

        return `
            <div class="detail-panel">
                <div class="detail-header">
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Room ID</span>
                            <span class="detail-value detail-value--mono">${this._esc(d.room_id || '')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Description</span>
                            <span class="detail-value">${this._esc(d.description || '-')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Vault Key</span>
                            <span class="detail-value detail-value--mono">${this._esc(d.vault_cache_key || '-')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Created</span>
                            <span class="detail-value">${d.created ? new Date(d.created).toLocaleString() : '-'}</span>
                        </div>
                    </div>
                </div>
                <div class="enter-room-section">
                    <button class="btn btn--primary btn--sm" id="btn-enter-room"
                            ${this._enterCreating ? 'disabled' : ''}>
                        ${this._enterCreating ? '<span class="spinner"></span>' : ''} Enter Room
                    </button>
                    ${this._enterRoomLink ? `
                        <div class="enter-room-result">
                            <span class="detail-label">Join link (includes room key — single use):</span>
                            <div class="enter-room-link-row">
                                <input type="text" class="enter-room-link" id="enter-room-link"
                                       value="${this._attr(this._enterRoomLink)}" readonly>
                                <button class="btn btn--primary btn--xs" id="btn-copy-enter-link">Copy</button>
                                <a class="btn btn--primary btn--xs" href="${this._attr(this._enterRoomLink)}"
                                   target="_blank" rel="noopener" id="btn-open-enter-link">Open</a>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="tabs">
                    ${tabs.map(t => `
                        <button class="tab-btn ${this._activeTab === t ? 'tab-btn--active' : ''}"
                                data-tab="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>
                    `).join('')}
                </div>
                <div class="tab-content">
                    ${this._renderTabContent()}
                </div>
            </div>
        `;
    }

    _renderTabContent() {
        switch (this._activeTab) {
            case 'members': return this._renderMembersTab();
            case 'invites': return this._renderInvitesTab();
            case 'audit':   return this._renderAuditTab();
            default:        return '';
        }
    }

    // --- Members Tab --------------------------------------------------------

    _renderMembersTab() {
        if (this._membersLoading) {
            return '<div class="loading loading--sm"><span class="spinner"></span> Loading members...</div>';
        }

        const memberRows = this._members.map(m => {
            const userId     = m.user_id    || m.entity_id || '';
            const permission = m.permission || 'viewer';
            const isOwner    = permission === 'owner';
            return `
                <tr>
                    <td class="detail-value--mono">${this._esc(userId)}</td>
                    <td><span class="perm-badge perm-badge--${permission}">${permission}</span></td>
                    <td class="col-actions">
                        ${!isOwner ? `<button class="btn btn--danger btn--xs btn-remove-member" data-user="${this._attr(userId)}">Remove</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <table class="members-table">
                <thead>
                    <tr><th>User ID</th><th>Permission</th><th class="col-actions">Actions</th></tr>
                </thead>
                <tbody>
                    ${memberRows || '<tr><td colspan="3" class="empty-cell">No members</td></tr>'}
                </tbody>
            </table>
            <form class="inline-form" id="add-member-form">
                <input id="member-user-id" type="text" placeholder="User ID" required class="inline-input">
                <select id="member-permission" class="inline-select">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                </select>
                <button type="submit" class="btn btn--primary btn--xs">Add Member</button>
            </form>
        `;
    }

    // --- Invites Tab --------------------------------------------------------

    _renderInvitesTab() {
        let inviteResult = '';
        if (this._lastInvite) {
            const code = this._lastInvite.invite_code || '';
            inviteResult = `
                <div class="invite-result">
                    <span class="detail-label">Invite Code</span>
                    <span class="invite-code">${this._esc(code)}</span>
                    <div class="invite-meta">
                        Permission: ${this._esc(this._lastInvite.permission || '')} |
                        Max uses: ${this._lastInvite.max_uses ?? 1} |
                        Status: ${this._esc(this._lastInvite.status || '')}
                    </div>
                </div>
            `;
        }

        return `
            <form class="inline-form" id="create-invite-form">
                <select id="invite-permission" class="inline-select">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                </select>
                <input id="invite-max-uses" type="number" value="1" min="0" class="inline-input inline-input--sm"
                       placeholder="Max uses (0=unlimited)">
                <button type="submit" class="btn btn--primary btn--xs"
                        ${this._inviteCreating ? 'disabled' : ''}>
                    ${this._inviteCreating ? '<span class="spinner"></span>' : 'Create Invite'}
                </button>
            </form>
            ${inviteResult}
        `;
    }

    // --- Audit Tab ----------------------------------------------------------

    _renderAuditTab() {
        if (this._auditLoading) {
            return '<div class="loading loading--sm"><span class="spinner"></span> Loading audit trail...</div>';
        }

        if (this._auditEvents.length === 0) {
            return '<div class="empty-cell">No audit events</div>';
        }

        const eventRows = this._auditEvents.map(ev => `
            <tr>
                <td class="col-timestamp">${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '-'}</td>
                <td><span class="action-badge">${this._esc(ev.action || '')}</span></td>
                <td class="detail-value--mono">${this._esc(ev.user_id || '')}</td>
                <td class="detail-value--mono">${this._esc(ev.target_guid || '-')}</td>
            </tr>
        `).join('');

        return `
            <table class="audit-table">
                <thead>
                    <tr><th>Time</th><th>Action</th><th>User</th><th>Target</th></tr>
                </thead>
                <tbody>${eventRows}</tbody>
            </table>
        `;
    }

    // --- Render: Detail update in-place -------------------------------------

    _renderDetail() {
        const el = this.shadowRoot.querySelector('#inline-detail');
        if (!el) return;
        el.innerHTML = this._renderInlineDetail();

        // Re-wire tab buttons
        el.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleTabClick(btn.dataset.tab);
            });
        });

        // Re-wire add-member form
        const addMemberForm = el.querySelector('#add-member-form');
        if (addMemberForm) {
            addMemberForm.addEventListener('submit', (e) => this._handleAddMember(e));
        }

        // Re-wire remove-member buttons
        el.querySelectorAll('.btn-remove-member').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleRemoveMember(btn.dataset.user);
            });
        });

        // Re-wire create-invite form
        const inviteForm = el.querySelector('#create-invite-form');
        if (inviteForm) {
            inviteForm.addEventListener('submit', (e) => this._handleCreateInvite(e));
        }

        // Wire enter-room button
        const btnEnterRoom = el.querySelector('#btn-enter-room');
        if (btnEnterRoom) {
            btnEnterRoom.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleEnterRoom();
            });
        }
        const btnCopyEnterLink = el.querySelector('#btn-copy-enter-link');
        if (btnCopyEnterLink) {
            btnCopyEnterLink.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(this._enterRoomLink);
                    btnCopyEnterLink.textContent = 'Copied!';
                    setTimeout(() => { btnCopyEnterLink.textContent = 'Copy'; }, 2000);
                } catch (err) {
                    const input = el.querySelector('#enter-room-link');
                    if (input) { input.select(); }
                }
            });
        }
    }

    // --- Helpers -------------------------------------------------------------

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    _attr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // --- Static Registration ------------------------------------------------

    static get appId()    { return 'data-rooms'; }
    static get navLabel() { return 'Data Rooms'; }

    // --- Styles -------------------------------------------------------------

    static get styles() {
        return `
            :host {
                display: block;
            }

            /* --- Panel Header --- */
            .panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 1.25rem;
            }

            .panel-header__title {
                font-size: var(--admin-font-size-xl);
                font-weight: 600;
                color: var(--admin-text);
                margin: 0;
            }

            .panel-header__actions {
                display: flex;
                gap: 0.5rem;
            }

            /* --- Buttons --- */
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0.375rem;
                border: none;
                border-radius: var(--admin-radius);
                cursor: pointer;
                font-family: var(--admin-font);
                font-weight: 500;
                transition: background var(--admin-transition), color var(--admin-transition);
                white-space: nowrap;
            }

            .btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .btn--sm {
                padding: 0.4rem 0.75rem;
                font-size: var(--admin-font-size-sm);
            }

            .btn--xs {
                padding: 0.25rem 0.5rem;
                font-size: var(--admin-font-size-xs);
            }

            .btn--primary {
                background: var(--admin-primary);
                color: #fff;
            }

            .btn--primary:hover:not(:disabled) {
                background: var(--admin-primary-hover);
            }

            .btn--ghost {
                background: transparent;
                color: var(--admin-text-secondary);
            }

            .btn--ghost:hover:not(:disabled) {
                background: var(--admin-surface-hover);
                color: var(--admin-text);
            }

            .btn--danger {
                background: var(--admin-error-bg);
                color: var(--admin-error);
                border: 1px solid rgba(248, 113, 113, 0.2);
            }

            .btn--danger:hover:not(:disabled) {
                background: var(--admin-error);
                color: #fff;
            }

            /* --- Loading & Empty --- */
            .loading {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 2rem;
                justify-content: center;
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-sm);
            }

            .loading--inline { padding: 0.5rem; }
            .loading--sm     { padding: 1rem;   }

            .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid var(--admin-border);
                border-top-color: var(--admin-primary);
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .empty {
                text-align: center;
                padding: 3rem 2rem;
            }

            .empty__text {
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-base);
                margin-bottom: 0.25rem;
            }

            .empty__hint {
                color: var(--admin-text-muted);
                font-size: var(--admin-font-size-sm);
            }

            .empty-cell {
                text-align: center;
                color: var(--admin-text-muted);
                padding: 1rem;
                font-size: var(--admin-font-size-sm);
            }

            /* --- Error Bar --- */
            .error-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.625rem 1rem;
                margin-bottom: 1rem;
                background: var(--admin-error-bg);
                border: 1px solid rgba(248, 113, 113, 0.2);
                border-radius: var(--admin-radius);
                color: var(--admin-error);
                font-size: var(--admin-font-size-sm);
            }

            /* --- Create Form --- */
            .create-form {
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                padding: 1.25rem;
                margin-bottom: 1.25rem;
            }

            .create-form__title {
                font-size: var(--admin-font-size-base);
                font-weight: 600;
                color: var(--admin-text);
                margin-bottom: 1rem;
            }

            .create-form__fields {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 1rem;
                margin-bottom: 1rem;
            }

            .field label {
                display: block;
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                color: var(--admin-text-secondary);
                margin-bottom: 0.25rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .field input {
                width: 100%;
                padding: 0.5rem 0.625rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                color: var(--admin-text);
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                transition: border-color var(--admin-transition);
                box-sizing: border-box;
            }

            .field input:focus {
                outline: none;
                border-color: var(--admin-primary);
                box-shadow: 0 0 0 2px var(--admin-primary-bg);
            }

            .field input:disabled { opacity: 0.5; }

            .create-form__actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
            }

            /* --- Room Table --- */
            .room-table {
                width: 100%;
                border-collapse: collapse;
                background: var(--admin-surface);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius-lg);
                overflow: hidden;
            }

            .room-table thead th {
                text-align: left;
                padding: 0.625rem 1rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--admin-text-muted);
                background: var(--admin-surface-raised);
                border-bottom: 1px solid var(--admin-border);
            }

            .room-table tbody td {
                padding: 0.625rem 1rem;
                font-size: var(--admin-font-size-sm);
                border-bottom: 1px solid var(--admin-border-subtle);
                vertical-align: middle;
            }

            .room-row {
                cursor: pointer;
                transition: background var(--admin-transition);
            }

            .room-row:hover {
                background: var(--admin-surface-hover);
            }

            .room-row--selected {
                background: var(--admin-primary-bg);
            }

            .room-name {
                font-weight: 500;
                color: var(--admin-text);
            }

            .owner-id {
                font-family: var(--admin-font-mono);
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-secondary);
            }

            .col-actions {
                text-align: right;
                width: 140px;
            }

            .col-members {
                text-align: center;
                font-family: var(--admin-font-mono);
            }

            .col-created {
                color: var(--admin-text-secondary);
                font-size: var(--admin-font-size-xs);
            }

            .col-timestamp {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-secondary);
                white-space: nowrap;
            }

            /* --- Status Badge --- */
            .status-badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .status-badge--active {
                background: var(--admin-success-bg);
                color: var(--admin-success);
            }

            .status-badge--archived {
                background: rgba(139, 143, 167, 0.1);
                color: var(--admin-text-muted);
            }

            .status-badge--unknown {
                background: rgba(139, 143, 167, 0.1);
                color: var(--admin-text-muted);
            }

            /* --- Permission Badge --- */
            .perm-badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .perm-badge--owner {
                background: var(--admin-primary-bg);
                color: var(--admin-primary);
            }

            .perm-badge--editor {
                background: var(--admin-warning-bg);
                color: var(--admin-warning);
            }

            .perm-badge--viewer {
                background: var(--admin-success-bg);
                color: var(--admin-success);
            }

            /* --- Action Badge --- */
            .action-badge {
                display: inline-block;
                padding: 0.125rem 0.5rem;
                font-size: var(--admin-font-size-xs);
                font-family: var(--admin-font-mono);
                background: var(--admin-surface-raised);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                color: var(--admin-text-secondary);
            }

            /* --- Detail Panel (inline) --- */
            .detail-row td {
                padding: 0 !important;
                background: var(--admin-surface-raised);
            }

            .detail-panel {
                padding: 1rem 1.25rem;
            }

            .detail-header {
                margin-bottom: 1rem;
            }

            .detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 0.75rem;
            }

            .detail-item {
                display: flex;
                flex-direction: column;
                gap: 0.2rem;
            }

            .detail-label {
                font-size: var(--admin-font-size-xs);
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                color: var(--admin-text-muted);
            }

            .detail-value {
                font-size: var(--admin-font-size-sm);
                color: var(--admin-text);
            }

            .detail-value--mono {
                font-family: var(--admin-font-mono);
            }

            /* --- Tabs --- */
            .tabs {
                display: flex;
                gap: 0;
                border-bottom: 1px solid var(--admin-border);
                margin-bottom: 1rem;
            }

            .tab-btn {
                padding: 0.5rem 1rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                font-weight: 500;
                color: var(--admin-text-muted);
                background: transparent;
                border: none;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                transition: color var(--admin-transition), border-color var(--admin-transition);
            }

            .tab-btn:hover {
                color: var(--admin-text);
            }

            .tab-btn--active {
                color: var(--admin-primary);
                border-bottom-color: var(--admin-primary);
            }

            .tab-content {
                min-height: 80px;
            }

            /* --- Members / Audit Tables --- */
            .members-table,
            .audit-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 0.75rem;
            }

            .members-table thead th,
            .audit-table thead th {
                text-align: left;
                padding: 0.4rem 0.75rem;
                font-size: var(--admin-font-size-xs);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--admin-text-muted);
                border-bottom: 1px solid var(--admin-border);
            }

            .members-table tbody td,
            .audit-table tbody td {
                padding: 0.4rem 0.75rem;
                font-size: var(--admin-font-size-sm);
                border-bottom: 1px solid var(--admin-border-subtle);
            }

            /* --- Inline Forms --- */
            .inline-form {
                display: flex;
                gap: 0.5rem;
                align-items: center;
                padding: 0.5rem 0;
            }

            .inline-input {
                padding: 0.35rem 0.5rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                color: var(--admin-text);
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                flex: 1;
                min-width: 0;
            }

            .inline-input--sm {
                flex: 0 0 120px;
            }

            .inline-input:focus {
                outline: none;
                border-color: var(--admin-primary);
                box-shadow: 0 0 0 2px var(--admin-primary-bg);
            }

            .inline-select {
                padding: 0.35rem 0.5rem;
                font-size: var(--admin-font-size-sm);
                font-family: var(--admin-font);
                color: var(--admin-text);
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
            }

            .inline-select:focus {
                outline: none;
                border-color: var(--admin-primary);
            }

            /* --- Enter Room --- */
            .enter-room-section {
                margin-bottom: 0.75rem;
                display: flex;
                flex-wrap: wrap;
                align-items: flex-start;
                gap: 0.75rem;
            }

            .enter-room-result {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 0.375rem;
            }

            .enter-room-link-row {
                display: flex;
                gap: 0.375rem;
            }

            .enter-room-link {
                flex: 1;
                padding: 0.375rem 0.5rem;
                font-family: var(--admin-font-mono);
                font-size: var(--admin-font-size-xs);
                color: var(--admin-primary);
                background: var(--admin-bg);
                border: 1px solid var(--admin-border);
                border-radius: var(--admin-radius);
                box-sizing: border-box;
            }

            .enter-room-link:focus {
                outline: none;
                border-color: var(--admin-primary);
            }

            /* --- Invite Result --- */
            .invite-result {
                margin-top: 0.75rem;
                padding: 0.75rem 1rem;
                background: var(--admin-success-bg);
                border: 1px solid rgba(52, 211, 153, 0.2);
                border-radius: var(--admin-radius);
            }

            .invite-code {
                display: block;
                font-family: var(--admin-font-mono);
                font-size: var(--admin-font-size-xl);
                font-weight: 700;
                color: var(--admin-text);
                letter-spacing: 0.1em;
                margin: 0.25rem 0;
                user-select: all;
            }

            .invite-meta {
                font-size: var(--admin-font-size-xs);
                color: var(--admin-text-secondary);
            }

            /* --- Responsive --- */
            @media (max-width: 768px) {
                .create-form__fields {
                    grid-template-columns: 1fr;
                }

                .col-owner,
                .col-created {
                    display: none;
                }

                .col-actions {
                    width: auto;
                }

                .detail-grid {
                    grid-template-columns: 1fr;
                }

                .inline-form {
                    flex-wrap: wrap;
                }
            }
        `;
    }
}

customElements.define('data-room-manager', DataRoomManager);
