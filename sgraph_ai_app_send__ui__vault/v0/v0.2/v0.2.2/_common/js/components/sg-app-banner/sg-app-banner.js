/* =================================================================================
   SGraph Vault — sg-app-banner
   v0.2.2 — Fixed-position app banner for maximised chrome mode.

   Activated by app.json: { "chrome": { "mode": "maximised" } }
   or by clicking the "App Mode" button on any HTML file in the vault.

   In App Mode only TWO things are visible:
     1. This banner (SG/Send brand · Refresh · Vault ▾ · App Mode ✓)
     2. The HTML iframe content filling all remaining viewport height

   Strategy — two-layer approach:
     Layer 1 (CSS): hide vault-shell chrome (header, nav, status bar)
     Layer 2 (frame lift): apply position:fixed to the iframe wrapper div so
       it fills the viewport below the banner, covering all sg-layout chrome
       (tab bar, resize handle, collapse buttons, tree panel) without moving
       the iframe node in the DOM (which would reload it).

   If no HTML iframe is present (e.g. vault opened from app.json before any
   file is selected), Layer 1 + shadow CSS hides act as fallback.
   ================================================================================= */

(function() {
    'use strict';

    var CSS_ID        = 'sg-app-banner-max-css';
    var SHADOW_CSS_ID = 'sg-app-banner-shadow-css';

    // Layer 1: vault-shell chrome to hide
    var MAX_CSS = [
        'vault-shell vault-header      { display:none !important; }',
        'vault-shell vault-nav         { display:none !important; }',
        'vault-shell vault-status-bar  { display:none !important; }',
        'vault-shell .vs-body          { padding-top:0 !important; }',
        'vault-shell .vs-shell         { padding-top:2.25rem !important; }'
    ].join('\n');

    // Fallback: shadow-DOM chrome to hide when no iframe is present
    var SHADOW_CSS = [
        '.sgl-tab-bar       { display:none !important; }',
        '.sgl-resize-handle { display:none !important; }'
    ].join('\n');

    // Saved state for frame-lift restore
    var _savedWrapperStyle = null;
    var _savedIframeStyle  = null;

    // ── Component ────────────────────────────────────────────────────────────

    class SGAppBanner extends HTMLElement {
        connectedCallback() {
            if (this._built) return;
            this._built = true;
            this._vaultOpen = false;
            this._render();
        }

        _render() {
            // Start hidden. activate() switches display to 'flex'.
            this.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:8000',
                'display:none', 'align-items:center', 'gap:0.6rem',
                'padding:0 0.75rem', 'height:2.25rem',
                'background:rgba(10,10,24,0.96)',
                'border-bottom:1px solid rgba(78,205,196,0.18)',
                'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
                'font-family:var(--font-sans,system-ui,sans-serif)', 'font-size:13px'
            ].join(';');

            // Brand
            var brand = _el('span', {
                style: 'color:#4ecdc4;font-weight:700;letter-spacing:0.05em;flex-shrink:0;font-size:12px;',
                textContent: 'SG/Send'
            });
            this.appendChild(brand);

            // Status badge slot — reserved for vault-app events (VLT-026)
            var status = _el('span', {
                className: 'sg-app-banner__status',
                style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
                       'color:rgba(226,232,240,0.45);font-size:11px;'
            });
            this.appendChild(status);
            this._statusEl = status;

            // Refresh
            var refreshBtn = _btn('↺ Refresh', 'Re-fetch and re-render the current file');
            refreshBtn.addEventListener('click', function() {
                var shell = document.querySelector('vault-shell');
                if (shell) shell.dispatchEvent(
                    new CustomEvent('vault-header-refresh', { bubbles: true, composed: true })
                );
            });
            this.appendChild(refreshBtn);

            // Vault ▾ — temporary vault browser toggle
            var vaultBtn = _btn('Vault ▾', 'Temporarily show vault file browser');
            var self = this;
            vaultBtn.addEventListener('click', function() {
                self._vaultOpen = !self._vaultOpen;
                _setVaultVisible(self._vaultOpen);
                vaultBtn.textContent = self._vaultOpen ? 'Vault ▴' : 'Vault ▾';
            });
            this.appendChild(vaultBtn);
            this._vaultBtn = vaultBtn;

            // App Mode ✓ — exit toggle
            var appBtn = _btn('App Mode ✓', 'Exit app mode — restore full vault chrome');
            appBtn.style.cssText += ';border-color:rgba(78,205,196,0.6);color:#4ecdc4;';
            appBtn.addEventListener('click', function() {
                var active = !!document.getElementById(CSS_ID);
                if (active) {
                    _deactivate();
                } else {
                    _activateAll();
                    appBtn.textContent = 'App Mode ✓';
                    appBtn.style.borderColor = 'rgba(78,205,196,0.6)';
                    appBtn.style.color = '#4ecdc4';
                }
            });
            this.appendChild(appBtn);
        }

        // Called by the "App Mode" button in vault-browse-edit or app.json handler
        activate() {
            _activateAll();
            this.style.display = 'flex';
        }

        setStatus(text) {
            if (this._statusEl) this._statusEl.textContent = text || '';
        }
    }

    // ── Core activate / deactivate ────────────────────────────────────────────

    function _activateAll() {
        _injectMaxCss();
        // Try to lift the iframe wrapper to cover sg-layout chrome entirely.
        // Fall back to shadow-CSS + tree-hide if no iframe is present yet.
        if (!_liftContentFrame()) {
            _injectShadowCss();
            _hideTreeStack();
        }
    }

    function _deactivate() {
        _dropContentFrame();
        _removeMaxCss();
        _removeShadowCss();
        _restoreTreeStack();
        var banner = document.querySelector('sg-app-banner');
        if (banner) banner.style.display = 'none';
    }

    // ── Layer 2: frame lift ───────────────────────────────────────────────────
    // Applies position:fixed to the iframe's wrapper div so it fills the
    // viewport below the banner.  The iframe stays in its original DOM position
    // (no reload), while all sg-layout chrome is covered beneath it.

    function _liftContentFrame() {
        var iframeEl = document.querySelector('.sb-file__html-frame');
        if (!iframeEl) return false;
        var wrapper = iframeEl.parentElement;
        if (!wrapper) return false;

        _savedWrapperStyle = wrapper.style.cssText;
        _savedIframeStyle  = iframeEl.style.cssText;

        wrapper.style.cssText = [
            'position:fixed', 'top:2.25rem', 'left:0', 'right:0', 'bottom:0',
            'z-index:7999', 'display:flex', 'flex-direction:column', 'overflow:hidden'
        ].join(';');

        // iframe used height:0 with flex parent; now parent is fixed so use 100%
        iframeEl.style.cssText = 'flex:1;border:none;width:100%;height:100%;min-height:0;';

        return true;
    }

    function _dropContentFrame() {
        var iframeEl = document.querySelector('.sb-file__html-frame');
        if (!iframeEl) return;
        var wrapper = iframeEl.parentElement;
        if (!wrapper) return;

        wrapper.style.cssText  = _savedWrapperStyle  ||
            'flex:1;display:flex;flex-direction:column;position:relative;overflow:hidden;min-height:0;';
        iframeEl.style.cssText = _savedIframeStyle ||
            'flex:1;border:none;width:100%;height:0;min-height:0;';

        _savedWrapperStyle = null;
        _savedIframeStyle  = null;
    }

    // ── Layer 1: regular-DOM CSS ──────────────────────────────────────────────

    function _injectMaxCss() {
        if (document.getElementById(CSS_ID)) return;
        var s = document.createElement('style');
        s.id = CSS_ID;
        s.textContent = MAX_CSS;
        document.head.appendChild(s);
    }

    function _removeMaxCss() {
        var s = document.getElementById(CSS_ID);
        if (s) s.remove();
    }

    // ── Fallback: sg-layout shadow DOM CSS ───────────────────────────────────

    function _getSgLayout() {
        return document.querySelector('#sb-layout') || document.querySelector('sg-layout');
    }

    function _injectShadowCss() {
        var sgLayout = _getSgLayout();
        if (!sgLayout || !sgLayout.shadowRoot) return;
        if (sgLayout.shadowRoot.getElementById(SHADOW_CSS_ID)) return;
        var s = document.createElement('style');
        s.id = SHADOW_CSS_ID;
        s.textContent = SHADOW_CSS;
        sgLayout.shadowRoot.appendChild(s);
    }

    function _removeShadowCss() {
        var sgLayout = _getSgLayout();
        if (!sgLayout || !sgLayout.shadowRoot) return;
        var s = sgLayout.shadowRoot.getElementById(SHADOW_CSS_ID);
        if (s) s.remove();
    }

    // ── Fallback: tree stack show/hide ────────────────────────────────────────

    function _getTreeStack() {
        var sgLayout = _getSgLayout();
        if (!sgLayout || typeof sgLayout.getPanelElement !== 'function') return null;
        var treeEl = sgLayout.getPanelElement('t-tree');
        if (!treeEl) return null;
        var slotName = treeEl.getAttribute('slot');
        if (slotName && sgLayout.shadowRoot) {
            var slotEl = sgLayout.shadowRoot.querySelector('slot[name="' + slotName + '"]');
            if (slotEl) {
                var stack = slotEl.closest('.sgl-stack');
                if (stack) return { stack: stack, treeEl: treeEl };
            }
        }
        if (sgLayout.shadowRoot) {
            var firstStack = sgLayout.shadowRoot.querySelector('.sgl-stack');
            if (firstStack) return { stack: firstStack, treeEl: treeEl };
        }
        return { stack: null, treeEl: treeEl };
    }

    function _hideTreeStack() {
        var res = _getTreeStack();
        if (!res) return;
        if (res.stack)  res.stack.style.setProperty('display', 'none', 'important');
        if (res.treeEl) res.treeEl.style.setProperty('display', 'none', 'important');
    }

    function _restoreTreeStack() {
        var res = _getTreeStack();
        if (!res) return;
        if (res.stack)  res.stack.style.removeProperty('display');
        if (res.treeEl) res.treeEl.style.removeProperty('display');
    }

    // ── Vault ▾ toggle ────────────────────────────────────────────────────────
    // Drops the lifted frame (restoring sg-layout layout) and shows vault nav
    // so the user can browse files without fully exiting App Mode.

    function _setVaultVisible(show) {
        var shell = document.querySelector('vault-shell');
        var nav   = shell && shell.querySelector('vault-nav');

        if (show) {
            // Drop the lifted frame so vault chrome is visible behind it
            _dropContentFrame();
            if (nav) nav.style.removeProperty('display');
            _restoreTreeStack();
        } else {
            // Re-hide vault chrome and re-lift the frame
            if (nav) nav.style.setProperty('display', 'none', 'important');
            _hideTreeStack();
            _liftContentFrame();
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _el(tag, props) {
        var el = document.createElement(tag);
        Object.assign(el, props);
        if (props.style) el.style.cssText = props.style;
        return el;
    }

    function _btn(text, title) {
        var b = document.createElement('button');
        b.textContent = text;
        b.title       = title || '';
        b.style.cssText = [
            'background:transparent',
            'border:1px solid rgba(78,205,196,0.28)',
            'border-radius:4px', 'padding:2px 8px',
            'color:var(--color-text,#e2e8f0)', 'cursor:pointer',
            'font-size:11px', 'font-family:inherit', 'line-height:1.6',
            'white-space:nowrap', 'flex-shrink:0'
        ].join(';');
        b.addEventListener('mouseenter', function() { b.style.borderColor = 'rgba(78,205,196,0.6)'; });
        b.addEventListener('mouseleave', function() { b.style.borderColor = 'rgba(78,205,196,0.28)'; });
        return b;
    }

    customElements.define('sg-app-banner', SGAppBanner);
})();
