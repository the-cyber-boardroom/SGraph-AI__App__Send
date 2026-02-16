/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — Transparency Panel Web Component
   v0.1.0 — Base major version

   Displays what the server stored and what it did NOT store.
   Receives transparency data via the 'data' attribute or setData() method.

   Usage:
     <send-transparency></send-transparency>

   Set data:
     element.setData({ your_ip: '...', upload_timestamp: '...', ... })
     — or —
     element.setAttribute('data', JSON.stringify({...}))
   ═══════════════════════════════════════════════════════════════════════════ */

class SendTransparency extends HTMLElement {

    constructor() {
        super();
        this.transparencyData = null;
    }

    connectedCallback() {
        this._onLocaleChanged = () => this.render();
        document.addEventListener('locale-changed', this._onLocaleChanged);
        this.render();
        this.loadDataFromAttribute();
    }

    disconnectedCallback() {
        if (this._onLocaleChanged) {
            document.removeEventListener('locale-changed', this._onLocaleChanged);
        }
    }

    static get observedAttributes() {
        return ['data'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'data' && newValue) {
            try {
                this.transparencyData = JSON.parse(newValue);
                this.render();
            } catch (e) {
                // Ignore invalid JSON
            }
        }
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Set transparency data programmatically.
     * @param {object} data — transparency payload from the API
     */
    setData(data) {
        this.transparencyData = data;
        this.render();
    }

    // ─── Rendering ─────────────────────────────────────────────────────────

    loadDataFromAttribute() {
        const attr = this.getAttribute('data');
        if (attr) {
            try {
                this.transparencyData = JSON.parse(attr);
                this.render();
            } catch (e) {
                // Ignore
            }
        }
    }

    t(key, params) {
        return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key;
    }

    render() {
        if (!this.transparencyData) {
            this.innerHTML = '';
            return;
        }

        const data = this.transparencyData;
        this.innerHTML = `
            <div class="transparency">
                <div class="transparency__title">${this.t('transparency.title')}</div>
                ${this.renderStoredFields(data)}
                ${this.renderNotStoredFields(data)}
                <div class="transparency__footer">
                    ${this.t('transparency.footer')}
                </div>
            </div>
        `;
    }

    renderStoredFields(data) {
        const fields = [];

        if (data.your_ip || data.ip_hash) {
            fields.push({ label: this.t('transparency.ip_address'), value: data.your_ip || data.ip_hash });
        }
        if (data.upload_timestamp || data.download_timestamp) {
            const ts    = data.upload_timestamp || data.download_timestamp;
            const label = data.upload_timestamp ? this.t('transparency.upload_time') : this.t('transparency.download_time');
            fields.push({ label, value: this.formatTimestamp(ts) });
        }
        if (data.file_size_bytes) {
            fields.push({ label: this.t('transparency.file_size'), value: this.formatBytes(data.file_size_bytes) });
        }

        return fields.map(f => `
            <div class="transparency__row">
                <span class="transparency__label">${f.label}</span>
                <span class="transparency__value">${f.value}</span>
            </div>
        `).join('');
    }

    renderNotStoredFields(data) {
        const notStored = data.not_stored || ['file_name', 'file_content', 'decryption_key'];
        const labels    = {
            file_name:      this.t('transparency.label.file_name'),
            file_content:   this.t('transparency.label.file_content'),
            decryption_key: this.t('transparency.label.decryption_key'),
            raw_ip:         this.t('transparency.label.raw_ip')
        };
        const descriptions = {
            file_name:      this.t('transparency.not_stored'),
            file_content:   this.t('transparency.encrypted'),
            decryption_key: this.t('transparency.key_not_stored'),
            raw_ip:         this.t('transparency.not_stored')
        };

        return notStored.map(field => `
            <div class="transparency__row">
                <span class="transparency__label">${labels[field] || field}</span>
                <span class="transparency__value transparency__value--not-stored">${descriptions[field] || this.t('transparency.not_stored')}</span>
            </div>
        `).join('');
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const k     = 1024;
        const i     = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);
        return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
    }

    formatTimestamp(ts) {
        try {
            const date = new Date(ts);
            return date.toUTCString();
        } catch (e) {
            return ts;
        }
    }
}

customElements.define('send-transparency', SendTransparency);
