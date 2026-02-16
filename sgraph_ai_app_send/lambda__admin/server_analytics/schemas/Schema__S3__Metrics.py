# ===============================================================================
# SGraph Send - S3 Metrics Schema
# All metrics for one S3 bucket
# ===============================================================================

from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id
from sgraph_ai_app_send.lambda__admin.server_analytics.schemas.Schema__Metric__Series                        import Schema__Metric__Series


class Schema__S3__Metrics(Type_Safe):                                    # S3 bucket metrics
    bucket_name           : Safe_Str__Id                                 # S3 bucket name
    filter_id             : Safe_Str__Id                                 # Request metrics filter ID
    get_requests          : Schema__Metric__Series                       # GetObject requests
    put_requests          : Schema__Metric__Series                       # PutObject requests
    first_byte_latency    : Schema__Metric__Series                       # Time to first byte (ms)
    total_request_latency : Schema__Metric__Series                       # Total request time (ms)
    errors_4xx            : Schema__Metric__Series                       # 4xx errors
    errors_5xx            : Schema__Metric__Series                       # 5xx errors
    bytes_downloaded      : Schema__Metric__Series                       # Bytes out
    bytes_uploaded        : Schema__Metric__Series                       # Bytes in
