/* =================================================================================
   SGraph Vault — <sg-embed-frame>  (controlled external-resource embed)
   v0.1.0 — Phase 2

   Renders an EXTERNAL resource (image / video / web page / app) that a `*.link.json`
   points at, with a hard security boundary:

     • DEFAULT-DENY: an embedded page/app CANNOT read the vault. It gets NO VFS bridge,
       NO `window.sg`, and the host registers NO `message` listener for it.
     • Click-to-load: nothing contacts the third party until the user clicks Load
       (privacy — opening a vault never phones home).
     • Per-type rendering:
         image          → <img>           (media element, referrerpolicy=no-referrer)
         video (file)   → <video controls> (media element)
         video provider → provider <iframe> (cross-origin; sandbox allows the player)
         link / app     → sandboxed <iframe> — NO allow-same-origin, NO bridge
     • A sticky guarantee banner sits above iframe embeds ("CANNOT read this vault").

   This component shares NO code with app-shell's VFS bridge. It only ever points an
   <img>/<video>/<iframe> at an external URL.

   Usage: el.setResource({ type, url, provider, label }); host appends it to a panel.
   ================================================================================= */

(function () {
    'use strict';

    class SgEmbedFrame extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });
            this._res = null;
            this._loaded = false;
        }

        setResource(res) { this._res = res || {}; this._loaded = false; this._render(); }

        _host(url) { try { return new URL(url).host; } catch (_) { return 'an external site'; } }
        _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        // youtu.be/<id>, watch?v=<id>, /shorts/<id>, or an /embed/ URL → embed URL
        _youtubeEmbed(url) {
            try {
                const u = new URL(url);
                if (u.pathname.startsWith('/embed/')) return 'https://www.youtube.com/embed/' + u.pathname.split('/')[2];
                let id = '';
                if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
                else if (u.searchParams.get('v'))    id = u.searchParams.get('v');
                else if (u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1];
                id = (id || '').split(/[/?&]/)[0];
                return id ? 'https://www.youtube.com/embed/' + encodeURIComponent(id) : url;
            } catch (_) { return url; }
        }

        // is this type rendered as an iframe (vs a media element)?
        _isIframeType(type, provider) { return type === 'link' || type === 'app' || (type === 'video' && !!provider); }

        _render() {
            const r = this._res || {};
            const type = r.type || 'link', url = r.url || '', host = this._host(url);
            const label = this._esc(r.label || host);
            const isIframe = this._isIframeType(type, r.provider);

            this.shadowRoot.innerHTML = `
                <style>
                    :host { display: flex; flex-direction: column; height: 100%; width: 100%; background: #0d1117; color: #e2e8f0;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                    .ef-banner { flex: 0 0 auto; display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.7rem;
                                 font-size: 0.78rem; background: #12122a; border-bottom: 1px solid #2a2a4a; }
                    .ef-lock { color: #4ECDC4; }
                    .ef-host { color: #8892a4; }
                    .ef-grow { flex: 1; }
                    .ef-why  { background: none; border: 1px solid #2a2a4a; color: #8892a4; border-radius: 4px;
                               font-size: 0.72rem; padding: 0.1rem 0.45rem; cursor: pointer; }
                    .ef-body { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: auto; }
                    .ef-body img, .ef-body video { max-width: 100%; max-height: 100%; }
                    .ef-frame { border: 0; width: 100%; height: 100%; display: block; background: #fff; }
                    .ef-ph { text-align: center; padding: 2rem; max-width: 460px; }
                    .ef-ph-icon { font-size: 2rem; margin-bottom: 0.5rem; }
                    .ef-ph-note { color: #8892a4; font-size: 0.82rem; margin: 0.5rem 0 1rem; }
                    .ef-ph-host { color: #cbd5e1; font-weight: 600; }
                    .ef-load { background: #4ECDC4; color: #0a0a18; border: none; border-radius: 5px; font-weight: 700;
                               font-size: 0.85rem; padding: 0.55rem 1.1rem; cursor: pointer; }
                    .ef-load:hover { background: #3dbdb5; }
                    .ef-why-detail { font-size: 0.78rem; color: #8892a4; padding: 0.5rem 0.7rem; border-bottom: 1px solid #2a2a4a; background: #0f0f22; }
                    .ef-hidden { display: none; }
                </style>
                ${isIframe ? `
                <div class="ef-banner">
                    <span class="ef-lock">🔒</span>
                    <span>External window · <span class="ef-host">${this._esc(host)}</span> · <strong>cannot read this vault</strong></span>
                    <span class="ef-grow"></span>
                    <button class="ef-why" id="ef-why" type="button">Why?</button>
                </div>
                <div class="ef-why-detail ef-hidden" id="ef-why-detail">
                    This page is loaded in a sandboxed frame from another website. It has no access to your
                    vault's files or keys — it is just shown here. (Default-deny.)
                </div>` : `
                <div class="ef-banner"><span class="ef-lock">🔒</span><span>External ${this._esc(type)} · <span class="ef-host">${this._esc(host)}</span></span></div>`}
                <div class="ef-body" id="ef-body">
                    <div class="ef-ph" id="ef-ph">
                        <div class="ef-ph-icon">${type === 'image' ? '🖼' : type === 'video' ? '▶' : type === 'app' ? '🧩' : '🌐'}</div>
                        <div><strong>${label}</strong></div>
                        <div class="ef-ph-note">Loading this will contact <span class="ef-ph-host">${this._esc(host)}</span>.
                            Nothing is sent from your vault.</div>
                        <button class="ef-load" id="ef-load" type="button">Load external ${this._esc(type)}</button>
                    </div>
                </div>
            `;

            const why = this.shadowRoot.getElementById('ef-why');
            if (why) why.addEventListener('click', () => {
                const d = this.shadowRoot.getElementById('ef-why-detail');
                if (d) d.classList.toggle('ef-hidden');
            });
            const load = this.shadowRoot.getElementById('ef-load');
            if (load) load.addEventListener('click', () => this._load());
        }

        // Replace the placeholder with the actual embed (click-to-load).
        _load() {
            if (this._loaded) return;
            this._loaded = true;
            const r = this._res || {}, type = r.type || 'link', url = r.url || '';
            const body = this.shadowRoot.getElementById('ef-body');
            if (!body) return;
            let node;
            if (type === 'image') {
                node = document.createElement('img');
                node.referrerPolicy = 'no-referrer';
                node.loading = 'lazy';
                node.src = url;
            } else if (type === 'video' && !r.provider) {
                node = document.createElement('video');
                node.controls = true;
                node.src = url;
            } else {
                // iframe types (web page / app / video-provider). NO bridge, NO message listener.
                node = document.createElement('iframe');
                node.className = 'ef-frame';
                if (type === 'video' && r.provider === 'youtube') {
                    node.src = this._youtubeEmbed(url);
                    node.sandbox = 'allow-scripts allow-same-origin allow-presentation';   // provider player
                    node.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
                } else {
                    node.src = url;
                    node.sandbox = 'allow-scripts allow-popups allow-presentation';        // NO allow-same-origin
                }
            }
            body.innerHTML = '';
            body.appendChild(node);
        }
    }

    if (!customElements.get('sg-embed-frame')) customElements.define('sg-embed-frame', SgEmbedFrame);
})();
