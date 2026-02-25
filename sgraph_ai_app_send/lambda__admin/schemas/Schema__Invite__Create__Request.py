# ===============================================================================
# SGraph Send - Invite Create Request Schema
# Type_Safe request body for POST /rooms/{room_id}/invite
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Invite__Create__Request(Type_Safe):                            # POST /rooms/{room_id}/invite request body
    permission : str = 'viewer'                                              # Permission level for invitee: viewer, editor
    created_by : str = ''                                                    # User ID of invite creator
    max_uses   : int = 1                                                     # Max number of uses (0 = unlimited)
