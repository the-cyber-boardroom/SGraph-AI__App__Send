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
   - Resizable panel dividers (tree + detail)
   - Loading state + blur when switching keys
   - Files-only table view (folders live in tree sidebar)
   - Share via Send link — decrypt, re-encrypt, upload as transfer
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
    // Share helpers — re-encrypt vault file for Send transfer
    // =========================================================================

    function arrayBufToBase64Url(buf) {
        return arrayBufToB64Safe(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function packageSgmeta(fileBytes, filename) {
        const MAGIC = new Uint8Array([0x53, 0x47, 0x4D, 0x45, 0x54, 0x41, 0x00]); // "SGMETA\0"
        const meta  = new TextEncoder().encode(JSON.stringify({ filename }));
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, meta.length, false); // big-endian
        const packed = new Uint8Array(7 + 4 + meta.length + fileBytes.byteLength);
        packed.set(MAGIC, 0);
        packed.set(new Uint8Array(lenBuf), 7);
        packed.set(meta, 11);
        packed.set(new Uint8Array(fileBytes), 11 + meta.length);
        return packed;
    }

    async function sendEncrypt(plaintext) {
        const key    = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const rawKey = await crypto.subtle.exportKey('raw', key);
        const keyStr = arrayBufToBase64Url(rawKey);
        const iv     = crypto.getRandomValues(new Uint8Array(12));
        const ct     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
        const blob   = new Uint8Array(12 + ct.byteLength);
        blob.set(iv, 0);
        blob.set(new Uint8Array(ct), 12);
        return { keyStr, encrypted: blob };
    }

    // User Lambda base URL — transfer endpoints (/transfers/*) live on the
    // user lambda, not the admin lambda.
    //
    // Detection order:
    // DC: note: for now defaulting to https://send.sgraph.ai
    // 1. Explicit: window.sgraphAdmin.userLambdaUrl
    // 2. Auto-detect: admin hostname pattern → user lambda URL
    //    - admin.sgraph.ai → https://send.sgraph.ai
    //    - localhost:10061  → localhost:10062
    // 3. Fallback: same-origin (works when both lambdas share a domain)
    let _cachedUserLambdaUrl = null;

    function getUserLambdaUrl() {
        return "https://send.sgraph.ai"
        // if (_cachedUserLambdaUrl !== null) return _cachedUserLambdaUrl;
        //
        // // 1. Explicit config
        // if (window.sgraphAdmin && window.sgraphAdmin.userLambdaUrl) {
        //     _cachedUserLambdaUrl = window.sgraphAdmin.userLambdaUrl;
        //     return _cachedUserLambdaUrl;
        // }
        //
        // const loc = window.location;
        //
        // // 2a. Production: admin.sgraph.ai → send.sgraph.ai
        // if (loc.hostname.startsWith('admin.') && loc.hostname.includes('sgraph')) {
        //     _cachedUserLambdaUrl = `${loc.protocol}//${loc.hostname.replace(/^admin\./, '')}`;
        //     return _cachedUserLambdaUrl;
        // }
        //
        // // 2b. Dev port swap (admin 10061 → user 10062)
        // if (loc.port === '10061') {
        //     _cachedUserLambdaUrl = `${loc.protocol}//${loc.hostname}:10062`;
        //     return _cachedUserLambdaUrl;
        // }
        //
        // // 3. Same-origin fallback
        // _cachedUserLambdaUrl = '';
        // return _cachedUserLambdaUrl;
    }

    async function transferCreate(tokenName, fileSize, contentType) {
        const base = getUserLambdaUrl();
        const resp = await fetch(`${base}/transfers/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-sgraph-access-token': tokenName },
            body: JSON.stringify({ file_size_bytes: fileSize, content_type_hint: contentType })
        });
        if (!resp.ok) {
            const hint = !base ? ' (Hint: set window.sgraphAdmin.userLambdaUrl to the user lambda URL)' : '';
            throw new Error(`Create failed: ${resp.status} ${resp.statusText}${hint}`);
        }
        return resp.json();
    }

    async function transferUpload(tokenName, transferId, encryptedBlob) {
        const base = getUserLambdaUrl();
        const resp = await fetch(`${base}/transfers/upload/${transferId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'x-sgraph-access-token': tokenName },
            body: encryptedBlob
        });
        if (!resp.ok) throw new Error(`Upload failed: ${resp.status} ${resp.statusText}`);
        return resp.json();
    }

    async function transferComplete(tokenName, transferId) {
        const base = getUserLambdaUrl();
        const resp = await fetch(`${base}/transfers/complete/${transferId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-sgraph-access-token': tokenName }
        });
        if (!resp.ok) throw new Error(`Complete failed: ${resp.status} ${resp.statusText}`);
        return resp.json();
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
        .vm-body        { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; position: relative; }
        .vm-body.vm-loading .vm-row-1, .vm-body.vm-loading .vm-row-2, .vm-body.vm-loading .vm-row-3 { opacity: 0.4; pointer-events: none; filter: blur(1px); transition: all 200ms ease; }
        .vm-loading-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 20; }
        .vm-loading-overlay .pk-spinner { width: 24px; height: 24px; }

        /* --- 3-Row Layout --- */
        .vm-row-1       { display: flex; overflow: hidden; min-height: 80px; flex: 1; position: relative; }
        .vm-row-2       { flex-shrink: 0; border-top: 1px solid var(--admin-border-subtle, #252838); }
        .vm-row-3       { flex: 1; min-height: 60px; overflow: hidden; display: flex; flex-direction: column; border-top: 1px solid var(--admin-border-subtle, #252838); }
        .vm-row-3 vault-preview, .vm-row-3 vault-editor { flex: 1; min-height: 0; }
        .vm-preview-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--admin-text-muted, #5e6280); font-size: 0.75rem; font-style: italic; }

        /* --- Horizontal resize handle (between rows) --- */
        .vm-resize-row  { height: 4px; cursor: row-resize; background: transparent; transition: background 150ms ease; flex-shrink: 0; z-index: 5; }
        .vm-resize-row:hover, .vm-resize-row.vm-resize-active { background: var(--admin-primary, #4f8ff7); }

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
        .vm-tree-node.vm-tree-selected { background: var(--admin-primary-bg, rgba(79,143,247,0.15)); color: var(--admin-primary, #4f8ff7); }
        .vm-tree-node.vm-tree-drop-target { outline: 2px dashed var(--admin-primary, #4f8ff7); outline-offset: -2px; background: var(--admin-primary-bg, rgba(79,143,247,0.08)); }
        .vm-tree-chevron { width: 14px; height: 14px; flex-shrink: 0; transition: transform 150ms ease; display: inline-flex; align-items: center; justify-content: center; }
        .vm-tree-chevron.vm-tree-expanded { transform: rotate(90deg); }
        .vm-tree-chevron.vm-tree-empty { visibility: hidden; }
        .vm-tree-icon { flex-shrink: 0; }
        .vm-tree-icon svg { width: 14px; height: 14px; color: var(--admin-warning, #fbbf24); }
        .vm-tree-label { overflow: hidden; text-overflow: ellipsis; }
        .vm-tree-children { padding-left: 0.75rem; }
        .vm-tree-children.vm-tree-collapsed { display: none; }
        .vm-tree-footer { border-top: 1px solid var(--admin-border-subtle, #252838); padding: 0.375rem; display: flex; gap: 0.25rem; flex-shrink: 0; }
        .vm-tree-footer .pk-btn { width: 100%; justify-content: center; white-space: nowrap; }

        /* --- Resize Handles --- */
        .vm-resize-handle { width: 4px; cursor: col-resize; background: transparent; transition: background 150ms ease; flex-shrink: 0; z-index: 5; }
        .vm-resize-handle:hover, .vm-resize-handle.vm-resize-active { background: var(--admin-primary, #4f8ff7); }

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

        /* --- Share Dialog --- */
        .vm-share-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
        .vm-share-dialog { background: var(--admin-surface, #1a1d27); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius-lg, 10px); padding: 1.25rem; width: 480px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        .vm-share-title { font-size: 1rem; font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.375rem; }
        .vm-share-title svg { width: 18px; height: 18px; flex-shrink: 0; }
        .vm-share-actions svg { width: 14px; height: 14px; vertical-align: -2px; }
        .vm-share-result svg { width: 12px; height: 12px; vertical-align: -1px; }
        .vm-share-subtitle { font-size: 0.75rem; color: var(--admin-text-muted, #5e6280); margin-bottom: 1rem; }
        .vm-share-field { margin-bottom: 0.75rem; }
        .vm-share-field label { display: block; font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
        .vm-share-field select, .vm-share-field input { width: 100%; background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); color: var(--admin-text, #e4e6ef); font-size: 0.8125rem; padding: 0.375rem 0.5rem; outline: none; font-family: var(--admin-font-mono, monospace); }
        .vm-share-field select:focus, .vm-share-field input:focus { border-color: var(--admin-primary, #4f8ff7); box-shadow: 0 0 0 2px var(--admin-primary-bg, rgba(79,143,247,0.1)); }
        .vm-share-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
        .vm-share-progress { font-size: 0.75rem; color: var(--admin-text-secondary, #8b8fa7); margin-top: 0.75rem; min-height: 1.25rem; }
        .vm-share-progress.vm-share-error { color: var(--admin-error, #ef4444); }
        .vm-share-result { margin-top: 0.75rem; }
        .vm-share-url-box { display: flex; gap: 0.375rem; align-items: stretch; }
        .vm-share-url-input { flex: 1; background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); color: var(--admin-text, #e4e6ef); font-size: 0.6875rem; font-family: var(--admin-font-mono, monospace); padding: 0.375rem 0.5rem; }
        .vm-share-copied { font-size: 0.6875rem; color: var(--admin-success, #34d399); margin-top: 0.25rem; min-height: 1rem; }
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
    const SVG_CHEVRON  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>';
    const SVG_NEW_FILE = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clip-rule="evenodd"/></svg>';
    const SVG_RAW    = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_MOVE   = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L11 6.414V13.586l1.293-1.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L9 13.586V6.414L7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3z"/></svg>';
    const SVG_SHARE  = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>';
    const SVG_COPY   = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>';

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
            this._selectedItem   = null;   // guid of item selected for settings + preview
            this._showRawData    = false;  // raw data view toggle
            this._treeExpanded   = {};     // guid -> bool: which tree nodes are expanded
            this._dragCounter    = 0;      // for nested dragenter/dragleave counting
            this._treeWidth      = 200;   // tree sidebar width in px
            this._row1Height     = null;  // row-1 height in px (null = flex:1)
            this._draggingGuid   = null;  // guid of item being dragged internally
            this._loadPrefs();
        }

        _loadPrefs() {
            try {
                const raw = localStorage.getItem('sgraph-vault-prefs');
                if (raw) {
                    const p = JSON.parse(raw);
                    if (p.treeWidth)    this._treeWidth    = p.treeWidth;
                    if (p.row1Height)   this._row1Height   = p.row1Height;
                }
            } catch (_) { /* ignore */ }
        }

        _savePrefs() {
            try {
                localStorage.setItem('sgraph-vault-prefs', JSON.stringify({
                    treeWidth        : this._treeWidth,
                    row1Height       : this._row1Height
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

            const row1Style = this._row1Height ? `flex: 0 0 ${this._row1Height}px` : 'flex: 1';

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
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-new-file" title="Create new text file">${SVG_NEW_FILE} New</button>
                        <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-refresh" title="Refresh">${SVG_REFRESH}</button>
                    </div>
                </div>
                <div class="vm-body" id="vm-body">
                    <div class="vm-row-1" id="vm-row-1" style="${row1Style}">
                        <div class="vm-tree-sidebar" id="vm-tree-sidebar" style="width: ${this._treeWidth}px"></div>
                        <div class="vm-resize-handle" id="vm-resize-left"></div>
                        <div class="vm-content" id="vm-content">
                            <div class="vm-drag-overlay" id="vm-drag-overlay">
                                <span class="vm-drag-overlay-text">Drop files here to encrypt &amp; upload</span>
                            </div>
                        </div>
                    </div>
                    <div class="vm-row-2" id="vm-row-2">
                        <vault-settings id="vm-settings"></vault-settings>
                    </div>
                    <div class="vm-resize-row" id="vm-resize-row"></div>
                    <div class="vm-row-3" id="vm-row-3">
                        <vault-preview id="vm-preview"></vault-preview>
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
            container.querySelector('#vm-btn-new-file').addEventListener('click', () => this._createNewFile());

            // Key selector change
            container.querySelector('#vm-key-select').addEventListener('change', (e) => this._onKeyChange(parseInt(e.target.value, 10)));

            // Drag-and-drop on content area
            const contentArea = container.querySelector('#vm-content');
            contentArea.addEventListener('dragenter', (e) => this._onDragEnter(e));
            contentArea.addEventListener('dragover',  (e) => this._onDragOver(e));
            contentArea.addEventListener('dragleave', (e) => this._onDragLeave(e));
            contentArea.addEventListener('drop',      (e) => this._onDrop(e));

            // Resize handles — column (tree sidebar) + row (browser vs preview)
            this._setupResize('vm-resize-left', 'vm-tree-sidebar', '_treeWidth', 120, Infinity, false);
            this._setupRowResize('vm-resize-row', 'vm-row-1', '_row1Height', 80);

            // Settings bar events (delegated from vault-settings component)
            const settingsEl = container.querySelector('#vm-settings');
            settingsEl.addEventListener('vault-settings-download', (e) => this._downloadFile(e.detail.guid));
            settingsEl.addEventListener('vault-settings-share',    (e) => this._showShareDialog(e.detail.guid));
            settingsEl.addEventListener('vault-settings-edit',     (e) => this._openEditor(e.detail.guid));
            settingsEl.addEventListener('vault-settings-open',     (e) => this._navigateToFolder(e.detail.guid));
            settingsEl.addEventListener('vault-settings-delete',   (e) => this._deleteItem(e.detail.guid));
            settingsEl.addEventListener('vault-settings-rename',   (e) => this._commitRename(e.detail.guid, e.detail.newName));

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

            sidebar.innerHTML = `
                <div class="vm-tree-scroll">${this._buildTreeNode(rootGuid, 'Root', 0)}</div>
                <div class="vm-tree-footer">
                    <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-btn-new-folder" title="New folder">\uD83D\uDCC1 New Folder</button>
                </div>`;
            this._bindTreeEvents(sidebar);

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
            // Single-click: navigate into folder + show settings
            sidebar.querySelectorAll('.vm-tree-node').forEach(node => {
                node.addEventListener('click', (e) => {
                    const guid = node.dataset.treeGuid;
                    // If clicking the chevron, toggle expand/collapse only
                    const chevron = e.target.closest('[data-tree-toggle]');
                    if (chevron) {
                        this._treeExpanded[guid] = !this._treeExpanded[guid];
                        this._renderTree();
                        return;
                    }
                    // Navigate into the folder and show its settings
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
        // Selection + settings/preview (replaces detail panel)
        // -----------------------------------------------------------------

        _clearSelection() {
            this._selectedItem  = null;
            this._pendingDelete = null;
            const settingsEl = this.querySelector('#vm-settings');
            if (settingsEl) settingsEl.clear();
            this._restorePreview();
            const previewEl = this.querySelector('#vm-preview');
            if (previewEl) previewEl.showEmpty();
            this.querySelectorAll('.vm-row-selected').forEach(r => r.classList.remove('vm-row-selected'));
            this.querySelectorAll('.vm-tree-selected').forEach(n => n.classList.remove('vm-tree-selected'));
        }

        // Ensures row-3 contains a vault-preview (replaces editor if open)
        _restorePreview() {
            const row3 = this.querySelector('#vm-row-3');
            if (!row3) return;
            const existing = row3.querySelector('vault-preview');
            if (existing) return; // already there
            // Use innerHTML so the HTML parser upgrades the custom element
            row3.innerHTML = '<vault-preview id="vm-preview"></vault-preview>';
            // Restore row-1 height if it was collapsed for editor
            const row1 = this.querySelector('#vm-row-1');
            if (row1) {
                const h = this._row1Height;
                row1.style.flex = h ? `0 0 ${h}px` : '1';
                row1.style.minHeight = '';
            }
        }

        _updateSettings() {
            const settingsEl = this.querySelector('#vm-settings');
            if (!settingsEl) return;
            if (!this._selectedItem) { settingsEl.clear(); return; }
            const meta = this._index[this._selectedItem] || {};
            settingsEl.show({
                guid       : this._selectedItem,
                name       : meta.name || this._selectedItem,
                type       : meta.type || 'unknown',
                size       : meta.size,
                mime       : meta.mime,
                uploadedAt : meta.uploadedAt
            });
        }

        _updatePreview() {
            this._restorePreview();
            const previewEl = this.querySelector('#vm-preview');
            if (!previewEl) return;
            if (!this._selectedItem) { previewEl.showEmpty(); return; }
            const meta = this._index[this._selectedItem] || {};
            if (meta.type === 'folder') {
                previewEl.showEmpty('Folder selected');
                return;
            }
            const mime = meta.mime || '';
            if (!this._isPreviewable(mime)) {
                previewEl.showEmpty('No preview available for this file type');
                return;
            }
            // Auto-preview: start loading
            previewEl.showLoading('Decrypting preview...');
            this._autoPreview(this._selectedItem);
        }

        async _autoPreview(fileGuid) {
            const meta = this._index[fileGuid] || {};
            const mime = meta.mime || '';
            const previewEl = this.querySelector('#vm-preview');

            try {
                const result = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!result || !result.data) {
                    if (this._selectedItem === fileGuid && previewEl) previewEl.showEmpty('File data not found');
                    return;
                }
                if (this._selectedItem !== fileGuid) return;

                const packed    = b64ToArrayBuf(result.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);
                if (this._selectedItem !== fileGuid) return;
                if (!previewEl) return;

                if (mime.startsWith('image/')) {
                    const blob = new Blob([decrypted], { type: mime });
                    const url  = URL.createObjectURL(blob);
                    previewEl.show({ type: 'image', data: url, filename: meta.name || fileGuid });
                } else {
                    const text = new TextDecoder().decode(decrypted);
                    const truncated = text.length > 10000 ? text.substring(0, 10000) + '\n... (truncated)' : text;
                    previewEl.show({ type: 'text', data: truncated, filename: meta.name || fileGuid });
                }
            } catch (err) {
                if (this._selectedItem === fileGuid && previewEl) {
                    previewEl.showError('Preview failed: ' + err.message);
                }
            }
        }

        _selectItem(guid) {
            if (this._selectedItem === guid) {
                this._clearSelection();
                return;
            }
            this._selectedItem = guid;

            // Highlight the selected row
            this.querySelectorAll('.vm-row-selected').forEach(r => r.classList.remove('vm-row-selected'));
            const row = this.querySelector(`tr[data-guid="${guid}"]`);
            if (row) row.classList.add('vm-row-selected');

            this._updateSettings();
            this._updatePreview();
        }

        _isPreviewable(mime) {
            if (!mime || mime === '\u2014') return false;
            return mime.startsWith('image/') || mime.startsWith('text/') || mime === 'application/json';
        }

        _isEditable(mime) {
            if (!mime || mime === '\u2014') return false;
            return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript';
        }

        async _openEditor(fileGuid) {
            const meta = this._index[fileGuid];
            if (!meta) return;
            const mime = meta.mime || 'text/plain';

            try {
                this._msg('info', `Decrypting "${meta.name}" for editing...`);
                const result = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!result || !result.data) {
                    this._msg('error', 'Could not load file for editing');
                    return;
                }

                const packed    = b64ToArrayBuf(result.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);
                const text      = new TextDecoder().decode(decrypted);

                // Open editor in row-3 — collapse row-1 to give editor more space
                const row3 = this.querySelector('#vm-row-3');
                if (!row3) return;
                row3.innerHTML = '';
                const row1 = this.querySelector('#vm-row-1');
                if (row1) { row1.style.flex = '0 0 80px'; row1.style.minHeight = '0'; }

                const editor = document.createElement('vault-editor');
                row3.appendChild(editor);
                editor.open({
                    text,
                    filename : meta.name || fileGuid,
                    mime,
                    onSave   : async (newText) => {
                        const encoded   = new TextEncoder().encode(newText);
                        const encrypted = await encryptBlob(this._selectedKey.publicKey, encoded);
                        const b64       = arrayBufToB64Safe(encrypted);
                        await adminAPI.vaultStoreFile(this._vaultCacheKey, fileGuid, b64);
                        meta.size = encoded.byteLength;
                        await this._saveIndex();
                        this._msg('success', `"${meta.name}" saved`);
                    }
                });

                editor.addEventListener('vault-editor-close', () => {
                    this._updatePreview();
                });

            } catch (err) {
                this._msg('error', `Failed to open editor: ${err.message}`);
            }
        }

        // -----------------------------------------------------------------
        // Create new file
        // -----------------------------------------------------------------

        async _createNewFile() {
            try {
                const filename = 'untitled.md';
                const mime     = 'text/markdown';
                const guid     = generateGuid();

                // Encrypt empty content and store
                const encoded   = new TextEncoder().encode('');
                const encrypted = await encryptBlob(this._selectedKey.publicKey, encoded);
                const b64       = arrayBufToB64Safe(encrypted);
                await adminAPI.vaultStoreFile(this._vaultCacheKey, guid, b64);

                // Add to current folder
                const parent = await adminAPI.vaultGetFolder(this._vaultCacheKey, this._currentFolder);
                if (parent && parent.data) {
                    parent.data.children = parent.data.children || [];
                    parent.data.children.push(guid);
                    await adminAPI.vaultStoreFolder(this._vaultCacheKey, this._currentFolder, parent.data);
                }

                // Register in index
                this._index[guid] = { name: filename, type: 'file', size: 0, mime, parentGuid: this._currentFolder, uploadedAt: new Date().toISOString() };
                await this._saveIndex();

                // Refresh view and open editor directly (skip _selectItem to avoid
                // preview lifecycle — the editor replaces the preview immediately)
                await this._browseFolder(this._currentFolder);
                this._selectedItem = guid;
                this._updateSettings();
                // Highlight the row in the file list
                const row = this.querySelector(`[data-guid="${guid}"]`);
                if (row) row.classList.add('vm-row-selected');
                await this._openEditor(guid);
                this._msg('success', `Created "${filename}" — editing now`);
            } catch (err) {
                this._msg('error', `Failed to create file: ${err.message}`);
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
                // Re-render settings if an item is selected
                if (this._selectedItem) this._updateSettings();
            } catch (err) {
                this._renderFolderContents({ children: [] });
                this._renderBreadcrumb();
                this._renderTree();
            }
        }

        _navigateToRoot() {
            this._currentFolder = this._vaultManifest.root_folder;
            this._folderPath    = [{ guid: this._currentFolder, name: 'Root' }];
            this._clearSelection();
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
            this._treeExpanded[folderGuid] = true;
            // Select the folder to show its settings
            this._selectedItem  = folderGuid;
            this._pendingDelete = null;
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
            // Update settings bar if the renamed item is selected
            if (this._selectedItem === guid) this._updateSettings();
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
                if (this._selectedItem === guid) this._clearSelection();
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

        _setupRowResize(handleId, rowId, heightProp, minHeight) {
            const handle = this.querySelector('#' + handleId);
            const row    = this.querySelector('#' + rowId);
            if (!handle || !row) return;

            let isResizing = false, startY, startHeight;

            const onMouseDown = (e) => {
                isResizing  = true;
                startY      = e.clientY;
                startHeight = row.offsetHeight;
                handle.classList.add('vm-resize-active');
                document.body.style.cursor     = 'row-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff      = e.clientY - startY;
                const newHeight = Math.max(startHeight + diff, minHeight);
                this[heightProp] = newHeight;
                row.style.flex   = `0 0 ${newHeight}px`;
            };

            const onMouseUp = () => {
                if (!isResizing) return;
                isResizing = false;
                handle.classList.remove('vm-resize-active');
                document.body.style.cursor     = '';
                document.body.style.userSelect = '';
                this._savePrefs();
            };

            handle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
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
                this._clearSelection();
                this._browseFolder(this._currentFolder);
            } catch (err) {
                this._msg('error', `Move failed: ${err.message}`);
            }
        }

        // =====================================================================
        // Share via Send link
        // =====================================================================

        async _showShareDialog(fileGuid) {
            const meta = this._index[fileGuid] || {};

            // Fetch available tokens
            let tokenOptions = '';
            try {
                const result = await adminAPI.listTokens();
                const tokens = result.tokens || result.data || [];
                if (Array.isArray(tokens) && tokens.length > 0) {
                    for (const t of tokens) {
                        const name = typeof t === 'string' ? t : (t.name || t.token_name || '');
                        if (name) tokenOptions += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
                    }
                }
            } catch (_) { /* tokens list unavailable */ }

            const hasTokens = tokenOptions.length > 0;
            const tokenField = hasTokens
                ? `<select id="vm-share-token">${tokenOptions}</select>`
                : `<input type="text" id="vm-share-token" placeholder="Enter access token name" required>`;

            const overlay = document.createElement('div');
            overlay.className = 'vm-share-overlay';
            overlay.id = 'vm-share-overlay';
            overlay.innerHTML = `
                <div class="vm-share-dialog">
                    <div class="vm-share-title">${SVG_SHARE} Share File via Send Link</div>
                    <div class="vm-share-subtitle">Decrypt from vault, re-encrypt for Send, generate a shareable link</div>
                    <div class="vm-share-field">
                        <label>File</label>
                        <input type="text" value="${escapeHtml(meta.name || fileGuid)}" disabled>
                    </div>
                    <div class="vm-share-field">
                        <label>Access Token</label>
                        ${tokenField}
                    </div>
                    <div class="vm-share-progress" id="vm-share-progress"></div>
                    <div class="vm-share-result" id="vm-share-result" style="display:none"></div>
                    <div class="vm-share-actions" id="vm-share-actions">
                        <button class="pk-btn pk-btn--sm pk-btn--ghost" id="vm-share-cancel">Cancel</button>
                        <button class="pk-btn pk-btn--sm pk-btn--primary" id="vm-share-confirm">${SVG_SHARE} Share</button>
                    </div>
                </div>`;

            this.appendChild(overlay);

            // Events
            overlay.querySelector('#vm-share-cancel').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            overlay.querySelector('#vm-share-confirm').addEventListener('click', () => {
                const token = overlay.querySelector('#vm-share-token').value.trim();
                if (!token) {
                    overlay.querySelector('#vm-share-progress').textContent = 'Please enter an access token';
                    overlay.querySelector('#vm-share-progress').classList.add('vm-share-error');
                    return;
                }
                this._shareFile(fileGuid, token, overlay);
            });
        }

        async _shareFile(fileGuid, tokenName, overlay) {
            const meta     = this._index[fileGuid] || {};
            const progress = overlay.querySelector('#vm-share-progress');
            const actions  = overlay.querySelector('#vm-share-actions');
            const result   = overlay.querySelector('#vm-share-result');
            const filename = meta.name || fileGuid;
            const mime     = meta.mime || 'application/octet-stream';

            const setProgress = (text) => {
                progress.textContent = text;
                progress.classList.remove('vm-share-error');
            };
            const setError = (text) => {
                progress.textContent = text;
                progress.classList.add('vm-share-error');
                actions.querySelector('#vm-share-confirm').disabled = false;
            };

            // Disable share button during processing
            actions.querySelector('#vm-share-confirm').disabled = true;

            try {
                // Step 1: Decrypt from vault
                setProgress('Decrypting from vault...');
                const vaultResult = await adminAPI.vaultGetFile(this._vaultCacheKey, fileGuid);
                if (!vaultResult || !vaultResult.data) throw new Error('File data not found in vault');

                const packed    = b64ToArrayBuf(vaultResult.data);
                const decrypted = await decryptBlob(this._selectedKey.privateKey, packed);

                // Step 2: Package with SGMETA envelope (preserves filename for recipient)
                setProgress('Packaging with filename metadata...');
                const sgmeta = packageSgmeta(decrypted, filename);

                // Step 3: Re-encrypt with new Send-style AES key
                setProgress('Re-encrypting for Send...');
                const { keyStr, encrypted } = await sendEncrypt(sgmeta.buffer);

                // Step 4: Create transfer
                setProgress('Creating transfer...');
                const createResult = await transferCreate(tokenName, meta.size || decrypted.byteLength, mime);
                const transferId = createResult.transfer_id;

                // Step 5: Upload encrypted blob (raw binary)
                setProgress('Uploading encrypted file...');
                await transferUpload(tokenName, transferId, encrypted);

                // Step 6: Complete transfer
                setProgress('Completing transfer...');
                await transferComplete(tokenName, transferId);

                // Step 7: Build share URL (use user lambda origin for download link)
                const userBase = getUserLambdaUrl() || window.location.origin;
                const shareUrl = `${userBase}/send/v0/v0.1/v0.1.6/download.html#${transferId}/${keyStr}`;

                // Show result
                setProgress('');
                actions.style.display = 'none';
                result.style.display = 'block';
                result.innerHTML = `
                    <div style="font-size: 0.75rem; color: var(--admin-success, #34d399); font-weight: 600; margin-bottom: 0.5rem;">File shared successfully</div>
                    <div class="vm-share-field">
                        <label>Share URL (key included)</label>
                        <div class="vm-share-url-box">
                            <input type="text" class="vm-share-url-input" id="vm-share-url" value="${escapeHtml(shareUrl)}" readonly>
                            <button class="pk-btn pk-btn--xs pk-btn--primary" id="vm-share-copy">${SVG_COPY} Copy</button>
                        </div>
                        <div class="vm-share-copied" id="vm-share-copied"></div>
                    </div>
                    <div class="vm-share-field">
                        <label>Link only (key separate)</label>
                        <div class="vm-share-url-box">
                            <input type="text" class="vm-share-url-input" id="vm-share-url-only" value="${escapeHtml(`${userBase}/send/v0/v0.1/v0.1.6/download.html#${transferId}`)}" readonly>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-share-copy-link">${SVG_COPY}</button>
                        </div>
                    </div>
                    <div class="vm-share-field">
                        <label>Decrypt key (share separately)</label>
                        <div class="vm-share-url-box">
                            <input type="text" class="vm-share-url-input" id="vm-share-key-only" value="${escapeHtml(keyStr)}" readonly>
                            <button class="pk-btn pk-btn--xs pk-btn--ghost" id="vm-share-copy-key">${SVG_COPY}</button>
                        </div>
                    </div>
                    <div class="vm-share-actions">
                        <button class="pk-btn pk-btn--sm pk-btn--ghost" id="vm-share-done">Done</button>
                    </div>`;

                // Copy handlers
                const copyTo = (inputId) => {
                    const input = result.querySelector('#' + inputId);
                    if (input) {
                        navigator.clipboard.writeText(input.value).then(() => {
                            const copied = result.querySelector('#vm-share-copied');
                            if (copied) { copied.textContent = 'Copied to clipboard'; setTimeout(() => { copied.textContent = ''; }, 2000); }
                        });
                    }
                };
                result.querySelector('#vm-share-copy').addEventListener('click', () => copyTo('vm-share-url'));
                result.querySelector('#vm-share-copy-link').addEventListener('click', () => copyTo('vm-share-url-only'));
                result.querySelector('#vm-share-copy-key').addEventListener('click', () => copyTo('vm-share-key-only'));
                result.querySelector('#vm-share-done').addEventListener('click', () => overlay.remove());

                this._msg('success', `"${filename}" shared via Send link`);
            } catch (err) {
                setError('Share failed: ' + err.message);
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
