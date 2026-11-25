# ===============================================================================
# SGraph Send - Append blob id
# A blob's id is the SHA-256 of its own ciphertext: 64 lowercase hex characters,
# nothing else (no '/', no '..', no trailing newline, no uppercase). Used by
# blob-upload, blob-url, blob-delete and purge folder:"blobs" (AS-9).
# ===============================================================================

import re
from osbot_utils.type_safe.primitives.core.Safe_Str                          import Safe_Str
from osbot_utils.type_safe.primitives.core.enums.Enum__Safe_Str__Regex_Mode import Enum__Safe_Str__Regex_Mode

TYPE_SAFE_STR__VAULT__APPEND__BLOB_ID__REGEX = re.compile(r'^[0-9a-f]{64}\Z')


class Safe_Str__Vault__Append__Blob_Id(Safe_Str):
    regex             = TYPE_SAFE_STR__VAULT__APPEND__BLOB_ID__REGEX
    regex_mode        = Enum__Safe_Str__Regex_Mode.MATCH
    strict_validation = True
    allow_empty       = False
    max_length        = 64
    to_lower_case     = False
