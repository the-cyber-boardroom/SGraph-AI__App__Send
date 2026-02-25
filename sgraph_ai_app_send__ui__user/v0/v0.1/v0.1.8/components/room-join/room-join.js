/* =============================================================================
   SGraph Send — Room Join Web Component
   v0.1.8 — Invite code entry and acceptance flow

   Three-step flow:
     1. Enter invite code (or auto-fill from URL hash)
     2. Preview room details + enter user ID
     3. Accept → redirect to room view with session token

   Usage:
     <room-join></room-join>

   URL hash support:
     join.html#CODE                    — auto-fills invite code
     join.html#CODE:user               — auto-fills code + user ID
     join.html#CODE:user:ROOMKEY       — auto-fills code + user ID + room key
   ============================================================================= */

class RoomJoin extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._step       = 'code';      // code | preview | joining | done | error
        this._inviteCode = '';
        this._userId     = '';
        this._roomKey    = '';           // 64-char hex room encryption key (from URL hash)
        this._roomInfo   = null;         // from validate response
        this._joinResult = null;         // from accept response
        this._error      = null;
        this._loading    = false;
    }

    connectedCallback() {
        this._parseHash();
        this.render();

        if (this._inviteCode && this._userId) {
            this._handleValidate();
        } else if (this._inviteCode) {
            this._handleValidate();
        }
    }

    // --- URL Hash Parsing ---------------------------------------------------

    _parseHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;

        const parts = hash.split(':');
        this._inviteCode = (parts[0] || '').trim().toUpperCase();
        if (parts[1]) {
            this._userId = parts[1].trim();
        }
        if (parts[2]) {
            this._roomKey = parts[2].trim().toLowerCase();
        }
    }

    // --- Step 1: Validate Invite Code ---------------------------------------

    async _handleValidate(e) {
        if (e) e.preventDefault();

        const input = this.shadowRoot.querySelector('#input-code');
        if (input) this._inviteCode = input.value.trim().toUpperCase();

        if (!this._inviteCode) return;

        this._loading = true;
        this._error   = null;
        this.render();

        try {
            const result = await JoinAPI.validate(this._inviteCode);

            if (!result.valid) {
                this._error = this._friendlyReason(result.reason);
                this._step  = 'code';
            } else {
                this._roomInfo = result;
                this._step     = 'preview';
            }
        } catch (err) {
            this._error = err.message;
            this._step  = 'code';
        }

        this._loading = false;
        this.render();
    }

    // --- Step 2: Accept Invite -----------------------------------------------

    async _handleAccept(e) {
        if (e) e.preventDefault();

        const input = this.shadowRoot.querySelector('#input-user-id');
        if (input) this._userId = input.value.trim();

        if (!this._userId) return;

        this._step    = 'joining';
        this._loading = true;
        this._error   = null;
        this.render();

        try {
            const result = await JoinAPI.accept(this._inviteCode, this._userId);

            this._joinResult = result;
            this._step       = 'done';

            // Store session for the room page
            sessionStorage.setItem('sg_room_session', JSON.stringify({
                session_token   : result.session_token   ,
                room_id         : result.room_id         ,
                room_name       : result.room_name       ,
                vault_cache_key : result.vault_cache_key  ,
                permission      : result.permission       ,
                user_id         : this._userId            ,
                expires         : result.expires
            }));

        } catch (err) {
            this._error = err.message;
            this._step  = 'preview';
        }

        this._loading = false;
        this.render();
    }

    // --- Navigate to Room ----------------------------------------------------

    _handleEnterRoom() {
        if (!this._joinResult) return;
        // Store room key if available (from URL hash or future UI)
        if (this._roomKey) {
            sessionStorage.setItem('sg_room_key', this._roomKey);
        }
        const roomId = this._joinResult.room_id;
        window.location.href = `room.html#${roomId}`;
    }

    // --- Reset ---------------------------------------------------------------

    _handleReset() {
        this._step       = 'code';
        this._inviteCode = '';
        this._userId     = '';
        this._roomInfo   = null;
        this._joinResult = null;
        this._error      = null;
        this._loading    = false;
        window.location.hash = '';
        this.render();
    }

    // --- Render --------------------------------------------------------------

    render() {
        let content;
        switch (this._step) {
            case 'code':    content = this._renderCodeStep();    break;
            case 'preview': content = this._renderPreviewStep(); break;
            case 'joining': content = this._renderJoiningStep(); break;
            case 'done':    content = this._renderDoneStep();    break;
            default:        content = this._renderCodeStep();
        }

        this.shadowRoot.innerHTML = `
            <style>${RoomJoin.styles}</style>
            <div class="join-container">
                <div class="join-card">
                    <div class="join-header">
                        <svg class="join-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <h2 class="join-title">Join a Data Room</h2>
                        <p class="join-subtitle">Enter your invite code to access a shared encrypted space</p>
                    </div>
                    ${this._error ? `<div class="error-bar">${this._esc(this._error)}</div>` : ''}
                    ${content}
                </div>
            </div>
        `;

        this._wireEvents();
    }

    // --- Step Renderers ------------------------------------------------------

    _renderCodeStep() {
        return `
            <form class="join-form" id="form-code">
                <div class="field">
                    <label for="input-code">Invite Code</label>
                    <input id="input-code" type="text" class="input-code"
                           placeholder="e.g. A1B2C3D4E5F6"
                           value="${this._attr(this._inviteCode)}"
                           autocomplete="off" spellcheck="false"
                           ${this._loading ? 'disabled' : ''}>
                    <span class="field-hint">12-character code provided by the room owner</span>
                </div>
                <button type="submit" class="btn btn--primary btn--lg"
                        ${this._loading ? 'disabled' : ''}>
                    ${this._loading ? '<span class="spinner"></span> Validating...' : 'Continue'}
                </button>
            </form>
        `;
    }

    _renderPreviewStep() {
        const r = this._roomInfo || {};
        return `
            <div class="room-preview">
                <div class="preview-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>Valid Invite</span>
                </div>
                <div class="preview-details">
                    <div class="preview-item">
                        <span class="preview-label">Room</span>
                        <span class="preview-value">${this._esc(r.room_name || 'Unnamed Room')}</span>
                    </div>
                    <div class="preview-item">
                        <span class="preview-label">Access Level</span>
                        <span class="preview-value perm-badge perm-badge--${r.permission || 'viewer'}">${this._esc(r.permission || 'viewer')}</span>
                    </div>
                </div>
            </div>
            <form class="join-form" id="form-accept">
                <div class="field">
                    <label for="input-user-id">Your Identity</label>
                    <input id="input-user-id" type="text" class="input-user-id"
                           placeholder="e.g. alice@example.com"
                           value="${this._attr(this._userId)}"
                           ${this._loading ? 'disabled' : ''}>
                    <span class="field-hint">This identifies you within the data room</span>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn--ghost" id="btn-back">Back</button>
                    <button type="submit" class="btn btn--primary btn--lg"
                            ${this._loading ? 'disabled' : ''}>
                        ${this._loading ? '<span class="spinner"></span> Joining...' : 'Join Room'}
                    </button>
                </div>
            </form>
        `;
    }

    _renderJoiningStep() {
        return `
            <div class="joining-state">
                <span class="spinner spinner--lg"></span>
                <p>Joining room...</p>
            </div>
        `;
    }

    _renderDoneStep() {
        const r = this._joinResult || {};
        return `
            <div class="done-state">
                <div class="done-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <h3 class="done-title">You're in!</h3>
                <p class="done-room-name">${this._esc(r.room_name || 'Data Room')}</p>
                <div class="done-details">
                    <span class="perm-badge perm-badge--${r.permission || 'viewer'}">${this._esc(r.permission || 'viewer')}</span>
                </div>
                <button class="btn btn--primary btn--lg" id="btn-enter">
                    Enter Room
                </button>
                <p class="done-note">Your session expires ${r.expires ? 'at ' + new Date(r.expires).toLocaleString() : 'in 24 hours'}</p>
            </div>
        `;
    }

    // --- Event Wiring --------------------------------------------------------

    _wireEvents() {
        const formCode   = this.shadowRoot.querySelector('#form-code');
        const formAccept = this.shadowRoot.querySelector('#form-accept');
        const btnBack    = this.shadowRoot.querySelector('#btn-back');
        const btnEnter   = this.shadowRoot.querySelector('#btn-enter');

        if (formCode)   formCode.addEventListener('submit', (e) => this._handleValidate(e));
        if (formAccept) formAccept.addEventListener('submit', (e) => this._handleAccept(e));
        if (btnBack)    btnBack.addEventListener('click', () => this._handleReset());
        if (btnEnter)   btnEnter.addEventListener('click', () => this._handleEnterRoom());
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

    _friendlyReason(reason) {
        const map = {
            not_found:  'Invite code not found. Please check and try again.',
            exhausted:  'This invite has already been used the maximum number of times.',
            expired:    'This invite has expired. Ask the room owner for a new one.',
            archived:   'This room has been archived and is no longer accepting members.'
        };
        return map[reason] || `Invalid invite: ${reason}`;
    }

    // --- Styles --------------------------------------------------------------

    static get styles() {
        return `
            :host {
                display: block;
            }

            .join-container {
                display: flex;
                justify-content: center;
                padding: var(--space-4, 16px) 0;
            }

            .join-card {
                width: 100%;
                max-width: 480px;
                background: var(--bg-surface, #1E2A4A);
                border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                border-radius: var(--radius-md, 12px);
                padding: var(--space-8, 32px);
                box-shadow: var(--shadow, 0 4px 24px rgba(0,0,0,0.3));
            }

            /* --- Header --- */

            .join-header {
                text-align: center;
                margin-bottom: var(--space-6, 24px);
            }

            .join-icon {
                width: 48px;
                height: 48px;
                color: var(--accent, #4ECDC4);
                margin-bottom: var(--space-3, 12px);
            }

            .join-title {
                font-family: var(--font-display);
                font-size: var(--text-h2, 1.6rem);
                font-weight: var(--weight-semibold, 600);
                color: var(--color-text, #E0E0E0);
                margin: 0 0 var(--space-2, 8px) 0;
            }

            .join-subtitle {
                font-size: var(--text-small, 0.8rem);
                color: var(--color-text-secondary, #8892A0);
                margin: 0;
            }

            /* --- Error --- */

            .error-bar {
                padding: var(--space-3, 12px) var(--space-4, 16px);
                margin-bottom: var(--space-4, 16px);
                background: rgba(233, 69, 96, 0.1);
                border: 1px solid rgba(233, 69, 96, 0.25);
                border-radius: var(--radius-sm, 6px);
                color: var(--color-error, #E94560);
                font-size: var(--text-small, 0.8rem);
            }

            /* --- Form --- */

            .join-form {
                display: flex;
                flex-direction: column;
                gap: var(--space-4, 16px);
            }

            .field {
                display: flex;
                flex-direction: column;
                gap: var(--space-1, 4px);
            }

            .field label {
                font-size: var(--text-small, 0.8rem);
                font-weight: var(--weight-medium, 500);
                color: var(--color-text-secondary, #8892A0);
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .field input {
                padding: var(--space-3, 12px) var(--space-4, 16px);
                font-family: var(--font-mono, monospace);
                font-size: var(--text-body, 1rem);
                color: var(--color-text, #E0E0E0);
                background: var(--bg-secondary, #16213E);
                border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                border-radius: var(--radius, 8px);
                transition: border-color var(--transition, 150ms ease);
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }

            .field input.input-user-id {
                font-family: var(--font-body, 'DM Sans', sans-serif);
                text-transform: none;
                letter-spacing: normal;
            }

            .field input:focus {
                outline: none;
                border-color: var(--accent, #4ECDC4);
                box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.15);
            }

            .field input:disabled {
                opacity: 0.5;
            }

            .field-hint {
                font-size: var(--text-micro, 0.625rem);
                color: var(--color-text-secondary, #8892A0);
                opacity: 0.7;
            }

            .form-actions {
                display: flex;
                gap: var(--space-3, 12px);
                justify-content: flex-end;
            }

            /* --- Buttons --- */

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: var(--space-2, 8px);
                border: none;
                border-radius: var(--radius, 8px);
                cursor: pointer;
                font-family: var(--font-body);
                font-weight: var(--weight-medium, 500);
                transition: background var(--transition), color var(--transition);
                white-space: nowrap;
            }

            .btn:disabled { opacity: 0.5; cursor: not-allowed; }

            .btn--lg {
                padding: var(--space-3, 12px) var(--space-6, 24px);
                font-size: var(--text-body, 1rem);
            }

            .btn--primary {
                background: var(--accent, #4ECDC4);
                color: var(--bg-primary, #1A1A2E);
                font-weight: var(--weight-semibold, 600);
                width: 100%;
            }

            .btn--primary:hover:not(:disabled) {
                background: var(--accent-hover, #3DBDB4);
            }

            .btn--ghost {
                background: transparent;
                color: var(--color-text-secondary, #8892A0);
                padding: var(--space-3, 12px) var(--space-4, 16px);
            }

            .btn--ghost:hover:not(:disabled) {
                color: var(--color-text, #E0E0E0);
                background: rgba(255,255,255,0.05);
            }

            /* --- Room Preview --- */

            .room-preview {
                margin-bottom: var(--space-4, 16px);
            }

            .preview-badge {
                display: inline-flex;
                align-items: center;
                gap: var(--space-2, 8px);
                padding: var(--space-2, 8px) var(--space-3, 12px);
                background: rgba(78, 205, 196, 0.1);
                border: 1px solid rgba(78, 205, 196, 0.2);
                border-radius: var(--radius-sm, 6px);
                color: var(--accent, #4ECDC4);
                font-size: var(--text-small, 0.8rem);
                font-weight: var(--weight-medium, 500);
                margin-bottom: var(--space-4, 16px);
            }

            .preview-details {
                display: flex;
                flex-direction: column;
                gap: var(--space-3, 12px);
            }

            .preview-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--space-3, 12px) var(--space-4, 16px);
                background: var(--bg-secondary, #16213E);
                border-radius: var(--radius-sm, 6px);
            }

            .preview-label {
                font-size: var(--text-small, 0.8rem);
                color: var(--color-text-secondary, #8892A0);
                text-transform: uppercase;
                letter-spacing: 0.03em;
                font-weight: var(--weight-medium, 500);
            }

            .preview-value {
                font-size: var(--text-body, 1rem);
                font-weight: var(--weight-medium, 500);
                color: var(--color-text, #E0E0E0);
            }

            /* --- Permission Badge --- */

            .perm-badge {
                display: inline-block;
                padding: var(--space-1, 4px) var(--space-3, 12px);
                font-size: var(--text-small, 0.8rem);
                font-weight: var(--weight-semibold, 600);
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .perm-badge--viewer {
                background: rgba(78, 205, 196, 0.15);
                color: var(--accent, #4ECDC4);
            }

            .perm-badge--editor {
                background: rgba(224, 124, 79, 0.15);
                color: var(--color-warning, #E07C4F);
            }

            .perm-badge--owner {
                background: rgba(78, 205, 196, 0.25);
                color: var(--accent, #4ECDC4);
            }

            /* --- Loading --- */

            .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255,255,255,0.2);
                border-top-color: currentColor;
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }

            .spinner--lg {
                width: 32px;
                height: 32px;
                border-width: 3px;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .joining-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: var(--space-4, 16px);
                padding: var(--space-8, 32px);
                color: var(--color-text-secondary, #8892A0);
            }

            /* --- Done State --- */

            .done-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: var(--space-3, 12px);
            }

            .done-icon {
                width: 64px;
                height: 64px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background: rgba(78, 205, 196, 0.1);
                color: var(--accent, #4ECDC4);
            }

            .done-icon svg {
                width: 32px;
                height: 32px;
            }

            .done-title {
                font-family: var(--font-display);
                font-size: var(--text-h2, 1.6rem);
                font-weight: var(--weight-semibold, 600);
                color: var(--color-text, #E0E0E0);
                margin: 0;
            }

            .done-room-name {
                font-size: var(--text-h3, 1.25rem);
                color: var(--accent, #4ECDC4);
                margin: 0;
            }

            .done-details {
                margin-bottom: var(--space-4, 16px);
            }

            .done-note {
                font-size: var(--text-micro, 0.625rem);
                color: var(--color-text-secondary, #8892A0);
                opacity: 0.7;
                margin: 0;
            }
        `;
    }
}

customElements.define('room-join', RoomJoin);
