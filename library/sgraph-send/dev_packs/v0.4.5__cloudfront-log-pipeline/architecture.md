# CloudFront Log Pipeline — Architecture

**Version:** v0.4.4
**For:** Implementor (LLM coding session without repo access)

---

## 1. Type_Safe Schema Patterns

All data structures in this project use `Type_Safe` from `osbot-utils`, never Pydantic. Here's how it works:

```python
from osbot_utils.type_safe.Type_Safe import Type_Safe
from osbot_utils.type_safe.primitives.core.Safe_UInt import Safe_UInt
from osbot_utils.type_safe.primitives.domains.identifiers.safe_str.Safe_Str__Id import Safe_Str__Id
from osbot_utils.type_safe.primitives.domains.identifiers.safe_int.Timestamp_Now import Timestamp_Now

class Schema__My_Data(Type_Safe):
    name       : Safe_Str__Id                    # String with ID validation
    count      : Safe_UInt                       # Unsigned integer
    created_at : Timestamp_Now                   # Auto-populated timestamp
    items      : list                            # Plain list
    metadata   : dict                            # Plain dict
```

Key patterns:
- `Type_Safe` classes auto-initialise all attributes to their default values
- `.json()` returns a dict representation
- No decorators, no validators, no model_config — just class attributes with type annotations
- Use `Safe_Str__Id` for string identifiers, `Safe_UInt` for non-negative integers
- Use plain `list` and `dict` for collections (not `List[str]` or `Dict[str, Any]`)

### Schemas to Create

#### Schema__SA__Log__Event (parsed log record)

```python
class Schema__SA__Log__Event(Type_Safe):
    timestamp              : str                 # epoch seconds as string
    sc_status              : str                 # HTTP status code
    sc_bytes               : str                 # Bytes sent
    cs_method              : str                 # HTTP method
    cs_uri_stem            : str                 # URL path
    cs_uri_query           : str                 # Query string
    cs_protocol            : str                 # HTTP/HTTPS
    cs_protocol_version    : str                 # HTTP version
    sc_content_type        : str                 # Response content type
    sc_content_len         : str                 # Response content length
    cs_user_agent          : str                 # User agent
    cs_referer             : str                 # Referrer
    x_edge_location        : str                 # CloudFront POP
    x_edge_result_type     : str                 # Hit/Miss/Error
    x_edge_response_type   : str                 # Final result type
    x_edge_request_id      : str                 # Unique request ID
    time_taken             : str                 # Serve time
    time_to_first_byte     : str                 # TTFB
    sc_range_start         : str                 # Range start
    sc_range_end           : str                 # Range end
    ssl_protocol           : str                 # TLS version
    ssl_cipher             : str                 # Cipher suite
    cs_accept              : str                 # Accept header
    cs_accept_encoding     : str                 # Accept-Encoding
    cs_host                : str                 # Host header
    origin_fbl             : str                 # Origin first-byte latency
    origin_lbl             : str                 # Origin last-byte latency
```

#### Schema__SA__Ingestion__Result (Step 1 output)

```python
class Schema__SA__Ingestion__Result(Type_Safe):
    log_file_key       : str                     # S3 key of source file
    records_parsed     : Safe_UInt               # Number of records
    records_stored     : Safe_UInt               # Number cached
    cache_prefix       : str                     # Where stored in cache
    errors             : list                    # Any parse errors
```

#### Schema__SA__Consolidation__Result (Step 2 output)

```python
class Schema__SA__Consolidation__Result(Type_Safe):
    period_start       : str                     # Start of consolidation window
    period_end         : str                     # End of consolidation window
    total_requests     : Safe_UInt               # Total request count
    unique_paths       : Safe_UInt               # Distinct URL paths
    unique_agents      : Safe_UInt               # Distinct user agents
    unique_edges       : Safe_UInt               # Distinct edge locations
    status_breakdown   : dict                    # {2xx: N, 3xx: N, 4xx: N, 5xx: N}
    top_paths          : list                    # [{path, count, bytes}, ...]
    edge_distribution  : dict                    # {edge_code: count, ...}
    cache_hit_rate     : float                   # Percentage of cache hits
    total_bytes        : Safe_UInt               # Total bytes served
```

#### Schema__SA__Aggregate__Window (Step 3 output)

```python
class Schema__SA__Aggregate__Window(Type_Safe):
    period             : str                     # "30min", "hourly", "daily", "monthly"
    time_key           : str                     # "2026-02-16-1430", "2026-02-16-14", etc.
    status             : str                     # "final" or "partial"
    computed_at        : str                     # ISO timestamp
    source_count       : Safe_UInt               # Number of source entries
    sources_final      : bool                    # True if all sources are final
    total_requests     : Safe_UInt
    unique_paths       : Safe_UInt
    status_breakdown   : dict
    top_paths          : list
    edge_distribution  : dict
    cache_hit_rate     : float
    total_bytes        : Safe_UInt
    avg_time_taken     : float                   # Average serve time
    avg_ttfb           : float                   # Average TTFB
```

---

## 2. Service Architecture

Each LETS step is a separate service class. All follow the same pattern:

```python
class Service__SA__Something(Type_Safe):
    send_cache_client : Send__Cache__Client      # Injected cache client

    def execute(self, **kwargs) -> SomeSchema:
        # 1. Read input (from S3 or from cache)
        # 2. Process
        # 3. Store result in cache
        # 4. Return result schema
        ...
```

### Service Wiring

```
Fast_API__SGraph__App__Send__Admin
    │
    ├── setup()
    │     └── creates SA__Pipeline__Setup
    │           ├── Service__SA__Log__Ingestion(send_cache_client, s3_config)
    │           ├── Service__SA__Consolidation(send_cache_client)
    │           ├── Service__SA__Temporal__Aggregation(send_cache_client)
    │           └── Service__SA__Archive(send_cache_client, s3_config)
    │
    └── setup_routes()
          └── add_routes(Routes__SA, sa_pipeline=sa_pipeline)
```

### Routes Registration Pattern

Follow the existing `Routes__Metrics` pattern:

```python
from osbot_fast_api.api.routes.Fast_API__Routes import Fast_API__Routes

TAG__ROUTES_SA = 'sa'

class Routes__SA(Fast_API__Routes):
    tag        : str = TAG__ROUTES_SA
    sa_pipeline: SA__Pipeline__Setup              # Injected pipeline

    def cloudfront__ingest(self) -> dict:         # POST /api/sa/cloudfront/ingest
        return self.sa_pipeline.ingestion.execute()

    def setup_routes(self):
        self.add_route_post(self.cloudfront__ingest)
        # ... etc
        return self
```

Note: The route path is derived from the method name. `cloudfront__ingest` becomes `/sa/cloudfront/ingest`. The `/api/` prefix would need to be configured at the route level.

---

## 3. Cache Service Integration

### How to Store Data

The `Send__Cache__Client` wraps the MGraph-AI Cache Service. Two storage strategies matter:

**Temporal (time-series data):**
```python
# Auto-generates time-based cache key
result = send_cache_client.cache_client.store().store__json(
    namespace = 'sa-cloudfront-raw',
    strategy  = 'temporal',
    body      = event_data
)
```

**Key-based (addressable data):**
```python
# You choose the cache key
result = send_cache_client.cache_client.store().store__json__cache_key(
    namespace = 'sa-cloudfront-aggregate',
    strategy  = 'key_based',
    cache_key = 'hourly/2026-02-16-14',
    file_id   = 'hourly-2026-02-16-14',
    body      = aggregate_data
)
```

**Retrieve by cache key:**
```python
result = send_cache_client.cache_client.retrieve().retrieve__cache_key__json(
    cache_key = 'hourly/2026-02-16-14',
    namespace = 'sa-cloudfront-aggregate'
)
```

**List files under a path:**
```python
files = send_cache_client.cache_client.admin_storage().files__all__path(
    path = 'sa-cloudfront-raw/2026/02/16'
)
```

**List folders:**
```python
folders = send_cache_client.cache_client.admin_storage().folders(
    path             = 'sa-cloudfront-aggregate/',
    return_full_path = False,
    recursive        = False
)
```

### Namespace Convention for SA

Use dashes (not slashes) in namespace names:
- `sa-cloudfront-raw` — Step 1 output
- `sa-cloudfront-consolidated` — Step 2 output
- `sa-cloudfront-aggregate` — Step 3 output

Use the cache key for the hierarchical structure:
- `2026-02-16/14-30/{hash}` for raw
- `30min/2026-02-16-1430` for aggregates

---

## 4. S3 Access Pattern (for collectors)

The existing `CloudFront__Logs__Collector` uses boto3 directly with lazy import (Decision D050):

```python
class CloudFront__Logs__Collector(Type_Safe):
    logs_bucket     : Safe_Str__Id
    logs_prefix     : Safe_Str__Id = 'cloudfront-realtime'
    region          : Safe_Str__Id = 'eu-west-2'

    def setup(self):
        import boto3
        self._s3_client = boto3.client('s3', region_name=str(self.region))
        return self
```

The `_s3_client` is underscore-prefixed to keep it outside `Type_Safe`'s attribute system. This is the approved pattern for all collector classes that need direct AWS SDK access.

For the SA pipeline, the ingestion service wraps the existing collector:

```python
class Service__SA__Log__Ingestion(Type_Safe):
    send_cache_client : Send__Cache__Client
    logs_collector    : CloudFront__Logs__Collector

    def execute(self) -> Schema__SA__Ingestion__Result:
        events = self.logs_collector.collect()
        # Store each event in cache...
        # Return result schema
```

---

## 5. FastAPI App Registration

New routes are added in `Fast_API__SGraph__App__Send__Admin.setup_routes()`:

```python
def setup_routes(self):
    # ... existing routes ...
    if self.sa_pipeline is not None:
        self.add_routes(Routes__SA,
                        sa_pipeline = self.sa_pipeline)
```

The pipeline setup follows the same factory pattern as `Metrics__Pipeline__Setup`:

```python
def create_sa_pipeline(send_cache_client, logs_bucket, region='eu-west-2'):
    collector = CloudFront__Logs__Collector(
        logs_bucket = logs_bucket,
        region      = region
    )
    collector.setup()

    return SA__Pipeline__Setup(
        send_cache_client = send_cache_client,
        logs_collector    = collector
    )
```

---

## 6. Environment Variables

New env vars needed (following existing naming convention):

```
SGRAPH_SEND__SA_LOGS_BUCKET           # S3 bucket where CloudFront logs land
SGRAPH_SEND__SA_LOGS_PREFIX           # Key prefix (default: cloudfront-realtime)
SGRAPH_SEND__SA_ENABLED               # Enable SA pipeline (true/false)
```

Add to `admin__config.py` following the existing `METRICS__*` pattern.

---

## 7. Finality Cascade Logic

```
                    ┌─────────────┐
                    │   monthly   │ final when all daily are final
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌─────────┐ ┌─────────┐
         │  daily   │ │  daily   │ │  daily   │ final when all 24 hourly are final
         └────┬─────┘ └─────────┘ └─────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌────────┐┌────────┐┌────────┐
│ hourly ││ hourly ││ hourly │ final when all 6 x 30min are final
└───┬────┘└────────┘└────────┘
    │
  ┌─┴──┐
  ▼    ▼
┌────┐┌────┐
│30m ││30m │ final when all raw logs for that window ingested
└────┘└────┘
```

A simple approach: each aggregate stores `sources_final: bool`. When computing an aggregate:
1. Check all source entries' finality
2. If all final → mark this entry final
3. If any partial → mark partial, include `computed_at` so it can be refreshed later
