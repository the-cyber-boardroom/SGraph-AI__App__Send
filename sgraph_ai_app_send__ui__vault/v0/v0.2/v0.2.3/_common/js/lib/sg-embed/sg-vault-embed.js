/* =================================================================================
   SgVaultEmbed — vendorable parent-side embed helper (one script tag on ANY website)

   Lets a third-party page (e.g. sgit.ai) embed a live vault surface — the main
   vault UI (file browser + SGit history) or the App UI (kernel + HUD) — with the
   official handshake, no hand-rolled postMessage:

     <script src="https://dev.vault.sgraph.ai/_common/js/lib/sg-embed/sg-vault-embed.js"></script>

     <!-- declarative -->
     <sg-vault-embed surface="vault" key="<64-hex read key>:<vault_id>"
                     style="display:block;height:600px"></sg-vault-embed>

     <!-- or programmatic -->
     SgVaultEmbed.mount(el, 'sgit_rk1_…:<vault_id>', { surface: 'app' }).then(...)

   surface="vault" → /en-gb/vault/?embed=1 (main vault UI: files, SGit view)
   surface="app"   → /en-gb/app/?embed=1   (App UI: kernel shell + HUD, which itself
                                            hosts the inner vault-app iframe)

   ── One implementation, not two ──
   The complete handshake lives in _mountImpl below, written self-contained (its
   pure helpers arrive as ARGUMENTS) so app-shell injects THIS EXACT FUNCTION into
   the vault-app bridge via Function.prototype.toString() — the code a website
   vendors is byte-identical to the code `sg.vault.embed()` runs inside vault apps.
   The pure helpers themselves (SgEmbed.buildEmbedSrc / sanitizeSandbox) stay in
   sg-embed-helpers.js (unit-tested); when this file is vendored onto a page that
   doesn't have them, they are lazy-loaded from the SAME host this script came from.

   ── Security ──
   • sandbox: always allow-scripts only, plus narrow opt-ins; allow-same-origin and
     allow-popups-to-escape-sandbox are refused unconditionally (sanitizeSandbox).
   • The key is sent ONLY to the created iframe's window, pinned by event.source,
     with a concrete targetOrigin whenever the child's origin is concrete.
   • The `key` HTML attribute is for PUBLISHABLE credentials (a read key you have
     deliberately published — the sgit.ai case). For anything private, call
     SgVaultEmbed.mount() and keep the key out of the DOM/HTML source.
   • A read key grants READ ONLY — it cannot be escalated to write (independent
     PBKDF2 derivations). It does expose the vault's full history: publish only
     from a dedicated publish-vault.
   ================================================================================= */

(function () {
    'use strict';

    // Captured at LOAD time (currentScript is null later): the host this file was
    // vendored from — used both to lazy-load the pure helpers and as the default
    // vault host, so a third-party page needs zero configuration.
    var _scriptSrc = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
    var _scriptOrigin = '';
    try { _scriptOrigin = _scriptSrc ? new URL(_scriptSrc).origin : ''; } catch (_) {}

    var _helpersReady = null;
    function _ensureHelpers() {
        if (typeof SgEmbed !== 'undefined' && SgEmbed.sanitizeSandbox && SgEmbed.buildEmbedSrc) {
            return Promise.resolve();
        }
        if (_helpersReady) return _helpersReady;
        _helpersReady = new Promise(function (resolve, reject) {
            if (!_scriptOrigin) {
                reject(new Error('SgVaultEmbed: SgEmbed helpers missing and no script origin to load them from'));
                return;
            }
            var s = document.createElement('script');
            s.src     = _scriptOrigin + '/_common/js/components/app-shell/sg-embed-helpers.js';
            s.onload  = function () {
                if (typeof SgEmbed !== 'undefined') resolve();
                else reject(new Error('SgVaultEmbed: sg-embed-helpers.js loaded but SgEmbed missing'));
            };
            s.onerror = function () { reject(new Error('SgVaultEmbed: failed to load sg-embed-helpers.js')); };
            document.head.appendChild(s);
        });
        // A transient load failure must not poison every future mount() on the page:
        // drop the cached promise on rejection so the next call retries the load.
        _helpersReady.catch(function () { _helpersReady = null; });
        return _helpersReady;
    }

    // The complete parent-side handshake. SELF-CONTAINED BY CONTRACT: no closure
    // references — pure helpers arrive as arguments — so Function.toString()
    // injection into the app bridge (app-shell._embedHelperSrc) ships this exact
    // code. Do not add closure captures here.
    function _mountImpl(_sanitizeSandbox, _buildEmbedSrc, mount, key, opts) {
        opts = opts || {};
        if (!mount || !key) return Promise.reject(new Error('sg.vault.embed: a mount element and a vault key are required'));
        var nullOrigin = (location.origin === 'null');
        var host       = opts.host || (location.protocol + '//' + location.host);
        var src        = _buildEmbedSrc(host, nullOrigin, { surface: opts.surface, parentOrigin: location.origin });
        var sandbox    = _sanitizeSandbox(opts.sandbox);
        var expectedFrom; try { expectedFrom = new URL(host).origin; } catch (_) { expectedFrom = host; }
        return new Promise(function (resolve, reject) {
            var iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.setAttribute('sandbox', sandbox);
            iframe.style.cssText = opts.style || 'width:100%;height:100%;border:0;display:block';
            if (opts.allow) iframe.setAttribute('allow', opts.allow);
            mount.appendChild(iframe);
            var sent  = false;
            var timer = setTimeout(function () { fail(new Error('sg.vault.embed: handshake timed out')); }, opts.timeoutMs || 14000);
            function cleanup() { clearTimeout(timer); window.removeEventListener('message', onMsg); }
            // Failure also REMOVES the iframe — a dead frame must not squat in the
            // host page's layout, and a retry mount() must not stack a second frame
            // next to it. (opts.keepFrameOnError opts out, for debugging.)
            function fail(err) {
                cleanup();
                if (!opts.keepFrameOnError) { try { iframe.remove(); } catch (_) {} }
                reject(err);
            }
            function onMsg(e) {
                if (e.source !== iframe.contentWindow) return;                       // pin to THIS frame
                if (e.origin !== expectedFrom && e.origin !== 'null') return;        // host or opaque only
                var d = e.data; if (!d || typeof d !== 'object') return;
                if (d.sg === 'vault-embed-ready' && !sent) {
                    sent = true;
                    var to = (e.origin && e.origin !== 'null') ? e.origin : '*';     // concrete, else "*" to this one window
                    iframe.contentWindow.postMessage({ sg: 'vault-open', key: key, mode: opts.mode || 'auto', deepLink: opts.deepLink || '' }, to);
                } else if (d.sg === 'vault-ready') {
                    cleanup(); resolve({ vaultName: d.vaultName || '', fileCount: d.fileCount | 0, hasApp: !!d.hasApp, iframe: iframe });
                } else if (d.sg === 'vault-error') {
                    fail(new Error(d.message || 'vault error'));
                }
            }
            window.addEventListener('message', onMsg);
        });
    }

    // mount(el, key, opts) → Promise<{vaultName, fileCount, hasApp, iframe}>
    //   opts.surface: 'vault' | 'app' (default 'app')
    //   opts.host:    vault host origin; defaults to where THIS SCRIPT was loaded from
    //   opts.mode / opts.deepLink / opts.sandbox / opts.style / opts.allow / opts.timeoutMs
    function mount(el, key, opts) {
        opts = Object.assign({}, opts);
        if (!opts.host && _scriptOrigin) opts.host = _scriptOrigin;
        return _ensureHelpers().then(function () {
            return _mountImpl(SgEmbed.sanitizeSandbox, SgEmbed.buildEmbedSrc, el, key, opts);
        });
    }

    var SgVaultEmbed = { mount: mount, _mountImpl: _mountImpl };
    if (typeof window     !== 'undefined') window.SgVaultEmbed     = SgVaultEmbed;
    if (typeof globalThis !== 'undefined') globalThis.SgVaultEmbed = SgVaultEmbed;

    // ── <sg-vault-embed surface key [host] [mode] [deep-link] [sandbox-extras]> ──
    // Declarative wrapper over mount(). Fires 'vault-ready' / 'vault-error' events
    // on the element. Give the element a height (it defaults to display:block).
    if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined'
        && !customElements.get('sg-vault-embed')) {
        class SgVaultEmbedElement extends HTMLElement {
            connectedCallback() {
                if (this._mounted) return;
                this._mounted = true;
                if (!this.style.display) this.style.display = 'block';
                var key = this.getAttribute('key') || '';
                var extras = (this.getAttribute('sandbox-extras') || '').split(/\s+/).filter(Boolean);
                var self = this;
                mount(this, key, {
                    surface:  this.getAttribute('surface') || 'app',
                    host:     this.getAttribute('host')     || undefined,
                    mode:     this.getAttribute('mode')     || undefined,
                    deepLink: this.getAttribute('deep-link') || '',
                    sandbox:  extras
                }).then(function (info) {
                    self.dispatchEvent(new CustomEvent('vault-ready', { detail: info }));
                }).catch(function (err) {
                    console.error('[sg-vault-embed]', err);
                    self.dispatchEvent(new CustomEvent('vault-error', { detail: { error: err } }));
                });
            }

            // Reparenting an iframe RELOADS it (browser behaviour) — the reloaded
            // child would re-post vault-embed-ready to a listener that resolved and
            // detached long ago, leaving the frame stuck at 'Waiting for vault key…'
            // forever. So on disconnect, drop the dead frame and re-arm: the next
            // connectedCallback runs the full handshake again (and fires a fresh
            // vault-ready event on this element).
            disconnectedCallback() {
                this._mounted = false;
                try { this.innerHTML = ''; } catch (_) {}
            }
        }
        customElements.define('sg-vault-embed', SgVaultEmbedElement);
    }
})();
