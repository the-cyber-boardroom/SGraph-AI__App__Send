# ===============================================================================
# SGraph Send - Room Member Request Schema
# Type_Safe request body for POST /rooms/{room_id}/members
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Room__Member__Request(Type_Safe):                              # POST /rooms/{room_id}/members request body
    user_id    : str                                                         # User to add
    permission : str = 'viewer'                                              # Permission level: owner, editor, viewer
    granted_by : str = ''                                                    # User granting access
