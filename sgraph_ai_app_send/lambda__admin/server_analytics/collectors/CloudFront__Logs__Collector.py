# ===============================================================================
# SGraph Send - CloudFront Real-Time Logs Collector
# Reads CloudFront real-time logs from S3 (delivered via Kinesis Firehose)
# Parses tab-separated records and stores structured events in cache service
# Note: c-ip field is deliberately excluded from log configuration (privacy)
# ===============================================================================

import gzip
import json
from datetime                                                                                                import datetime, timezone, timedelta
from osbot_utils.type_safe.Type_Safe                                                                         import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt                                                         import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id                              import Safe_Str__Id

# Fields selected in CloudFront real-time log configuration (in order)
# This must match the field selection in the CloudFront console
CF_LOG_FIELDS = [
    'timestamp'                    ,                                     # epoch seconds (float)
    'sc-status'                    ,                                     # HTTP status code
    'sc-bytes'                     ,                                     # Bytes sent to client
    'cs-method'                    ,                                     # HTTP method
    'cs-uri-stem'                  ,                                     # URL path
    'cs-uri-query'                 ,                                     # Query string
    'cs-protocol'                  ,                                     # HTTP or HTTPS
    'cs-protocol-version'          ,                                     # HTTP/1.1, HTTP/2, HTTP/3
    'sc-content-type'              ,                                     # Response content type
    'sc-content-len'               ,                                     # Response content length
    'cs-user-agent'                ,                                     # Browser user agent
    'cs-referer'                   ,                                     # Referrer header
    'x-edge-location'              ,                                     # CloudFront POP
    'x-edge-result-type'           ,                                     # Hit, Miss, Error
    'x-edge-response-result-type'  ,                                     # Final result
    'x-edge-request-id'            ,                                     # Unique request ID
    'time-taken'                   ,                                     # Total serve time (seconds)
    'time-to-first-byte'           ,                                     # TTFB from origin
    'sc-range-start'               ,                                     # Range request start
    'sc-range-end'                 ,                                     # Range request end
    'ssl-protocol'                 ,                                     # TLS version
    'ssl-cipher'                   ,                                     # TLS cipher suite
    'cs-accept'                    ,                                     # Accept header
    'cs-accept-encoding'           ,                                     # Accept-Encoding header
    'cs-host'                      ,                                     # Host header
    'origin-fbl'                   ,                                     # Origin first-byte latency
    'origin-lbl'                   ,                                     # Origin last-byte latency
]


class CloudFront__Logs__Collector(Type_Safe):                            # Reads and parses CloudFront real-time logs from S3
    logs_bucket     : Safe_Str__Id                                       # S3 bucket for CF logs
    logs_prefix     : Safe_Str__Id = 'cloudfront-realtime'               # S3 key prefix
    lookback_hours  : Safe_UInt    = 24                                  # How far back to look for logs
    region          : Safe_Str__Id = 'eu-west-2'                         # AWS region for S3

    def setup(self):                                                     # Initialise S3 client (lazy import)
        import boto3
        self._s3_client = boto3.client('s3', region_name=str(self.region))
        return self

    def collect(self) -> list:                                           # Collect and parse all log files in lookback window
        keys       = self._list_log_files()
        all_events = []
        for key in keys:
            events = self._read_and_parse(key)
            all_events.extend(events)
        return all_events

    def collect_summary(self) -> dict:                                   # Collect and return summary statistics
        events = self.collect()
        if not events:
            return dict(total_records     = 0               ,
                        log_files_read    = 0               ,
                        time_range        = ''              ,
                        status_breakdown  = {}              ,
                        edge_locations    = []              ,
                        cache_hit_rate    = 0.0             ,
                        top_paths         = []              )

        status_counts = {}
        edge_locations = set()
        path_counts   = {}
        cache_hits    = 0
        total         = len(events)

        for event in events:
            status = event.get('sc-status', '')
            bucket = f'{status[0]}xx' if len(status) >= 1 else 'unknown'
            status_counts[bucket] = status_counts.get(bucket, 0) + 1

            edge = event.get('x-edge-location', '')
            if edge:
                edge_locations.add(edge)

            path = event.get('cs-uri-stem', '')
            path_counts[path] = path_counts.get(path, 0) + 1

            result = event.get('x-edge-result-type', '')
            if result == 'Hit':
                cache_hits += 1

        top_paths = sorted(path_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        top_paths = [dict(path=p, count=c) for p, c in top_paths]

        return dict(total_records     = total                             ,
                    status_breakdown  = status_counts                     ,
                    edge_locations    = sorted(edge_locations)            ,
                    cache_hit_rate    = round(cache_hits / total * 100, 2) if total > 0 else 0.0,
                    top_paths         = top_paths                         )

    # ═══════════════════════════════════════════════════════════════════════
    # Internal
    # ═══════════════════════════════════════════════════════════════════════

    def _list_log_files(self) -> list:                                   # List S3 keys for log files in lookback window
        now    = datetime.now(timezone.utc)
        keys   = []

        for hours_ago in range(int(self.lookback_hours)):
            dt     = now - timedelta(hours=hours_ago)
            prefix = f"{self.logs_prefix}/year={dt.strftime('%Y')}/month={dt.strftime('%m')}/day={dt.strftime('%d')}/"

            try:
                paginator = self._s3_client.get_paginator('list_objects_v2')
                for page in paginator.paginate(Bucket=str(self.logs_bucket), Prefix=prefix):
                    for obj in page.get('Contents', []):
                        keys.append(obj['Key'])
            except Exception:
                continue

        return keys

    def _read_and_parse(self, key) -> list:                              # Read one S3 file and parse log records
        try:
            response = self._s3_client.get_object(Bucket=str(self.logs_bucket), Key=key)
            body     = response['Body'].read()

            if key.endswith('.gz') or body[:2] == b'\x1f\x8b':           # GZIP compressed
                body = gzip.decompress(body)

            text    = body.decode('utf-8', errors='replace')
            events  = []

            for line in text.strip().split('\n'):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                event = self._parse_line(line)
                if event:
                    events.append(event)

            return events
        except Exception:
            return []

    def _parse_line(self, line) -> dict:                                 # Parse one tab-separated log line
        fields = line.split('\t')
        event  = {}

        for i, field_name in enumerate(CF_LOG_FIELDS):
            if i < len(fields):
                value = fields[i]
                if value == '-':
                    value = ''
                event[field_name] = value

        return event if event else None
