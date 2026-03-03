# ===============================================================================
# SGraph Send - Vault__Crypto Tests
# Deterministic key derivation with cross-language test vectors
# ===============================================================================

from unittest                                                                    import TestCase
from sgraph_ai_app_send.utils.Vault__Crypto                                     import Vault__Crypto, parse_vault_key

# Cross-language test vectors — JS SGVaultCrypto must produce identical output
VECTOR_1 = dict(passphrase       = 'my-secret-passphrase'                                          ,
                vault_id         = 'a1b2c3d4'                                                      ,
                read_key_hex     = 'a9cbcf15b4719384a732594405f138a2a42895fe56710dcfbd1324369f735124',
                write_key        = '3181d6650958b51fd00f913f6290eca22e6b09da661c8e831fc89fe659df378e',
                tree_file_id     = '4bc7e18f0779'                                                  ,
                settings_file_id = '591414eaaa88'                                                  )

VECTOR_2 = dict(passphrase       = 'pass:with:colons'                                              ,
                vault_id         = 'deadbeef'                                                      ,
                read_key_hex     = 'a903fc429b2806e6c05ba0d21271d982f451bd3c78e4899a8ee6e0fbed3d9b3f',
                write_key        = '3da59de516555d963eaf4c5d3179893acd9045bb0df69f3c89c0bed915a77f96',
                tree_file_id     = '220ae644906a'                                                  ,
                settings_file_id = '5398a4d71d8d'                                                  )


class test_Vault__Crypto(TestCase):

    @classmethod
    def setUpClass(cls):
        cls.crypto = Vault__Crypto()

    # --- derive_keys: test vector 1 ---

    def test__derive_keys__vector_1(self):
        result = self.crypto.derive_keys(VECTOR_1['passphrase'], VECTOR_1['vault_id'])
        assert result['read_key_bytes'].hex() == VECTOR_1['read_key_hex']
        assert result['write_key']            == VECTOR_1['write_key']
        assert result['tree_file_id']         == VECTOR_1['tree_file_id']
        assert result['settings_file_id']     == VECTOR_1['settings_file_id']

    # --- derive_keys: test vector 2 (passphrase with colons) ---

    def test__derive_keys__vector_2(self):
        result = self.crypto.derive_keys(VECTOR_2['passphrase'], VECTOR_2['vault_id'])
        assert result['read_key_bytes'].hex() == VECTOR_2['read_key_hex']
        assert result['write_key']            == VECTOR_2['write_key']
        assert result['tree_file_id']         == VECTOR_2['tree_file_id']
        assert result['settings_file_id']     == VECTOR_2['settings_file_id']

    # --- derive_keys_from_vault_key ---

    def test__derive_keys_from_vault_key__simple(self):
        result = self.crypto.derive_keys_from_vault_key('my-secret-passphrase:a1b2c3d4')
        assert result['passphrase']           == 'my-secret-passphrase'
        assert result['vault_id']             == 'a1b2c3d4'
        assert result['write_key']            == VECTOR_1['write_key']
        assert result['tree_file_id']         == VECTOR_1['tree_file_id']
        assert result['settings_file_id']     == VECTOR_1['settings_file_id']

    def test__derive_keys_from_vault_key__colons(self):
        result = self.crypto.derive_keys_from_vault_key('pass:with:colons:deadbeef')
        assert result['passphrase']           == 'pass:with:colons'
        assert result['vault_id']             == 'deadbeef'
        assert result['write_key']            == VECTOR_2['write_key']

    # --- Key properties ---

    def test__read_key_is_32_bytes(self):
        result = self.crypto.derive_keys('test', 'aabbccdd')
        assert len(result['read_key_bytes']) == 32

    def test__write_key_is_64_hex_chars(self):
        result = self.crypto.derive_keys('test', 'aabbccdd')
        assert len(result['write_key']) == 64
        assert all(c in '0123456789abcdef' for c in result['write_key'])

    def test__tree_file_id_is_12_hex_chars(self):
        result = self.crypto.derive_keys('test', 'aabbccdd')
        assert len(result['tree_file_id']) == 12
        assert all(c in '0123456789abcdef' for c in result['tree_file_id'])

    def test__settings_file_id_is_12_hex_chars(self):
        result = self.crypto.derive_keys('test', 'aabbccdd')
        assert len(result['settings_file_id']) == 12
        assert all(c in '0123456789abcdef' for c in result['settings_file_id'])

    # --- Determinism ---

    def test__same_input_same_output(self):
        r1 = self.crypto.derive_keys('passphrase', 'aabbccdd')
        r2 = self.crypto.derive_keys('passphrase', 'aabbccdd')
        assert r1['read_key_bytes'] == r2['read_key_bytes']
        assert r1['write_key']      == r2['write_key']
        assert r1['tree_file_id']   == r2['tree_file_id']

    def test__different_passphrase_different_keys(self):
        r1 = self.crypto.derive_keys('passphrase-A', 'aabbccdd')
        r2 = self.crypto.derive_keys('passphrase-B', 'aabbccdd')
        assert r1['read_key_bytes'] != r2['read_key_bytes']
        assert r1['write_key']      != r2['write_key']

    def test__different_vault_id_different_keys(self):
        r1 = self.crypto.derive_keys('passphrase', 'aabbccdd')
        r2 = self.crypto.derive_keys('passphrase', '11223344')
        assert r1['read_key_bytes'] != r2['read_key_bytes']
        assert r1['write_key']      != r2['write_key']
        assert r1['tree_file_id']   != r2['tree_file_id']

    # --- Independence: read_key and write_key ---

    def test__read_and_write_keys_are_independent(self):
        result = self.crypto.derive_keys('test', 'aabbccdd')
        assert result['read_key_bytes'].hex() != result['write_key']           # Different keys from different salts

    # --- parse_vault_key ---

    def test__parse_vault_key__simple(self):
        passphrase, vault_id = parse_vault_key('my-passphrase:aabbccdd')
        assert passphrase == 'my-passphrase'
        assert vault_id   == 'aabbccdd'

    def test__parse_vault_key__colons_in_passphrase(self):
        passphrase, vault_id = parse_vault_key('a:b:c:deadbeef')
        assert passphrase == 'a:b:c'
        assert vault_id   == 'deadbeef'

    def test__parse_vault_key__invalid_no_colon(self):
        with self.assertRaises(ValueError):
            parse_vault_key('no-colon-here')

    def test__parse_vault_key__invalid_empty_passphrase(self):
        with self.assertRaises(ValueError):
            parse_vault_key(':aabbccdd')

    def test__parse_vault_key__invalid_vault_id_too_short(self):
        with self.assertRaises(ValueError):
            parse_vault_key('passphrase:abc')

    def test__parse_vault_key__invalid_vault_id_not_hex(self):
        with self.assertRaises(ValueError):
            parse_vault_key('passphrase:XXXXXXXX')
