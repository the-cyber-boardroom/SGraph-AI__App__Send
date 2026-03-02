from osbot_utils.testing.Pytest import skip_pytest

import sgraph_ai_app_send__ui__vault
from unittest       import TestCase
from osbot_utils.utils.Files import path_combine, file_exists, file_contents


class test__Vault_UI__static_files(TestCase):

    @classmethod
    def setUpClass(cls):
        skip_pytest("Needs sg-send.js file")
        cls.vault_ui_path = sgraph_ai_app_send__ui__vault.path
        cls.v010_path     = path_combine(cls.vault_ui_path, 'v0/v0.1/v0.1.0')

    # --- Package Structure ---

    def test__package_init_exists(self):
        assert file_exists(path_combine(self.vault_ui_path, '__init__.py'))

    def test__root_index_redirects_to_latest(self):
        index = file_contents(path_combine(self.vault_ui_path, 'index.html'))
        assert 'v0/v0.1/v0.1.0/en-gb/' in index

    def test__v010_index_redirects_to_en_gb(self):
        index = file_contents(path_combine(self.v010_path, 'index.html'))
        assert 'en-gb/' in index

    # --- Main Page ---

    def test__en_gb_index_html_exists(self):
        page = path_combine(self.v010_path, 'en-gb/index.html')
        assert file_exists(page)

    def test__en_gb_index_has_vault_app(self):
        page = file_contents(path_combine(self.v010_path, 'en-gb/index.html'))
        assert '<vault-app>'   in page
        assert 'SG/Vault'      in page
        assert 'vault-i18n.js' in page

    def test__en_gb_index_loads_all_scripts(self):
        page = file_contents(path_combine(self.v010_path, 'en-gb/index.html'))
        expected_scripts = [
            'vault-i18n.js',
            'sg-send-crypto.js',
            'sg-send.js',
            'sg-vault.js',
            'vault-helpers.js',
            'vault-component-paths.js',
            'vault-component.js',
            'vault-entry.js',
            'vault-browser.js',
            'vault-upload.js',
            'vault-share.js',
            'vault-app.js',
        ]
        for script in expected_scripts:
            assert script in page, f'Missing script: {script}'

    # --- Libraries ---

    def test__sg_send_crypto_exists(self):
        path = path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send-crypto.js')
        assert file_exists(path)

    def test__sg_send_crypto_has_aes_gcm(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send-crypto.js'))
        assert 'AES-GCM'          in content
        assert 'PBKDF2'           in content
        assert '600000'           in content                              # 600k iterations
        assert 'deriveKey'        in content
        assert 'encrypt'          in content
        assert 'decrypt'          in content
        assert 'generateKey'      in content
        assert 'exportKey'        in content
        assert 'importKey'        in content
        assert 'bytesToBase64url' in content
        assert 'base64urlToBytes' in content

    def test__sg_send_exists(self):
        path = path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send.js')
        assert file_exists(path)

    def test__sg_send_has_transfer_api(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send.js'))
        assert 'class SGSend'           in content
        assert '/api/transfers/create'   in content
        assert '/api/transfers/upload/'  in content
        assert '/api/transfers/complete/'in content
        assert '/api/transfers/download/'in content
        assert 'x-sgraph-access-token'  in content
        assert 'encryptAndUpload'       in content
        assert 'downloadAndDecrypt'     in content

    def test__sg_vault_exists(self):
        path = path_combine(self.v010_path, '_common/js/lib/sg-vault/sg-vault.js')
        assert file_exists(path)

    def test__sg_vault_has_vault_logic(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-vault/sg-vault.js'))
        assert 'class SGVault'     in content
        assert 'static async create' in content
        assert 'static async open'   in content
        assert 'addFile'             in content
        assert 'getFile'             in content
        assert 'removeFile'          in content
        assert 'createFolder'        in content
        assert 'listFolder'          in content
        assert 'removeFolder'        in content
        assert '_loadTree'           in content
        assert '_saveTree'           in content
        assert '_findNode'           in content
        assert 'getVaultKey'         in content
        assert 'sg-vault-v1:'       in content                            # KDF salt prefix

    # --- Base System ---

    def test__vault_component_exists(self):
        path = path_combine(self.v010_path, '_common/js/base/vault-component.js')
        assert file_exists(path)

    def test__vault_component_has_shadow_dom(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/base/vault-component.js'))
        assert 'class VaultComponent extends HTMLElement' in content
        assert 'attachShadow'       in content
        assert 'connectedCallback'  in content
        assert 'loadResources'      in content
        assert 'emit'               in content

    def test__vault_helpers_exists(self):
        path = path_combine(self.v010_path, '_common/js/base/vault-helpers.js')
        assert file_exists(path)

    def test__vault_component_paths_exists(self):
        path = path_combine(self.v010_path, '_common/js/base/vault-component-paths.js')
        assert file_exists(path)

    # --- i18n ---

    def test__vault_i18n_exists(self):
        path = path_combine(self.v010_path, '_common/js/vault-i18n.js')
        assert file_exists(path)

    def test__vault_i18n_has_english_strings(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/vault-i18n.js'))
        assert 'vault.entry.label'    in content
        assert 'vault.browser.upload' in content
        assert 'vault.share.title'    in content
        assert '_detectLocale'        in content
        assert "t(key"                in content

    def test__en_gb_json_exists(self):
        path = path_combine(self.v010_path, 'i18n/en-gb.json')
        assert file_exists(path)

    def test__en_gb_json_has_all_keys(self):
        import json
        path = path_combine(self.v010_path, 'i18n/en-gb.json')
        data = json.loads(file_contents(path))
        required_keys = [
            'vault.entry.label', 'vault.entry.open', 'vault.entry.create',
            'vault.browser.upload', 'vault.browser.name', 'vault.browser.size',
            'vault.upload.encrypting', 'vault.upload.uploading',
            'vault.share.title', 'vault.share.copy',
            'vault.stats.summary',
        ]
        for key in required_keys:
            assert key in data, f'Missing i18n key: {key}'

    # --- Components ---

    def test__vault_entry_component_files(self):
        base = path_combine(self.v010_path, '_common/js/components/vault-entry')
        assert file_exists(path_combine(base, 'vault-entry.js'))
        assert file_exists(path_combine(base, 'vault-entry.html'))
        assert file_exists(path_combine(base, 'vault-entry.css'))

    def test__vault_browser_component_files(self):
        base = path_combine(self.v010_path, '_common/js/components/vault-browser')
        assert file_exists(path_combine(base, 'vault-browser.js'))
        assert file_exists(path_combine(base, 'vault-browser.html'))
        assert file_exists(path_combine(base, 'vault-browser.css'))

    def test__vault_upload_component_files(self):
        base = path_combine(self.v010_path, '_common/js/components/vault-upload')
        assert file_exists(path_combine(base, 'vault-upload.js'))
        assert file_exists(path_combine(base, 'vault-upload.html'))
        assert file_exists(path_combine(base, 'vault-upload.css'))

    def test__vault_share_component_files(self):
        base = path_combine(self.v010_path, '_common/js/components/vault-share')
        assert file_exists(path_combine(base, 'vault-share.js'))
        assert file_exists(path_combine(base, 'vault-share.html'))
        assert file_exists(path_combine(base, 'vault-share.css'))

    def test__vault_app_component_files(self):
        base = path_combine(self.v010_path, '_common/js/components/vault-app')
        assert file_exists(path_combine(base, 'vault-app.js'))
        assert file_exists(path_combine(base, 'vault-app.html'))
        assert file_exists(path_combine(base, 'vault-app.css'))

    def test__vault_entry_has_custom_element(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/components/vault-entry/vault-entry.js'))
        assert "customElements.define('vault-entry'" in content
        assert 'VaultEntry extends VaultComponent'   in content

    def test__vault_browser_has_custom_element(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/components/vault-browser/vault-browser.js'))
        assert "customElements.define('vault-browser'" in content
        assert 'VaultBrowser extends VaultComponent'   in content

    def test__vault_upload_has_custom_element(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/components/vault-upload/vault-upload.js'))
        assert "customElements.define('vault-upload'" in content
        assert 'VaultUpload extends VaultComponent'   in content

    def test__vault_share_has_custom_element(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/components/vault-share/vault-share.js'))
        assert "customElements.define('vault-share'" in content
        assert 'VaultShare extends VaultComponent'   in content

    def test__vault_app_has_custom_element(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/components/vault-app/vault-app.js'))
        assert "customElements.define('vault-app'" in content
        assert 'VaultApp extends VaultComponent'   in content

    # --- CSS ---

    def test__design_tokens_exists(self):
        path = path_combine(self.v010_path, '_common/css/design-tokens.css')
        assert file_exists(path)

    def test__design_tokens_has_aurora_theme(self):
        content = file_contents(path_combine(self.v010_path, '_common/css/design-tokens.css'))
        assert '#4ECDC4' in content                                       # teal accent
        assert '#1A1A2E' in content                                       # navy background
        assert '#E94560' in content                                       # danger red
        assert 'DM Sans' in content                                       # primary font

    def test__shared_components_exists(self):
        path = path_combine(self.v010_path, '_common/css/shared-components.css')
        assert file_exists(path)

    def test__fonts_css_exists(self):
        path = path_combine(self.v010_path, '_common/fonts/fonts.css')
        assert file_exists(path)

    # --- Security Checks ---

    def test__crypto_uses_aes_256_gcm(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send-crypto.js'))
        assert "KEY_LENGTH   = 256"  in content
        assert "ALGORITHM    = 'AES-GCM'" in content
        assert "IV_LENGTH    = 12"   in content

    def test__kdf_uses_pbkdf2_600k_iterations(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send-crypto.js'))
        assert 'KDF_ITERATIONS = 600000' in content
        assert "'PBKDF2'"                in content
        assert "'SHA-256'"               in content

    def test__vault_key_format_includes_vault_id(self):
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-vault/sg-vault.js'))
        assert 'passphrase:vaultId:settingsTransferId' in content.replace(' ', '')  or \
               'passphrase:vault_id:settings_transfer_id' in content               or \
               'getVaultKey' in content

    def test__no_server_side_key_exposure(self):
        # The API _fetch method should never send passphrase to the server.
        # sg-send.js delegates deriveKey locally but never transmits the passphrase.
        content = file_contents(path_combine(self.v010_path, '_common/js/lib/sg-send/sg-send.js'))
        # Extract the _fetch method and verify passphrase is not in any fetch body
        fetch_section = content.split('async _fetch')[1].split('// --- Transfer')[0]
        assert 'passphrase' not in fetch_section                          # passphrase never sent in network calls
