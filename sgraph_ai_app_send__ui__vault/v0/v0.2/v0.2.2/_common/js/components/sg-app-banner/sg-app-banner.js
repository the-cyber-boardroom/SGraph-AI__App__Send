/* =================================================================================
   SGraph Vault — sg-app-banner
   v0.2.2 — Fixed-position app banner for maximised chrome mode.

   Activated by app.json: { "chrome": { "mode": "maximised" } }
   or by clicking the "App Mode" button on any HTML file in the vault.

   In App Mode only TWO things are visible:
     1. This banner (SG/Send brand · Refresh · Vault ▾ · App Mode ✓)
     2. The HTML iframe content filling all remaining viewport height

   Hidden elements:
     - vault-header, vault-nav, vault-status-bar   (vault shell chrome)
     - send-browse .sb-header                       (file archive header)
     - send-browse .sb-file__actions                (per-file action bar)
     - sg-layout shadow: .sgl-tab-bar               (Share|Info|file tabs)
     - sg-layout shadow: .sgl-resize-handle         (tree/content splitter)
     - sg-layout tree stack                         (file tree panel)
   ================================================================================= */

(function() {
    'use strict';

    var CSS_ID      = 'sg-app-banner-max-css';
    var SHADOW_CSS_ID = 'sg-app-banner-shadow-css';

    // Regular-DOM chrome to hide (injected into document <head>)
    var MAX_CSS = [
        'vault-shell vault-header      { display:none !important; }',
        'vault-shell vault-nav         { display:none !important; }',
        'vault-shell vault-status-bar  { display:none !important; }',
        'vault-shell .vs-body          { padding-top:0 !important; }',
        'vault-shell .vs-shell         { padding-top:2.25rem !important; }',
        'send-browse .sb-header        { display:none !important; }',
        'send-browse .sb-file__actions { display:none !important; }'
    ].join('\n');

    // sg-layout shadow-DOM chrome to hide (injected into sg-layout.shadowRoot)
    var SHADOW_CSS = [
        '.sgl-tab-bar      { display:none !important; }',
        '.sgl-resize-handle { display:none !important; }'
    ].join('\n');

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
                _setVaultChromeVisible(self._vaultOpen);
                vaultBtn.textContent = self._vaultOpen ? 'Vault ▴' : 'Vault ▾';
            });
            this.appendChild(vaultBtn);
            this._vaultBtn = vaultBtn;

            // App Mode ✓ — exit toggle
            var embedBtn = _btn('App Mode ✓', 'Exit app mode — restore full vault chrome');
            embedBtn.style.cssText += ';border-color:rgba(78,205,196,0.6);color:#4ecdc4;';
            embedBtn.addEventListener('click', function() {
                var active = !!document.getElementById(CSS_ID);
                if (active) {
                    _deactivate();
                } else {
                    _activateAll();
                    embedBtn.textContent = 'App Mode ✓';
                    embedBtn.style.borderColor = 'rgba(78,205,196,0.6)';
                    embedBtn.style.color = '#4ecdc4';
                }
            });
            this.appendChild(embedBtn);
        }

        // Activate App Mode from external callers
        activate() {
            _activateAll();
            this.style.display = 'flex';
        }

        // Update status badge text
        setStatus(text) {
            if (this._statusEl) this._statusEl.textContent = text || '';
        }
    }

    // ── Core activate / deactivate ────────────────────────────────────────────

    function _activateAll() {
        _injectMaxCss();
        _injectShadowCss();
        _hideTreeStack();
    }

    function _deactivate() {
        _removeMaxCss();
        _removeShadowCss();
        _restoreTreeStack();
        document.querySelector('sg-app-banner').style.display = 'none';
    }

    // ── Regular-DOM CSS ───────────────────────────────────────────────────────

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

    // ── sg-layout shadow DOM CSS ──────────────────────────────────────────────

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

    // ── Tree stack show/hide ──────────────────────────────────────────────────
    // Uses getPanelElement('t-tree') to find the slotted element, then resolves
    // its slot name to find the shadow-DOM stack container that wraps it.

    function _getTreeStack() {
        var sgLayout = _getSgLayout();
        if (!sgLayout || typeof sgLayout.getPanelElement !== 'function') return null;
        var treeEl = sgLayout.getPanelElement('t-tree');
        if (!treeEl) return null;

        // treeEl is a light-DOM element assigned to a named slot. Its slot
        // attribute tells us which shadow <slot> shows it. Walk up from that
        // slot to find the enclosing .sgl-stack.
        var slotName = treeEl.getAttribute('slot');
        if (slotName && sgLayout.shadowRoot) {
            var slotEl = sgLayout.shadowRoot.querySelector('slot[name="' + slotName + '"]');
            if (slotEl) {
                var stack = slotEl.closest('.sgl-stack');
                if (stack) return { stack: stack, treeEl: treeEl };
            }
        }

        // Fallback: hide the panel element itself (tree content) and the first
        // .sgl-stack in the shadow root (the tree stack).
        if (sgLayout.shadowRoot) {
            var firstStack = sgLayout.shadowRoot.querySelector('.sgl-stack');
            if (firstStack) return { stack: firstStack, treeEl: treeEl };
        }
        return { stack: null, treeEl: treeEl };
    }

    function _hideTreeStack() {
        var res = _getTreeStack();
        if (!res) return;
        if (res.stack) res.stack.style.setProperty('display', 'none', 'important');
        if (res.treeEl) res.treeEl.style.setProperty('display', 'none', 'important');
    }

    function _restoreTreeStack() {
        var res = _getTreeStack();
        if (!res) return;
        if (res.stack) res.stack.style.removeProperty('display');
        if (res.treeEl) res.treeEl.style.removeProperty('display');
    }

    // ── Vault toggle (Vault ▾ button) ─────────────────────────────────────────
    // Temporarily shows vault nav + tree without fully exiting App Mode.

    function _setVaultChromeVisible(show) {
        var shell = document.querySelector('vault-shell');
        var nav   = shell && shell.querySelector('vault-nav');
        if (nav) {
            if (show) { nav.style.removeProperty('display'); }
            else      { nav.style.setProperty('display', 'none', 'important'); }
        }
        var res = _getTreeStack();
        if (res) {
            if (show) {
                if (res.stack)  res.stack.style.removeProperty('display');
                if (res.treeEl) res.treeEl.style.removeProperty('display');
            } else {
                _hideTreeStack();
            }
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
