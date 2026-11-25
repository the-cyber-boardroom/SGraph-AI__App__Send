# ===============================================================================
# SGraph Send - Append lane settings (typed)
# What an owner may set per lane (or as lane_defaults) through configure.
# Type_Safe rejects NaN, booleans (for the int fields), ints (for blobs), floats, strings and
# unknown fields; ranges and
# the allowed retention classes are checked by Vault__Append__Config.
# ===============================================================================

from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Vault__Append__Lane(Type_Safe):
    soft_pending      : int                                                     # the level the owner expects; above it stats raise over_soft
    hard_pending      : int                                                     # appends are refused (507) from here
    max_pending_bytes : int                                                     # byte budget for pending entries
    retention_days    : int                                                     # processed entries expire after this many days (S3 lifecycle by tag)
    blobs             : bool                                                    # v2 Phase 3: the lane accepts blob uploads (presigned PUT straight to S3)
    max_blob_bytes    : int                                                     # largest blob a writer may upload
    blob_retention_days : int                                                   # blobs expire this many days after upload; 0 = kept until purged (no tag)
