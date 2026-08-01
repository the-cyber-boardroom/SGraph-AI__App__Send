/* =================================================================================
   SGraph App — HUD Bar Component  (app-hud)
   v0.2.3 — Minimal status bar for /en-gb/app page.

   Sits OUTSIDE sg-layout as a fixed 48px row. Receives vault/app info via
   setInfo() called from the page script when app-shell:ready fires.

   Also handles sg.ui.message() notifications dispatched from the app iframe.
   ================================================================================= */

(function () {
    'use strict';

    class AppHud extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._messages  = {};     // handle → { el, timer }
            this._debugOpen = false;
            // Nav state mirrors app-shell's history (set via setNavState on every
            // 'app-nav:change' event). The HUD never owns the history, only displays it.
            this._navState  = { path: '', canBack: false, canForward: false, historyLen: 0 };
            this._recent    = [];   // most-recent-first list of paths for the ⋯ menu
            // HUD config from app.json (resolved with defaults — see _resolvedHudCfg).
            this._hudCfg    = null;
            this._menuOpen  = false;
            // Live file-activity meter (power-user value): session-cumulative read/write
            // counts + a recent-ops list, fed by the `app-debug:bridge-call` event the
            // kernel already emits for every vfs/fs op. Pure consumer — no kernel change.
            this._actR = 0; this._actW = 0; this._actErr = 0; this._actRecent = [];
        }

        connectedCallback() {
            this.shadowRoot.innerHTML = `
                <style>${AppHud.styles}</style>
                <div class="hud-wrap">
                    <div class="hud">
                        <div class="hud-left">
                            <span class="hud-brand" data-hud-el="brand">SG<span class="hud-slash">/</span>App</span>
                            <span class="hud-vault-badge" data-hud-el="vaultName" style="display:none"></span>
                            <span class="hud-app-title" data-hud-el="appTitle"></span>
                        </div>
                        <div class="hud-center">
                            <span class="hud-msg" style="display:none"></span>
                        </div>
                        <div class="hud-right">
                            <a class="hud-vault-link" data-hud-el="openVault" href="#" style="display:none" title="Open the vault file browser">&#8612; Open Vault</a>
                            <div class="hud-privs-wrap" style="display:none">
                                <button class="hud-privs-chip" type="button" aria-haspopup="true" aria-expanded="false" title="What this app is allowed to do"></button>
                                <div class="hud-privs-pop" style="display:none"></div>
                            </div>
                            <div class="hud-activity-wrap" data-hud-el="activity">
                                <button class="hud-activity-chip" type="button" aria-haspopup="true" aria-expanded="false" title="Files this app has read / written this session">⇅ <span class="hud-act-r">R0</span> <span class="hud-act-w">W0</span></button>
                                <div class="hud-activity-pop" style="display:none"></div>
                            </div>
                            <span class="hud-ro-badge" style="display:none">👁 Read-only</span>
                            <div class="hud-more-wrap" data-hud-el="more">
                                <button class="hud-more-btn" type="button" aria-haspopup="true" aria-expanded="false" title="More actions">&#8943;</button>
                                <div class="hud-more-panel" style="display:none">
                                    <button class="hud-mi hud-copy-btn"  data-hud-el="copyLink" style="display:none">⎘ Copy app link</button>
                                    <button class="hud-mi hud-print-btn" data-hud-el="print"    style="display:none">&#128424; Print…</button>
                                    <button class="hud-mi hud-debug-btn" data-hud-el="debug">🔍 Debug panel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="navrow" data-hud-el="navBar" style="display:none">
                        <button class="navrow-back"    data-hud-el="navArrows"  title="Back"    disabled>‹</button>
                        <button class="navrow-forward" data-hud-el="navArrows"  title="Forward" disabled>›</button>
                        <button class="navrow-reload"  data-hud-el="navRefresh" title="Reload this page">↻</button>
                        <button class="navrow-home"    data-hud-el="navHome"    title="Home (app entry page)" disabled>⌂</button>
                        <span class="navrow-divider" data-hud-el="navArrows"></span>
                        <div class="navrow-addr" data-hud-el="navPath" title="Click to edit, Enter to navigate, Esc to cancel">
                            <span class="navrow-addr-icon">📄</span>
                            <span class="navrow-addr-text"></span>
                            <input class="navrow-addr-input" type="text" autocomplete="off" spellcheck="false" style="display:none" />
                        </div>
                        <button class="navrow-copy" data-hud-el="navPath" title="Copy path">⎘</button>
                        <div class="navrow-menu-wrap">
                            <button class="navrow-menu" title="Recent pages">⋯</button>
                            <div class="navrow-menu-panel" style="display:none"></div>
                        </div>
                    </div>
                </div>
                <!-- Consent bar — a SIBLING of .hud-wrap so it renders even when the chrome row
                     is hidden (modes 'hidden'/'none'). Full-width so the message never truncates;
                     co-locates the request, the app's standing grants, and Allow/Deny. -->
                <div class="hud-consent-bar" style="display:none"
                     role="alertdialog" aria-label="Vault permission request" aria-live="assertive"
                     data-testid="hud-consent">
                    <span class="hud-consent-icon" aria-hidden="true">🔐</span>
                    <div class="hud-consent-body">
                        <div class="hud-consent-text" data-testid="hud-consent-text"></div>
                        <div class="hud-consent-grants" data-testid="hud-consent-grants" style="display:none"></div>
                    </div>
                    <div class="hud-consent-actions">
                        <button class="hud-consent-deny"  data-testid="hud-consent-deny"  aria-label="Deny">Deny</button>
                        <button class="hud-consent-allow" data-testid="hud-consent-allow" aria-label="Approve">Allow</button>
                    </div>
                </div>
                <!-- External-link confirm (Option D): an app without the externalLinks grant
                     asked to open a URL. Shown as a full-width sibling so it works in every hud
                     mode; the Open button click is the user gesture that lets window.open run. -->
                <div class="hud-extlink-bar" style="display:none" role="alertdialog" aria-label="Open external link" data-testid="hud-extlink">
                    <span class="hud-extlink-icon" aria-hidden="true">↗</span>
                    <div class="hud-extlink-body">
                        <span class="hud-extlink-label">This app wants to open an external site:</span>
                        <span class="hud-extlink-url" data-testid="hud-extlink-url"></span>
                    </div>
                    <div class="hud-extlink-actions">
                        <button class="hud-extlink-dismiss" data-testid="hud-extlink-dismiss">Dismiss</button>
                        <button class="hud-extlink-open" data-testid="hud-extlink-open">Open ↗</button>
                    </div>
                </div>
                <button class="hud-escape" style="display:none" title="Exit app and return to vault">×&nbsp;Exit app</button>
            `;

            this.shadowRoot.addEventListener('click', (e) => {
                // ⋯ overflow menu + privileges popover (expand-on-click).
                if (e.target.closest('.hud-more-btn'))     { e.stopPropagation(); return this._toggleMore(); }
                if (e.target.closest('.hud-privs-chip'))   { e.stopPropagation(); return this._togglePrivsPop(); }
                if (e.target.closest('.hud-privs-reset'))  { return this._resetConsents(); }
                if (e.target.closest('.hud-activity-chip')){ e.stopPropagation(); return this._toggleActivityPop(); }
                // Menu actions — run, then collapse the menu.
                if (e.target.closest('.hud-copy-btn'))   { this._copyLink();      this._toggleMore(false); }
                if (e.target.closest('.hud-print-btn'))  { this._onPrintClick();  this._toggleMore(false); }
                if (e.target.closest('.hud-debug-btn'))  { this._toggleDebug();   this._toggleMore(false); }
                // Nav row buttons — dispatch events that app-shell listens to.
                if (e.target.closest('.navrow-back'))    this._emitNavEvent('back');
                if (e.target.closest('.navrow-forward')) this._emitNavEvent('forward');
                if (e.target.closest('.navrow-reload'))  this._emitNavEvent('reload');
                if (e.target.closest('.navrow-home'))    this._emitNavEvent('home');
                // Address-bar click: enter edit mode (the explicit copy button still copies).
                if (e.target.closest('.navrow-copy'))    this._copyCurrentPath();
                if (e.target.closest('.navrow-addr') && !e.target.closest('.navrow-addr-input')) {
                    this._enterAddrEdit();
                }
                if (e.target.closest('.navrow-menu'))  { e.stopPropagation(); this._toggleMenu(); }
                if (e.target.closest('[data-recent-path]')) {
                    var path = e.target.closest('[data-recent-path]').getAttribute('data-recent-path');
                    this._emitNavEvent('jump', { path: path });
                    this._toggleMenu(false);
                }
                if (e.target.closest('.hud-escape'))     this._emitNavEvent('exit');
            });

            // Editable URL bar: Enter commits + navigates, Escape cancels, focus loss cancels.
            this.shadowRoot.addEventListener('keydown', (e) => {
                if (!e.target || !e.target.classList || !e.target.classList.contains('navrow-addr-input')) return;
                if (e.key === 'Enter')  { e.preventDefault(); this._exitAddrEdit(true);  }
                if (e.key === 'Escape') { e.preventDefault(); this._exitAddrEdit(false); }
            });
            this.shadowRoot.addEventListener('focusout', (e) => {
                if (!e.target || !e.target.classList || !e.target.classList.contains('navrow-addr-input')) return;
                if (this._editingAddr) this._exitAddrEdit(false);
            });

            // Listen for nav-state changes from app-shell (back/forward arrows + path display).
            this._navChangeHandler = (ev) => this.setNavState(ev.detail || {});
            document.addEventListener('app-nav:change', this._navChangeHandler);

            // Live file-activity meter: the kernel already dispatches `app-debug:bridge-call`
            // for every vfs/fs op (it's what the debug pane consumes). We just tally it.
            this._bridgeCallHandler = (ev) => this._onBridgeCall(ev.detail || {});
            document.addEventListener('app-debug:bridge-call', this._bridgeCallHandler);
        }

        disconnectedCallback() {
            if (this._navChangeHandler) document.removeEventListener('app-nav:change', this._navChangeHandler);
            if (this._bridgeCallHandler) document.removeEventListener('app-debug:bridge-call', this._bridgeCallHandler);
            if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
            clearTimeout(this._actPulseTimer);
        }

        // Called by page script with vault/app metadata.
        setInfo(vaultName, appTitle, vaultKey, isRO) {
            this._vaultKey = vaultKey;
            this._vaultName = vaultName;

            const badge  = this.shadowRoot.querySelector('.hud-vault-badge');
            const title  = this.shadowRoot.querySelector('.hud-app-title');
            const link   = this.shadowRoot.querySelector('.hud-vault-link');
            const copy   = this.shadowRoot.querySelector('.hud-copy-btn');
            const roBadge = this.shadowRoot.querySelector('.hud-ro-badge');

            if (badge && vaultName) {
                badge.textContent = vaultName;
                badge.style.display = '';
            }
            if (title) {
                title.textContent = appTitle || '';
                title.style.display = appTitle ? '' : 'none';
            }
            if (link && vaultKey) {
                // Go straight to the vault file browser. Using /#key would route through
                // the root hash inbox, which redirects back to /app when the vault has an
                // app.json — an infinite loop. /en-gb/vault/ reads the key from
                // localStorage (saved by app-shell on open) and does not auto-open the app.
                var base = window.location.pathname.split('/en-gb/')[0];
                link.href  = base + '/en-gb/vault/';
                link.style.display = '';
            }
            if (copy && vaultKey) {
                copy.style.display = '';
            }
            const printBtn = this.shadowRoot.querySelector('.hud-print-btn');
            if (printBtn && vaultKey) {
                printBtn.style.display = '';
            }
            if (roBadge) {
                roBadge.style.display = isRO ? '' : 'none';
            }

            // Update page title
            if (appTitle) document.title = appTitle + ' — SG/App';
            else if (vaultName) document.title = vaultName + ' — SG/App';
        }

        // Render a compact summary of what the app is allowed to do, from the parsed
        // app.json permissions (AppPermissions.parsePermissions shape). Visibility only —
        // makes the otherwise-invisible grants legible to the user. Phase 4 makes it clickable
        // (permissions panel / revoke). No grants beyond default reads → chip hidden.
        setPrivileges(perm) {
            var wrap = this.shadowRoot.querySelector('.hud-privs-wrap');
            var chip = this.shadowRoot.querySelector('.hud-privs-chip');
            if (!wrap || !chip) return;

            // Map raw grant verbs to user-facing language + a risk tier. Destructive
            // (irreversible) grants are flagged so they can be visually separated from
            // benign ones — collapsing them all into one neutral yellow blob hid the risk.
            var fs = (perm && perm.fs) || {};
            var vault = (perm && perm.vault) || {};
            function granted(v) { return v === true || (Array.isArray(v) && v.length > 0); }
            var list = [];
            if (granted(fs.write))        list.push({ label: 'write files',    danger: false });
            if (granted(fs.move))         list.push({ label: 'move files',     danger: false });
            if (granted(fs.mkdir))        list.push({ label: 'create folders', danger: false });
            if (granted(vault.create))    list.push({ label: 'create vaults',  danger: false });
            if (granted(fs['delete']))    list.push({ label: 'delete files',   danger: true  });
            if (granted(vault.unlink))    list.push({ label: 'unlink vaults',  danger: true  });
            if (vault['delete'] === true) list.push({ label: 'delete vaults',  danger: true  });
            // Destructive grants sort last so the expanded list ends on the ones that matter.
            list.sort(function (a, b) { return (a.danger ? 1 : 0) - (b.danger ? 1 : 0); });
            this._privList = list;

            if (list.length === 0) { wrap.style.display = 'none'; return; }
            var hasDanger = list.some(function (p) { return p.danger; });
            // Compact chip: a lock + count. Click expands the full list (see _renderPrivsPop).
            chip.innerHTML = '🔒 <span class="hud-privs-count">' + list.length + '</span>';
            chip.title = 'This app is allowed to: ' + list.map(function (p) { return p.label; }).join(', ')
                       + ' — click for details';
            chip.classList.toggle('hud-privs-chip--danger', hasDanger);
            wrap.style.display = '';
            this._renderPrivsPop();
        }

        // Build the expanded privileges popover content from the parsed grant list.
        _renderPrivsPop() {
            var pop = this.shadowRoot && this.shadowRoot.querySelector('.hud-privs-pop');
            if (!pop) return;
            var rows = (this._privList || []).map(function (p) {
                return '<div class="hud-priv-row' + (p.danger ? ' hud-priv-row--danger' : '') + '">'
                     + (p.danger ? '⚠ ' : '• ') + AppHud._escapeHtml(p.label) + '</div>';
            }).join('');
            pop.innerHTML = '<div class="hud-priv-head">This app is allowed to</div>'
                          + rows
                          + '<button class="hud-privs-reset" type="button">Reset granted consents…</button>';
        }

        // Hide every popover EXCEPT the selector passed (so only one is open at a time).
        _closeOtherPops(except) {
            ['.hud-privs-pop', '.hud-more-panel', '.hud-activity-pop'].forEach((sel) => {
                if (sel === except) return;
                var el = this.shadowRoot.querySelector(sel);
                if (el) el.style.display = 'none';
            });
        }

        _togglePrivsPop(force) {
            var pop  = this.shadowRoot && this.shadowRoot.querySelector('.hud-privs-pop');
            var chip = this.shadowRoot && this.shadowRoot.querySelector('.hud-privs-chip');
            if (!pop) return;
            var open = (typeof force === 'boolean') ? force : (pop.style.display === 'none');
            if (open) this._closeOtherPops('.hud-privs-pop');
            pop.style.display = open ? '' : 'none';
            if (chip) chip.setAttribute('aria-expanded', open ? 'true' : 'false');
            this._armOutsideClose(open, () => this._togglePrivsPop(false));
        }

        _toggleMore(force) {
            var panel = this.shadowRoot && this.shadowRoot.querySelector('.hud-more-panel');
            var btn   = this.shadowRoot && this.shadowRoot.querySelector('.hud-more-btn');
            if (!panel) return;
            var open = (typeof force === 'boolean') ? force : (panel.style.display === 'none');
            if (open) this._closeOtherPops('.hud-more-panel');
            panel.style.display = open ? '' : 'none';
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            this._armOutsideClose(open, () => this._toggleMore(false));
        }

        // ── File-activity meter ─────────────────────────────────────────────────────────
        // Consumes `app-debug:bridge-call` (one per vfs/fs op). Tallies reads vs writes,
        // tracks the last 15 ops, and flashes the chip green (ok) / red (error) per event.
        _onBridgeCall(detail) {
            var method = detail.method || '';
            var kind;
            if (method === 'vfs.read' || method === 'vfs.list') kind = 'r';
            else if (method === 'vfs.write' || method === 'fs.move'
                  || method === 'fs.delete' || method === 'fs.mkdir') kind = 'w';
            else return;   // not a file op (vault.*, ui.*, state.* …) — the meter is files-only

            if (kind === 'r') this._actR++; else this._actW++;
            var okFlag = detail.ok !== false;     // ok defaults true unless explicitly false
            if (!okFlag) this._actErr++;

            this._actRecent.unshift({
                method: method, kind: kind,
                path: detail.path || detail.from || detail.to || '',
                bytes: (typeof detail.bytes === 'number') ? detail.bytes : null,
                count: (typeof detail.count === 'number') ? detail.count : null,
                ms: (typeof detail.ms === 'number') ? detail.ms : null,
                ok: okFlag, err: detail.err || ''
            });
            if (this._actRecent.length > 15) this._actRecent.length = 15;
            this._renderActivity(okFlag);
        }

        _renderActivity(lastOk) {
            var sr = this.shadowRoot; if (!sr) return;
            var chip = sr.querySelector('.hud-activity-chip');
            var r = sr.querySelector('.hud-act-r');
            var w = sr.querySelector('.hud-act-w');
            if (!chip) return;
            if (r) r.textContent = 'R' + this._actR;
            if (w) w.textContent = 'W' + this._actW;
            // Error tally only appears once something has failed.
            var e = chip.querySelector('.hud-act-e');
            if (this._actErr > 0) {
                if (!e) { e = document.createElement('span'); e.className = 'hud-act-e'; chip.appendChild(document.createTextNode(' ')); chip.appendChild(e); }
                e.textContent = '!' + this._actErr;
            } else if (e) { e.remove(); }

            var last = this._actRecent[0];
            chip.title = last
                ? (last.method + ' ' + (last.path || '')
                   + (last.bytes != null ? ' · ' + AppHud._fmtBytes(last.bytes) : '')
                   + (last.count != null ? ' · ' + last.count + ' items' : '')
                   + (last.ms != null ? ' · ' + last.ms + ' ms' : '')
                   + (last.ok ? '' : ' · FAILED'))
                : 'Files this app has read / written this session';

            // Flash: add the pulse class, then remove after a beat (CSS transitions it back).
            chip.classList.remove('pulse-ok', 'pulse-err');
            // force reflow so a back-to-back event re-triggers the transition
            void chip.offsetWidth;
            chip.classList.add(lastOk ? 'pulse-ok' : 'pulse-err');
            clearTimeout(this._actPulseTimer);
            this._actPulseTimer = setTimeout(function () {
                chip.classList.remove('pulse-ok', 'pulse-err');
            }, 500);

            if (this._actPopOpen) this._renderActivityPop();
        }

        _renderActivityPop() {
            var pop = this.shadowRoot && this.shadowRoot.querySelector('.hud-activity-pop');
            if (!pop) return;
            var rows = (this._actRecent || []).map(function (o) {
                var meta = [];
                if (o.bytes != null) meta.push(AppHud._fmtBytes(o.bytes));
                if (o.count != null) meta.push(o.count + ' items');
                if (o.ms != null)    meta.push(o.ms + ' ms');
                return '<div class="hud-act-row' + (o.ok ? '' : ' hud-act-row--err') + '">'
                     + '<span class="hud-act-tag hud-act-tag--' + o.kind + '">' + (o.kind === 'r' ? 'R' : 'W') + '</span>'
                     + '<span class="hud-act-path">' + AppHud._escapeHtml(o.path || o.method) + '</span>'
                     + '<span class="hud-act-meta">' + AppHud._escapeHtml(meta.join(' · ')) + '</span>'
                     + '</div>';
            }).join('');
            pop.innerHTML = '<div class="hud-priv-head">File activity · this session</div>'
                + '<div class="hud-act-summary">' + this._actR + ' read · ' + this._actW + ' written'
                + (this._actErr ? ' · <span class="hud-act-e">' + this._actErr + ' failed</span>' : '') + '</div>'
                + (rows || '<div class="hud-act-empty">No file activity yet</div>');
        }

        _toggleActivityPop(force) {
            var pop  = this.shadowRoot && this.shadowRoot.querySelector('.hud-activity-pop');
            var chip = this.shadowRoot && this.shadowRoot.querySelector('.hud-activity-chip');
            if (!pop) return;
            var open = (typeof force === 'boolean') ? force : (pop.style.display === 'none');
            if (open) { this._closeOtherPops('.hud-activity-pop'); this._renderActivityPop(); }
            pop.style.display = open ? '' : 'none';
            this._actPopOpen = open;
            if (chip) chip.setAttribute('aria-expanded', open ? 'true' : 'false');
            this._armOutsideClose(open, () => this._toggleActivityPop(false));
        }

        static _fmtBytes(n) {
            if (n == null) return '';
            if (n < 1024) return n + ' B';
            if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
            return (n / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // Shared one-shot outside-click closer for the ⋯ menu / privs popover. Armed on the
        // next tick so the opening click (which bubbles up composed from the shadow root)
        // doesn't immediately close it.
        _armOutsideClose(open, closeFn) {
            if (this._popClickHandler) {
                document.removeEventListener('click', this._popClickHandler);
                this._popClickHandler = null;
            }
            if (!open) return;
            var self = this;
            setTimeout(function () {
                self._popClickHandler = function () { closeFn(); self._popClickHandler = null; };
                document.addEventListener('click', self._popClickHandler, { once: true });
            }, 0);
        }

        // Render a consent prompt in the HUD (host chrome — the app cannot draw or dismiss this).
        // Resolves cb(true/false) only on a real user click. Called by app-shell._consent.
        // External-link confirm (Option D). Shows the URL + an Open button; the Open click
        // is the user gesture that lets onConfirm() call window.open without a popup block.
        // Called by app-shell._promptExternalOpen for apps that lack the externalLinks grant.
        promptExternalLink(url, onConfirm) {
            const bar     = this.shadowRoot.querySelector('.hud-extlink-bar');
            const urlEl   = this.shadowRoot.querySelector('.hud-extlink-url');
            const openBtn = this.shadowRoot.querySelector('.hud-extlink-open');
            const disBtn  = this.shadowRoot.querySelector('.hud-extlink-dismiss');
            if (!bar || !urlEl || !openBtn || !disBtn) { try { onConfirm && onConfirm(); } catch (_) {} return; }

            urlEl.textContent = url;
            bar.style.display = '';
            const done = (go) => {
                bar.style.display = 'none';
                openBtn.removeEventListener('click', onOpen);
                disBtn.removeEventListener('click', onDis);
                if (go) { try { onConfirm && onConfirm(); } catch (_) {} }   // runs inside this click gesture
            };
            const onOpen = () => done(true);
            const onDis  = () => done(false);
            openBtn.addEventListener('click', onOpen);
            disBtn.addEventListener('click', onDis);
        }

        // Download confirm — same host-chrome bar as promptExternalLink, different copy.
        // onDecision(true|false) ALWAYS fires (dismiss included) so the app's
        // sg.vfs.download promise can settle instead of hanging. The confirm click is the
        // user gesture the host's <a download> click runs inside. Called by
        // app-shell for apps that lack the `downloads` grant.
        promptDownload(filename, sizeLabel, onDecision) {
            const bar     = this.shadowRoot.querySelector('.hud-extlink-bar');
            const labelEl = this.shadowRoot.querySelector('.hud-extlink-label');
            const urlEl   = this.shadowRoot.querySelector('.hud-extlink-url');
            const iconEl  = this.shadowRoot.querySelector('.hud-extlink-icon');
            const openBtn = this.shadowRoot.querySelector('.hud-extlink-open');
            const disBtn  = this.shadowRoot.querySelector('.hud-extlink-dismiss');
            if (!bar || !urlEl || !openBtn || !disBtn) { try { onDecision && onDecision(true); } catch (_) {} return; }

            const prev = { label: labelEl && labelEl.textContent, icon: iconEl && iconEl.textContent, btn: openBtn.textContent };
            if (labelEl) labelEl.textContent = 'This app wants to save a file to your device:';
            if (iconEl)  iconEl.textContent  = '⬇';
            openBtn.textContent = 'Download ⬇';
            urlEl.textContent   = filename + (sizeLabel ? ' (' + sizeLabel + ')' : '');
            bar.style.display   = '';
            const done = (go) => {
                bar.style.display = 'none';
                if (labelEl) labelEl.textContent = prev.label;
                if (iconEl)  iconEl.textContent  = prev.icon;
                openBtn.textContent = prev.btn;
                openBtn.removeEventListener('click', onGo);
                disBtn.removeEventListener('click', onNo);
                try { onDecision && onDecision(go); } catch (_) {}    // confirm runs inside this click gesture
            };
            const onGo = () => done(true);
            const onNo = () => done(false);
            openBtn.addEventListener('click', onGo);
            disBtn.addEventListener('click', onNo);
        }

        requestConsent(verb, path, cb) {
            const bar    = this.shadowRoot.querySelector('.hud-consent-bar');
            const t      = this.shadowRoot.querySelector('.hud-consent-text');
            const grants = this.shadowRoot.querySelector('.hud-consent-grants');
            const allow  = this.shadowRoot.querySelector('.hud-consent-allow');
            const deny   = this.shadowRoot.querySelector('.hud-consent-deny');
            if (!bar || !t || !allow || !deny) { try { cb(false); } catch (_) {} return; }

            const info = AppHud._consentInfo(verb, path);
            t.textContent = info.message;
            bar.classList.toggle('hud-consent-bar--danger', info.danger);

            // Surface the cumulative power the app already holds (destructive ones flagged),
            // so a single-verb prompt doesn't understate what saying "Allow" repeatedly means.
            if (grants) {
                if (this._privList && this._privList.length) {
                    grants.innerHTML = '<span class="hud-grants-label">Already allowed:</span> '
                        + this._privList.map(function (p) {
                            return '<span class="hud-grant' + (p.danger ? ' hud-grant--danger' : '') + '">'
                                 + AppHud._escapeHtml(p.label) + '</span>';
                        }).join('');
                    grants.style.display = '';
                } else {
                    grants.style.display = 'none';
                    grants.innerHTML = '';
                }
            }

            bar.style.display = '';
            // Remember focus so we can restore it after the decision (a11y).
            this._consentPrevFocus = (document.activeElement && document.activeElement !== document.body)
                ? document.activeElement : null;

            const onKey = (ev) => {
                if (ev.key === 'Escape') { ev.preventDefault(); done(false); }
            };
            const done = (ok) => {
                bar.style.display = 'none';
                bar.classList.remove('hud-consent-bar--danger');
                allow.removeEventListener('click', onAllow);
                deny.removeEventListener('click', onDeny);
                bar.removeEventListener('keydown', onKey);
                try { if (this._consentPrevFocus && this._consentPrevFocus.focus) this._consentPrevFocus.focus(); } catch (_) {}
                try { cb(ok); } catch (_) {}
            };
            const onAllow = () => done(true);
            const onDeny  = () => done(false);
            allow.addEventListener('click', onAllow);
            deny.addEventListener('click', onDeny);
            bar.addEventListener('keydown', onKey);
            // Safe default: focus DENY (not Allow) so a stray Enter/keypress never grants —
            // the user must deliberately move to Allow. Esc also denies.
            setTimeout(() => { try { deny.focus(); } catch (_) {} }, 0);
        }

        // Returns { message, danger } for a consent verb. Destructive (irreversible) verbs
        // get a ⚠ prefix and flip the bar to a danger colour.
        static _consentInfo(verb, path) {
            const map = {
                'vault.create':           { what: 'create a vault',                     danger: false },
                'vault.createKey':        { what: 'create a vault and receive its key', danger: false },
                'vault.delete':           { what: 'permanently delete a vault',         danger: true  },
                'vault.unlink':           { what: 'unlink a vault',                     danger: false },
                'vault.embedAccessToken': { what: 'embed an access token in a vault',    danger: true  },
                'vfs.write':              { what: 'write files',                        danger: false },
                'vfs.delete':             { what: 'delete files',                       danger: true  },
                'vfs.move':               { what: 'move files',                         danger: false },
                'vfs.mkdir':              { what: 'create folders',                     danger: false }
            };
            const e = map[verb] || { what: 'use ' + verb, danger: /delete|destroy|unlink/i.test(verb) };
            // Only show the location for real folder paths — a ref id (e.g. "lk-abc…") is noise.
            const showPath = path && path.indexOf('/') > -1;
            return {
                message: (e.danger ? '⚠ ' : '') + 'This app wants to ' + e.what
                       + (showPath ? ' in “' + path + '”' : '') + '.',
                danger: e.danger
            };
        }

        // The manifest grants are a fixed ceiling; the user can still reset this app's cached
        // create/delete consents so the prompts are asked again. Triggered from the privs popover.
        _resetConsents() {
            this._togglePrivsPop(false);
            const ok = window.confirm('Reset this app’s granted consents (e.g. create/delete prompts will be asked again)?');
            if (ok) this.dispatchEvent(new CustomEvent('app-hud:reset-consents', { bubbles: true, composed: true }));
        }

        // Show a transient message (called from VFS bridge sg.ui.message handler).
        showMessage(handle, text, type, ttl) {
            const msgEl = this.shadowRoot.querySelector('.hud-msg');
            if (!msgEl) return;

            if (handle && this._messages[handle]) {
                clearTimeout(this._messages[handle].timer);
            }

            const icons = { info: '•', success: '✓', warn: '⚠', error: '✗' };
            msgEl.textContent = (icons[type] || '•') + ' ' + text;
            msgEl.className   = 'hud-msg hud-msg--' + (type || 'info');
            msgEl.style.display = '';

            if (ttl !== null) {
                const ms    = typeof ttl === 'number' ? ttl : 3000;
                const timer = setTimeout(() => {
                    if (handle) delete this._messages[handle];
                    msgEl.style.display = 'none';
                    msgEl.textContent   = '';
                }, ms);
                if (handle) this._messages[handle] = { timer };
            }
        }

        clearMessage(handle) {
            if (handle && this._messages[handle]) {
                clearTimeout(this._messages[handle].timer);
                delete this._messages[handle];
            }
            const msgEl = this.shadowRoot.querySelector('.hud-msg');
            if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }
        }

        _toggleDebug() {
            this._debugOpen = !this._debugOpen;
            this.dispatchEvent(new CustomEvent('app-debug:toggle', {
                bubbles: true, composed: true,
                detail: { open: this._debugOpen, split: 0.32 }
            }));
            const btn = this.shadowRoot.querySelector('.hud-debug-btn');
            if (btn) btn.classList.toggle('active', this._debugOpen);
        }

        _copyLink() {
            if (!this._vaultKey) return;
            var url = window.location.origin + '/en-gb/app#' + this._vaultKey;
            navigator.clipboard.writeText(url).then(() => {
                this.showMessage('copy', 'Link copied', 'success', 2000);
            }).catch(() => {
                this.showMessage('copy', 'Could not copy: ' + url, 'info', 5000);
            });
        }

        // Print is implemented by app-shell (it owns the iframe). The HUD just signals.
        // app-shell._onPrint() reads iframe.contentDocument, normalises blob: URLs to
        // data: URIs (so the print window is self-contained), and hands off to SgPrint.
        _onPrintClick() {
            this.showMessage('print', 'Preparing print preview…', 'info', 4000);
            this.dispatchEvent(new CustomEvent('app-hud:print', { bubbles: true, composed: true }));
        }

        // ── Nav row ───────────────────────────────────────────────────────────────────

        // Called by app-shell on every 'app-nav:change' event. Updates the path display,
        // enables/disables back/forward arrows, and maintains the most-recent list for ⋯.
        setNavState(state) {
            state = state || {};
            this._navState = {
                path:       String(state.path || ''),
                canBack:    !!state.canBack,
                canForward: !!state.canForward,
                canHome:    !!state.canHome,
                historyLen: state.historyLen | 0
            };
            this._updateRecent(this._navState.path);
            var sr = this.shadowRoot; if (!sr) return;

            var back    = sr.querySelector('.navrow-back');
            var forward = sr.querySelector('.navrow-forward');
            var home    = sr.querySelector('.navrow-home');
            if (back)    back.disabled    = !this._navState.canBack;
            if (forward) forward.disabled = !this._navState.canForward;
            if (home)    home.disabled    = !this._navState.canHome;

            var addr = sr.querySelector('.navrow-addr-text');
            // Don't overwrite the display text while the user is editing the URL — they're
            // typing into the input and an incoming nav-change shouldn't visually flicker
            // behind it. When the input commits and edit mode exits, the next nav-change
            // (the one that just landed) will already be the one we want to show.
            if (addr && !this._editingAddr) {
                var p = this._navState.path;
                var hashIdx = p.indexOf('#');
                if (hashIdx >= 0) {
                    var pathPart = p.slice(0, hashIdx);
                    var hashPart = p.slice(hashIdx);
                    addr.innerHTML = '';
                    addr.appendChild(document.createTextNode(pathPart));
                    var hashSpan = document.createElement('span');
                    hashSpan.className = 'navrow-addr-hash';
                    hashSpan.textContent = hashPart;
                    addr.appendChild(hashSpan);
                } else {
                    addr.textContent = p;
                }
            }

            // Refresh the menu if it's open so it reflects new "current" highlighting.
            if (this._menuOpen) this._renderMenu();
        }

        _updateRecent(path) {
            if (!path) return;
            // Pure chronological recency — last 15 entries, duplicates kept on purpose.
            // The previous move-to-front dedup made the same path jump positions in the
            // menu as you navigated past it again, which is disorienting: a link's slot
            // shouldn't shift just because you visited that page once more. Keeping the
            // raw sequence reflects "where you've been" more honestly. Skip only the
            // immediate self-repeat (a reload of the same page shouldn't double-stamp it).
            if (this._recent[0] === path) return;
            this._recent.unshift(path);
            if (this._recent.length > 15) this._recent.length = 15;
        }

        _emitNavEvent(action, detail) {
            this.dispatchEvent(new CustomEvent('app-hud:nav', {
                bubbles: true, composed: true,
                detail: Object.assign({ action: action }, detail || {})
            }));
        }

        _copyCurrentPath() {
            var p = this._navState.path || '';
            if (!p) return;
            navigator.clipboard.writeText(p).then(() => {
                this.showMessage('copyPath', 'Path copied: ' + p, 'success', 2000);
            }).catch(() => {
                this.showMessage('copyPath', 'Could not copy', 'warn', 3000);
            });
        }

        // Browser-style URL bar: click flips text → input pre-filled with current path,
        // focused and selected. Enter commits via the 'jump' nav event (paths typed in
        // are treated as vault-absolute by app-shell, so no current-dir prefixing).
        // Escape or focus loss cancels and restores the read-only display.
        _enterAddrEdit() {
            var sr = this.shadowRoot; if (!sr) return;
            if (this._editingAddr) return;
            var input = sr.querySelector('.navrow-addr-input');
            var text  = sr.querySelector('.navrow-addr-text');
            var icon  = sr.querySelector('.navrow-addr-icon');
            if (!input) return;
            this._editingAddr = true;
            input.value = this._navState.path || '';
            if (text) text.style.display = 'none';
            if (icon) icon.style.display = 'none';
            input.style.display = '';
            // Defer focus/select until after the click event finishes (avoids a
            // race where focusout from another element re-triggers _exitAddrEdit).
            setTimeout(() => { input.focus(); input.select(); }, 0);
        }

        _exitAddrEdit(commit) {
            var sr = this.shadowRoot; if (!sr) return;
            if (!this._editingAddr) return;
            var input = sr.querySelector('.navrow-addr-input');
            var text  = sr.querySelector('.navrow-addr-text');
            var icon  = sr.querySelector('.navrow-addr-icon');
            this._editingAddr = false;
            var value = input ? (input.value || '').trim() : '';
            if (input) input.style.display = 'none';
            if (text)  text.style.display  = '';
            if (icon)  icon.style.display  = '';
            if (commit && value && value !== this._navState.path) {
                this._emitNavEvent('jump', { path: value });
            }
        }

        _toggleMenu(force) {
            var open = (typeof force === 'boolean') ? force : !this._menuOpen;
            this._menuOpen = open;
            var panel = this.shadowRoot && this.shadowRoot.querySelector('.navrow-menu-panel');
            if (!panel) return;
            if (open) {
                this._renderMenu();
                panel.style.display = '';
                // Outside-click close: armed on the *next* event-loop turn so the
                // click that opens the menu (which bubbles from shadow DOM up to
                // document with composed:true) doesn't immediately close it again.
                // A one-shot listener means clicks on the ⋯ button after open will
                // re-toggle through the shadow handler instead of being eaten here.
                if (this._docClickHandler) document.removeEventListener('click', this._docClickHandler);
                setTimeout(() => {
                    this._docClickHandler = () => this._toggleMenu(false);
                    document.addEventListener('click', this._docClickHandler, { once: true });
                }, 0);
            } else {
                panel.style.display = 'none';
                if (this._docClickHandler) {
                    document.removeEventListener('click', this._docClickHandler);
                    this._docClickHandler = null;
                }
            }
        }

        _renderMenu() {
            var panel = this.shadowRoot && this.shadowRoot.querySelector('.navrow-menu-panel');
            if (!panel) return;
            var current = this._navState.path || '';
            var rows = this._recent.map((p) => {
                var cls = (p === current) ? 'navrow-menu-item current' : 'navrow-menu-item';
                var safe = AppHud._escapeHtml(p);
                return '<div class="' + cls + '" data-recent-path="' + safe + '" title="' + safe + '">📄 ' + safe + '</div>';
            }).join('');
            var html = '<div class="navrow-menu-section">Recent</div>'
                     + (rows || '<div class="navrow-menu-empty">No history yet</div>');
            panel.innerHTML = html;
        }

        // ── HUD config (app.json hud.* surface) ───────────────────────────────────────

        // Apply a resolved hud config to the chrome. Idempotent — safe to call repeatedly.
        // Sovereignty rules baked in:
        //   1. Consent prompts always render when active (regardless of mode/show flags).
        //   2. In 'hidden' mode the chrome row is invisible BUT a corner escape pill stays.
        //   3. The user-side override (force-show-hud) is applied OUTSIDE this method, by
        //      the page script that constructs the config — see _resolvedHudCfg().
        applyHudConfig(hudCfg) {
            this._hudCfg = hudCfg || null;
            var cfg = AppHud._resolveHudCfg(hudCfg);
            var sr  = this.shadowRoot; if (!sr) return;

            var wrap   = sr.querySelector('.hud-wrap');
            var escape = sr.querySelector('.hud-escape');

            if (cfg.mode === 'hidden') {
                // Chrome row hidden, but the corner escape pill stays — a visible clue
                // that this is a vault app + a one-click way back.
                if (wrap)   wrap.style.display = 'none';
                if (escape) escape.style.display = '';
                return;
            }
            if (cfg.mode === 'none') {
                // No chrome AND no escape pill — the app is visually indistinguishable from a
                // standalone page; the only way back is to edit the URL. Author-only, opt-in.
                // (Consent prompts still render — the consent bar is a sibling of .hud-wrap.)
                if (wrap)   wrap.style.display = 'none';
                if (escape) escape.style.display = 'none';
                return;
            }
            if (wrap)   wrap.style.display = '';
            if (escape) escape.style.display = 'none';

            // Per-element visibility. Buttons/spans with [data-hud-el] respect the show flags.
            // Note: the visibility is "may show" — the actual setInfo()/setNavState() calls
            // still hide elements that have nothing to display (e.g. vault badge with no name).
            var els = sr.querySelectorAll('[data-hud-el]');
            els.forEach((el) => {
                var key = el.getAttribute('data-hud-el');
                if (key === 'navArrows') {
                    // Group key — same logic applies to back/forward/divider.
                    el.style.visibility = cfg.show.navArrows ? '' : 'hidden';
                    return;
                }
                if (cfg.show[key] === false) {
                    el.style.display = 'none';
                }
            });

            // The ⋯ menu only holds Copy / Print / Debug — collapse the whole control when
            // all three are hidden (e.g. minimal mode) so there's no empty dangling button.
            var moreWrap = sr.querySelector('.hud-more-wrap');
            if (moreWrap) {
                var anyMore = cfg.show.copyLink || cfg.show.print || cfg.show.debug;
                moreWrap.style.display = anyMore ? '' : 'none';
            }

            // Activity meter has no data-gating (it's always meaningful, starts at R0/W0), so
            // drive its visibility explicitly — both hide AND restore — off the show flag. The
            // per-element loop above only hides, which wouldn't re-show it on a force-show.
            var actWrap = sr.querySelector('.hud-activity-wrap');
            if (actWrap) actWrap.style.display = cfg.show.activity ? '' : 'none';

            var navbar = sr.querySelector('.navrow');
            if (navbar) navbar.style.display = cfg.show.navBar ? '' : 'none';
        }

        // Delegates to AppHudConfig (loaded before this file in /en-gb/app/index.html).
        // Extracted so the schema can be unit-tested in Node — see test__app_hud_config.js
        // for the contract (mode resolution, per-mode show.* defaults, override merging,
        // forward-compat for unknown flags, no-mutation of input).
        static _resolveHudCfg(input) {
            return AppHudConfig.resolve(input);
        }

        static _escapeHtml(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
    }

    AppHud.styles = `
        :host { display: block; }
        .hud {
            display: flex; align-items: center; justify-content: space-between;
            height: 48px; padding: 0 1rem;
            background: #12122a; border-bottom: 1px solid #2a2a4a;
        }
        .hud-left  { display: flex; align-items: center; gap: 0.625rem; min-width: 0; }
        .hud-center { flex: 1; display: flex; align-items: center; justify-content: center; min-width: 0; overflow: hidden; }
        .hud-right { display: flex; align-items: center; gap: 0.5rem; flex: 0 0 auto; }
        .hud-brand { font-weight: 700; font-size: 1rem; color: #e2e8f0; white-space: nowrap; }
        .hud-slash { color: #4ECDC4; }
        .hud-vault-badge {
            font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 9999px;
            background: rgba(78,205,196,0.12); color: #4ECDC4;
            font-family: monospace; border: 1px solid rgba(78,205,196,0.3);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;
        }
        .hud-app-title {
            font-size: 0.875rem; font-weight: 600; color: #e2e8f0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            min-width: 0; max-width: 40vw;
            /* Cap at 40vw so a long title ellipsizes inside hud-left instead of growing
               until it butts against centre content. (The consent prompt now lives in
               its own full-width bar, so it no longer collides — but the cap keeps the
               top row tidy when brand+badge+title are all long.) */
        }
        .hud-msg {
            font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 4px;
            color: #8892a4; background: rgba(255,255,255,0.05);
        }
        .hud-msg--success { color: #4ECDC4; }
        .hud-msg--error   { color: #ff6b6b; }
        .hud-msg--warn    { color: #E9C445; }
        .hud-vault-link {
            font-size: 0.75rem; color: #8892a4; text-decoration: none;
            padding: 0.2rem 0.5rem; border-radius: 4px;
            border: 1px solid #2a2a4a; white-space: nowrap;
        }
        .hud-vault-link:hover { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-ro-badge {
            font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px;
            background: rgba(100,160,220,0.12); color: #64a0dc;
            border: 1px solid rgba(100,160,220,0.25); white-space: nowrap;
        }
        /* ── Privileges chip (compact 🔒 N) + expandable popover ─────────────────────── */
        .hud-privs-wrap { position: relative; display: inline-flex; }
        /* Privileges chip — standing grants, NOT an error. Default state is a calm slate
           (informational); presence of any destructive grant lifts it to amber. We deliberately
           do NOT use red here — red is reserved for active errors and the active consent prompt.
           Red on a permanent status chip read as "something is wrong" in user testing. */
        .hud-privs-chip {
            font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 9999px;
            background: rgba(136,146,164,0.10); color: #aeb6c6;
            border: 1px solid rgba(136,146,164,0.30); white-space: nowrap;
            font-family: inherit; cursor: pointer; line-height: 1.4;
        }
        .hud-privs-chip:hover { color: #e2e8f0; border-color: rgba(174,182,198,0.55); }
        .hud-privs-count { font-weight: 700; }
        .hud-privs-chip--danger {
            background: rgba(245,164,67,0.10); color: #f5a443;
            border-color: rgba(245,164,67,0.45);
        }
        .hud-privs-chip--danger:hover { color: #ffba5c; border-color: #f5a443; }
        .hud-privs-pop {
            position: absolute; top: calc(100% + 6px); right: 0;
            min-width: 200px; background: #14142a; border: 1px solid #2a2a4a;
            border-radius: 6px; padding: 0.35rem; box-shadow: 0 12px 30px rgba(0,0,0,0.55);
            z-index: 200; display: flex; flex-direction: column; gap: 0.1rem;
        }
        .hud-priv-head {
            color: rgba(255,255,255,0.38); font-size: 0.66rem;
            text-transform: uppercase; letter-spacing: 0.08em; padding: 0.2rem 0.45rem 0.3rem;
        }
        .hud-priv-row { padding: 0.22rem 0.45rem; font-size: 0.78rem; color: #cbd3e1; white-space: nowrap; }
        .hud-priv-row--danger { color: #f5a443; font-weight: 600; }
        .hud-privs-reset {
            margin-top: 0.3rem; font-size: 0.72rem; padding: 0.3rem 0.45rem; border-radius: 4px;
            border: 1px solid #2a2a4a; background: transparent; color: #8892a4;
            cursor: pointer; text-align: left; font-family: inherit;
        }
        .hud-privs-reset:hover { color: #ff8a8a; border-color: rgba(255,107,107,0.4); }

        /* ── File-activity meter (⇅ R N  W N) + expandable popover ────────────────────── */
        .hud-activity-wrap { position: relative; display: inline-flex; }
        .hud-activity-chip {
            font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 9999px;
            background: rgba(255,255,255,0.04); color: #8892a4;
            border: 1px solid #2a2a4a; white-space: nowrap; cursor: pointer;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            transition: border-color 0.45s ease, color 0.45s ease, background 0.45s ease;
        }
        .hud-activity-chip:hover { border-color: #4ECDC4; }
        .hud-act-r { color: #64a0dc; }     /* reads — blue */
        .hud-act-w { color: #4ECDC4; }     /* writes — teal */
        .hud-act-e { color: #ff6b6b; font-weight: 700; }   /* errors — red */
        .hud-activity-chip.pulse-ok  { border-color: #4ECDC4; background: rgba(78,205,196,0.16); }
        .hud-activity-chip.pulse-err { border-color: #ff6b6b; background: rgba(255,107,107,0.16); }
        .hud-activity-pop {
            position: absolute; top: calc(100% + 6px); right: 0;
            min-width: 240px; max-width: 360px; background: #14142a; border: 1px solid #2a2a4a;
            border-radius: 6px; padding: 0.35rem; box-shadow: 0 12px 30px rgba(0,0,0,0.55);
            z-index: 200; display: flex; flex-direction: column; gap: 0.05rem;
        }
        .hud-act-summary {
            font-size: 0.74rem; color: #cbd3e1; padding: 0.15rem 0.45rem 0.35rem;
            border-bottom: 1px solid #23233f; margin-bottom: 0.2rem;
        }
        .hud-act-row {
            display: flex; align-items: center; gap: 0.4rem;
            padding: 0.2rem 0.45rem; font-size: 0.74rem; color: #cbd3e1;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .hud-act-row--err { color: #ff8a8a; }
        .hud-act-tag {
            flex: 0 0 auto; width: 1.1rem; text-align: center; border-radius: 3px;
            font-size: 0.66rem; font-weight: 700; padding: 0.02rem 0;
        }
        .hud-act-tag--r { background: rgba(100,160,220,0.18); color: #64a0dc; }
        .hud-act-tag--w { background: rgba(78,205,196,0.18); color: #4ECDC4; }
        .hud-act-path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hud-act-meta { flex: 0 0 auto; color: rgba(255,255,255,0.4); font-size: 0.68rem; }
        .hud-act-empty { padding: 0.4rem 0.45rem 0.55rem; color: rgba(255,255,255,0.32); font-style: italic; font-size: 0.74rem; }

        /* ── ⋯ overflow menu (Copy link / Print / Debug) ─────────────────────────────── */
        .hud-more-wrap { position: relative; display: inline-flex; }
        .hud-more-btn {
            font-size: 0.95rem; line-height: 1; padding: 0.15rem 0.5rem; border-radius: 4px;
            border: 1px solid #2a2a4a; background: transparent; color: #8892a4;
            cursor: pointer; font-family: inherit;
        }
        .hud-more-btn:hover { color: #4ECDC4; border-color: #4ECDC4; }
        .hud-more-panel {
            position: absolute; top: calc(100% + 6px); right: 0;
            min-width: 170px; background: #14142a; border: 1px solid #2a2a4a;
            border-radius: 6px; padding: 0.3rem; box-shadow: 0 12px 30px rgba(0,0,0,0.55);
            z-index: 200; display: flex; flex-direction: column; gap: 0.1rem;
        }
        .hud-mi {
            font-size: 0.78rem; padding: 0.35rem 0.5rem; border-radius: 4px;
            border: 1px solid transparent; background: transparent; color: #cbd3e1;
            cursor: pointer; text-align: left; white-space: nowrap; font-family: inherit;
        }
        .hud-mi:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .hud-debug-btn.active { color: #4ECDC4; }

        /* ── External-link confirm bar (Option D) ──────────────────────────────────────── */
        .hud-extlink-bar {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.5rem 1rem; min-height: 44px; box-sizing: border-box;
            background: #1a2a3a; border-bottom: 1px solid #2a4a5a; color: #e2e8f0;
        }
        .hud-extlink-icon { flex: 0 0 auto; font-size: 1rem; color: #64a0dc; }
        .hud-extlink-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
        .hud-extlink-label { font-size: 0.72rem; color: #aeb6c6; }
        .hud-extlink-url { font-size: 0.82rem; color: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hud-extlink-actions { flex: 0 0 auto; display: flex; gap: 0.5rem; }
        .hud-extlink-open, .hud-extlink-dismiss {
            font-size: 0.78rem; padding: 0.3rem 0.9rem; border-radius: 4px; cursor: pointer;
            border: 1px solid #2a2a4a; background: transparent; white-space: nowrap; font-family: inherit;
        }
        .hud-extlink-open { background: #64a0dc; color: #0a0a18; border-color: #64a0dc; font-weight: 700; }
        .hud-extlink-open:hover { background: #5590cc; }
        .hud-extlink-dismiss { color: #8892a4; }
        .hud-extlink-dismiss:hover { color: #e2e8f0; border-color: #4a5568; }

        /* ── Consent bar (full-width sibling of .hud-wrap — sovereignty: always rendered) ── */
        .hud-consent-bar {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 0.5rem 1rem; min-height: 44px; box-sizing: border-box;
            background: #15264a; border-bottom: 1px solid #2a3a6a; color: #e2e8f0;
        }
        .hud-consent-bar--danger { background: #3a1a22; border-bottom-color: #7a2a3a; }
        .hud-consent-icon { flex: 0 0 auto; font-size: 1.05rem; }
        .hud-consent-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        .hud-consent-text { font-size: 0.85rem; color: #fff; line-height: 1.3; }   /* wraps — never truncates */
        .hud-consent-grants {
            font-size: 0.72rem; color: #aeb6c6;
            display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem;
        }
        .hud-grants-label { color: rgba(255,255,255,0.4); }
        .hud-grant { white-space: nowrap; }
        .hud-grant--danger { color: #ff8a8a; font-weight: 600; }
        .hud-consent-actions { flex: 0 0 auto; display: flex; gap: 0.5rem; }
        .hud-consent-allow, .hud-consent-deny {
            font-size: 0.78rem; padding: 0.3rem 0.9rem; border-radius: 4px; cursor: pointer;
            border: 1px solid #2a2a4a; background: transparent; white-space: nowrap; font-family: inherit;
        }
        .hud-consent-allow { background: #4ECDC4; color: #0a0a18; border-color: #4ECDC4; font-weight: 700; }
        .hud-consent-allow:hover { background: #3dbdb5; }
        .hud-consent-deny { color: #ff6b6b; border-color: rgba(255,107,107,0.4); }
        .hud-consent-deny:hover  { border-color: #ff6b6b; }
        .hud-consent-deny:focus, .hud-consent-allow:focus { outline: 2px solid #4ECDC4; outline-offset: 1px; }

        /* ── Nav row (HUD V1: back/forward/refresh + path display + copy + recent menu) ── */
        .hud-wrap { display: block; }
        .navrow {
            display: flex; align-items: center; gap: 0.4rem;
            background: #0e0e22; border-bottom: 1px solid #2a2a4a;
            padding: 0.3rem 0.7rem;
            min-height: 32px;
        }
        .navrow button {
            background: transparent; border: 1px solid transparent;
            color: #8892a4; border-radius: 4px;
            width: 26px; height: 26px;
            display: inline-flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 0.95rem; font-family: inherit; padding: 0;
        }
        .navrow button:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .navrow button:disabled,
        .navrow button:disabled:hover {
            opacity: 0.28; cursor: default;
            background: transparent; color: #8892a4;
        }
        .navrow-divider {
            width: 1px; height: 18px; background: #2a2a4a; margin: 0 0.15rem;
            display: inline-block;
        }
        .navrow-addr {
            flex: 1; min-width: 0;
            display: flex; align-items: center; gap: 0.45rem;
            background: rgba(255,255,255,0.04);
            border: 1px solid #2a2a4a;
            border-radius: 6px;
            padding: 0.22rem 0.6rem;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            cursor: pointer;
            overflow: hidden;
            height: 26px; box-sizing: border-box;
        }
        .navrow-addr:hover { border-color: rgba(78,205,196,0.35); }
        .navrow-addr-icon { color: rgba(255,255,255,0.32); flex-shrink: 0; font-size: 0.85rem; }
        .navrow-addr-text {
            color: #e2e8f0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            min-width: 0; flex: 1;
        }
        .navrow-addr-hash { color: #4ECDC4; }
        .navrow-addr-input {
            flex: 1; min-width: 0;
            background: transparent;
            border: none; outline: none;
            color: #e2e8f0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.78rem;
            padding: 0;
            cursor: text;
        }
        .navrow-addr-input::selection { background: rgba(78,205,196,0.35); color: #fff; }
        .navrow-addr-input:focus { outline: none; }
        .navrow-menu-wrap { position: relative; }
        .navrow-menu-panel {
            position: absolute; top: calc(100% + 4px); right: 0;
            min-width: 260px; max-width: 420px;
            background: #14142a; border: 1px solid #2a2a4a;
            border-radius: 6px; padding: 0.35rem 0;
            box-shadow: 0 12px 30px rgba(0,0,0,0.55);
            z-index: 100;
            font-size: 0.78rem;
        }
        .navrow-menu-section {
            color: rgba(255,255,255,0.38);
            font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em;
            padding: 0.3rem 0.7rem 0.2rem;
        }
        .navrow-menu-item {
            display: block;
            padding: 0.3rem 0.7rem;
            color: #8892a4;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.74rem;
            cursor: pointer;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .navrow-menu-item:hover  { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .navrow-menu-item.current { color: #4ECDC4; }
        .navrow-menu-empty {
            padding: 0.4rem 0.7rem 0.6rem;
            color: rgba(255,255,255,0.32);
            font-size: 0.74rem;
            font-style: italic;
        }

        /* ── Escape pill (hidden-mode sovereignty chrome — always reachable) ──────── */
        .hud-escape {
            position: fixed; top: 8px; right: 8px;
            z-index: 9999;
            background: rgba(13,17,23,0.85);
            backdrop-filter: blur(8px);
            color: #e2e8f0;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 999px;
            padding: 0.28rem 0.8rem;
            font-size: 0.72rem;
            font-family: inherit;
            cursor: pointer;
        }
        .hud-escape:hover {
            background: rgba(13,17,23,0.95);
            border-color: rgba(78,205,196,0.45);
            color: #4ECDC4;
        }
    `;

    customElements.define('app-hud', AppHud);
})();
