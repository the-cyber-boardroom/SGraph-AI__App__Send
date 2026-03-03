# ===============================================================================
# SGraph Send - Vault Crypto (Python)
# Deterministic key derivation matching the JavaScript SGVaultCrypto exactly
#
# From a vault key ({passphrase}:{vault_id}), derives:
#   - read_key:          32 bytes for AES-256-GCM encryption/decryption
#   - write_key:         64-char hex string for server write authorization
#   - tree_file_id:      deterministic 12-char hex ID for the vault tree
#   - settings_file_id:  deterministic 12-char hex ID for vault settings
# ===============================================================================

import hashlib
import hmac
import re
from   cryptography.hazmat.primitives.kdf.pbkdf2                               import PBKDF2HMAC
from   cryptography.hazmat.primitives                                           import hashes
from   osbot_utils.type_safe.Type_Safe                                          import Type_Safe

KDF_ITERATIONS  = 600_000
KEY_LENGTH      = 32                                                            # 256 bits = 32 bytes
FILE_ID_LENGTH  = 12                                                            # 12 hex chars


def parse_vault_key(full_vault_key):                                            # Parse {passphrase}:{vault_id} → (passphrase, vault_id)
    parts = full_vault_key.split(':')
    if len(parts) < 2:
        raise ValueError('Invalid vault key format. Expected {passphrase}:{vault_id}')
    vault_id   = parts[-1]                                                      # Last segment is vault_id
    passphrase = ':'.join(parts[:-1])                                           # Everything before (may contain colons)
    if not passphrase:
        raise ValueError('Passphrase cannot be empty')
    if not re.match(r'^[0-9a-f]{8}$', vault_id):
        raise ValueError('vault_id must be 8 hex characters')
    return passphrase, vault_id


def _derive_pbkdf2(passphrase, salt):                                           # PBKDF2-SHA256, 600K iterations → 32 bytes
    kdf = PBKDF2HMAC(algorithm  = hashes.SHA256()  ,
                     length     = KEY_LENGTH        ,
                     salt       = salt              ,
                     iterations = KDF_ITERATIONS    )
    return kdf.derive(passphrase)


def _derive_file_id(read_key_bytes, input_string):                              # HMAC-SHA256 → first 12 hex chars
    mac = hmac.new(read_key_bytes, input_string.encode(), hashlib.sha256)
    return mac.hexdigest()[:FILE_ID_LENGTH]


class Vault__Crypto(Type_Safe):                                                 # Vault key derivation (matches JS SGVaultCrypto exactly)

    def derive_keys(self, passphrase, vault_id):                                # Derive all keys and file IDs from passphrase + vault_id
        passphrase_bytes = passphrase.encode()

        # Parallel PBKDF2: read_key + write_key (different salts)
        read_salt       = f'sg-vault-v1:{vault_id}'.encode()
        write_salt      = f'sg-vault-v1:write:{vault_id}'.encode()
        read_key_bytes  = _derive_pbkdf2(passphrase_bytes, read_salt )
        write_key_bytes = _derive_pbkdf2(passphrase_bytes, write_salt)

        # write_key as hex string (matches JS output)
        write_key = write_key_bytes.hex()

        # Deterministic file IDs via HMAC from read_key
        tree_file_id     = _derive_file_id(read_key_bytes, f'sg-vault-v1:file-id:tree:{vault_id}'    )
        settings_file_id = _derive_file_id(read_key_bytes, f'sg-vault-v1:file-id:settings:{vault_id}')

        return dict(read_key_bytes   = read_key_bytes   ,
                    write_key        = write_key         ,
                    tree_file_id     = tree_file_id      ,
                    settings_file_id = settings_file_id  )

    def derive_keys_from_vault_key(self, full_vault_key):                       # Parse vault key and derive all keys
        passphrase, vault_id = parse_vault_key(full_vault_key)
        result = self.derive_keys(passphrase, vault_id)
        result['vault_id']   = vault_id
        result['passphrase'] = passphrase
        return result
