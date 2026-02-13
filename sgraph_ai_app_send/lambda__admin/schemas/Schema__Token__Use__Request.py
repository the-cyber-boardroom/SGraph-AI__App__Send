# ===============================================================================
# SGraph Send - Token Use Request Schema
# Type_Safe request body for POST /tokens/use/{token_name}
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                            import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id


class Schema__Token__Use__Request(Type_Safe):                                # POST /tokens/use/{token_name} request body
    ip_hash     : Safe_Str__Id                                               # SHA-256 hash of user IP (todo: should be Safe_Str__Cache_Hash or custom hash type)
    action      : Safe_Str__Id  = 'page_opened'                             # Action type (todo: should be Literal or Enum: 'page_opened', 'upload_initiated', 'upload_completed')
    transfer_id : Safe_Str__Id                                               # Transfer ID if applicable (todo: should be Transfer_Id)
