/* =================================================================================
   SGraph Vault — sg-app-banner
   v0.2.2 — Fixed-position app banner for maximised chrome mode.

   Activated by app.json: { "entry": "...", "present": true }
   or by clicking the "App Mode" button on any HTML file in the vault.

   In App Mode only TWO things are visible:
     1. This banner (SG/Send brand · status · Reload App · Open Vault · App Mode)
     2. The HTML iframe content filling all remaining viewport height

   Strategy — two-layer approach:
     Layer 1 (CSS): hide vault-shell chrome (header, nav, status bar)
     Layer 2 (frame lift): apply position:fixed to the iframe wrapper div so
       it fills the viewport below the banner, covering all sg-layout chrome
       (tab bar, resize handle, collapse buttons, tree panel) without moving
       the iframe node in the DOM (which would reload it).

   If no HTML iframe is present at activate time, Layer 1 + shadow CSS act
   as fallback; frame-lift is applied once the iframe appears.
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
        'vault-shell .vs-shell         { padding-top:2.25rem !important; }',
        'send-browse .sb-header        { display:none !important; }',
        'send-browse .sb-file__actions { display:none !important; }',
        'send-browse .sb-file__markdown { max-width:100% !important; }'
    ].join('\n');

    // Shadow-DOM chrome to hide (sg-layout internals + page layout action bar)
    var SHADOW_CSS = [
        '.sgl-tab-bar       { display:none !important; }',
        '.sgl-resize-handle { display:none !important; }',
        '.plr-source-bar    { display:none !important; }'
    ].join('\n');

    // Saved state for frame-lift restore
    var _savedLiftEl       = null;  // the element that was lifted
    var _savedWrapperStyle = null;
    var _savedIframeStyle  = null;

    // ── Component ────────────────────────────────────────────────────────────

    class SGAppBanner extends HTMLElement {
        connectedCallback() {
            if (this._built) return;
            this._built = true;
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
            this.appendChild(_el('span', {
                style: 'color:#4ecdc4;font-weight:700;letter-spacing:0.05em;flex-shrink:0;font-size:12px;',
                textContent: 'SG/Send'
            }));

            // Status badge — reserved for vault-app events (VLT-026)
            var status = _el('span', {
                className: 'sg-app-banner__status',
                style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
                       'color:rgba(226,232,240,0.45);font-size:11px;'
            });
            this.appendChild(status);
            this._statusEl = status;

            // Open Vault — exits App Mode and returns to full vault view
            var openVaultBtn = _btn('Open Vault', 'Exit app mode and return to vault');
            openVaultBtn.addEventListener('click', function() { _deactivate(); });
            this.appendChild(openVaultBtn);

            // App Mode — label only, not a button
            this.appendChild(_el('span', {
                style: 'color:#4ecdc4;font-size:11px;flex-shrink:0;' +
                       'padding:2px 8px;border:1px solid rgba(78,205,196,0.3);border-radius:4px;',
                textContent: 'App Mode'
            }));
        }

        // Called by the "App Mode" button in vault-browse-edit or app.json handler.
        // liftEl: the element to lift to full-viewport (optional — falls back to
        // .sb-file__html-frame wrapper or .sb-file__content for the app.json path).
        activate(liftEl) {
            window._sgAppModeUserExited = false;
            // Drop any previous lift before re-activating (e.g. switching from
            // _page.json to an HTML file while App Mode is active).
            _dropContentFrame();
            _activateAll(liftEl);
            this.style.display = 'flex';
        }

        setStatus(text) {
            if (this._statusEl) this._statusEl.textContent = text || '';
        }
    }

    // ── Core activate / deactivate ────────────────────────────────────────────

    function _activateAll(liftEl) {
        _injectMaxCss();
        // Always inject shadow CSS and hide the tree so sg-layout chrome never
        // leaks through regardless of which lift path is taken.
        _injectShadowCss();
        _hideTreeStack();
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(function() { window.dispatchEvent(new Event('resize')); });
        // Try to lift the provided element (or the HTML iframe wrapper on the
        // app.json path). If nothing is present yet, wait for content to appear.
        if (!_liftContentFrame(liftEl)) {
            _waitForIframeAndLift();
        }
    }

    function _deactivate() {
        window._sgAppModeUserExited = true;
        _dropContentFrame();
        _removeMaxCss();
        _removeShadowCss();
        // Belt-and-suspenders: force all sgl-stacks visible.
        // On initial app.json activation the fallback path hides the tree stack
        // in shadow DOM; after Reload App that state persists until deactivation.
        var sgLayout = _getSgLayout();
        if (sgLayout && sgLayout.shadowRoot) {
            sgLayout.shadowRoot.querySelectorAll('.sgl-stack').forEach(function(s) {
                s.style.removeProperty('display');
            });
        }
        _restoreTreeStack();
        var banner = document.querySelector('sg-app-banner');
        if (banner) banner.style.display = 'none';
        // sg-layout caches panel dimensions. While the wrapper was position:fixed
        // the content panel had no in-flow children and may have collapsed to 0px.
        // Dispatch resize twice to ensure sg-layout re-measures in all cases.
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(function() {
            window.dispatchEvent(new Event('resize'));
        });
    }

    // ── Reload App ────────────────────────────────────────────────────────────
    // Re-fetches the current file via vault-header-refresh, then re-lifts
    // the new iframe wrapper once it appears in the DOM.
    // A cover div at z-index:7998 fills the viewport below the banner during
    // re-render so the brief gap between old wrapper removal and new lift is
    // not visible. Saved style pointers are cleared so _liftContentFrame
    // captures fresh values from the new wrapper.

    function _reloadAndLift() {
        _savedLiftEl       = null;
        _savedWrapperStyle = null;
        _savedIframeStyle  = null;

        var cover = document.createElement('div');
        cover.style.cssText = [
            'position:fixed', 'top:2.25rem', 'left:0', 'right:0', 'bottom:0',
            'z-index:7998', 'background:#0a0a18'
        ].join(';');
        document.body.appendChild(cover);

        _waitForIframeAndLift(function() { cover.remove(); });

        var shell = document.querySelector('vault-shell');
        if (shell) {
            shell.dispatchEvent(new CustomEvent('vault-header-refresh', { bubbles: true, composed: true }));
        }
    }

    // ── Layer 2: frame lift ───────────────────────────────────────────────────
    // Applies position:fixed to the iframe wrapper div.
    // The iframe stays in its original DOM position — no reload.

    function _liftContentFrame(liftEl) {
        var el = liftEl || null;
        if (!el) {
            // App.json path: no element provided.
            // Try HTML iframe wrapper first, then fall back to any file content element.
            var iframeEl = document.querySelector('.sb-file__html-frame');
            if (iframeEl) {
                el = iframeEl.parentElement;
            } else {
                el = document.querySelector('.sb-file__content');
            }
            if (!el) return false;
        }

        _savedLiftEl       = el;
        _savedWrapperStyle = el.style.cssText;

        el.style.cssText = [
            'position:fixed', 'top:2.25rem', 'left:0', 'right:0', 'bottom:0',
            'z-index:7999', 'display:flex', 'flex-direction:column', 'overflow-y:auto'
        ].join(';');

        // If there's an HTML iframe inside, fix its height (was height:0 in flex layout)
        var htmlIframe = el.querySelector('.sb-file__html-frame');
        if (htmlIframe) {
            _savedIframeStyle = htmlIframe.style.cssText;
            htmlIframe.style.cssText = 'flex:1;border:none;width:100%;height:100%;min-height:0;background:#fff;color-scheme:light;';
        } else {
            _savedIframeStyle = null;
        }

        return true;
    }

    function _dropContentFrame() {
        var el = _savedLiftEl;
        if (!el) return;

        el.style.cssText = _savedWrapperStyle || '';

        if (_savedIframeStyle !== null) {
            var htmlIframe = el.querySelector('.sb-file__html-frame');
            if (htmlIframe) {
                htmlIframe.style.cssText = _savedIframeStyle ||
                    'flex:1;border:none;width:100%;height:0;min-height:0;';
            }
        }

        _savedLiftEl       = null;
        _savedWrapperStyle = null;
        _savedIframeStyle  = null;
    }

    // Watches for file content to appear — HTML iframe, any other content element, or
    // a _page.json panel (in sg-layout shadow DOM, signalled via sg-page-layout-ready).
    // onLifted callback called when lift succeeds or on timeout.
    function _waitForIframeAndLift(onLifted) {
        var done = false;

        function finish(liftEl) {
            if (done) return;
            done = true;
            window.removeEventListener('sg-page-layout-ready', onPageLayoutReady);
            observer.disconnect();
            _liftContentFrame(liftEl);
            if (typeof onLifted === 'function') onLifted();
        }

        // _page.json panels live in sg-layout's shadow DOM — not reachable by
        // document.querySelector. vault-browse-edit patches _openFolderPage to
        // dispatch this event with the panel element reference.
        function onPageLayoutReady(e) {
            finish(e.detail && e.detail.el ? e.detail.el : undefined);
        }
        window.addEventListener('sg-page-layout-ready', onPageLayoutReady);

        var observer = new MutationObserver(function() {
            // Light-DOM file content (HTML iframe, PDF, markdown, images, etc.)
            if (document.querySelector('.sb-file__html-frame') ||
                document.querySelector('.sb-file__content')) {
                finish(undefined);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Safety: disconnect after 5 s
        setTimeout(function() { finish(undefined); }, 5000);
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
