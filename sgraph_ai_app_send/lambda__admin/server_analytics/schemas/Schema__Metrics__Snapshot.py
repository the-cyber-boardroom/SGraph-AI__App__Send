# ===============================================================================
# SGraph Send - Metrics Snapshot Schema
# Complete point-in-time metrics snapshot across all infrastructure
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                              import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                              import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                                   import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now                                  import Timestamp_Now
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__CloudFront__Metrics                        import Schema__CloudFront__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Lambda__Metrics                            import Schema__Lambda__Metrics
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__S3__Metrics                                import Schema__S3__Metrics


class Schema__Metrics__Snapshot(Type_Safe):                              # Complete metrics snapshot
    snapshot_time     : Timestamp_Now                                    # When snapshot was taken
    region            : Safe_Str__Id                                     # AWS region
    lookback_minutes  : Safe_UInt                                        # Time range collected
    period_seconds    : Safe_UInt                                        # CloudWatch resolution
    cloudfront        : Schema__CloudFront__Metrics                      # CloudFront metrics
    lambda_user       : Schema__Lambda__Metrics                          # User Lambda metrics
    lambda_admin      : Schema__Lambda__Metrics                          # Admin Lambda metrics
    s3_transfers      : Schema__S3__Metrics                              # Transfers bucket metrics
    s3_cache          : Schema__S3__Metrics                              # Cache bucket metrics
    health_status     : list                                             # List of Schema__Health__Status dicts
