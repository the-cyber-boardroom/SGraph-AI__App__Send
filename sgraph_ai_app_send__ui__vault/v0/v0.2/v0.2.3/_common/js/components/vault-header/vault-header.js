/* =================================================================================
   SGraph Vault -- Header Bar Component
   v0.2.3 -- brand, vault name, sync status pill, open-app, overflow menu

   Shadow DOM component. Public API (setters) and emitted events are the contract
   with vault-shell — unchanged from v0.2.0 so the shell needs no rewiring.

   Presentation redesign:
     - The 4 separate sync buttons (Check/Push/Pull/Refresh) collapse into ONE
       status pill whose colour/label reflects sync state. Clicking it opens a
       dropdown with the explicit actions plus a "last checked" line.
     - Read-only state folds into the pill: the dropdown carries a *validated*
       access-key entry (check-token) instead of the old silent unlock badge.
     - Rarely-used controls (Debug, raw, Return to Vaults, version) move into an
       overflow (⋯) menu. Upload now lives only in the Files action bar.

   Emits (composed: true) for the shell to handle:
     'vault-header-check'   'vault-header-push'   'vault-header-pull'
     'vault-header-refresh' 'vault-header-lock'   'vault-header-debug'
     'vault-header-raw'     'vault-header-rename'  { name }
     'vault-settings-access-key' { key }   -- emitted only after validation
   ================================================================================= */

(function() {
    'use strict';

    function _endpoint() {
        return (window.SG_ENDPOINT
            || (function() { try { return sessionStorage.getItem('sg-vault-endpoint'); } catch (_) { return null; } })()
            || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
    }

    class VaultHeader extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            // Sync state (fed by the setter API, read by _renderPill)
            this._ahead = 0; this._behind = 0; this._diverged = false;
            this._pushBusy = false; this._pullBusy = false; this._checkBusy = false;
            this._refreshAvailable = false;
            this._isReadOnly = false; this._isROMode = false;
            this._showLock = false;
            this._lastChecked = 0;
            this._onDocClick = (e) => { if (!this.contains(e.target)) this._closeMenus(); };
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${VaultHeader.styles}</style>
                <header class="vh-header">
                    <div class="vh-title">
                        <span class="vh-brand">SG<span class="vh-slash">/</span>Vault</span>
                        <span class="vh-dot">&middot;</span>
                        <span class="vh-vault-name" title="Click to rename"></span>
                    </div>
                    <div class="vh-right">
                        <button class="vh-lock-btn" type="button" style="display:none" title="Return to vault list">&#8646; Vaults</button>
                        <div class="vh-status">
                            <button class="vh-pill" type="button" aria-haspopup="true" aria-expanded="false"></button>
                            <div class="vh-menu vh-sync-menu" style="display:none"></div>
                        </div>
                        <button class="vh-open-app-btn" style="display:none" title="Open app">&#9654; Open App</button>
                        <div class="vh-overflow">
                            <button class="vh-overflow-btn" type="button" title="More" aria-haspopup="true" aria-expanded="false">&#8943;</button>
                            <div class="vh-menu vh-overflow-menu" style="display:none">
                                <button class="vh-mi vh-mi--debug" type="button">&#128295; Debug</button>
                                <a class="vh-mi vh-mi--raw" href="#">&#128196; Raw vault data</a>
                                <div class="vh-mi-sep"></div>
                                <div class="vh-version">v0.2.3</div>
                            </div>
                        </div>
                    </div>
                    <div class="vh-loading-bar" style="display:none"><div class="vh-loading-inner"></div></div>
                </header>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                if (e.target.closest('.vh-pill'))         return this._toggleMenu('.vh-sync-menu');
                if (e.target.closest('.vh-overflow-btn')) return this._toggleMenu('.vh-overflow-menu');

                if (e.target.closest('.vh-act-check'))    { this._closeMenus(); this._emit('vault-header-check'); }
                if (e.target.closest('.vh-act-push'))     { this._closeMenus(); this._emit('vault-header-push'); }
                if (e.target.closest('.vh-act-pull'))     { this._closeMenus(); this._emit('vault-header-pull'); }
                if (e.target.closest('.vh-act-refresh'))  { this._closeMenus(); this._emit('vault-header-refresh'); }
                if (e.target.closest('.vh-unlock-apply')) this._applyUnlock();

                if (e.target.closest('.vh-lock-btn'))  this._emit('vault-header-lock');
                if (e.target.closest('.vh-mi--debug')) { this._closeMenus(); this._emit('vault-header-debug'); }
                if (e.target.closest('.vh-mi--raw'))   { e.preventDefault(); this._closeMenus(); this._emit('vault-header-raw'); }

                if (e.target.closest('.vh-open-app-btn')) this._openApp();
                if (e.target.closest('.vh-vault-name') && !e.target.closest('input')) this._startNameEdit();
            });

            this.shadowRoot.addEventListener('keydown', (e) => {
                if (!e.target.closest('.vh-unlock-input')) return;
                if (e.key === 'Enter')  this._applyUnlock();
                if (e.key === 'Escape') this._closeMenus();
            });

            document.addEventListener('click', this._onDocClick, true);

            this._renderPill();
            this._fetchAppVersion();
        }

        disconnectedCallback() {
            document.removeEventListener('click', this._onDocClick, true);
        }

        // --- Public API (contract with vault-shell — names/signatures unchanged) ---

        setVaultName(name) {
            const el = this.shadowRoot.querySelector('.vh-vault-name');
            if (el) { el.textContent = name || ''; this._vaultName = name || ''; }
        }

        setReadOnly(isReadOnly) {
            this._isReadOnly = isReadOnly;
            this._renderPill();
        }

        // True RO mode: vault opened via ro-token. Distinct, non-writable state.
        setROMode(isRO) {
            this._isROMode = isRO;
            this._renderPill();
        }

        setAheadCount(n)        { this._ahead  = n > 0 ? n : 0; this._renderPill(); }
        setBehindCount(n)       { this._behind = n > 0 ? n : 0; this._renderPill(); }
        setDiverged(diverged)   { this._diverged = !!diverged;  this._renderPill(); }
        setPushBusy(busy)       { this._pushBusy = !!busy;      this._renderPill(); }
        setPullBusy(busy)       { this._pullBusy = !!busy;      this._renderPill(); }

        setCheckBusy(busy) {
            // Record completion time so the synced menu can show "checked Ns ago"
            if (this._checkBusy && !busy) this._lastChecked = Date.now();
            this._checkBusy = !!busy;
            this._renderPill();
        }

        setRefreshAvailable(show) {
            this._refreshAvailable = !!show;
            this._renderPill();
        }

        showLockButton(show) {
            this._showLock = !!show;
            const btn = this.shadowRoot.querySelector('.vh-lock-btn');
            if (btn) btn.style.display = show ? '' : 'none';
        }

        showLoading() {
            const bar = this.shadowRoot.querySelector('.vh-loading-bar');
            if (bar) bar.style.display = '';
        }

        hideLoading() {
            const bar = this.shadowRoot.querySelector('.vh-loading-bar');
            if (bar) bar.style.display = 'none';
        }

        // Called by the shell's _applyAppJson() when app.json is present.
        setAppJson(config, vaultKey) {
            this._appJsonConfig = config;
            this._appVaultKey   = vaultKey;
            const btn = this.shadowRoot.querySelector('.vh-open-app-btn');
            if (!btn) return;
            const title = (config && config.title) ? config.title : 'App';
            btn.textContent  = '▶ Open ' + title;
            btn.style.display = '';
        }

        // --- Status pill rendering ---

        _pillState() {
            if (this._isROMode)   return { cls: 'ro',       label: '👁 Read-only' };
            if (this._pushBusy)   return { cls: 'busy',     label: '↑ Pushing…' };
            if (this._pullBusy)   return { cls: 'busy',     label: '↓ Pulling…' };
            if (this._checkBusy)  return { cls: 'busy',     label: '⟳ Checking…' };
            if (this._isReadOnly) return { cls: 'locked',   label: '🔒 Read-only' };
            if (this._diverged)   return { cls: 'diverged', label: '⇅ Diverged' };
            if (this._ahead > 0)  return { cls: 'ahead',    label: '↑' + this._ahead + ' to push' };
            if (this._behind > 0) return { cls: 'behind',   label: '↓' + this._behind + ' to pull' };
            if (this._refreshAvailable) return { cls: 'refresh', label: '↻ Update available' };
            return { cls: 'synced', label: '● Synced' };
        }

        _renderPill() {
            const pill = this.shadowRoot.querySelector('.vh-pill');
            if (!pill) return;
            const st = this._pillState();
            // ROMode (read-only share token) is purely informational — no actions.
            const interactive = (st.cls !== 'busy' && st.cls !== 'ro');
            pill.textContent = st.label + (interactive ? '  ▾' : '');
            pill.className   = 'vh-pill vh-pill--' + st.cls;
            pill.disabled    = !interactive;
            // If the sync menu is open, keep its contents fresh
            const menu = this.shadowRoot.querySelector('.vh-sync-menu');
            if (menu && menu.style.display !== 'none') this._renderSyncMenu();
        }

        _renderSyncMenu() {
            const menu = this.shadowRoot.querySelector('.vh-sync-menu');
            if (!menu) return;
            const rows = [];

            if (this._isReadOnly && !this._isROMode) {
                rows.push(`
                    <div class="vh-menu-head">Read-only — enter access key to enable writing</div>
                    <div class="vh-unlock-row">
                        <input class="vh-unlock-input" type="password" placeholder="Access key…" autocomplete="off">
                        <button class="vh-unlock-apply" type="button">Unlock</button>
                    </div>
                    <div class="vh-unlock-status"></div>
                    <div class="vh-mi-sep"></div>`);
            }

            if (this._diverged) {
                rows.push('<div class="vh-menu-head vh-menu-head--warn">Diverged — push force-overwrites the published branch. Use SGit → Repair to merge safely.</div>');
            }

            if (!this._isROMode) {
                if (this._diverged || this._ahead > 0) {
                    rows.push(`<button class="vh-act vh-act-push" type="button">↑ Push${this._ahead > 0 ? ' (' + this._ahead + ')' : ''}</button>`);
                }
                if (this._diverged || this._behind > 0) {
                    rows.push(`<button class="vh-act vh-act-pull" type="button">↓ Pull${this._behind > 0 ? ' (' + this._behind + ')' : ''}</button>`);
                }
            }
            rows.push('<button class="vh-act vh-act-check" type="button">⟳ Check for updates</button>');
            rows.push('<button class="vh-act vh-act-refresh" type="button">↻ Refresh from server</button>');

            if (this._lastChecked) {
                rows.push('<div class="vh-menu-foot">Last checked ' + this._relTime(this._lastChecked) + '</div>');
            }

            menu.innerHTML = rows.join('');
            const input = menu.querySelector('.vh-unlock-input');
            if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
        }

        _relTime(ts) {
            const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
            if (s < 5)   return 'just now';
            if (s < 60)  return s + 's ago';
            const m = Math.round(s / 60);
            if (m < 60)  return m + 'm ago';
            return Math.round(m / 60) + 'h ago';
        }

        // --- Menus ---

        _toggleMenu(sel) {
            const menu = this.shadowRoot.querySelector(sel);
            if (!menu) return;
            const open = menu.style.display !== 'none';
            this._closeMenus();
            if (!open) {
                if (sel === '.vh-sync-menu') this._renderSyncMenu();
                menu.style.display = '';
                const trigger = sel === '.vh-sync-menu' ? '.vh-pill' : '.vh-overflow-btn';
                this.shadowRoot.querySelector(trigger)?.setAttribute('aria-expanded', 'true');
            }
        }

        _closeMenus() {
            this.shadowRoot.querySelectorAll('.vh-menu').forEach((m) => { m.style.display = 'none'; });
            this.shadowRoot.querySelector('.vh-pill')?.setAttribute('aria-expanded', 'false');
            this.shadowRoot.querySelector('.vh-overflow-btn')?.setAttribute('aria-expanded', 'false');
        }

        // --- Validated access-key unlock ---

        async _applyUnlock() {
            const input  = this.shadowRoot.querySelector('.vh-unlock-input');
            const btn    = this.shadowRoot.querySelector('.vh-unlock-apply');
            const status = this.shadowRoot.querySelector('.vh-unlock-status');
            const key    = input?.value?.trim();
            const setStatus = (msg, type) => {
                if (!status) return;
                status.textContent = msg;
                status.className = 'vh-unlock-status' + (type ? ' vh-unlock-status--' + type : '');
            };
            if (!key) { setStatus('Enter a key first', 'warn'); return; }

            const orig = btn ? btn.textContent : '';
            if (btn) { btn.disabled = true; btn.textContent = '…'; }
            setStatus('Checking…', 'info');
            try {
                const resp = await fetch(_endpoint() + '/api/transfers/check-token/' + encodeURIComponent(key));
                if (!resp.ok) { setStatus('Server error — could not validate', 'error'); return; }
                const data = await resp.json();
                if (!data.valid) {
                    setStatus('✗ Invalid — ' + (data.reason || data.status || 'not found'), 'error');
                    return;
                }
                if (data.remaining === 0) {
                    setStatus('⚠ Valid but exhausted (' + data.status + ')', 'warn');
                    return;
                }
                setStatus('✓ Valid — unlocking…', 'ok');
                this._emit('vault-settings-access-key', { key });
                this._closeMenus();
            } catch (err) {
                setStatus('✗ Check failed: ' + err.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = orig; }
            }
        }

        // --- Inline vault-name editing ---

        _startNameEdit() {
            const span = this.shadowRoot.querySelector('.vh-vault-name');
            if (!span || span.querySelector('input')) return;
            const current = span.textContent;
            span.textContent = '';
            const input = document.createElement('input');
            input.className = 'vh-vault-name-input';
            input.value = current;
            input.size = Math.max(current.length + 4, 20);
            input.addEventListener('input', () => { input.size = Math.max(input.value.length + 4, 20); });
            span.appendChild(input);
            input.focus();
            input.select();

            const commit = () => {
                const val = input.value.trim();
                span.textContent = val || current;
                this._vaultName = span.textContent;
                if (val && val !== current) this._emit('vault-header-rename', { name: val });
            };
            const cancel = () => { span.textContent = current; };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
            input.addEventListener('blur', commit);
        }

        // --- Private ---

        _emit(name, detail) {
            this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || null }));
        }

        _fetchAppVersion() {
            // window.SGRAPH_BUILD is set by /_common/js/build-info.js, generated on every
            // CI deploy by scripts/inject_build_version.py (and locally by build-vault-static.sh)
            // from sgraph_ai_app_send/version. Showing this in the header is the reliable way
            // to confirm you're looking at the latest version of the files. Falls back to the
            // hardcoded UI version if build-info.js wasn't loaded (which would itself be a
            // deploy bug — the script tag is in index.html).
            const el = this.shadowRoot.querySelector('.vh-version');
            if (!el) return;
            const build      = window.SGRAPH_BUILD || {};
            const appVersion = build.appVersion || '';
            const uiVersion  = build.uiVersion  || 'v0.2.3';
            el.textContent = appVersion
                ? `${appVersion}  .  UI ${uiVersion} (IFD)`
                : `UI ${uiVersion} (IFD)`;
        }

        _openApp() {
            if (!this._appVaultKey) return;
            // Route through the root hash inbox (/#key): it saves the key to localStorage and
            // redirects to /en-gb/app, which auto-mounts the vault's default app. Do NOT use
            // /en-gb/app#key — that hash is now read as a FILE PATH, not a vault key, so the key
            // would be misread as a deep-link file (see vault-loader-routing.js).
            const base = window.location.pathname.split('/en-gb/')[0];
            window.location.assign(base + '/#' + this._appVaultKey);
        }
    }

    VaultHeader.styles = `
        :host { display: block; }
        .vh-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 var(--space-4); background: var(--bg-surface);
            border-bottom: 1px solid var(--color-border); height: 48px;
            position: relative; z-index: 20;
        }
        .vh-title { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
        .vh-brand { font-weight: 700; font-size: var(--text-h3); color: var(--color-text); white-space: nowrap; }
        .vh-slash { color: var(--color-primary); }
        .vh-dot { color: var(--color-text-secondary); }
        .vh-vault-name {
            font-size: var(--text-h3); font-weight: 700; color: var(--color-text);
            font-family: var(--font-mono); cursor: pointer; border-radius: 3px;
            padding: 1px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw;
        }
        .vh-vault-name:hover { background: var(--bg-secondary); }
        .vh-vault-name:hover::after { content: ' \\270E'; opacity: 0.5; font-size: 0.8em; }
        .vh-vault-name-input {
            font-size: var(--text-h3); font-weight: 700; color: var(--color-text); font-family: var(--font-mono);
            background: var(--bg-secondary); border: 1px solid var(--color-primary);
            border-radius: 3px; padding: 1px 4px; outline: none; min-width: 200px; width: auto;
        }
        .vh-right { display: flex; align-items: center; gap: var(--space-2); }

        /* --- Return-to-vaults nav button (index.html may relabel/restyle it) --- */
        .vh-lock-btn {
            font-size: var(--text-small); padding: 0.3rem 0.7rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); white-space: nowrap;
        }
        .vh-lock-btn:hover { background: var(--bg-secondary); color: var(--color-text); }

        /* --- Status pill --- */
        .vh-status { position: relative; }
        .vh-pill {
            font-size: var(--text-small); font-family: var(--font-family); font-weight: 600;
            padding: 0.3rem 0.7rem; border-radius: 9999px; cursor: pointer; white-space: nowrap;
            border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary);
            display: inline-flex; align-items: center; gap: 6px; line-height: 1;
        }
        .vh-pill:disabled { cursor: default; }
        .vh-pill--synced   { border-color: rgba(78,205,196,0.5);  color: #4ECDC4; background: rgba(78,205,196,0.10); }
        .vh-pill--ahead    { border-color: rgba(78,205,196,0.6);  color: #4ECDC4; background: rgba(78,205,196,0.14); }
        .vh-pill--behind   { border-color: rgba(69,183,209,0.6);  color: #45b7d1; background: rgba(69,183,209,0.14); }
        .vh-pill--refresh  { border-color: rgba(69,183,209,0.6);  color: #45b7d1; background: rgba(69,183,209,0.14); }
        .vh-pill--diverged { border-color: rgba(233,196,69,0.7);  color: #E9C445; background: rgba(233,196,69,0.16); }
        .vh-pill--locked   { border-color: rgba(233,196,69,0.6);  color: #E9C445; background: rgba(233,196,69,0.14); }
        .vh-pill--ro       { border-color: rgba(100,160,220,0.5); color: #64a0dc; background: rgba(100,160,220,0.12); cursor: default; }
        .vh-pill--busy     { border-color: var(--color-border);   color: var(--color-text-secondary); }
        .vh-pill:not(:disabled):hover { filter: brightness(1.15); }

        /* --- Dropdown menus --- */
        .vh-menu {
            position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
            min-width: 230px; padding: var(--space-2);
            background: var(--bg-surface); border: 1px solid var(--color-border);
            border-radius: var(--radius-md, 8px); box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            display: flex; flex-direction: column; gap: 2px;
        }
        .vh-menu-head {
            font-size: var(--text-small); color: var(--color-text-secondary);
            padding: 4px 6px 6px; line-height: 1.35;
        }
        .vh-menu-head--warn { color: #E9C445; }
        .vh-menu-foot { font-size: 0.7rem; color: var(--color-text-secondary); padding: 6px 6px 2px; }
        .vh-mi-sep { height: 1px; background: var(--color-border); margin: 4px 0; }
        .vh-act, .vh-mi {
            display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
            font-size: var(--text-small); font-family: var(--font-family);
            padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); cursor: pointer;
            border: 1px solid transparent; background: transparent; color: var(--color-text);
            text-decoration: none; box-sizing: border-box;
        }
        .vh-act:hover, .vh-mi:hover { background: var(--bg-secondary); }
        .vh-act-push:hover    { color: #4ECDC4; }
        .vh-act-pull:hover    { color: #45b7d1; }

        /* --- Unlock row inside the sync menu --- */
        .vh-unlock-row { display: flex; gap: 4px; padding: 2px 0; }
        .vh-unlock-input {
            flex: 1; font-size: var(--text-small); padding: 0.3rem 0.5rem;
            background: var(--bg-primary, #0a0a18); border: 1px solid var(--color-primary, #4ECDC4);
            border-radius: var(--radius-sm, 4px); color: var(--color-text, #e2e8f0);
            font-family: var(--font-mono); outline: none; min-width: 0;
        }
        .vh-unlock-apply {
            font-size: var(--text-small); padding: 0.3rem 0.7rem; border-radius: var(--radius-sm, 4px);
            border: 1px solid var(--color-primary, #4ECDC4); background: transparent;
            color: var(--color-primary, #4ECDC4); cursor: pointer; font-family: var(--font-family); font-weight: 600;
            white-space: nowrap;
        }
        .vh-unlock-apply:hover:not(:disabled) { background: rgba(78,205,196,0.12); }
        .vh-unlock-status { font-size: var(--text-small); padding: 2px 6px 0; min-height: 1em; }
        .vh-unlock-status--info  { color: var(--color-text-secondary); }
        .vh-unlock-status--ok    { color: #4ECDC4; }
        .vh-unlock-status--warn  { color: #E9C445; }
        .vh-unlock-status--error { color: #ff6b6b; }

        /* --- Open App (primary) --- */
        .vh-open-app-btn {
            font-size: var(--text-small); padding: 0.3rem 0.75rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-primary); background: var(--color-primary);
            color: var(--bg-primary, #0a0a18); cursor: pointer; font-family: var(--font-family);
            font-weight: 700; white-space: nowrap;
        }
        .vh-open-app-btn:hover { background: var(--color-primary-hover, #3dbdb5); border-color: var(--color-primary-hover, #3dbdb5); }

        /* --- Overflow --- */
        .vh-overflow { position: relative; }
        .vh-overflow-btn {
            font-size: 1.1rem; line-height: 1; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm);
            border: 1px solid var(--color-border); background: transparent;
            color: var(--color-text-secondary); cursor: pointer;
        }
        .vh-overflow-btn:hover { background: var(--bg-secondary); color: var(--color-text); }
        .vh-version { font-size: 0.7rem; color: var(--color-text-secondary); font-family: var(--font-mono); padding: 4px 6px 2px; }

        /* --- Loading bar --- */
        .vh-loading-bar { position: absolute; bottom: -2px; left: 0; right: 0; height: 2px; overflow: hidden; z-index: 30; }
        .vh-loading-inner { width: 30%; height: 100%; background: var(--color-primary); animation: vh-slide 1.2s ease-in-out infinite; }
        @keyframes vh-slide { 0% { transform: translateX(-100%); } 50% { transform: translateX(230%); } 100% { transform: translateX(-100%); } }
    `;

    customElements.define('vault-header', VaultHeader);
})();
