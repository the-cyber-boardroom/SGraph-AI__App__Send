/* ═══════════════════════════════════════════════════════════════════════════
   SGraph Send — i18n Module
   v0.1.3 — Foundation

   Lightweight internationalisation for vanilla JS + Web Components.
   English strings are embedded inline so t() works synchronously.
   Additional locales load async via fetch.

   Usage:
     I18n.t('upload.drop_zone.label')
     I18n.t('download.info.download_count', { count: 3 })
     I18n.setLocale('pt')

   Events:
     'locale-changed' on document — components should re-render
   ═══════════════════════════════════════════════════════════════════════════ */

const I18n = {

    locale: 'en',

    // English strings embedded inline — t() always works, even before async init
    strings: {
        en: {
            // ─── App ────────────────────────────────────────────────────
            'app.title':                        'SGraph Send',
            'app.subtitle':                     'Zero-knowledge encrypted file sharing',

            // ─── Upload: Mode ───────────────────────────────────────────
            'upload.mode.file':                 'File',
            'upload.mode.text':                 'Text',

            // ─── Upload: Drop Zone ──────────────────────────────────────
            'upload.drop_zone.label':           'Drop your file here',
            'upload.drop_zone.hint':            'or click to browse',
            'upload.drop_zone.encrypted_hint':  'Encrypted in your browser before upload',

            // ─── Upload: Text Input ─────────────────────────────────────
            'upload.text.placeholder':          'Type or paste your text here',
            'upload.text.char_count':           '{count} characters',

            // ─── Upload: Buttons ────────────────────────────────────────
            'upload.button.encrypt_upload':     'Encrypt & Upload',
            'upload.button.encrypt_send':       'Encrypt & Send',

            // ─── Upload: Progress ───────────────────────────────────────
            'upload.progress.encrypting':       'Encrypting...',
            'upload.progress.uploading':        'Uploading...',

            // ─── Upload: Result ─────────────────────────────────────────
            'upload.result.file_success':       'Your file has been encrypted and uploaded.',
            'upload.result.text_success':       'Your text has been encrypted and uploaded.',
            'upload.result.share_link':         'Share this link',
            'upload.result.copy_link':          'Copy link',
            'upload.result.show_separate_key':  'Share key separately',
            'upload.result.hide_key':           'Hide key',
            'upload.result.link_only':          'Link only',
            'upload.result.decryption_key':     'Decryption key',
            'upload.result.copy':               'Copy',
            'upload.guidance.split_channels':   'For best security, share the link and the key via <strong>different channels</strong> (e.g. link via email, key via messaging app).',

            // ─── Upload: Text Drop ────────────────────────────────────────
            'upload.text.drop_hint':            'You can also drop a text file here',

            // ─── Upload: Send Another ─────────────────────────────────────
            'upload.result.send_another':       'Send another',

            // ─── Upload: Errors ─────────────────────────────────────────
            'upload.error.empty_text':          'Please enter some text to encrypt.',
            'upload.error.upload_failed':       'Upload failed. Please try again.',

            // ─── Download: Loading ──────────────────────────────────────
            'download.loading':                 'Loading transfer info...',

            // ─── Download: Info ─────────────────────────────────────────
            'download.info.encrypted_file':     'Encrypted file',
            'download.info.encrypted_text':     'Encrypted text',
            'download.info.uploaded':           'Uploaded {timestamp}',
            'download.info.download_count':     'Downloaded {count} time(s)',

            // ─── Download: Key Input ────────────────────────────────────
            'download.key.label':               'Decryption key',
            'download.key.placeholder':         'Paste the decryption key here',
            'download.button.decrypt_download': 'Download & Decrypt',
            'download.button.decrypt_view':     'Decrypt & View',

            // ─── Download: Progress ─────────────────────────────────────
            'download.progress.decrypting':     'Downloading and decrypting...',

            // ─── Download: Result ───────────────────────────────────────
            'download.result.file_success':     'File decrypted and saved successfully.',
            'download.result.text_success':     'Text decrypted successfully.',
            'download.result.copy_text':        'Copy to clipboard',
            'download.result.download_file':    'Download as file',

            // ─── Download: Send Another ───────────────────────────────────
            'download.result.send_another':     'Send your own',

            // ─── Download: History ────────────────────────────────────────
            'download.history.title':           'Recent downloads',
            'download.history.privacy':         'Stored in your browser. Anyone with access to this device can view these.',
            'download.history.clear':           'Clear history',
            'download.history.empty':           'No recent downloads.',
            'download.history.text_preview':    'Text',
            'download.history.file_label':      'File',

            // ─── Download: Errors ───────────────────────────────────────
            'download.error.no_id':             'No transfer ID found in URL. Please check your link.',
            'download.error.not_ready':         'This transfer is not yet available for download.',
            'download.error.not_found':         'Transfer not found. The link may have expired.',
            'download.error.no_key':            'Please enter the decryption key.',
            'download.error.failed':            'Download or decryption failed.',

            // ─── Crypto Errors ──────────────────────────────────────────
            'crypto.error.unavailable':         'Web Crypto API is not available. It requires a secure context (HTTPS or localhost). If running locally, use "localhost" instead of "127.0.0.1".',
            'crypto.error.read_failed':         'Failed to read file',

            // ─── Common ─────────────────────────────────────────────────
            'common.copied':                    'Copied!',

            // ─── Test Files Section ─────────────────────────────────────
            'test_files.title':                 'Test Files',
            'test_files.description':           'Download a test file, then drag it into the upload zone above.',

            // ─── Call to Action ─────────────────────────────────────────
            'cta.title':                        'Want to send files too?',
            'cta.description':                  'Join the early access program for SGraph Send.'
        }
    },

    availableLocales: [
        { code: 'en', name: 'English',   flag: '\uD83C\uDDEC\uD83C\uDDE7' },
        { code: 'pt', name: 'Português', flag: '\uD83C\uDDE7\uD83C\uDDF7' }
    ],

    // ─── Initialisation ────────────────────────────────────────────────────

    async init() {
        const saved = localStorage.getItem('sgraph-send-locale');
        if (saved && saved !== 'en' && this.isSupported(saved)) {
            this.locale = saved;
            await this.loadLocale(saved);
            // Fire event so web components re-render with loaded locale
            document.dispatchEvent(new CustomEvent('locale-changed', {
                detail: { locale: saved }
            }));
        }
    },

    isSupported(code) {
        return this.availableLocales.some(l => l.code === code);
    },

    // ─── Locale Loading ────────────────────────────────────────────────────

    async loadLocale(code) {
        if (this.strings[code]) return true;
        try {
            const resp = await fetch(`i18n/${code}.json`);
            if (resp.ok) {
                this.strings[code] = await resp.json();
                return true;
            }
        } catch (e) { /* fallback to English */ }
        return false;
    },

    // ─── Translation ───────────────────────────────────────────────────────

    t(key, params) {
        let str = (this.strings[this.locale] && this.strings[this.locale][key])
               || this.strings.en[key]
               || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                str = str.split(`{${k}}`).join(String(v));
            });
        }
        return str;
    },

    // ─── Locale Switching ──────────────────────────────────────────────────

    async setLocale(code) {
        if (!this.isSupported(code)) return;
        if (!this.strings[code]) {
            await this.loadLocale(code);
        }
        this.locale = code;
        localStorage.setItem('sgraph-send-locale', code);
        document.dispatchEvent(new CustomEvent('locale-changed', {
            detail: { locale: code }
        }));
    }
};
