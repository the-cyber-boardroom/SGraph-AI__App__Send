import re
from osbot_utils.type_safe.primitives.core.Safe_Str                          import Safe_Str
from osbot_utils.type_safe.primitives.core.enums.Enum__Safe_Str__Regex_Mode import Enum__Safe_Str__Regex_Mode

TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX = re.compile(r'^\d{13}_[0-9a-f]{24}\.enc$')


class Safe_Str__Vault__Append__File_Id(Safe_Str):
    regex             = TYPE_SAFE_STR__VAULT__APPEND__FILE_ID__REGEX
    regex_mode        = Enum__Safe_Str__Regex_Mode.MATCH
    strict_validation = True
    allow_empty       = False
    max_length        = 64
    to_lower_case     = False
