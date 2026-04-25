import sgraph_ai_app_send__ui__user
from unittest       import TestCase
from osbot_utils.utils.Files import path_combine, file_exists, file_contents


class test__Sg_Vault_Picker__static_files(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.ui_path        = sgraph_ai_app_send__ui__user.path
        cls.component_path = path_combine(cls.ui_path, 'v0/v0.3/v0.3.2/_common/js/components/sg-vault-picker')

    def test__js_file_exists(self):
        assert file_exists(path_combine(self.component_path, 'sg-vault-picker.js'))

    def test__css_file_exists(self):
        assert file_exists(path_combine(self.component_path, 'sg-vault-picker.css'))

    def test__js_defines_custom_element(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert "customElements.define('sg-vault-picker'" in js

    def test__js_dispatches_vault_opened_event(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'vault-opened' in js

    def test__js_dispatches_vault_created_event(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'vault-created' in js

    def test__js_dispatches_vault_key_copied_event(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'vault-key-copied' in js

    def test__js_dispatches_vault_share_requested_event(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'vault-share-requested' in js

    def test__js_dispatches_vault_closed_event(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'vault-closed' in js

    def test__js_has_generate_vault_key(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'generateVaultKey' in js

    def test__js_uses_local_storage(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'localStorage' in js

    def test__js_no_pydantic_no_fetch(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'pydantic' not in js.lower()
        assert 'import fetch' not in js

    def test__js_has_public_api_methods(self):
        js = file_contents(path_combine(self.component_path, 'sg-vault-picker.js'))
        assert 'open(vaultKey)'  in js
        assert 'close()'         in js
        assert 'create(vaultName)' in js
        assert 'getVaultKey()'  in js
        assert 'getVaultName()' in js

    def test__css_has_design_tokens(self):
        css = file_contents(path_combine(self.component_path, 'sg-vault-picker.css'))
        assert '--vp-bg'     in css
        assert '--vp-accent' in css
        assert '--vp-border' in css

    def test__css_has_recovery_popover(self):
        css = file_contents(path_combine(self.component_path, 'sg-vault-picker.css'))
        assert 'sg-vp__recovery' in css
