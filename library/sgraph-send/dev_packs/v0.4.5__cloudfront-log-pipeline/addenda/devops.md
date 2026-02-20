# CloudFront Log Pipeline — DevOps Addendum

**Version:** v0.4.4
**Role:** DevOps

---

## Infrastructure Context

### Current State

CloudFront real-time logs are already configured and flowing:

```
CloudFront Distribution
    │
    ├── Real-time log configuration
    │     ├── Selected fields: 27 fields (see CF_LOG_FIELDS in code-context.md)
    │     ├── Excluded: c-ip (client IP) — by design
    │     └── Sampling rate: 100%
    │
    ▼
Kinesis Data Firehose delivery stream
    │
    ├── Buffer: 60 seconds or 1 MB (whichever first)
    ├── Compression: GZIP
    └── Error handling: retry for 24 hours
    │
    ▼
S3 Bucket (log delivery target)
    ├── Prefix: cloudfront-realtime/
    ├── Partitioning: year=YYYY/month=MM/day=DD/
    └── Format: tab-delimited, gzip-compressed files
```

### AWS Resources

| Resource | ID/Name | Region | Notes |
|----------|---------|--------|-------|
| CloudFront Distribution | Set via `SGRAPH_SEND__CLOUDFRONT_DISTRIBUTION_ID` | Global | `send.sgraph.ai` |
| Firehose Stream | (configured in CloudFront console) | eu-west-2 | Delivers to S3 |
| S3 Log Bucket | Set via new `SGRAPH_SEND__SA_LOGS_BUCKET` env var | eu-west-2 | Where logs land |
| Admin Lambda | Set via `SGRAPH_SEND__LAMBDA_ADMIN_NAME` | eu-west-2 | Where SA pipeline runs |

### Environment Variables to Add

These new environment variables are needed on the Admin Lambda:

```bash
SGRAPH_SEND__SA_LOGS_BUCKET=<bucket-name>       # S3 bucket with CloudFront logs
SGRAPH_SEND__SA_LOGS_PREFIX=cloudfront-realtime  # S3 key prefix (default)
SGRAPH_SEND__SA_ENABLED=true                     # Enable SA pipeline
```

Follow the existing pattern in `admin__config.py`.

### S3 Key Structure (what the pipeline reads)

```
cloudfront-realtime/
├── year=2026/
│   └── month=02/
│       ├── day=15/
│       │   ├── cloudfront-realtime-2-2026-02-15-14-30-00-abc123.gz
│       │   ├── cloudfront-realtime-2-2026-02-15-14-31-00-def456.gz
│       │   └── ...
│       └── day=16/
│           ├── cloudfront-realtime-2-2026-02-16-08-00-00-ghi789.gz
│           └── ...
```

Each file is:
- Gzip-compressed
- Tab-delimited
- Contains one log record per line
- May contain comment lines starting with `#`
- Delivered in ~60-second batches by Firehose

### Domain Architecture (Decision D054)

All environments use `sgraph.ai`:
- `dev.send.sgraph.ai` — development
- `qa.send.sgraph.ai` — quality assurance
- `send.sgraph.ai` — production

Route 53 is in the same AWS account (Decision D056). DevOps has direct access.

### Lambda Placement (Decision D055)

The SA pipeline runs on the **existing Admin Lambda**. No new Lambda function is needed. The SA endpoints are additive routes under `/api/sa/`.

### Future: Archive Step (Step 4)

When implementing Step 4 (archive), the pipeline will:
1. Move processed log files from the live prefix to an archive prefix or S3 Glacier/IA
2. This effectively treats the live S3 bucket as a queue: unprocessed files are "pending", processed files get archived

This is NOT Phase 1. Build Steps 1–3 first.
