# ===============================================================================
# SGraph Send - Vault Append Token (typed)
# The append token (= H(recipient public key)) which also names the inbox folder.
# Enforced as lowercase hex so it is always a safe path component (no traversal).
# ===============================================================================

import re
from osbot_utils.type_safe.primitives.core.Safe_Str                          import Safe_Str
from osbot_utils.type_safe.primitives.core.enums.Enum__Safe_Str__Regex_Mode import Enum__Safe_Str__Regex_Mode

# Hex-only, bounded length. H(pubkey) is SHA-256 (64 hex chars); allow a band so
# other hash sizes / encodings still fit while excluding any path metacharacter.
TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX = re.compile(r'^[0-9a-f]{16,128}$')


class Safe_Str__Vault__Append_Token(Safe_Str):                                  # Append token / inbox folder name — hex only, never a path
    regex             = TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX
    regex_mode        = Enum__Safe_Str__Regex_Mode.MATCH
    strict_validation = True
    allow_empty       = False
    max_length        = 128
    to_lower_case     = False
