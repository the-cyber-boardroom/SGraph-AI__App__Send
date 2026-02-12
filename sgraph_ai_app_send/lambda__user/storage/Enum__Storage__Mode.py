# ===============================================================================
# SGraph Send - Storage Mode Enum
# Supported storage backends for transfer data
# ===============================================================================

from enum                                                                       import Enum


class Enum__Storage__Mode(str, Enum):                                           # Storage backend selection
    MEMORY = "memory"                                                           # In-memory (default, for dev/test)
    S3     = "s3"                                                               # AWS S3 (production)

    def __str__(self):
        return self.value
