# ===============================================================================
# SGraph Send - Vault Inbox File Id (typed)
# Server-assigned inbox filename: {epoch_ms:013d}_{rand_hex:24}.enc
# Enforced format guarantees it is always a safe leaf name (no traversal).
# ===============================================================================

import re
from osbot_utils.type_safe.primitives.core.Safe_Str                          import Safe_Str
from osbot_utils.type_safe.primitives.core.enums.Enum__Safe_Str__Regex_Mode import Enum__Safe_Str__Regex_Mode

# 13-digit zero-padded epoch ms, underscore, 24 hex chars (96 bits), .enc suffix.
TYPE_SAFE_STR__VAULT__INBOX__FILE_ID__REGEX = re.compile(r'^\d{13}_[0-9a-f]{24}\.enc$')


class Safe_Str__Vault__Inbox__File_Id(Safe_Str):                                # Inbox file id — server-assigned name, hex+digits only, never a path
    regex             = TYPE_SAFE_STR__VAULT__INBOX__FILE_ID__REGEX
    regex_mode        = Enum__Safe_Str__Regex_Mode.MATCH
    strict_validation = True
    allow_empty       = False
    max_length        = 64
    to_lower_case     = False
