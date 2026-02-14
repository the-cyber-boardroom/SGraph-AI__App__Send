# ===============================================================================
# SGraph Send - Admin Service Client Requests
# Transport layer extending generic Fast_API__Client__Requests
# ===============================================================================

from osbot_fast_api.services.registry.Fast_API__Client__Requests import Fast_API__Client__Requests


class Admin__Service__Client__Requests(Fast_API__Client__Requests):              # Transport for admin service (inherits IN_MEMORY / REMOTE logic)
    pass
