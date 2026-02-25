# ===============================================================================
# SGraph Send - Data Room Create Request Schema
# Type_Safe request body for POST /rooms/create
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Data_Room__Create__Request(Type_Safe):                         # POST /rooms/create request body
    name          : str                                                      # Human-readable room name
    description   : str = ''                                                 # Optional room description
    owner_user_id : str = ''                                                 # Owner user ID (from session/header)
