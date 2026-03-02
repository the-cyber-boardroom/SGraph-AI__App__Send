# ===============================================================================
# SGraph Send - Early Access Schemas
# Request model for Early Access signup
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Early_Access__Signup(Type_Safe):                                     # Request: early access signup
    name  : str                                                                    # User's name
    email : str                                                                    # User's email address
