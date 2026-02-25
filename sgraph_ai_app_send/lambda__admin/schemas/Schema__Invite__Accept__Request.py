# ===============================================================================
# SGraph Send - Invite Accept Request Schema
# Type_Safe request body for POST /invites/{invite_code}/accept
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Invite__Accept__Request(Type_Safe):                            # POST /invites/{invite_code}/accept request body
    user_id : str                                                            # User ID accepting the invite
