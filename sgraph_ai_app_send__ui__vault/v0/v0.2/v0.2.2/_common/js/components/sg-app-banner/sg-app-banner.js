/* =================================================================================
   SGraph Vault — sg-app-banner
   v0.2.2 — Fixed-position app banner for maximised chrome mode.

   Activated by app.json: { "chrome": { "mode": "maximised" } }
   Hides vault chrome (header, nav) and replaces it with a minimal branded bar:
     SG/Send brand · status badge slot (stubbed) · Refresh · Vault ▾ · App Mode toggle
   ================================================================================= */

(function() {
    'use strict';

    var CSS_ID  = 'sg-app-banner-max-css';
    var MAX_CSS = [
        'vault-shell vault-header { display:none !important; }',
        'vault-shell vault-nav    { display:none !important; }',
        'vault-shell .vs-body     { padding-top:0 !important; }',
        'vault-shell .vs-shell    { padding-top:2.25rem; }'
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
            this.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:8000',
                'display:flex', 'align-items:center', 'gap:0.6rem',
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

            // Status badge slot — empty, reserved for vault-app events
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
                if (shell) shell.dispatchEvent(new CustomEvent('vault-header-refresh', { bubbles: true, composed: true }));
            });
            this.appendChild(refreshBtn);

            // Vault menu toggle (shows/hides vault nav)
            var vaultBtn = _btn('Vault ▾', 'Show / hide vault file browser');
            var self = this;
            vaultBtn.addEventListener('click', function() {
                self._vaultOpen = !self._vaultOpen;
                var shell = document.querySelector('vault-shell');
                var nav   = shell && shell.querySelector('vault-nav');
                if (nav) {
                    if (self._vaultOpen) {
                        nav.style.removeProperty('display');
                        nav.style.setProperty('display', '', 'important');
                    } else {
                        nav.style.setProperty('display', 'none', 'important');
                    }
                }
                vaultBtn.textContent = self._vaultOpen ? 'Vault ▴' : 'Vault ▾';
            });
            this.appendChild(vaultBtn);
            this._vaultBtn = vaultBtn;

            // Embedded / App Mode toggle
            var embedBtn = _btn('App Mode ✓', 'Exit maximised chrome mode — restore vault chrome');
            embedBtn.style.cssText += ';border-color:rgba(78,205,196,0.6);color:#4ecdc4;';
            embedBtn.addEventListener('click', function() {
                var active = !!document.getElementById(CSS_ID);
                if (active) {
                    _removeMaxCss();
                    document.querySelector('sg-app-banner').style.display = 'none';
                } else {
                    _injectMaxCss();
                    document.querySelector('sg-app-banner').style.display = '';
                    embedBtn.textContent = 'App Mode ✓';
                    embedBtn.style.cssText += ';border-color:rgba(78,205,196,0.6);color:#4ecdc4;';
                }
            });
            this.appendChild(embedBtn);
            this._embedBtn = embedBtn;
        }

        // Called externally to activate maximised chrome mode
        activate() {
            _injectMaxCss();
        }

        // Update the status slot text (for vault-app events)
        setStatus(text) {
            if (this._statusEl) this._statusEl.textContent = text || '';
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

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

    customElements.define('sg-app-banner', SGAppBanner);
})();
