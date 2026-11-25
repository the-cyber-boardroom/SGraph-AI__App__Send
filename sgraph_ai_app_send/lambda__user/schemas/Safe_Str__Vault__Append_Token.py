# ===============================================================================
# SGraph Send - Vault Append Token (typed)
# The append token, which also names the append folder (it is the `inbox` value
# that list returns). Enforced as lowercase hex so it is always a safe path
# component (no traversal). Use RANDOM tokens: the folder name is stored at rest,
# so a token derived from a public key (H(pubkey)) would be an identifier on the
# server, against the no-identifiers rule.
# ===============================================================================

import re
from osbot_utils.type_safe.primitives.core.Safe_Str                          import Safe_Str
from osbot_utils.type_safe.primitives.core.enums.Enum__Safe_Str__Regex_Mode import Enum__Safe_Str__Regex_Mode

# Hex-only, bounded length. H(pubkey) is SHA-256 (64 hex chars); allow a band so
# other hash sizes / encodings still fit while excluding any path metacharacter.
TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX = re.compile(r'^[0-9a-f]{16,128}\Z')            # \Z, not $ (which lets a trailing newline through)


class Safe_Str__Vault__Append_Token(Safe_Str):                                  # Append token / folder name — hex only, never a path
    regex             = TYPE_SAFE_STR__VAULT__APPEND_TOKEN__REGEX
    regex_mode        = Enum__Safe_Str__Regex_Mode.MATCH
    strict_validation = True
    allow_empty       = False
    max_length        = 128
    to_lower_case     = False
