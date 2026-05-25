/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Transparency Panel Component
   v0.2.0 — Consolidated from v0.1.0 (unchanged logic, consolidated i18n)

   Displays what the server stored, what it encrypted, and what it did NOT store.

   Usage:
     <send-transparency></send-transparency>
     element.setData({ your_ip: '...', upload_timestamp: '...', ... })
   ═══════════════════════════════════════════════════════════════════════════════ */

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
        if (this._onLocaleChanged) document.removeEventListener('locale-changed', this._onLocaleChanged);
    }

    static get observedAttributes() { return ['data']; }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'data' && newValue) {
            try {
                this.transparencyData = JSON.parse(newValue);
                this.render();
            } catch (e) { /* invalid JSON */ }
        }
    }

    setData(data) {
        this.transparencyData = data;
        this.render();
    }

    loadDataFromAttribute() {
        const attr = this.getAttribute('data');
        if (attr) {
            try {
                this.transparencyData = JSON.parse(attr);
                this.render();
            } catch (e) { /* ignore */ }
        }
    }

    t(key, params) { return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key; }

    render() {
        if (!this.transparencyData) { this.innerHTML = ''; return; }

        const data = this.transparencyData;
        this.innerHTML = `
            <div class="transparency">
                <div class="transparency__title">${this.t('transparency.title')}</div>
                ${this.renderStoredFields(data)}
                ${this.renderEncryptedFields(data)}
                ${this.renderNotStoredFields(data)}
                <div class="transparency__footer">${this.t('transparency.footer')}</div>
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
            fields.push({ label, value: SendHelpers.formatTimestamp(ts) });
        }
        if (data.file_size_bytes) {
            fields.push({ label: this.t('transparency.file_size'), value: SendHelpers.formatBytes(data.file_size_bytes) });
        }
        if (data.encryption_method) {
            fields.push({ label: this.t('transparency.encryption_method'), value: data.encryption_method });
        }
        if (fields.length === 0) return '';

        return `
            <div class="transparency__section-label">${this.t('transparency.section.stored')}</div>
        ` + fields.map(f => `
            <div class="transparency__row">
                <span class="transparency__label">${f.label}</span>
                <span class="transparency__value">${f.value}</span>
            </div>
        `).join('');
    }

    renderEncryptedFields(data) {
        const encrypted = data.encrypted || [];
        if (encrypted.length === 0) return '';
        const labels = {
            file_name:    this.t('transparency.label.file_name'),
            file_content: this.t('transparency.label.file_content')
        };
        return `
            <div class="transparency__section-label">${this.t('transparency.section.encrypted')}</div>
            ${encrypted.map(field => `
                <div class="transparency__row">
                    <span class="transparency__label">${labels[field] || field}</span>
                    <span class="transparency__value transparency__value--encrypted">${this.t('transparency.encrypted')}</span>
                </div>
            `).join('')}
        `;
    }

    renderNotStoredFields(data) {
        const notStored = data.not_stored || ['decryption_key'];
        const labels = {
            file_name: this.t('transparency.label.file_name'),
            file_content: this.t('transparency.label.file_content'),
            decryption_key: this.t('transparency.label.decryption_key'),
            raw_ip: this.t('transparency.label.raw_ip')
        };
        const descriptions = {
            file_name: this.t('transparency.not_stored'),
            file_content: this.t('transparency.encrypted'),
            decryption_key: this.t('transparency.key_not_stored'),
            raw_ip: this.t('transparency.not_stored')
        };
        return `
            <div class="transparency__section-label">${this.t('transparency.section.not_stored')}</div>
            ${notStored.map(field => `
                <div class="transparency__row">
                    <span class="transparency__label">${labels[field] || field}</span>
                    <span class="transparency__value transparency__value--not-stored">${descriptions[field] || this.t('transparency.not_stored')}</span>
                </div>
            `).join('')}
        `;
    }
}

customElements.define('send-transparency', SendTransparency);
