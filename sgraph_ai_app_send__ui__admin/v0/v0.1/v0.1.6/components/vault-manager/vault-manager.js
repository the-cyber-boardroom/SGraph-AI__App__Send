/* =============================================================================
   SGraph Send Admin Console — Vault File Manager
   v0.1.6 — PKI-keyed personal data vault

   Zero-knowledge encrypted file system:
   - Vault root derived from PKI key hash
   - Folders are plain JSON (structure only, no names on server)
   - Files are AES-256-GCM encrypted blobs
   - Index maps GUIDs to human-readable names (encrypted)
   - Server never sees plaintext

   Features (v0.1.5 carried forward):
   - Inline folder creation (no browser prompt())
   - Inline delete confirmation (no browser confirm())
   - Sortable table columns (name, size)
   - Vault statistics in status bar (file/folder count, total size)
   - In-place rename (double-click name)
   - Upload progress feedback via message center

   New in v0.1.6:
   - Tree view sidebar — collapsible folder hierarchy on the left
   - Key selector dropdown — pick which PKI key to use
   - Drag-and-drop overlay — upload + internal file move between folders
   - Detail/preview panel — right-side panel for file metadata + preview + delete
   - Raw data view toggle — show GUIDs and cache keys instead of names
   - Resizable panel dividers + collapsible left sidebar
   - Loading state + blur when switching keys
   - Files-only table view (folders live in tree sidebar)
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, arrayBufToB64, b64ToArrayBuf, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;

    // =========================================================================
    // Vault crypto helpers
    // =========================================================================

    async function deriveVaultCacheKey(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const hash     = await crypto.subtle.digest('SHA-256', exported);
        const hex      = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        const keyHash  = hex.substring(0, 32);
        const combined = new TextEncoder().encode(keyHash + '/filesystem');
        const derived  = await crypto.subtle.digest('SHA-256', combined);
        const derivedHex = [...new Uint8Array(derived)].map(b => b.toString(16).padStart(2, '0')).join('');
        return derivedHex.substring(0, 32);
    }

    async function generateAesKey() {
        return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    }

    async function encryptBlob(publicKey, data) {
        const aesKey     = await generateAesKey();
        const iv         = crypto.getRandomValues(new Uint8Array(12));
        const encrypted  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
        const rawAesKey  = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
        // Pack: [4 bytes wrappedKey length][wrappedKey][12 bytes IV][ciphertext]
        const wkLen  = new Uint32Array([wrappedKey.byteLength]);
        const packed = new Uint8Array(4 + wrappedKey.byteLength + 12 + encrypted.byteLength);
        packed.set(new Uint8Array(wkLen.buffer), 0);
        packed.set(new Uint8Array(wrappedKey), 4);
        packed.set(iv, 4 + wrappedKey.byteLength);
        packed.set(new Uint8Array(encrypted), 4 + wrappedKey.byteLength + 12);
        return packed;
    }

    async function decryptBlob(privateKey, packed) {
        const bytes  = new Uint8Array(packed);
        const wkLen  = new Uint32Array(bytes.slice(0, 4).buffer)[0];
        const wrappedKey = bytes.slice(4, 4 + wkLen);
        const iv         = bytes.slice(4 + wkLen, 4 + wkLen + 12);
        const ciphertext = bytes.slice(4 + wkLen + 12);
        const rawAesKey  = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
        const aesKey     = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    }

    function generateGuid() {
        return [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Chunked base64 encoder — avoids stack overflow for large files
    // (pki-common's arrayBufToB64 uses spread which blows the stack > ~100KB)
    function arrayBufToB64Safe(buf) {
        const bytes = new Uint8Array(buf);
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    function formatSize(bytes) {
        if (bytes == null) return '\u2014';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    // =========================================================================
    // Component
    // =========================================================================

    const VM_STYLES = `
        ${PKI_SHARED_STYLES}

        :host, vault-manager { display: block; height: 100%; }

        .vm-container   { height: 100%; display: flex; flex-direction: column; gap: 0; padding: 0.25rem; }
        .vm-toolbar     { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0 0 0.5rem 0; border-bottom: 1px solid var(--admin-border-subtle, #252838); }
        .vm-breadcrumb  { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8125rem; color: var(--admin-text-secondary, #8b8fa7); flex: 1; min-width: 0; overflow: hidden; }
        .vm-breadcrumb span { cursor: pointer; padding: 0.125rem 0.25rem; border-radius: 3px; white-space: nowrap; }
        .vm-breadcrumb span:hover { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
        .vm-breadcrumb .vm-bc-sep { cursor: default; color: var(--admin-text-muted, #5e6280); }
        .vm-breadcrumb .vm-bc-sep:hover { background: none; }
        .vm-breadcrumb .vm-bc-current { color: var(--admin-text, #e4e6ef); font-weight: 600; cursor: default; }
        .vm-breadcrumb .vm-bc-current:hover { background: none; }

        .vm-actions     { display: flex; gap: 0.375rem; align-items: center; }
        .vm-body        { flex: 1; display: flex; overflow: hidden; min-height: 0; position: relative; }
        .vm-body.vm-loading .vm-tree-sidebar, .vm-body.vm-loading .vm-content, .vm-body.vm-loading .vm-detail-panel { opacity: 0.4; pointer-events: none; filter: blur(1px); transition: all 200ms ease; }
        .vm-loading-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 20; }
        .vm-loading-overlay .pk-spinner { width: 24px; height: 24px; }
        .vm-content     { flex: 1; overflow-y: auto; position: relative; min-width: 200px; }

        /* --- Key Selector --- */
        .vm-key-selector { display: flex; align-items: center; gap: 0.375rem; margin-right: 0.5rem; }
        .vm-key-selector label { font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .vm-key-select { background: var(--admin-bg, #1a1d2e); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); color: var(--admin-text, #e4e6ef); font-size: 0.75rem; font-family: var(--admin-font-mono, monospace); padding: 0.2rem 0.375rem; outline: none; max-width: 200px; cursor: pointer; }
        .vm-key-select:focus { border-color: var(--admin-primary, #4f8ff7); box-shadow: 0 0 0 2px var(--admin-primary-bg, rgba(79,143,247,0.1)); }

        /* --- Raw toggle --- */
        .vm-raw-toggle { font-size: 0.6875rem; }
        .vm-raw-toggle.vm-raw-active { color: var(--admin-warning, #fbbf24); background: var(--admin-warning-bg, rgba(251,191,36,0.1)); }

        /* --- Tree View Sidebar --- */
        .vm-tree-sidebar { width: 200px; min-width: 120px; display: flex; flex-direction: column; overflow: hidden; font-size: 0.75rem; flex-shrink: 0; transition: width 200ms ease; }
        .vm-tree-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0.5rem 0; }
        .vm-tree-node { display: flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.375rem; cursor: pointer; color: var(--admin-text-secondary, #8b8fa7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-radius: 3px; margin: 0 0.25rem; user-select: none; }
        .vm-tree-node:hover { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
        .vm-tree-node.vm-tree-active { background: var(--admin-primary-bg, rgba(79,143,247,0.1)); color: var(--admin-primary, #4f8ff7); font-weight: 600; }
        .vm-tree-node.vm-tree-drop-target { outline: 2px dashed var(--admin-primary, #4f8ff7); outline-offset: -2px; background: var(--admin-primary-bg, rgba(79,143,247,0.08)); }
        .vm-tree-chevron { width: 14px; height: 14px; flex-shrink: 0; transition: transform 150ms ease; display: inline-flex; align-items: center; justify-content: center; }
        .vm-tree-chevron.vm-tree-expanded { transform: rotate(90deg); }
        .vm-tree-chevron.vm-tree-empty { visibility: hidden; }
        .vm-tree-icon { flex-shrink: 0; }
        .vm-tree-icon svg { width: 14px; height: 14px; color: var(--admin-warning, #fbbf24); }
        .vm-tree-label { overflow: hidden; text-overflow: ellipsis; }
        .vm-tree-children { padding-left: 0.75rem; }
        .vm-tree-children.vm-tree-collapsed { display: none; }
        .vm-tree-footer { border-top: 1px solid var(--admin-border-subtle, #252838); padding: 0.375rem; display: flex; gap: 0.25rem; }
        .vm-tree-footer .pk-btn { width: 100%; justify-content: center; }
        .vm-tree-collapse-btn { position: absolute; top: 0.25rem; right: 0.25rem; z-index: 2; cursor: pointer; background: none; border: none; color: var(--admin-text-muted, #5e6280); padding: 0.125rem; display: inline-flex; border-radius: 3px; }
        .vm-tree-collapse-btn:hover { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
        .vm-tree-collapse-btn svg { width: 14px; height: 14px; }
        /* Collapsed sidebar */
        .vm-tree-sidebar.vm-sidebar-collapsed { width: 36px !important; min-width: 36px; max-width: 36px; }
        .vm-sidebar-collapsed .vm-tree-label, .vm-sidebar-collapsed .vm-tree-chevron { display: none; }
        .vm-sidebar-collapsed .vm-tree-node { justify-content: center; padding: 0.3rem; margin: 0.125rem 0.125rem; }
        .vm-sidebar-collapsed .vm-tree-footer { padding: 0.25rem; }
        .vm-sidebar-collapsed .vm-tree-footer-text { display: none; }
        .vm-sidebar-collapsed .vm-tree-children { padding-left: 0; }

        /* --- Resize Handles --- */
        .vm-resize-handle { width: 4px; cursor: col-resize; background: transparent; transition: background 150ms ease; flex-shrink: 0; z-index: 5; }
        .vm-resize-handle:hover, .vm-resize-handle.vm-resize-active { background: var(--admin-primary, #4f8ff7); }

        /* --- Detail Panel --- */
        .vm-detail-panel { width: 260px; min-width: 180px; overflow-y: auto; padding: 0.75rem; flex-shrink: 0; }
        .vm-detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
        .vm-detail-title { font-size: 0.8125rem; font-weight: 600; color: var(--admin-text, #e4e6ef); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .vm-detail-close { cursor: pointer; color: var(--admin-text-muted, #5e6280); background: none; border: none; padding: 0.125rem; display: inline-flex; }
        .vm-detail-close:hover { color: var(--admin-text, #e4e6ef); }
        .vm-detail-close svg { width: 16px; height: 16px; }
        .vm-detail-row { display: flex; flex-direction: column; margin-bottom: 0.625rem; }
        .vm-detail-label { font-size: 0.625rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.125rem; }
        .vm-detail-value { font-size: 0.75rem; color: var(--admin-text, #e4e6ef); word-break: break-all; }
        .vm-detail-value code { font-family: var(--admin-font-mono, monospace); font-size: 0.6875rem; color: var(--admin-text-secondary, #8b8fa7); }
        .vm-detail-preview { margin-top: 0.75rem; border-top: 1px solid var(--admin-border-subtle, #252838); padding-top: 0.75rem; }
        .vm-detail-preview-label { font-size: 0.625rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
        .vm-detail-preview img { max-width: 100%; max-height: 200px; border-radius: var(--admin-radius, 6px); border: 1px solid var(--admin-border-subtle, #252838); }
        .vm-detail-preview pre { font-size: 0.6875rem; font-family: var(--admin-font-mono, monospace); color: var(--admin-text-secondary, #8b8fa7); background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border-subtle, #252838); border-radius: var(--admin-radius, 6px); padding: 0.5rem; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
        .vm-detail-preview-loading { font-size: 0.75rem; color: var(--admin-text-muted, #5e6280); font-style: italic; }
        .vm-detail-actions { margin-top: 0.75rem; display: flex; gap: 0.375rem; flex-wrap: wrap; }

        /* --- Table --- */
        .vm-table        { width: 100%; border-collapse: collapse; }
        .vm-table th     { text-align: left; font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; padding: 0.375rem 0.75rem; border-bottom: 1px solid var(--admin-border, #2e3347); cursor: pointer; user-select: none; }
        .vm-table th:hover { color: var(--admin-text-secondary, #8b8fa7); }
        .vm-table th.vm-sort-active { color: var(--admin-primary, #4f8ff7); }
        .vm-table th:last-child { cursor: default; }
        .vm-table td     { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); font-size: 0.8125rem; color: var(--admin-text, #e4e6ef); }
        .vm-table tr:hover td { background: var(--admin-surface-hover, #2a2e3d); }
        .vm-table tr.vm-row-selected td { background: var(--admin-primary-bg, rgba(79,143,247,0.08)); }
        .vm-table tr[draggable="true"] { cursor: grab; }
        .vm-table tr[draggable="true"]:active { cursor: grabbing; }
        .vm-table tr.vm-row-dragging { opacity: 0.4; }

        .vm-icon         { display: inline-flex; align-items: center; gap: 0.375rem; }
        .vm-icon svg     { width: 16px; height: 16px; flex-shrink: 0; }
        .vm-icon-folder  { color: var(--admin-warning, #fbbf24); }
        .vm-icon-file    { color: var(--admin-primary, #4f8ff7); }
        .vm-icon-lock    { color: var(--admin-success, #34d399); }

        .vm-name         { font-weight: 500; }
        .vm-name-editable { cursor: text; }
        .vm-name-editable:hover { text-decoration: underline dotted; text-underline-offset: 2px; }
        .vm-guid-display { font-family: var(--admin-font-mono, monospace); font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); }

        .vm-rename-input { background: var(--admin-bg, #1a1d2e); border: 1px solid var(--admin-primary, #4f8ff7); border-radius: 3px; color: var(--admin-text, #e4e6ef); font-size: 0.8125rem; font-weight: 500; padding: 0.125rem 0.375rem; outline: none; width: 100%; max-width: 300px; }

        .vm-inline-confirm { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; }
        .vm-inline-confirm span { color: var(--admin-error, #ef4444); }
        .vm-inline-confirm .vm-confirm-yes { color: var(--admin-error, #ef4444); border-color: var(--admin-error, #ef4444); }

        .vm-new-folder-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--admin-border-subtle, #252838); background: var(--admin-surface-hover, #2a2e3d); }
        .vm-new-folder-row input { flex: 1; max-width: 300px; }

        .vm-status-bar   { display: flex; align-items: center; gap: 0.75rem; font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); padding: 0.375rem 0 0.125rem; border-top: 1px solid var(--admin-border-subtle, #252838); flex-wrap: wrap; }
        .vm-status-bar .vm-status-key { font-family: var(--admin-font-mono, monospace); }

        .vm-no-key       { text-align: center; padding: 3rem 1rem; }
        .vm-no-key__icon { margin-bottom: 0.75rem; color: var(--admin-text-muted, #5e6280); }
        .vm-no-key__icon svg { width: 40px; height: 40px; }
        .pk-empty__icon svg  { width: 40px; height: 40px; }
        .vm-no-key__title { font-size: 1.125rem; font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 0.5rem; }
        .vm-no-key__text { font-size: 0.875rem; color: var(--admin-text-secondary, #8b8fa7); line-height: 1.6; max-width: 480px; margin: 0 auto 1rem; }

        /* --- Drag-and-drop overlay (replaces old drop zone box) --- */
        .vm-drag-overlay { display: none; position: absolute; inset: 0; z-index: 10; background: rgba(79,143,247,0.04); border: 2px dashed var(--admin-primary, #4f8ff7); border-radius: var(--admin-radius-lg, 10px); align-items: center; justify-content: center; pointer-events: none; }
        .vm-drag-overlay.vm-drag-visible { display: flex; }
        .vm-drag-overlay-text { font-size: 0.875rem; color: var(--admin-primary, #4f8ff7); font-weight: 500; background: var(--admin-surface, #1a1d27); padding: 0.5rem 1rem; border-radius: var(--admin-radius, 6px); border: 1px solid var(--admin-primary, #4f8ff7); }

        /* Hidden file input */
        .vm-file-input-hidden { display: none; }
    `;

    const SVG_FOLDER = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>';
    const SVG_FILE   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>';
    const SVG_LOCK   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>';
    const SVG_PLUS   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>';
    const SVG_UPLOAD = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_REFRESH = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>';
    const SVG_DOWNLOAD = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_DELETE  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
    const SVG_RENAME = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>';
    const SVG_CHEVRON = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_CLOSE  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_RAW    = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_EYE    = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>';
    const SVG_COLLAPSE = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_EXPAND  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_MOVE   = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L11 6.414V13.586l1.293-1.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 13.586V6.414L7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3z"/></svg>';

    class VaultManager extends HTMLElement {

        static get appId()    { return 'vault'; }
        static get navLabel() { return 'My Vault'; }
        static get navIcon()  { return SVG_LOCK; }

        constructor() {
            super();
            this._selectedKey    = null;   // { publicKey, privateKey, fingerprint, record }
            this._allKeys        = [];     // all PKI keys from IndexedDB
            this._vaultCacheKey  = null;
            this._vaultManifest  = null;
            this._currentFolder  = null;   // current folder GUID
            this._folderPath     = [];     // breadcrumb: [{guid, name}]
            this._index          = {};     // GUID -> { name, type, parentGuid, size, mime }
            this._loading        = false;
            this._sortBy         = 'name'; // name | size
            this._sortAsc        = true;
            this._pendingDelete  = null;   // guid awaiting delete confirmation
            this._showNewFolder  = false;  // inline new-folder input visible
            this._renamingGuid   = null;   // guid of item being renamed
            this._lastFolder     = null;   // cached folder data for current view
            this._selectedItem   = null;   // guid of item selected for detail panel
            this._showRawData    = false;  // raw data view toggle
            this._treeExpanded   = {};     // guid -> bool: which tree nodes are expanded
            this._dragCounter    = 0;      // for nested dragenter/dragleave counting
            this._previewData    = null;   // { type: 'image'|'text', data: ... } for detail panel preview
            this._previewLoading = false;
            this._sidebarCollapsed = false;// tree sidebar collapsed to icons
            this._treeWidth      = 200;   // tree sidebar width in px
            this._detailWidth    = 260;   // detail panel width in px
            this._draggingGuid   = null;  // guid of item being dragged internally
            this._loadPrefs();
        }

        _loadPrefs() {
            try {
                const raw = localStorage.getItem('sgraph-vault-prefs');
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p.treeWidth)    this._treeWidth    = p.treeWidth;
                    if (p.detailWidth)  this._detailWidth  = p.detailWidth;
                    if (p.sidebarCollapsed !== undefined) this._sidebarCollapsed = p.sidebarCollapsed;
                }
            } catch (_) { /* ignore */ }
        }

        _savePrefs() {
            try {
                localStorage.setItem('sgraph-vault-prefs', JSON.stringify({
                    treeWidth        : this._treeWidth,
                    detailWidth      : this._detailWidth,
                    sidebarCollapsed : this._sidebarCollapsed
                }));
            } catch (_) { /* ignore */ }
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { /* cleanup */ }

        onActivated() {
            this._loadKeys();
        }

        onDeactivated() { /* nothing */ }

        // =====================================================================
        // Rendering
        // =====================================================================

        render() {
            this.innerHTML = `<style>${VM_STYLES}</style><div class="vm-container"><div class="pk-loading"><span class="pk-spinner"></span> Loading keys...</div></div>`;
        }

        _renderNoKey() {
            this.querySelector('.vm-container').innerHTML = `
                <div class="vm-no-key">
                    <div class="vm-no-key__icon">${SVG_LOCK}</div>
                    <div class="vm-no-key__title">No PKI Key Found</div>
                    <p class="vm-no-key__text">
                        The vault requires a PKI key pair. Generate or import one in the
                        <span class="pk-btn pk-btn--xs pk-btn--ghost" onclick="window.sgraphAdmin.router.navigateTo('pki-keys')">PKI Keys</span>
                        section first.
                    </p>
                </div>
            `;
        }

        _renderVault() {
            const container = this.querySelector('.vm-container');
            const fingerprint = this._selectedKey.fingerprint || '';
            const shortFingerprint = fingerprint.length > 16 ? fingerprint.substring(0, 16) : fingerprint;

            // Build key selector options
            let keyOptions = '';
            for (let i = 0; i < this._allKeys.length; i++) {
                const key = this._allKeys[i];
                const fp = key.fingerprint || '';
                const shortFp = fp.length > 16 ? fp.substring(0, 16) : fp;
                const selected = (fp === fingerprint) ? ' selected' : '';
                const label = key.label || shortFp || ('Key ' + (i + 1));
                keyOptions += `<option value="${i}"${selected}>${escapeHtml(label)} (${escapeHtml(shortFp)})</option>`;
            }

            container.innerHTML = `
                <div class="vm-toolbar">
                    <div class="vm-key-selector">
                        <label>Key:</label>
                        <select class="vm-key-select" id="vm-key-select">${keyOptions}</select>
                    </div>
                    <div class="vm-breadcrumb" id="vm-breadcrumb"></div>
                    <div class="vm-actions">
                        <button class="pk-btn pk-btn--xs pk-btn--ghost vm-raw-toggle ${this._showRawData ? 'vm-raw-active' : ''}" id="vm-btn-raw" title="Toggle raw data view">${SVG_RAW}</button>
                        <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-btn-upload" title="Upload file">${SVG_UPLOAD} Upload</button>
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-refresh" title="Refresh">${SVG_REFRESH}</button>
                    </div>
                </div>
                <div class="vm-body" id="vm-body">
                    <div class="vm-tree-sidebar${this._sidebarCollapsed ? ' vm-sidebar-collapsed' : ''}" id="vm-tree-sidebar" style="width: ${this._sidebarCollapsed ? '36' : this._treeWidth}px"></div>
                    <div class="vm-resize-handle" id="vm-resize-left"></div>
                    <div class="vm-content" id="vm-content">
                        <div class="vm-drag-overlay" id="vm-drag-overlay">
                            <span class="vm-drag-overlay-text">Drop files here to encrypt &amp; upload</span>
                        </div>
                    </div>
                    <input type="file" class="vm-file-input-hidden" id="vm-file-input" multiple>
                </div>
                <div class="vm-status-bar" id="vm-status-bar">
                    <span class="vm-icon vm-icon-lock">${SVG_LOCK}</span>
                    <span>Key: <span class="vm-status-key">${escapeHtml(shortFingerprint)}</span></span>
                    <span>Vault: <span class="vm-status-key">${escapeHtml(this._vaultCacheKey.substring(0, 12))}...</span></span>
                    <span id="vm-stats"></span>
                </div>
            `;

            // Event listeners — toolbar
            container.querySelector('#vm-btn-refresh').addEventListener('click', () => this._browseFolder(this._currentFolder));
            container.querySelector('#vm-btn-upload').addEventListener('click', () => container.querySelector('#vm-file-input').click());
            container.querySelector('#vm-file-input').addEventListener('change', (e) => { this._handleFileUpload(e.target.files); e.target.value = ''; });
            container.querySelector('#vm-btn-raw').addEventListener('click', () => this._toggleRawData());

            // Key selector change
            container.querySelector('#vm-key-select').addEventListener('change', (e) => this._onKeyChange(parseInt(e.target.value, 10)));

            // Drag-and-drop on content area
            const contentArea = container.querySelector('#vm-content');
            contentArea.addEventListener('dragenter', (e) => this._onDragEnter(e));
            contentArea.addEventListener('dragover',  (e) => this._onDragOver(e));
            contentArea.addEventListener('dragleave', (e) => this._onDragLeave(e));
            contentArea.addEventListener('drop',      (e) => this._onDrop(e));

            // Resize handles
            this._setupResize('vm-resize-left', 'vm-tree-sidebar', '_treeWidth', 120, 360, false);

            this._renderTree();
            this._browseFolder(this._currentFolder);
        }

        _renderBreadcrumb() {
            const bc = this.querySelector('#vm-breadcrumb');
            if (!bc) return;
            let html = `<span onclick="this.getRootNode().host ? this.getRootNode().host._navigateToRoot() : document.querySelector('vault-manager')._navigateToRoot()">Vault</span>`;
            for (let i = 0; i < this._folderPath.length; i++) {
                const item = this._folderPath[i];
                const isCurrent = (i === this._folderPath.length - 1);
                html += `<span class="vm-bc-sep">/</span>`;
                if (isCurrent) {
                    html += `<span class="vm-bc-current">${escapeHtml(item.name)}</span>`;
                } else {
                    html += `<span data-guid="${escapeHtml(item.guid)}">${escapeHtml(item.name)}</span>`;
                }
            }
            bc.innerHTML = html;
            bc.querySelectorAll('span[data-guid]').forEach(el => {
                el.addEventListener('click', () => this._navigateToFolder(el.dataset.guid));
            });
        }

        // -----------------------------------------------------------------
        // Tree view sidebar
        // -----------------------------------------------------------------

        _renderTree() {
            const sidebar = this.querySelector('#vm-tree-sidebar');
            if (!sidebar) return;

            const rootGuid = this._vaultManifest ? this._vaultManifest.root_folder : this._currentFolder;
            // Ensure root is expanded by default
            if (this._treeExpanded[rootGuid] === undefined) {
                this._treeExpanded[rootGuid] = true;
            }

            const collapseIcon = this._sidebarCollapsed ? SVG_EXPAND : SVG_COLLAPSE;
            sidebar.innerHTML = `
                <button class="vm-tree-collapse-btn" id="vm-tree-collapse" title="${this._sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">${collapseIcon}</button>
                <div class="vm-tree-scroll">${this._buildTreeNode(rootGuid, 'Root', 0)}</div>
                <div class="vm-tree-footer">
                    <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-new-folder" title="New folder">${SVG_PLUS}<span class="vm-tree-footer-text"> New Folder</span></button>
                </div>`;
            this._bindTreeEvents(sidebar);

            // Collapse toggle
            sidebar.querySelector('#vm-tree-collapse').addEventListener('click', () => this._toggleSidebarCollapse());
            // New Folder button
            sidebar.querySelector('#vm-btn-new-folder').addEventListener('click', () => this._toggleNewFolderInput());
        }

        _buildTreeNode(guid, name, depth) {
            // Find children that are folders
            const childFolders = this._getChildFolders(guid);
            const hasChildren = childFolders.length > 0;
            const isExpanded = !!this._treeExpanded[guid];
            const isActive = (guid === this._currentFolder);

            const chevronClass = hasChildren
                ? ('vm-tree-chevron' + (isExpanded ? ' vm-tree-expanded' : ''))
                : 'vm-tree-chevron vm-tree-empty';

            let html = `<div class="vm-tree-node${isActive ? ' vm-tree-active' : ''}" data-tree-guid="${escapeHtml(guid)}" style="padding-left: ${0.375 + depth * 0.75}rem;">
                <span class="${chevronClass}" data-tree-toggle="${escapeHtml(guid)}">${SVG_CHEVRON}</span>
                <span class="vm-tree-icon">${SVG_FOLDER}</span>
                <span class="vm-tree-label">${escapeHtml(name)}</span>
            </div>`;

            if (hasChildren) {
                html += `<div class="vm-tree-children${isExpanded ? '' : ' vm-tree-collapsed'}" data-tree-children="${escapeHtml(guid)}">`;
                for (const child of childFolders) {
                    const childName = (this._index[child.guid] && this._index[child.guid].name) || child.guid;
                    html += this._buildTreeNode(child.guid, childName, depth + 1);
                }
                html += `</div>`;
            }

            return html;
        }

        _getChildFolders(parentGuid) {
            const folders = [];
            for (const [guid, meta] of Object.entries(this._index)) {
                if (meta.type === 'folder' && meta.parentGuid === parentGuid) {
                    folders.push({ guid, name: meta.name || guid });
                }
            }
            folders.sort((a, b) => a.name.localeCompare(b.name));
            return folders;
        }

        _bindTreeEvents(sidebar) {
            // Click on tree node to navigate
            sidebar.querySelectorAll('.vm-tree-node').forEach(node => {
                node.addEventListener('click', (e) => {
                    const guid = node.dataset.treeGuid;
                    // If clicking the chevron, toggle expand/collapse
                    const chevron = e.target.closest('[data-tree-toggle]');
                    if (chevron) {
                        this._treeExpanded[guid] = !this._treeExpanded[guid];
                        this._renderTree();
                        return;
                    }
                    // Otherwise navigate to the folder
                    this._navigateToFolder(guid);
                });

                // Drop target for internal file moves
                node.addEventListener('dragover', (e) => {
                    if (!this._draggingGuid) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    node.classList.add('vm-tree-drop-target');
                });
                node.addEventListener('dragleave', () => {
                    node.classList.remove('vm-tree-drop-target');
                });
                node.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    node.classList.remove('vm-tree-drop-target');
                    const targetFolder = node.dataset.treeGuid;
                    if (this._draggingGuid && targetFolder && targetFolder !== this._currentFolder) {
                        this._moveItem(this._draggingGuid, targetFolder);
                    }
                    this._draggingGuid = null;
                });
            });
        }

        // -----------------------------------------------------------------
        // Detail panel (right side)
        // -----------------------------------------------------------------

        _renderDetailPanel() {
            // Remove existing detail panel if any
            const existing = this.querySelector('#vm-detail-panel');
            if (existing) existing.remove();

            if (!this._selectedItem) return;

            const meta = this._index[this._selectedItem] || {};
            const body = this.querySelector('.vm-body');
            if (!body) return;

            const isFile = meta.type !== 'folder';
            const uploadDate = meta.uploadedAt || '\u2014';
            const mime = meta.mime || '\u2014';
            const size = isFile ? formatSize(meta.size) : '\u2014';

            let previewHtml = '';
            if (isFile) {
                if (this._previewLoading) {
                    previewHtml = `<div class="vm-detail-preview">
                        <div class="vm-detail-preview-label">Preview</div>
                        <div class="vm-detail-preview-loading">Decrypting preview...</div>
                    </div>`;
                } else if (this._previewData) {
                    if (this._previewData.type === 'image') {
                        previewHtml = `<div class="vm-detail-preview">
                            <div class="vm-detail-preview-label">Preview</div>
                            <img src="${this._previewData.data}" alt="Preview">
                        </div>`;
                    } else if (this._previewData.type === 'text') {
                        previewHtml = `<div class="vm-detail-preview">
                            <div class="vm-detail-preview-label">Preview</div>
                            <pre>${escapeHtml(this._previewData.data)}</pre>
                        </div>`;
                    }
                } else {
                    // Show a button to load preview for supported types
                    const previewable = this._isPreviewable(mime);
                    if (previewable) {
                        previewHtml = `<div class="vm-detail-preview">
                            <div class="vm-detail-preview-label">Preview</div>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-detail-preview-btn">${SVG_EYE} Load Preview</button>
                        </div>`;
                    }
                }
            }

            // Delete confirmation in detail panel
            const isDeleting = this._pendingDelete === this._selectedItem;
            let deleteHtml = '';
            if (isDeleting) {
                deleteHtml = `<div class="vm-inline-confirm" style="margin-top: 0.5rem;">
                    <span>Delete "${escapeHtml((meta.name || this._selectedItem).substring(0, 20))}"?</span>
                    <button class="pk-btn pk-btn--xs pk-btn--ghost vm-confirm-yes" id="vm-detail-confirm-delete">Yes</button>
                    <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-detail-cancel-delete">No</button>
                </div>`;
            }

            let actionsHtml = '';
            if (isFile) {
                actionsHtml = `<div class="vm-detail-actions">
                    <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-detail-download">${SVG_DOWNLOAD} Download</button>
                    <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-detail-rename">${SVG_RENAME} Rename</button>
                    ${isDeleting ? '' : `<button class="pk-btn pk-btn--xs pk-btn--danger" id="vm-detail-delete">${SVG_DELETE} Delete</button>`}
                </div>${deleteHtml}`;
            } else {
                actionsHtml = `<div class="vm-detail-actions">
                    <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-detail-open">Open</button>
                    <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-detail-rename">${SVG_RENAME} Rename</button>
                    ${isDeleting ? '' : `<button class="pk-btn pk-btn--xs pk-btn--danger" id="vm-detail-delete">${SVG_DELETE} Delete</button>`}
                </div>${deleteHtml}`;
            }

            const panelHtml = `
                <div class="vm-detail-panel" id="vm-detail-panel">
                    <div class="vm-detail-header">
                        <div class="vm-detail-title">${escapeHtml(meta.name || this._selectedItem)}</div>
                        <button class="vm-detail-close" id="vm-detail-close">${SVG_CLOSE}</button>
                    </div>
                    <div class="vm-detail-row">
                        <div class="vm-detail-label">Name</div>
                        <div class="vm-detail-value">${escapeHtml(meta.name || this._selectedItem)}</div>
                    </div>
                    <div class="vm-detail-row">
                        <div class="vm-detail-label">Type</div>
                        <div class="vm-detail-value">${escapeHtml(meta.type === 'folder' ? 'Folder' : 'File')}</div>
                    </div>
                    ${isFile ? `<div class="vm-detail-row">
                        <div class="vm-detail-label">Size</div>
                        <div class="vm-detail-value">${escapeHtml(size)}</div>
                    </div>` : ''}
                    <div class="vm-detail-row">
                        <div class="vm-detail-label">GUID</div>
                        <div class="vm-detail-value"><code>${escapeHtml(this._selectedItem)}</code></div>
                    </div>
                    ${isFile ? `<div class="vm-detail-row">
                        <div class="vm-detail-label">MIME Type</div>
                        <div class="vm-detail-value"><code>${escapeHtml(mime)}</code></div>
                    </div>` : ''}
                    <div class="vm-detail-row">
                        <div class="vm-detail-label">Uploaded</div>
                        <div class="vm-detail-value">${escapeHtml(uploadDate)}</div>
                    </div>
                    ${previewHtml}
                    ${actionsHtml}
                </div>
            `;

            // Insert resize handle then panel
            const existingResizeRight = this.querySelector('#vm-resize-right');
            if (existingResizeRight) existingResizeRight.remove();
            body.insertAdjacentHTML('beforeend', `<div class="vm-resize-handle" id="vm-resize-right"></div>` + panelHtml);

            // Bind detail panel events
            const panel = this.querySelector('#vm-detail-panel');
            panel.querySelector('#vm-detail-close').addEventListener('click', () => this._closeDetailPanel());

            const downloadBtn = panel.querySelector('#vm-detail-download');
            if (downloadBtn) downloadBtn.addEventListener('click', () => this._downloadFile(this._selectedItem));

            const openBtn = panel.querySelector('#vm-detail-open');
            if (openBtn) openBtn.addEventListener('click', () => this._navigateToFolder(this._selectedItem));

            const renameBtn = panel.querySelector('#vm-detail-rename');
            if (renameBtn) {
                renameBtn.addEventListener('click', () => {
                    this._renamingGuid = this._selectedItem;
                    if (this._lastFolder) {
                        this._renderFolderContents(this._lastFolder);
                        this._renderBreadcrumb();
                    }
                    const input = this.querySelector(`[data-rename-guid="${this._selectedItem}"]`);
                    if (input) { input.focus(); input.select(); }
                });
            }

            const previewBtn = panel.querySelector('#vm-detail-preview-btn');
            if (previewBtn) previewBtn.addEventListener('click', () => this._loadPreview(this._selectedItem));

            // Delete button in detail panel
            const deleteBtn = panel.querySelector('#vm-detail-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    this._pendingDelete = this._selectedItem;
                    this._renderDetailPanel();
                });
            }
            const confirmDelete = panel.querySelector('#vm-detail-confirm-delete');
            if (confirmDelete) {
                confirmDelete.addEventListener('click', () => {
                    this._deleteItem(this._selectedItem);
                });
            }
            const cancelDelete = panel.querySelector('#vm-detail-cancel-delete');
            if (cancelDelete) {
                cancelDelete.addEventListener('click', () => {
                    this._pendingDelete = null;
                    this._renderDetailPanel();
                });
            }

            // Setup right resize handle for detail panel
            this._setupResize('vm-resize-right', 'vm-detail-panel', '_detailWidth', 180, 500, true);
        }

        _closeDetailPanel() {
            this._selectedItem   = null;
            this._previewData    = null;
            this._previewLoading = false;
            this._pendingDelete  = null;
            const panel = this.querySelector('#vm-detail-panel');
            if (panel) panel.remove();
            const resizeRight = this.querySelector('#vm-resize-right');
            if (resizeRight) resizeRight.remove();
            // Remove selection highlight from rows
            this.querySelectorAll('.vm-row-selected').forEach(r => r.classList.remove('vm-row-selected'));
        }

        _selectItem(guid) {
            // If same item, deselect
            if (this._selectedItem === guid) {
                this._closeDetailPanel();
                return;
            }
            this._selectedItem   = guid;
            this._previewData    = null;
            this._previewLoading = false;

            // Highlight the selected row
            this.querySelectorAll('.vm-row-selected').forEach(r => r.classList.remove('vm-row-selected'));
            const row = this.querySelector(`tr[data-guid="${guid}"]`);
            if (row) row.classList.add('vm-row-selected');

            this._renderDetailPanel();
        }

        _isPreviewable(mime) {
            if (!mime || mime === '\u2014') return false;
            return mime.startsWith('image/') || mime.startsWith('text/') || mime === 'application/json';
        }

        async _loadPreview(fileGuid) {
            const meta = this._index[fileGuid] || {};
            const mime = meta.mime || '';
            if (!this._isPreviewable(mime)) return;

            this._previewLoading = true;
            this._renderDetailPanel();

            try {
                const result = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!result || !result.data) {
                    this._previewLoading = false;
                    this._renderDetailPanel();
                    return;
                }

                const packed    = b64ToArrayBuf(result.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);

                if (mime.startsWith('image/')) {
                    const blob = new Blob([decrypted], { type: mime });
                    const url  = URL.createObjectURL(blob);
                    this._previewData = { type: 'image', data: url };
                } else {
                    // Text or JSON
                    const text = new TextDecoder().decode(decrypted);
                    // Truncate for display
                    const truncated = text.length > 2000 ? text.substring(0, 2000) + '\n... (truncated)' : text;
                    this._previewData = { type: 'text', data: truncated };
                }

                this._previewLoading = false;
                this._renderDetailPanel();
            } catch (err) {
                this._previewLoading = false;
                this._previewData    = { type: 'text', data: 'Preview failed: ' + err.message };
                this._renderDetailPanel();
            }
        }

        // -----------------------------------------------------------------
        // Folder contents rendering
        // -----------------------------------------------------------------

        _renderFolderContents(folder) {
            const content = this.querySelector('#vm-content');
            if (!content) return;
            this._lastFolder = folder;
            const children = folder.children || [];

            // Preserve the drag overlay element
            const overlayHtml = '<div class="vm-drag-overlay" id="vm-drag-overlay"><span class="vm-drag-overlay-text">Drop files here to encrypt &amp; upload</span></div>';

            // Filter: only files in the table (folders live in tree sidebar)
            const fileGuids = children.filter(guid => {
                const meta = this._index[guid] || {};
                return meta.type !== 'folder';
            });

            if (fileGuids.length === 0 && !this._showNewFolder) {
                content.innerHTML = `
                    ${overlayHtml}
                    <div class="pk-empty">
                        <div class="pk-empty__icon">${SVG_FILE}</div>
                        <div class="pk-empty__text">No files in this folder</div>
                        <div class="pk-empty__hint">Upload files or drag them here to get started</div>
                    </div>`;
                this._updateStats(children);
                return;
            }

            // Build sorted item list with metadata (files only)
            const items = fileGuids.map(guid => {
                const meta = this._index[guid] || {};
                return { guid, name: meta.name || guid, type: meta.type || 'unknown', size: meta.size || 0, mime: meta.mime };
            });

            // Sort by selected column
            items.sort((a, b) => {
                const dir = this._sortAsc ? 1 : -1;
                if (this._sortBy === 'size') return (a.size - b.size) * dir;
                return a.name.localeCompare(b.name) * dir;
            });

            const arrow = this._sortAsc ? ' \u2191' : ' \u2193';
            let rows = '';

            // Inline new folder row
            if (this._showNewFolder) {
                rows += `<tr class="vm-new-folder-row">
                    <td colspan="3" style="padding: 0;">
                        <div class="vm-new-folder-row">
                            <span class="vm-icon vm-icon-folder">${SVG_FOLDER}</span>
                            <input type="text" class="vm-rename-input" id="vm-new-folder-input" placeholder="Folder name" autofocus>
                            <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-new-folder-save">Create</button>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-new-folder-cancel">Cancel</button>
                        </div>
                    </td>
                </tr>`;
            }

            for (const item of items) {
                const isRenaming  = this._renamingGuid  === item.guid;
                const isSelected  = this._selectedItem  === item.guid;
                const selectedCls = isSelected ? ' vm-row-selected' : '';

                // Raw data vs human-readable display
                const displayName = this._showRawData
                    ? `<span class="vm-guid-display">${escapeHtml(item.guid)}</span>`
                    : (isRenaming
                        ? `<input type="text" class="vm-rename-input" data-rename-guid="${escapeHtml(item.guid)}" value="${escapeHtml(item.name)}">`
                        : `<span class="vm-name vm-name-editable" data-name-guid="${escapeHtml(item.guid)}">${escapeHtml(item.name)}</span>`
                      );

                const size = item.size ? formatSize(item.size) : '\u2014';
                rows += `<tr class="${selectedCls}" data-guid="${escapeHtml(item.guid)}" draggable="true">
                    <td>
                        <span class="vm-icon vm-icon-file">${SVG_FILE}</span>
                        ${displayName}
                    </td>
                    <td class="vm-meta">${escapeHtml(size)}</td>
                    <td>
                        <button class="pk-btn pk-btn--xs pk-btn--ghost vm-btn-download" data-guid="${escapeHtml(item.guid)}" title="Download">${SVG_DOWNLOAD}</button>
                    </td>
                </tr>`;
            }

            content.innerHTML = `
                ${overlayHtml}
                <table class="vm-table">
                    <thead><tr>
                        <th id="vm-th-name" class="${this._sortBy === 'name' ? 'vm-sort-active' : ''}">Name${this._sortBy === 'name' ? arrow : ''}</th>
                        <th id="vm-th-size" class="${this._sortBy === 'size' ? 'vm-sort-active' : ''}">Size${this._sortBy === 'size' ? arrow : ''}</th>
                        <th></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;

            this._bindFolderEvents(content);
            this._updateStats(children);
        }

        _bindFolderEvents(content) {
            // Sort column headers
            const thName = content.querySelector('#vm-th-name');
            const thSize = content.querySelector('#vm-th-size');
            if (thName) thName.addEventListener('click', () => this._toggleSort('name'));
            if (thSize) thSize.addEventListener('click', () => this._toggleSort('size'));

            // Single-click on any row: select for detail panel
            content.querySelectorAll('tr[data-guid]').forEach(tr => {
                tr.addEventListener('click', (e) => {
                    if (e.target.closest('button') || e.target.closest('input')) return;
                    this._selectItem(tr.dataset.guid);
                });

                // Internal drag start — file move to folder
                tr.addEventListener('dragstart', (e) => {
                    this._draggingGuid = tr.dataset.guid;
                    tr.classList.add('vm-row-dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tr.dataset.guid);
                });
                tr.addEventListener('dragend', () => {
                    tr.classList.remove('vm-row-dragging');
                    this._draggingGuid = null;
                    // Clear any tree drop targets
                    this.querySelectorAll('.vm-tree-drop-target').forEach(n => n.classList.remove('vm-tree-drop-target'));
                });
            });

            // Download
            content.querySelectorAll('.vm-btn-download').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._downloadFile(btn.dataset.guid); });
            });

            // Double-click name to rename
            content.querySelectorAll('.vm-name-editable').forEach(el => {
                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    this._renamingGuid = el.dataset.nameGuid;
                    this._renderFolderContents(this._lastFolder);
                    this._renderBreadcrumb();
                    const input = content.querySelector(`[data-rename-guid="${el.dataset.nameGuid}"]`);
                    if (input) { input.focus(); input.select(); }
                });
            });

            // Rename input: Enter/Escape/blur
            content.querySelectorAll('.vm-rename-input[data-rename-guid]').forEach(input => {
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') this._commitRename(input.dataset.renameGuid, input.value);
                    else if (e.key === 'Escape') { this._renamingGuid = null; this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
                });
                input.addEventListener('blur', () => {
                    if (this._renamingGuid === input.dataset.renameGuid) {
                        this._commitRename(input.dataset.renameGuid, input.value);
                    }
                });
                input.addEventListener('click', (e) => e.stopPropagation());
            });

            // Inline new folder: save/cancel/Enter/Escape
            const nfInput  = content.querySelector('#vm-new-folder-input');
            const nfSave   = content.querySelector('#vm-new-folder-save');
            const nfCancel = content.querySelector('#vm-new-folder-cancel');
            if (nfInput) {
                nfInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const name = nfInput.value.trim();
                        if (name) this._createFolder(name);
                    } else if (e.key === 'Escape') {
                        this._showNewFolder = false;
                        this._renderFolderContents(this._lastFolder);
                        this._renderBreadcrumb();
                    }
                });
                setTimeout(() => nfInput.focus(), 0);
            }
            if (nfSave) nfSave.addEventListener('click', () => {
                const name = (nfInput ? nfInput.value.trim() : '');
                if (name) this._createFolder(name);
            });
            if (nfCancel) nfCancel.addEventListener('click', () => {
                this._showNewFolder = false;
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            });
        }

        _updateStats(children) {
            const el = this.querySelector('#vm-stats');
            if (!el) return;
            let files = 0, folders = 0, totalSize = 0;
            for (const guid of children) {
                const meta = this._index[guid] || {};
                if (meta.type === 'folder') folders++;
                else { files++; totalSize += (meta.size || 0); }
            }
            el.textContent = `${folders} folder${folders !== 1 ? 's' : ''}, ${files} file${files !== 1 ? 's' : ''}, ${formatSize(totalSize)} encrypted`;
        }

        // =====================================================================
        // Key + Vault initialization
        // =====================================================================

        async _loadKeys() {
            const pki = window.sgraphAdmin.pki;
            if (!pki.hasWebCrypto()) {
                this.querySelector('.vm-container').innerHTML = pki.renderInsecureContextError();
                return;
            }

            try {
                const keys = await pki.db.getAll('keys');
                if (!keys || keys.length === 0) {
                    this._allKeys = [];
                    this._renderNoKey();
                    return;
                }

                // Store all keys with fingerprints for key selector
                this._allKeys = [];
                for (const k of keys) {
                    const fp = k.fingerprint || await pki.computeFingerprint(k.publicKey);
                    this._allKeys.push({
                        publicKey   : k.publicKey,
                        privateKey  : k.privateKey,
                        fingerprint : fp,
                        label       : k.label || '',
                        record      : k
                    });
                }

                // Default: select first key
                this._selectedKey = this._allKeys[0];
                await this._initVault();
            } catch (err) {
                this._showError('Failed to load keys: ' + err.message);
            }
        }

        async _onKeyChange(keyIndex) {
            if (keyIndex < 0 || keyIndex >= this._allKeys.length) return;
            this._selectedKey    = this._allKeys[keyIndex];
            this._selectedItem   = null;
            this._previewData    = null;
            this._previewLoading = false;
            this._treeExpanded   = {};
            this._folderPath     = [];

            // Show loading state
            const body = this.querySelector('#vm-body');
            if (body) {
                body.classList.add('vm-loading');
                body.insertAdjacentHTML('afterbegin', '<div class="vm-loading-overlay" id="vm-loading-overlay"><span class="pk-spinner"></span></div>');
            }

            try {
                await this._initVault();
            } finally {
                // Remove loading state (initVault re-renders, so we need the new body)
                const newBody = this.querySelector('#vm-body');
                if (newBody) {
                    newBody.classList.remove('vm-loading');
                    const overlay = newBody.querySelector('#vm-loading-overlay');
                    if (overlay) overlay.remove();
                }
            }
        }

        async _initVault() {
            try {
                this._vaultCacheKey = await deriveVaultCacheKey(this._selectedKey.publicKey);

                const existsResult = await adminAPI.vaultExists(this._vaultCacheKey);

                if (existsResult.exists) {
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = this._vaultManifest.root_folder;
                } else {
                    const result = await adminAPI.vaultCreate(this._vaultCacheKey, this._selectedKey.fingerprint);
                    this._vaultManifest = await adminAPI.vaultLookup(this._vaultCacheKey);
                    this._currentFolder = result.root_folder;
                    const emptyIndex = JSON.stringify({ version: 1, entries: {} });
                    const encIndex   = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(emptyIndex));
                    await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64Safe(encIndex));
                }

                await this._loadIndex();
                this._folderPath = [{ guid: this._currentFolder, name: 'Root' }];
                this._renderVault();
            } catch (err) {
                this._showError('Failed to initialize vault: ' + err.message);
            }
        }

        async _loadIndex() {
            try {
                const result = await adminAPI.vaultGetIndex(this._vaultCacheKey);
                if (result && result.data) {
                    const packed    = b64ToArrayBuf(result.data);
                    const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);
                    const indexJson = JSON.parse(new TextDecoder().decode(decrypted));
                    this._index = indexJson.entries || {};
                }
            } catch (_) {
                this._index = {};
            }
        }

        async _saveIndex() {
            const indexJson = JSON.stringify({ version: 1, entries: this._index });
            const encrypted = await encryptBlob(this._selectedKey.publicKey, new TextEncoder().encode(indexJson));
            await adminAPI.vaultStoreIndex(this._vaultCacheKey, arrayBufToB64Safe(encrypted));
        }

        // =====================================================================
        // Sort
        // =====================================================================

        _toggleSort(col) {
            if (this._sortBy === col) {
                this._sortAsc = !this._sortAsc;
            } else {
                this._sortBy  = col;
                this._sortAsc = true;
            }
            if (this._lastFolder) {
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            }
        }

        // =====================================================================
        // Raw data toggle
        // =====================================================================

        _toggleRawData() {
            this._showRawData = !this._showRawData;
            // Update toggle button appearance
            const btn = this.querySelector('#vm-btn-raw');
            if (btn) {
                if (this._showRawData) {
                    btn.classList.add('vm-raw-active');
                } else {
                    btn.classList.remove('vm-raw-active');
                }
            }
            if (this._lastFolder) {
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            }
        }

        // =====================================================================
        // Drag-and-drop (full content area overlay)
        // =====================================================================

        _onDragEnter(e) {
            e.preventDefault();
            this._dragCounter++;
            if (this._dragCounter === 1) {
                const overlay = this.querySelector('#vm-drag-overlay');
                if (overlay) overlay.classList.add('vm-drag-visible');
            }
        }

        _onDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }

        _onDragLeave(e) {
            e.preventDefault();
            this._dragCounter--;
            if (this._dragCounter <= 0) {
                this._dragCounter = 0;
                const overlay = this.querySelector('#vm-drag-overlay');
                if (overlay) overlay.classList.remove('vm-drag-visible');
            }
        }

        _onDrop(e) {
            e.preventDefault();
            this._dragCounter = 0;
            const overlay = this.querySelector('#vm-drag-overlay');
            if (overlay) overlay.classList.remove('vm-drag-visible');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this._handleFileUpload(e.dataTransfer.files);
            }
        }

        // =====================================================================
        // Folder navigation
        // =====================================================================

        async _browseFolder(folderGuid) {
            this._pendingDelete = null;
            this._renamingGuid  = null;
            this._showNewFolder = false;
            try {
                const folder = await adminAPI.vaultGetFolder(this._vaultCacheKey, folderGuid);
                if (folder && folder.data) {
                    this._renderFolderContents(folder.data);
                } else {
                    this._renderFolderContents({ children: [] });
                }
                this._renderBreadcrumb();
                this._renderTree();
                // Re-render detail panel if an item is selected
                if (this._selectedItem) this._renderDetailPanel();
            } catch (err) {
                this._renderFolderContents({ children: [] });
                this._renderBreadcrumb();
                this._renderTree();
            }
        }

        _navigateToRoot() {
            this._currentFolder = this._vaultManifest.root_folder;
            this._folderPath    = [{ guid: this._currentFolder, name: 'Root' }];
            this._closeDetailPanel();
            this._browseFolder(this._currentFolder);
        }

        async _navigateToFolder(folderGuid) {
            const pathIdx = this._folderPath.findIndex(p => p.guid === folderGuid);
            if (pathIdx >= 0) {
                this._folderPath = this._folderPath.slice(0, pathIdx + 1);
            } else {
                const meta = this._index[folderGuid] || {};
                this._folderPath.push({ guid: folderGuid, name: meta.name || folderGuid });
            }
            this._currentFolder = folderGuid;
            // Expand this folder in the tree
            this._treeExpanded[folderGuid] = true;
            this._closeDetailPanel();
            this._browseFolder(folderGuid);
        }

        // =====================================================================
        // Folder operations
        // =====================================================================

        _toggleNewFolderInput() {
            this._showNewFolder = !this._showNewFolder;
            if (this._lastFolder) {
                this._renderFolderContents(this._lastFolder);
                this._renderBreadcrumb();
            }
        }

        async _createFolder(name) {
            try {
                const folderGuid = generateGuid();
                const folderData = { type: 'folder', id: folderGuid, children: [] };

                await adminAPI.vaultStoreFolder(this._vaultCacheKey, folderGuid, folderData);

                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(folderGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                this._index[folderGuid] = { name, type: 'folder', parentGuid: this._currentFolder };
                await this._saveIndex();

                this._showNewFolder = false;
                this._msg('success', `Folder "${name}" created`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', 'Failed to create folder: ' + err.message);
            }
        }

        // =====================================================================
        // Rename
        // =====================================================================

        async _commitRename(guid, newName) {
            this._renamingGuid = null;
            if (!newName || !newName.trim()) {
                if (this._lastFolder) { this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
                return;
            }
            const meta = this._index[guid];
            if (meta) {
                meta.name = newName.trim();
                await this._saveIndex();
                this._msg('success', `Renamed to "${meta.name}"`);
            }
            if (this._lastFolder) { this._renderFolderContents(this._lastFolder); this._renderBreadcrumb(); }
            this._renderTree();
            // Update detail panel if the renamed item is selected
            if (this._selectedItem === guid) this._renderDetailPanel();
        }

        // =====================================================================
        // File operations
        // =====================================================================

        async _handleFileUpload(fileList) {
            if (!fileList || fileList.length === 0) return;
            for (const file of fileList) {
                await this._uploadFile(file);
            }
        }

        async _uploadFile(file) {
            try {
                this._msg('info', `Encrypting "${file.name}"...`);

                const fileGuid  = generateGuid();
                const data      = await file.arrayBuffer();
                const encrypted = await encryptBlob(this._selectedKey.publicKey, data);
                const b64       = arrayBufToB64Safe(encrypted);

                this._msg('info', `Uploading "${file.name}"...`);
                await adminAPI.vaultStoreFile(this._vaultCacheKey, fileGuid, b64);

                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(fileGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                const now = new Date().toISOString();
                this._index[fileGuid] = { name: file.name, type: 'file', size: file.size, parentGuid: this._currentFolder, mime: file.type, uploadedAt: now };
                await this._saveIndex();

                this._msg('success', `"${file.name}" uploaded and encrypted`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Upload failed: ${err.message}`);
            }
        }

        async _downloadFile(fileGuid) {
            try {
                const meta = this._index[fileGuid] || {};
                this._msg('info', `Downloading "${meta.name || fileGuid}"...`);

                const result = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!result || !result.data) {
                    this._msg('error', 'File data not found');
                    return;
                }

                const packed    = b64ToArrayBuf(result.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);

                const blob = new Blob([decrypted], { type: meta.mime || 'application/octet-stream' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = meta.name || fileGuid;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this._msg('success', `"${meta.name || fileGuid}" decrypted and downloaded`);
            } catch (err) {
                this._msg('error', `Download failed: ${err.message}`);
            }
        }

        async _deleteItem(guid) {
            const meta = this._index[guid] || {};
            try {
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = (parent.data.children || []).filter(g => g !== guid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                delete this._index[guid];
                await this._saveIndex();

                this._pendingDelete = null;
                // If the deleted item was selected, close the detail panel
                if (this._selectedItem === guid) this._closeDetailPanel();
                this._msg('success', `"${meta.name || guid}" deleted`);
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Delete failed: ${err.message}`);
            }
        }

        // =====================================================================
        // Resize handles
        // =====================================================================

        _setupResize(handleId, panelId, widthProp, minWidth, maxWidth, isRightSide) {
            const handle = this.querySelector('#' + handleId);
            const panel  = this.querySelector('#' + panelId);
            if (!handle || !panel) return;

            let isResizing = false, startX, startWidth;

            const onMouseDown = (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = panel.offsetWidth;
                handle.classList.add('vm-resize-active');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff = isRightSide ? (startX - e.clientX) : (e.clientX - startX);
                const newWidth = Math.min(Math.max(startWidth + diff, minWidth), maxWidth);
                this[widthProp] = newWidth;
                panel.style.width = newWidth + 'px';
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('vm-resize-active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this._savePrefs();
            };

            handle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        _toggleSidebarCollapse() {
            this._sidebarCollapsed = !this._sidebarCollapsed;
            const sidebar = this.querySelector('#vm-tree-sidebar');
            if (sidebar) {
                if (this._sidebarCollapsed) {
                    sidebar.classList.add('vm-sidebar-collapsed');
                    sidebar.style.width = '36px';
                } else {
                    sidebar.classList.remove('vm-sidebar-collapsed');
                    sidebar.style.width = this._treeWidth + 'px';
                }
            }
            this._savePrefs();
            this._renderTree();
        }

        // =====================================================================
        // Move item between folders (internal drag-and-drop)
        // =====================================================================

        async _moveItem(itemGuid, targetFolderGuid) {
            const meta = this._index[itemGuid];
            if (!meta) return;
            const sourceFolderGuid = meta.parentGuid || this._currentFolder;
            if (sourceFolderGuid === targetFolderGuid) return;

            try {
                // Remove from source folder
                const source = await adminAPI.vaultGetFolder(this._vaultCacheKey, sourceFolderGuid);
                if (source && source.data) {
                    source.data.children = (source.data.children || []).filter(g => g !== itemGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, sourceFolderGuid, source.data);
                }

                // Add to target folder
                const target = await adminAPI.vaultGetFolder(this._vaultCacheKey, targetFolderGuid);
                if (target && target.data) {
                    target.data.children = target.data.children || [];
                    target.data.children.push(itemGuid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, targetFolderGuid, target.data);
                }

                // Update index
                meta.parentGuid = targetFolderGuid;
                await this._saveIndex();

                const targetName = (this._index[targetFolderGuid] && this._index[targetFolderGuid].name) || 'folder';
                this._msg('success', `Moved "${meta.name || itemGuid}" to "${targetName}"`);
                this._closeDetailPanel();
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Move failed: ${err.message}`);
            }
        }

        // =====================================================================
        // Helpers
        // =====================================================================

        _msg(type, text) {
            if (window.sgraphAdmin && window.sgraphAdmin.messages) {
                if (type === 'success') window.sgraphAdmin.messages.success(text);
                else if (type === 'error') window.sgraphAdmin.messages.error(text);
                else window.sgraphAdmin.messages.info(text);
            }
        }

        _showError(text) {
            const c = this.querySelector('.vm-container');
            if (c) c.innerHTML = `<div class="pk-section"><p style="color:var(--admin-error)">${escapeHtml(text)}</p></div>`;
        }
    }

    customElements.define('vault-manager', VaultManager);

})();
