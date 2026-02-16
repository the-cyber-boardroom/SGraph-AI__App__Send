# CloudFront Log Pipeline — Workstream Briefing Pack

**Version:** v0.4.4
**Date:** 2026-02-16
**Pack type:** Workstream (full pack)
**Target audience:** LLM coding session (no repo access)
**Objective:** Implement the CloudFront real-time log processing pipeline using the LETS methodology and the MGraph-AI Caching Service

---

## What You Are Building

A pipeline that takes CloudFront real-time log files (already being delivered to S3 via Kinesis Firehose) and processes them through four steps:

1. **Raw Ingestion** — Read tab-delimited log files from S3, parse to typed JSON, store in the cache service under `sa/cloudfront/raw/`
2. **Consolidation** — Group identical requests, extract unique visitors/paths/edge-locations, compress, store under `sa/cloudfront/consolidated/`
3. **Temporal Aggregation** — Roll up into time windows (`30min → hourly → daily → monthly`) with finality tracking, store under `sa/cloudfront/aggregate/{period}/`
4. **Archive and Clean** — Move processed raw logs to S3 Glacier/IA, treat the live S3 bucket as a queue of unprocessed files

Step 5 (event-driven automation via S3 triggers) is **deferred** — build manual/on-demand first.

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **No IP addresses** | CloudFront real-time log config deliberately excludes `c-ip`. Verify empirically via tests. |
| **Type_Safe only** | All schemas use `Type_Safe` from `osbot-utils`. Never Pydantic. |
| **osbot-aws for S3** | All S3 operations go through `osbot-aws`. Exception: boto3 with lazy imports inside collector classes (Decision D050). |
| **Cache Service** | All pipeline output stored via `Send__Cache__Client` → MGraph-AI Cache Service. |
| **Admin Lambda** | All SA endpoints live on the existing Admin Lambda (Decision D055). |
| **API prefix** | All SA endpoints under `/api/sa/` (Decision D058). |
| **No mocks in tests** | Real implementations with in-memory backends. |
| **IFD methodology** | Surgical, versioned, isolated changes. |

---

## Where This Fits in the Architecture

```
CloudFront Distribution (send.sgraph.ai)
    │
    ├── Real-time log config (selected fields, NO c-ip)
    │
    ▼
Kinesis Firehose
    │
    ▼
S3 Bucket (log delivery)
    │  prefix: cloudfront-realtime/year=YYYY/month=MM/day=DD/
    │  format: tab-delimited, gzip compressed
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  LETS Pipeline (this is what you're building)           │
│                                                         │
│  Step 1: Raw Ingestion                                  │
│    S3 → parse tab-delimited → typed JSON → cache raw/   │
│                                                         │
│  Step 2: Consolidation                                  │
│    raw/ → group, deduplicate → cache consolidated/      │
│                                                         │
│  Step 3: Temporal Aggregation                           │
│    consolidated/ → 30min → hourly → daily → monthly     │
│    with finality tracking (final vs partial)            │
│                                                         │
│  Step 4: Archive                                        │
│    processed raw logs → S3 Glacier/IA                   │
│    live bucket = queue of unprocessed files              │
└─────────────────────────────────────────────────────────┘
    │
    ▼
Cache Service (MGraph-AI)
    │  namespaces: sa/cloudfront/raw/, consolidated/, aggregate/
    │
    ▼
SA REST API (Admin Lambda, /api/sa/*)
    │
    ▼
Admin UI (cache browser, traffic dashboard)
```

---

## The Existing Code You're Extending

### Already built (use as patterns, don't rewrite)

| Component | File | Purpose |
|-----------|------|---------|
| CloudFront log collector | `sgraph_ai_app_send/lambda__admin/server_analytics/collectors/CloudFront__Logs__Collector.py` | Reads S3, parses tab-delimited logs |
| Cache client wrapper | `sgraph_ai_app_send/lambda__admin/service/Send__Cache__Client.py` | Domain wrapper over MGraph-AI cache |
| Metrics routes | `sgraph_ai_app_send/lambda__admin/server_analytics/Routes__Metrics.py` | Pattern for adding FastAPI routes |
| Metrics collector | `sgraph_ai_app_send/lambda__admin/server_analytics/Service__Metrics__Collector.py` | Orchestrates collection |
| Metrics cache | `sgraph_ai_app_send/lambda__admin/server_analytics/Service__Metrics__Cache.py` | Cache layer with TTL |
| Pipeline setup | `sgraph_ai_app_send/lambda__admin/server_analytics/Metrics__Pipeline__Setup.py` | Factory pattern for pipeline |
| Admin FastAPI app | `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py` | Where routes are registered |
| Admin config | `sgraph_ai_app_send/lambda__admin/admin__config.py` | Environment variables |

### What needs to be built

| Component | Suggested Location | Purpose |
|-----------|-------------------|---------|
| SA log ingestion service | `server_analytics/sa/Service__SA__Log__Ingestion.py` | Step 1: raw parse → cache |
| SA consolidation service | `server_analytics/sa/Service__SA__Consolidation.py` | Step 2: group, deduplicate |
| SA temporal aggregation | `server_analytics/sa/Service__SA__Temporal__Aggregation.py` | Step 3: time-window rollups |
| SA archive service | `server_analytics/sa/Service__SA__Archive.py` | Step 4: move to Glacier |
| Finality tracker | `server_analytics/sa/Schema__SA__Finality.py` | Metadata for final/partial |
| SA routes | `fast_api/routes/Routes__SA.py` | REST endpoints under `/api/sa/` |
| SA pipeline setup | `server_analytics/sa/SA__Pipeline__Setup.py` | Factory wiring |

---

## The Log Format

CloudFront real-time logs are tab-delimited with these fields (in order):

```
timestamp              # epoch seconds (float)
sc-status              # HTTP status code
sc-bytes               # Bytes sent to client
cs-method              # HTTP method (GET, POST, etc.)
cs-uri-stem            # URL path
cs-uri-query           # Query string
cs-protocol            # HTTP or HTTPS
cs-protocol-version    # HTTP/1.1, HTTP/2, HTTP/3
sc-content-type        # Response content type
sc-content-len         # Response content length
cs-user-agent          # Browser user agent
cs-referer             # Referrer header
x-edge-location        # CloudFront POP (e.g. LHR62-C5)
x-edge-result-type     # Hit, Miss, Error, etc.
x-edge-response-result-type  # Final result type
x-edge-request-id      # Unique request ID
time-taken             # Total serve time (seconds)
time-to-first-byte     # TTFB from origin
sc-range-start         # Range request start
sc-range-end           # Range request end
ssl-protocol           # TLS version
ssl-cipher             # TLS cipher suite
cs-accept              # Accept header
cs-accept-encoding     # Accept-Encoding header
cs-host                # Host header
origin-fbl             # Origin first-byte latency
origin-lbl             # Origin last-byte latency
```

**Critical:** `c-ip` (client IP) is deliberately NOT in this list. This is a privacy-by-design decision. Tests must empirically verify this.

---

## SA REST API Design

All endpoints live under `/api/sa/` on the Admin Lambda. They are admin-only (API key required).

### Pipeline Operations

```
POST /api/sa/cloudfront/ingest           # Step 1: ingest raw logs from S3
POST /api/sa/cloudfront/consolidate      # Step 2: consolidate raw → grouped
POST /api/sa/cloudfront/aggregate        # Step 3: temporal aggregation
POST /api/sa/cloudfront/archive          # Step 4: archive processed logs
GET  /api/sa/cloudfront/status           # Pipeline status (unprocessed count, last run, etc.)
```

### Cache Browsing

```
GET  /api/sa/cache/browse/{path}         # Browse cache tree
GET  /api/sa/cache/entry/{cache_id}      # Read single cache entry
GET  /api/sa/cache/stats                 # Cache usage statistics
```

### Traffic Data (for dashboards)

```
GET  /api/sa/traffic/summary             # Current period traffic summary
GET  /api/sa/traffic/timeseries          # Time-series data for charts
GET  /api/sa/traffic/top-paths           # Most requested paths
GET  /api/sa/traffic/edge-locations      # CloudFront POP distribution
GET  /api/sa/traffic/status-codes        # HTTP status code breakdown
```

---

## Cache Key Structure

All pipeline output is stored in the MGraph-AI Cache Service under structured keys:

```
sa/cloudfront/raw/{YYYY-MM-DD}/{HH-MM}/{log-file-hash}
sa/cloudfront/consolidated/{YYYY-MM-DD}/{HH-MM}/summary
sa/cloudfront/aggregate/30min/{YYYY-MM-DD-HHMM}
sa/cloudfront/aggregate/hourly/{YYYY-MM-DD-HH}
sa/cloudfront/aggregate/daily/{YYYY-MM-DD}
sa/cloudfront/aggregate/monthly/{YYYY-MM}
```

### Finality Metadata

Each aggregate entry has a `__meta.json` with:

```json
{
    "status"       : "final",
    "computed_at"  : "2026-02-16T14:30:00Z",
    "source_count" : 12,
    "sources_final": true
}
```

- `final` — all source data is complete, no recomputation needed
- `partial` — source data may still arrive, recompute on next request

**Cascade rule:** A period is `final` only when ALL its source periods are `final`:
- `30min` is final when all raw log files for that window have been ingested
- `hourly` is final when all six 30min windows are final
- `daily` is final when all 24 hourly windows are final
- `monthly` is final when all daily windows are final

---

## Testing Strategy

Tests use the in-memory stack (no AWS, no mocks):

1. **Unit tests** — each service class independently with in-memory cache
2. **Integration tests** — full pipeline (ingest → consolidate → aggregate) with synthetic log data
3. **IP address verification tests** — parse sample logs, assert no field contains an IP address pattern
4. **Live tests** (run by human) — connect to real S3 bucket, process real logs, verify end-to-end

### Test data approach

Create synthetic tab-delimited log files matching the real format. Include edge cases:
- Empty lines, comment lines (starting with `#`)
- Missing fields (`-` value)
- Multiple HTTP methods, status codes, edge locations
- Gzip-compressed files
- Files with zero records

---

## How to Read This Pack

| File | Purpose |
|------|---------|
| `BRIEF.md` | This file — start here |
| `architecture.md` | Detailed architecture with Type_Safe schemas and cache patterns |
| `code-context.md` | Actual source code from the existing codebase (method streams) |
| `addenda/appsec.md` | AppSec requirements — IP verification, data classification |
| `addenda/devops.md` | Infrastructure context — S3 buckets, Firehose config, env vars |
| `reference/caching-service-summary.md` | How the MGraph-AI Cache Service works |
| `reference/lets-pipeline-summary.md` | The LETS methodology explained |
| `.issues/tasks.issues` | Task breakdown for this workstream |
