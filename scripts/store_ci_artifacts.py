#!/usr/bin/env python3
"""Store CI build artifacts (git diff, commit messages, build log) to S3.

Follows the v0.7.6 architecture brief: CI pipeline logic lives in Python,
GitHub Actions is just the trigger and executor.

Artifacts are stored under: ci/{date}/{version}/
  - git-diff.txt       — diff of changes in this build
  - commit-messages.txt — recent commit messages
  - build-log.txt      — build output log (if provided)
  - build-metadata.json — structured metadata about the build

S3 bucket naming convention: {account-id}--static-sgraph-ai--{region}
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd, description="", check=True, capture=True):
    """Run a shell command via subprocess."""
    if description:
        print(f"\n--- {description} ---")
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=capture, text=True)
    if not capture:
        return result
    if check and result.returncode != 0:
        if result.stderr:
            print(f"  [stderr] {result.stderr.strip()}")
        print(f"\nERROR: command exited with code {result.returncode}")
        sys.exit(result.returncode)
    return result


def resolve_bucket_name(account_id, region):
    """Build the S3 bucket name from account ID and region.

    Convention: {account-id}--static-sgraph-ai--{region}
    """
    return f"{account_id}--static-sgraph-ai--{region}"


def get_git_diff(commit_range=None):
    """Get the git diff for the current build.

    If commit_range is provided (e.g. 'HEAD~5..HEAD'), use it.
    Otherwise, diff against the previous commit.
    """
    if commit_range:
        cmd = ["git", "diff", commit_range]
    else:
        cmd = ["git", "diff", "HEAD~1..HEAD"]
    result = run_cmd(cmd, description="Collecting git diff", check=False)
    if result.returncode != 0:
        # Fallback: if HEAD~1 doesn't exist (first commit), show all files
        result = run_cmd(["git", "diff", "--cached", "HEAD"], description="Fallback diff", check=False)
    return result.stdout or "(no diff available)"


def get_commit_messages(count=20):
    """Get recent commit messages."""
    cmd = ["git", "log", f"--max-count={count}", "--format=%H %s"]
    result = run_cmd(cmd, description=f"Collecting last {count} commit messages", check=False)
    return result.stdout or "(no commit messages available)"


def get_git_metadata():
    """Collect git metadata for the build."""
    metadata = {}

    # Current commit SHA
    result = run_cmd(["git", "rev-parse", "HEAD"], check=False)
    metadata["commit_sha"] = result.stdout.strip() if result.returncode == 0 else "unknown"

    # Current branch
    result = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], check=False)
    metadata["branch"] = result.stdout.strip() if result.returncode == 0 else "unknown"

    # Commit author
    result = run_cmd(["git", "log", "-1", "--format=%an <%ae>"], check=False)
    metadata["author"] = result.stdout.strip() if result.returncode == 0 else "unknown"

    # Commit timestamp
    result = run_cmd(["git", "log", "-1", "--format=%aI"], check=False)
    metadata["commit_timestamp"] = result.stdout.strip() if result.returncode == 0 else "unknown"

    return metadata


def upload_to_s3(local_path, s3_uri, content_type="text/plain"):
    """Upload a single file to S3 using aws CLI."""
    cmd = ["aws", "s3", "cp", str(local_path), s3_uri,
           "--content-type", content_type]
    run_cmd(cmd, description=f"Uploading to {s3_uri}")


def upload_content_to_s3(content, s3_uri, content_type="text/plain"):
    """Upload string content to S3 by writing to a temp file first."""
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(content)
        tmp_path = f.name
    try:
        upload_to_s3(tmp_path, s3_uri, content_type)
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Store CI build artifacts (git diff, commit messages, build log) to S3."
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Version tag for this build (e.g. 'v0.7.6').",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="Date string for the artifact path (YYYY-MM-DD). Default: today (UTC).",
    )
    parser.add_argument(
        "--bucket",
        default=None,
        help="S3 bucket name. If not provided, derived from --account-id and --region.",
    )
    parser.add_argument(
        "--account-id",
        default=os.environ.get("AWS_ACCOUNT_ID", ""),
        help="AWS account ID (for bucket name convention). Default: $AWS_ACCOUNT_ID",
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "eu-west-2")),
        help="AWS region. Default: $AWS_REGION or eu-west-2",
    )
    parser.add_argument(
        "--build-log",
        default=None,
        help="Path to a build log file to include in artifacts.",
    )
    parser.add_argument(
        "--commit-range",
        default=None,
        help="Git commit range for the diff (e.g. 'HEAD~5..HEAD'). Default: HEAD~1..HEAD",
    )
    parser.add_argument(
        "--commit-count",
        type=int,
        default=20,
        help="Number of recent commit messages to include. Default: 20",
    )
    parser.add_argument(
        "--site",
        default="",
        help="Site identifier for metadata (e.g. 'sgraph-ai'). Optional.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without uploading to S3.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    # Resolve date
    date_str = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Resolve bucket name
    bucket = args.bucket
    if not bucket:
        if not args.account_id:
            print("ERROR: either --bucket or --account-id must be provided")
            sys.exit(1)
        bucket = resolve_bucket_name(args.account_id, args.region)

    s3_base = f"s3://{bucket}/ci/{date_str}/{args.version}"

    print(f"Version    : {args.version}")
    print(f"Date       : {date_str}")
    print(f"Bucket     : {bucket}")
    print(f"S3 path    : ci/{date_str}/{args.version}/")

    # --- Collect artifacts ---

    # 1. Git diff
    print("\n" + "=" * 60)
    print("Collecting git diff")
    print("=" * 60)
    git_diff = get_git_diff(args.commit_range)

    # 2. Commit messages
    print("\n" + "=" * 60)
    print("Collecting commit messages")
    print("=" * 60)
    commit_messages = get_commit_messages(args.commit_count)

    # 3. Build log (optional)
    build_log = None
    if args.build_log:
        build_log_path = Path(args.build_log)
        if build_log_path.is_file():
            print(f"\nReading build log from: {build_log_path}")
            build_log = build_log_path.read_text()
        else:
            print(f"\nWARNING: Build log file not found: {build_log_path}")

    # 4. Build metadata
    git_meta = get_git_metadata()
    build_metadata = {
        "version"          : args.version,
        "date"             : date_str,
        "site"             : args.site,
        "timestamp_utc"    : datetime.now(timezone.utc).isoformat(),
        "git"              : git_meta,
        "artifacts_s3_path": f"ci/{date_str}/{args.version}/",
        "bucket"           : bucket,
    }

    if args.dry_run:
        print(f"\n*** DRY RUN — no uploads will be made ***")
        print(f"\n[dry-run] Would upload git-diff.txt       -> {s3_base}/git-diff.txt")
        print(f"[dry-run] Would upload commit-messages.txt -> {s3_base}/commit-messages.txt")
        print(f"[dry-run] Would upload build-metadata.json -> {s3_base}/build-metadata.json")
        if build_log is not None:
            print(f"[dry-run] Would upload build-log.txt   -> {s3_base}/build-log.txt")
        print(f"\nBuild metadata:")
        print(json.dumps(build_metadata, indent=2))
        print("\nDry run complete.")
        sys.exit(0)

    # --- Upload artifacts ---
    print("\n" + "=" * 60)
    print("Uploading artifacts to S3")
    print("=" * 60)

    upload_content_to_s3(git_diff, f"{s3_base}/git-diff.txt")
    upload_content_to_s3(commit_messages, f"{s3_base}/commit-messages.txt")
    upload_content_to_s3(
        json.dumps(build_metadata, indent=2),
        f"{s3_base}/build-metadata.json",
        content_type="application/json"
    )
    if build_log is not None:
        upload_content_to_s3(build_log, f"{s3_base}/build-log.txt")

    print(f"\n{'='*60}")
    print(f"CI artifacts stored: {s3_base}/")
    print(f"  - git-diff.txt")
    print(f"  - commit-messages.txt")
    print(f"  - build-metadata.json")
    if build_log is not None:
        print(f"  - build-log.txt")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
