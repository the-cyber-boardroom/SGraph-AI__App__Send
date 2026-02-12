# ===============================================================================
# SGraph Send - Transfer Status Enum
# Lifecycle states for a transfer
# ===============================================================================

from enum                                                                       import Enum


class Enum__Transfer__Status(str, Enum):                                        # Transfer lifecycle states
    PENDING   = "pending"                                                       # Created, awaiting upload
    COMPLETED = "completed"                                                     # Upload done, ready for download
    EXPIRED   = "expired"                                                       # No longer available

    def __str__(self):
        return self.value
