# CloudFront Log Pipeline — Code Context (Method Streams)

**Version:** v0.4.4
**Purpose:** Actual source code from the existing codebase, with file paths and line numbers. These are the patterns to follow and the code to extend.

---

## 1. CloudFront Log Collector (the parsing engine)

**File:** `sgraph_ai_app_send/lambda__admin/server_analytics/collectors/CloudFront__Logs__Collector.py`

This is the existing collector that reads CloudFront real-time logs from S3. The SA pipeline wraps this.

### Field definitions (lines 17–45)

```python
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
```

### Class definition and core methods (lines 48–65)

```python
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
```

### Summary method (lines 67–107)

```python
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
```

### S3 file listing (lines 113–129)

```python
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
```

### File reading and parsing (lines 131–165)

```python
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
```

---

## 2. Send Cache Client (the storage wrapper)

**File:** `sgraph_ai_app_send/lambda__admin/service/Send__Cache__Client.py`

### Namespace constants and class definition (lines 1–19)

```python
from mgraph_ai_service_cache_client.client.cache_client.Cache__Service__Client import Cache__Service__Client
from osbot_utils.helpers.cache.Cache__Hash__Generator                          import Cache__Hash__Generator
from osbot_utils.type_safe.Type_Safe                                           import Type_Safe

NS_ANALYTICS  = 'analytics'                                                # Raw events + aggregations
NS_TOKENS     = 'tokens'                                                   # Token metadata + usage events
NS_COSTS      = 'costs'                                                    # AWS cost data
NS_TRANSFERS  = 'transfers'                                                # Per-transfer analytics summaries

class Send__Cache__Client(Type_Safe):                                      # Cache service client wrapper for SGraph Send
    cache_client   : Cache__Service__Client                                # Official cache service client
    hash_generator : Cache__Hash__Generator                                # Hash generator for cache keys
```

### Analytics operations — the pattern to follow (lines 35–50)

```python
    def analytics__record_event(self, event_data):                         # Record raw analytics event via TEMPORAL strategy
        return self.cache_client.store().store__json(namespace = NS_ANALYTICS ,
                                                     strategy  = 'temporal'   ,
                                                     body      = event_data   )

    def analytics__list_recent_files(self, path_prefix):                   # List files under analytics temporal path
        result = self.cache_client.admin_storage().files__all__path(
            path = f'{NS_ANALYTICS}/{path_prefix}')
        if result and hasattr(result, 'files'):
            return result.files
        return []

    def analytics__retrieve_event(self, cache_id):                         # Retrieve a single analytics event by cache_id
        return self.cache_client.retrieve().retrieve__cache_id__json(
            cache_id  = cache_id     ,
            namespace = NS_ANALYTICS )
```

---

## 3. Metrics Cache Service (the caching pattern)

**File:** `sgraph_ai_app_send/lambda__admin/server_analytics/Service__Metrics__Cache.py`

### Cache with TTL pattern (lines 14–49)

```python
NS_METRICS = 'metrics'

CACHE_KEY__SNAPSHOT        = 'latest-snapshot'
CACHE_KEY__CF_LOGS_SUMMARY = 'cf-logs-summary'

class Service__Metrics__Cache(Type_Safe):
    send_cache_client    : Send__Cache__Client
    metrics_collector    : Service__Metrics__Collector
    cache_ttl_seconds    : Safe_UInt = 300                                 # 5 minute cache TTL

    def get_snapshot(self, force_refresh=False) -> dict:
        if not force_refresh:
            cached = self._get_cached(CACHE_KEY__SNAPSHOT)
            if cached:
                return cached

        snapshot      = self.metrics_collector.collect_snapshot()
        snapshot_dict = snapshot.json()
        snapshot_dict['_cached_at'] = int(time.time())

        self._store_cached(CACHE_KEY__SNAPSHOT, snapshot_dict)
        return snapshot_dict
```

### Internal cache operations (lines 71–93)

```python
    def _get_cached(self, cache_key) -> dict:
        try:
            result = self.send_cache_client.cache_client.retrieve().retrieve__cache_key__json(
                cache_key = cache_key ,
                namespace = NS_METRICS)
            if result and '_cached_at' in result:
                age = int(time.time()) - result['_cached_at']
                if age <= int(self.cache_ttl_seconds):
                    return result
        except Exception:
            pass
        return None

    def _store_cached(self, cache_key, data):
        try:
            self.send_cache_client.cache_client.store().store__json__cache_key(
                namespace = NS_METRICS ,
                strategy  = 'key_based',
                cache_key = cache_key  ,
                file_id   = cache_key  ,
                body      = data       )
        except Exception:
            pass
```

---

## 4. Metrics Routes (the route pattern)

**File:** `sgraph_ai_app_send/lambda__admin/server_analytics/Routes__Metrics.py`

```python
from osbot_fast_api.api.routes.Fast_API__Routes import Fast_API__Routes

TAG__ROUTES_METRICS = 'metrics'

ROUTES_PATHS__METRICS = [f'/{TAG__ROUTES_METRICS}/snapshot'      ,
                         f'/{TAG__ROUTES_METRICS}/snapshot/refresh',
                         f'/{TAG__ROUTES_METRICS}/cache-status'   ,
                         f'/{TAG__ROUTES_METRICS}/health'         ]

class Routes__Metrics(Fast_API__Routes):
    tag                : str = TAG__ROUTES_METRICS
    metrics_cache      : Service__Metrics__Cache

    def snapshot(self) -> dict:
        return self.metrics_cache.get_snapshot(force_refresh=False)

    def snapshot__refresh(self) -> dict:
        return self.metrics_cache.get_snapshot(force_refresh=True)

    def cache_status(self) -> dict:
        return self.metrics_cache.get_cache_status()

    def health(self) -> dict:
        snapshot = self.metrics_cache.get_snapshot(force_refresh=False)
        return dict(health_status = snapshot.get('health_status', [])      ,
                    snapshot_time = snapshot.get('snapshot_time' , '')      ,
                    _cached_at   = snapshot.get('_cached_at'    , 0)       )

    def setup_routes(self):
        self.add_route_get(self.snapshot         )
        self.add_route_get(self.snapshot__refresh )
        self.add_route_get(self.cache_status      )
        self.add_route_get(self.health            )
        return self
```

---

## 5. Pipeline Setup Factory (the wiring pattern)

**File:** `sgraph_ai_app_send/lambda__admin/server_analytics/Metrics__Pipeline__Setup.py`

```python
import os
from sgraph_ai_app_send.lambda__admin.admin__config import (METRICS__ENABLED, ...)

def create_metrics_cache(send_cache_client):
    if not METRICS__ENABLED:
        _log('[metrics] METRICS__ENABLED=False — missing env vars: ...')
        return None

    try:
        cloudwatch_client = _create_cloudwatch_client()
        metrics_collector = _create_metrics_collector(cloudwatch_client)
        metrics_cache     = _create_metrics_cache_service(send_cache_client, metrics_collector)
        _log(f'[metrics] Pipeline enabled — region=...')
        return metrics_cache
    except Exception as e:
        _log(f'[metrics] Pipeline setup FAILED: {type(e).__name__}: {e}')
        return None

def create_metrics_cache_with_stub(send_cache_client):
    # Build pipeline with stub (for local dev / testing)
    stub = CloudWatch__Client__Stub().setup()
    metrics_collector = Service__Metrics__Collector(cloudwatch_client=stub, ...)
    metrics_cache = Service__Metrics__Cache(send_cache_client=send_cache_client,
                                            metrics_collector=metrics_collector)
    _log('[metrics] Pipeline enabled with STUB data (no AWS calls)')
    return metrics_cache
```

---

## 6. Admin FastAPI App (where routes are registered)

**File:** `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py`

### Route registration (lines 56–71)

```python
    def setup_routes(self):
        self.setup_static_routes()
        self.setup_pulse_route()
        self.add_routes(Routes__Info             )
        self.add_routes(Routes__Tokens           ,
                        service_tokens = self.service_tokens)
        self.add_routes(Routes__Set_Cookie       )
        self.add_routes(Routes__Cache__Browser  ,
                        send_cache_client = self.send_cache_client)
        if self.metrics_cache is not None:
            self.add_routes(Routes__Metrics      ,
                            metrics_cache = self.metrics_cache)

        if self.send_cache_client is not None:
            self.app().add_middleware(Middleware__Analytics,
                                     send_cache_client = self.send_cache_client)
```

---

## 7. Admin Config (environment variables)

**File:** `sgraph_ai_app_send/lambda__admin/admin__config.py`

```python
import os

# Existing metrics env vars
METRICS__CLOUDFRONT_DISTRIBUTION_ID  = os.getenv('SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID' , '')
METRICS__LAMBDA_USER_NAME            = os.getenv('SGRAPH_SEND__LAMBDA_USER_NAME'           , '')
METRICS__LAMBDA_ADMIN_NAME           = os.getenv('SGRAPH_SEND__LAMBDA_ADMIN_NAME'          , '')
METRICS__S3_TRANSFERS_BUCKET         = os.getenv('SGRAPH_SEND__S3_TRANSFERS_BUCKET'        , '')
METRICS__S3_CACHE_BUCKET             = os.getenv('SGRAPH_SEND__S3_CACHE_BUCKET'            , '')
METRICS__S3_FILTER_ID                = os.getenv('SGRAPH_SEND__S3_FILTER_ID'               , 'all-requests')
METRICS__AWS_REGION                  = os.getenv('SGRAPH_SEND__AWS_REGION'                 , 'eu-west-2')
METRICS__ENABLED                     = bool(METRICS__CLOUDFRONT_DISTRIBUTION_ID and
                                            METRICS__LAMBDA_USER_NAME           and
                                            METRICS__LAMBDA_ADMIN_NAME          and
                                            METRICS__S3_TRANSFERS_BUCKET        and
                                            METRICS__S3_CACHE_BUCKET            )
METRICS__USE_STUB                    = os.getenv('SGRAPH_SEND__METRICS_USE_STUB', '').lower() in ('1', 'true', 'yes')
```
