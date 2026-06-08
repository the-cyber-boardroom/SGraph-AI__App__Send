/**
 * vault-api-log.js
 *
 * <vt-api-log> — scrolling log of every fetch() call made during the session.
 * Installs a minimal fetch proxy on first element connect.
 * Token values are masked as *** in the URL column (NEVER logged in plaintext).
 */

const LOG_EVENTS = [];
let _logListeners = [];
let _proxyInstalled = false;

/* ── Token masking ────────────────────────────────────────────────────────── */
// Masks any word-word-NNNN or ro-word-word-NNNN pattern after the last slash.
function maskUrl(url) {
    return String(url).replace(
        /(\/)(ro-)?([a-z]+-[a-z]+-\d{4})(\/|$|\?|#)/g,
        (_, slash, ro, _token, end) => `${slash}***${end}`
    ).replace(
        /(\/)(ro-)?([a-z]+-[a-z]+-\d{4})$/,
        (_, slash, ro, _token) => `${slash}***`
    );
}

/* ── Fetch proxy (installed once globally) ────────────────────────────────── */
function installFetchProxy() {
    if (_proxyInstalled) return;
    _proxyInstalled = true;

    const _origFetch = window.fetch.bind(window);
    window.fetch = async function (resource, init) {
        const urlStr = typeof resource === 'string' ? resource
            : (resource instanceof Request ? resource.url : String(resource));
        const method = (init && init.method) ? init.method.toUpperCase()
            : (resource instanceof Request ? resource.method : 'GET');
        const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

        let response;
        let status = '???';
        let extra  = '';
        try {
            response = await _origFetch(resource, init);
            status   = String(response.status);
            if (urlStr.includes('check-token')) {
                extra = response.ok ? 'valid' : 'not found';
            }
        } catch (err) {
            status = 'ERR';
            extra  = err.message || String(err);
            _addEntry({ ts, method, url: maskUrl(urlStr), status, extra });
            throw err;
        }

        _addEntry({ ts, method, url: maskUrl(urlStr), status, extra });
        return response;
    };
}

function _addEntry(entry) {
    LOG_EVENTS.push(entry);
    _logListeners.forEach(fn => { try { fn(entry); } catch (_) {} });
}

function subscribeToLog(fn) {
    _logListeners.push(fn);
    return () => { _logListeners = _logListeners.filter(f => f !== fn); };
}

/* ── <vt-api-log> custom element ──────────────────────────────────────────── */
class VtApiLog extends HTMLElement {
    constructor() {
        super();
        this._unsubscribe = null;
    }

    connectedCallback() {
        installFetchProxy();
        this._render();
        this._unsubscribe = subscribeToLog(() => this._appendLatest());
    }

    disconnectedCallback() {
        if (this._unsubscribe) this._unsubscribe();
    }

    _render() {
        this.innerHTML = `
            <div class="al-wrap">
                <div class="al-toolbar">
                    <span class="al-title">API Log</span>
                    <span class="al-count" id="al-count">0 calls</span>
                    <button class="pk-btn" id="al-clear-btn">Clear</button>
                </div>
                <div class="al-list" id="al-list"></div>
            </div>
            <style>
                .al-wrap { display:flex; flex-direction:column; height:100%; font-size:0.75rem; }
                .al-toolbar { display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.7rem;
                              border-bottom:1px solid var(--border); flex-shrink:0; }
                .al-title { font-weight:700; color:var(--text); }
                .al-count { color:var(--muted); font-size:0.68rem; margin-right:auto; }
                .al-list { flex:1; overflow-y:auto; padding:0.3rem 0; font-family:monospace; }
                .al-entry { display:grid; grid-template-columns:90px 50px 1fr 50px 80px;
                            gap:0.4rem; align-items:baseline; padding:0.18rem 0.7rem;
                            border-bottom:1px solid var(--border); }
                .al-entry:last-child { border-bottom:none; }
                .al-ts    { color:var(--muted); font-size:0.68rem; }
                .al-meth  { color:var(--teal); font-size:0.72rem; }
                .al-url   { color:var(--text); word-break:break-all; }
                .al-arrow { color:var(--muted); text-align:center; }
                .al-status { font-size:0.72rem; }
                .al-status--ok   { color:var(--teal); }
                .al-status--warn { color:var(--warn); }
                .al-status--err  { color:var(--err); }
                .al-extra { color:var(--muted); font-size:0.68rem; grid-column:2/-1;
                            padding-left:0.3rem; display:none; }
                .al-entry:hover .al-extra { display:block; }
                .al-empty { padding:0.8rem 0.7rem; color:var(--muted); font-style:italic; font-size:0.8rem; }
            </style>`;

        this.querySelector('#al-clear-btn').addEventListener('click', () => this._clear());
        this._renderAll();
    }

    _renderAll() {
        const list = this.querySelector('#al-list');
        if (!list) return;
        if (LOG_EVENTS.length === 0) {
            list.innerHTML = '<div class="al-empty">No API calls yet.</div>';
        } else {
            list.innerHTML = LOG_EVENTS.map(e => this._entryHtml(e)).join('');
            list.scrollTop = list.scrollHeight;
        }
        this._updateCount();
    }

    _appendLatest() {
        const list = this.querySelector('#al-list');
        if (!list) return;
        // Remove empty placeholder
        const empty = list.querySelector('.al-empty');
        if (empty) empty.remove();
        const entry = LOG_EVENTS[LOG_EVENTS.length - 1];
        list.insertAdjacentHTML('beforeend', this._entryHtml(entry));
        list.scrollTop = list.scrollHeight;
        this._updateCount();
    }

    _updateCount() {
        const el = this.querySelector('#al-count');
        if (el) el.textContent = `${LOG_EVENTS.length} call${LOG_EVENTS.length !== 1 ? 's' : ''}`;
    }

    _clear() {
        LOG_EVENTS.length = 0;
        this._renderAll();
    }

    _entryHtml(e) {
        const statusClass = e.status.startsWith('2') ? 'al-status--ok'
            : (e.status.startsWith('4') || e.status.startsWith('5') || e.status === 'ERR')
                ? 'al-status--err' : 'al-status--warn';
        const extraHtml = e.extra ? `<span class="al-extra">${_esc(e.extra)}</span>` : '';
        return `<div class="al-entry">
            <span class="al-ts">${_esc(e.ts)}</span>
            <span class="al-meth">${_esc(e.method)}</span>
            <span class="al-url">${_esc(e.url)}</span>
            <span class="al-arrow">→</span>
            <span class="al-status ${statusClass}">${_esc(e.status)}${e.extra && !e.extra.includes(' ') ? ' ' + _esc(e.extra) : ''}</span>
            ${extraHtml}
        </div>`;
    }
}

function _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

customElements.define('vt-api-log', VtApiLog);
