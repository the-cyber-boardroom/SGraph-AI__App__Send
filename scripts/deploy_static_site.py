#!/usr/bin/env python3
"""Deploy a static website to S3 with versioned releases and CloudFront invalidation.

Follows the v0.7.6 architecture brief: CI pipeline logic lives in Python,
GitHub Actions is just the trigger and executor.

Deployment model (IFD overlay):
  1. Validate required files exist
  2. Sync to S3: websites/{site}/{env}/releases/{version}/  (archive)
  3. Overlay release onto: websites/{site}/{env}/latest/     (no --delete)
  4. Invalidate CloudFront cache

IFD overlay means latest/ accumulates files across patch versions.
v0.2.0 (full base) + v0.2.1 (overrides) = latest/ has the union of both.
Rollback = re-sync a previous release folder. Cleanup = deliberate manual step.

When --deploy-env is provided (e.g. dev, main, prod), content is isolated
under that environment prefix. Each branch deploys to its own S3 folder:
  websites/sgraph-vault/dev/    — dev branch
  websites/sgraph-vault/main/   — main branch
  websites/sgraph-vault/prod/   — production

S3 bucket naming convention: {account-id}--static-sgraph-ai--{region}

Cache-Control strategy:
  - HTML files:  short cache  (300s / 5 minutes)
  - CSS/JS/JSON: medium cache (86400s / 1 day)
  - Images:      long cache   (604800s / 1 week)

CloudFront TTL configuration (applied via cache policy):
  - Default TTL: 300 seconds  (5 minutes)
  - Max TTL:     3600 seconds (1 hour)
  - Min TTL:     0 seconds
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CONTENT_TYPE_MAP = {
    ".html":  "text/html",
    ".css":   "text/css",
    ".js":    "application/javascript",
    ".json":  "application/json",
    ".png":   "image/png",
    ".jpg":   "image/jpeg",
    ".jpeg":  "image/jpeg",
    ".gif":   "image/gif",
    ".svg":   "image/svg+xml",
    ".ico":   "image/x-icon",
    ".webp":  "image/webp",
    ".woff2": "font/woff2",
    ".woff":  "font/woff",
    ".ttf":   "font/ttf",
}

CACHE_CONTROL = {
    "html":   "public, max-age=300",       # 5 minutes
    "css_js": "public, max-age=86400",     # 1 day
    "image":  "public, max-age=604800",    # 1 week
}

HTML_EXTENSIONS  = {".html"}
CSS_JS_EXTENSIONS = {".css", ".js", ".json"}
IMAGE_EXTENSIONS  = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp"}
FONT_EXTENSIONS   = {".woff2", ".woff", ".ttf"}

# CloudFront cache TTL configuration (seconds)
CLOUDFRONT_DEFAULT_TTL = 300    # 5 minutes
CLOUDFRONT_MAX_TTL     = 3600   # 1 hour
CLOUDFRONT_MIN_TTL     = 0      # 0 seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_cmd(cmd, description="", check=True):
    """Run a shell command via subprocess. Print output in real time."""
    if description:
        print(f"\n--- {description} ---")
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        for line in result.stdout.strip().split("\n"):
            print(f"  {line}")
    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            print(f"  [stderr] {line}")
    if check and result.returncode != 0:
        print(f"\nERROR: command exited with code {result.returncode}")
        sys.exit(result.returncode)
    return result


def resolve_bucket_name(account_id, region):
    """Build the S3 bucket name from account ID and region.

    Convention: {account-id}--static-sgraph-ai--{region}
    """
    return f"{account_id}--static-sgraph-ai--{region}"


def version_to_ifd_path(version):
    """Convert a version string to IFD nested path.

    IFD versioning nests releases as: v{major}/v{major}.{minor}/v{major}.{minor}.{patch}
    Examples:
        v0.7.7   -> v0/v0.7/v0.7.7
        v1.2.3   -> v1/v1.2/v1.2.3
        v0.10.1  -> v0/v0.10/v0.10.1
    """
    clean = version.lstrip("v")
    parts = clean.split(".")
    if len(parts) != 3:
        print(f"WARNING: version '{version}' doesn't match X.Y.Z — using flat path")
        return version
    major, minor, _patch = parts
    return f"v{major}/v{major}.{minor}/v{major}.{minor}.{_patch}"


def cache_control_for(extension):
    """Return the Cache-Control header value for a given file extension."""
    if extension in HTML_EXTENSIONS:
        return CACHE_CONTROL["html"]
    if extension in CSS_JS_EXTENSIONS:
        return CACHE_CONTROL["css_js"]
    if extension in IMAGE_EXTENSIONS:
        return CACHE_CONTROL["image"]
    return CACHE_CONTROL["html"]          # default to short cache


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_website_files(site_dir):
    """Check that expected HTML files exist. Warn but do not fail if missing."""
    required_files = [
        "index.html",
        "product/index.html",
        "agents/index.html",
        "architecture/index.html",
        "contact/index.html",
    ]
    print("\n--- Validating required HTML files ---")
    missing = 0
    for rel in required_files:
        full_path = site_dir / rel
        if full_path.exists():
            print(f"  OK: {rel}")
        else:
            print(f"  MISSING: {rel}")
            missing += 1
    if missing:
        print(f"\n  WARNING: {missing} required file(s) missing")
        print("  Continuing — some pages may still be in development")
    return missing


def validate_keys_json(site_dir):
    """Validate agents/keys.json is valid JSON if it exists."""
    keys_file = site_dir / "agents" / "keys.json"
    print("\n--- Validating keys.json ---")
    if not keys_file.exists():
        print("  SKIP: keys.json does not exist yet")
        return True
    try:
        with open(keys_file) as f:
            json.load(f)
        print("  OK: keys.json is valid JSON")
        return True
    except json.JSONDecodeError as exc:
        print(f"  ERROR: keys.json is NOT valid JSON — {exc}")
        return False


def check_broken_links(site_dir):
    """Scan HTML files for broken internal links. Warn but do not fail."""
    print("\n--- Checking internal links in HTML files ---")
    import re
    broken = 0
    for html_file in site_dir.rglob("*.html"):
        with open(html_file) as f:
            content = f.read()
        hrefs = re.findall(r'href="(/[^"#?]*)"', content)
        for href in hrefs:
            relative_path = href.lstrip("/")
            target = site_dir / relative_path
            if target.is_file() or (target / "index.html").is_file():
                continue
            print(f"  BROKEN: {html_file.relative_to(site_dir)} -> {href}")
            broken += 1
    if broken:
        print(f"\n  WARNING: {broken} potentially broken internal link(s) found")
    else:
        print("  No broken internal links detected")
    return broken


# ---------------------------------------------------------------------------
# S3 sync helpers
# ---------------------------------------------------------------------------

def s3_sync_by_type(source_dir, s3_prefix, file_type, extensions, cache_control,
                    content_type=None, delete=False):
    """Sync a specific file type from source_dir to an S3 prefix.

    Uses `aws s3 sync` via subprocess for performance (per v0.7.6 brief:
    "If a step requires invoking a CLI tool like `aws s3 sync` because it's
    faster than a Python equivalent, invoke it via subprocess from Python").
    """
    cmd = ["aws", "s3", "sync", str(source_dir) + "/", s3_prefix]

    if file_type == "html":
        # For HTML: sync everything, exclude non-HTML, exclude dotfiles and README
        cmd += ["--exclude", "README.md", "--exclude", ".*", "--exclude", "cloudfront/*"]
        for ext in CSS_JS_EXTENSIONS | IMAGE_EXTENSIONS | FONT_EXTENSIONS:
            cmd += ["--exclude", f"*{ext}"]
        if delete:
            cmd += ["--delete"]
    else:
        # For other types: exclude everything, then include only matching extensions
        cmd += ["--exclude", "*"]
        for ext in extensions:
            cmd += ["--include", f"*{ext}"]

    if content_type:
        cmd += ["--content-type", content_type]
    cmd += ["--cache-control", cache_control]

    description = f"Syncing {file_type} files"
    run_cmd(cmd, description=description)


def upload_version_file(version_file, bucket, site, deploy_env=None):
    """Upload a version file to the site root so it's accessible at /version.

    This makes the app version available at e.g. https://sgraph.ai/version,
    https://send.sgraph.ai/version, etc. — a plain text file with no extension.
    """
    version_path = Path(version_file)
    if not version_path.is_file():
        print(f"\n  WARNING: version file not found: {version_file} — skipping version upload")
        return

    env_segment = f"{deploy_env}/" if deploy_env else ""
    s3_key = f"s3://{bucket}/websites/{site}/{env_segment}latest/version"

    print(f"\n--- Uploading version file to site root ---")
    run_cmd(
        ["aws", "s3", "cp", str(version_path), s3_key,
         "--content-type", "text/plain",
         "--cache-control", CACHE_CONTROL["html"]],      # short cache (5 min) — same as HTML
        description=f"Uploading {version_file} → {s3_key}"
    )


def clean_latest(bucket, site, deploy_env=None):
    """Delete all files in latest/ to prepare for a clean rebuild.

    Use this when stale files from previous deployments contaminate latest/
    (e.g. renamed files leaving ghost copies, or major IFD version bumps).
    After cleaning, deploy all versions in order to rebuild the overlay.
    """
    env_segment = f"{deploy_env}/" if deploy_env else ""
    latest_prefix = f"s3://{bucket}/websites/{site}/{env_segment}latest/"

    print(f"\n{'='*60}")
    print(f"CLEAN: Deleting all files in {latest_prefix}")
    print(f"{'='*60}")

    run_cmd(
        ["aws", "s3", "rm", "--recursive", latest_prefix],
        description=f"Removing all objects under {latest_prefix}"
    )


def list_releases(bucket, site, deploy_env=None):
    """List all release versions deployed to S3, sorted by version number.

    Returns a list of version strings (e.g. ['v0.2.0', 'v0.2.1']).
    """
    env_segment = f"{deploy_env}/" if deploy_env else ""
    releases_prefix = f"s3://{bucket}/websites/{site}/{env_segment}releases/"

    result = run_cmd(
        ["aws", "s3", "ls", releases_prefix, "--recursive"],
        description="Listing release versions",
        check=False
    )

    # Parse S3 listing to extract unique version paths
    versions = set()
    for line in (result.stdout or '').strip().split('\n'):
        if not line.strip():
            continue
        # Extract the path after releases/ — format: releases/v0/v0.2/v0.2.0/...
        parts = line.strip().split()
        if len(parts) < 4:
            continue
        key = parts[3]  # the S3 key
        # Find the releases/ segment and extract the version path
        rel_idx = key.find('releases/')
        if rel_idx < 0:
            continue
        after_releases = key[rel_idx + len('releases/'):]
        # IFD path is v0/v0.2/v0.2.0/... — extract the third segment as the version
        segments = after_releases.split('/')
        if len(segments) >= 3:
            versions.add(segments[2])   # e.g. 'v0.2.0'

    # Sort versions numerically
    def version_key(v):
        try:
            return tuple(int(x) for x in v.lstrip('v').split('.'))
        except ValueError:
            return (0, 0, 0)

    sorted_versions = sorted(versions, key=version_key)
    print(f"  Found {len(sorted_versions)} release(s): {', '.join(sorted_versions)}")
    return sorted_versions


def rebuild_latest_from_releases(bucket, site, deploy_env=None):
    """Rebuild latest/ by replaying all releases in version order.

    1. Delete everything in latest/
    2. List all releases in releases/
    3. Sync each release to latest/ in version order (oldest first)

    This produces a clean IFD overlay with no ghost files.
    """
    env_segment = f"{deploy_env}/" if deploy_env else ""
    latest_prefix = f"s3://{bucket}/websites/{site}/{env_segment}latest/"

    # Step 1: Clean latest/
    clean_latest(bucket, site, deploy_env)

    # Step 2: List releases
    versions = list_releases(bucket, site, deploy_env)
    if not versions:
        print("\n  WARNING: No releases found — latest/ is now empty")
        return

    # Step 3: Replay each release onto latest/ in order
    for version in versions:
        ifd_path = version_to_ifd_path(version)
        release_prefix = f"s3://{bucket}/websites/{site}/{env_segment}releases/{ifd_path}/"

        print(f"\n{'='*60}")
        print(f"Rebuilding latest/ — overlaying {version}")
        print(f"{'='*60}")

        # Sync from S3 release → S3 latest (server-side copy, no download)
        run_cmd(
            ["aws", "s3", "sync", release_prefix, latest_prefix,
             "--no-progress"],
            description=f"Overlaying {version} onto latest/"
        )

    print(f"\n  Rebuild complete — latest/ now contains {len(versions)} version(s) overlaid in order")


def sync_all_types_to_s3(source_dir, s3_prefix, delete=False):
    """Sync all file types from source_dir to an S3 prefix."""
    s3_sync_by_type(source_dir, s3_prefix, "html",
                    HTML_EXTENSIONS, CACHE_CONTROL["html"],
                    content_type="text/html", delete=delete)

    s3_sync_by_type(source_dir, s3_prefix, "css",
                    {".css"}, CACHE_CONTROL["css_js"],
                    content_type="text/css")

    s3_sync_by_type(source_dir, s3_prefix, "js",
                    {".js"}, CACHE_CONTROL["css_js"],
                    content_type="application/javascript")

    s3_sync_by_type(source_dir, s3_prefix, "json",
                    {".json"}, CACHE_CONTROL["css_js"],
                    content_type="application/json")

    s3_sync_by_type(source_dir, s3_prefix, "image",
                    IMAGE_EXTENSIONS, CACHE_CONTROL["image"])

    s3_sync_by_type(source_dir, s3_prefix, "font",
                    FONT_EXTENSIONS, CACHE_CONTROL["image"])


def deploy_to_s3(source_dir, bucket, site, version, deploy_env=None, do_clean_latest=False):
    """Deploy the static site to S3 using the versioned deployment model.

    Step 1: Sync to websites/{site}/{env}/releases/{ifd_path}/  (IFD versioning)
    Step 2: Optionally clean latest/ (--clean-latest)
    Step 3: Copy the release to websites/{site}/{env}/latest/

    When deploy_env is provided (e.g. 'dev', 'main', 'prod'), files are isolated
    under that environment prefix. Without it, files go to the site root (legacy).

    IFD versioning: v0.7.7 -> releases/v0/v0.7/v0.7.7/
    """
    ifd_path = version_to_ifd_path(version)
    env_segment = f"{deploy_env}/" if deploy_env else ""
    release_prefix = f"s3://{bucket}/websites/{site}/{env_segment}releases/{ifd_path}/"
    latest_prefix  = f"s3://{bucket}/websites/{site}/{env_segment}latest/"

    # ----- Deploy to releases/{ifd_path}/ -----
    print(f"\n{'='*60}")
    print(f"Deploying to releases/{ifd_path}/")
    print(f"{'='*60}")

    sync_all_types_to_s3(source_dir, release_prefix, delete=True)

    # ----- Optionally clean latest/ before overlay -----
    if do_clean_latest:
        clean_latest(bucket, site, deploy_env)

    # ----- Overlay release onto latest/ -----
    # IFD overlay model: sync source directly to latest/ WITHOUT --delete.
    # Each patch version adds/overwrites files on top of what's already in latest/.
    # This preserves files from previous versions (e.g. v0.2.0 base files remain
    # when v0.2.1 overrides are deployed). Rollback = re-sync a previous release.
    # Cleanup of stale files is a deliberate, manual step (e.g. major version bump).
    print(f"\n{'='*60}")
    print(f"Overlaying release onto latest/ (IFD — preserving previous files)")
    print(f"{'='*60}")

    sync_all_types_to_s3(str(source_dir), latest_prefix, delete=False)


# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

def invalidate_cloudfront(distribution_id):
    """Invalidate the CloudFront cache for all paths."""
    if not distribution_id:
        print("\n  SKIP: No CloudFront distribution ID provided")
        return
    print(f"\n--- Invalidating CloudFront cache ---")
    run_cmd(
        ["aws", "cloudfront", "create-invalidation",
         "--distribution-id", distribution_id,
         "--paths", "/*"],
        description=f"CloudFront invalidation ({distribution_id})"
    )


def print_cloudfront_ttl_config():
    """Print the CloudFront cache TTL configuration for reference."""
    print(f"\n--- CloudFront Cache TTL Configuration ---")
    print(f"  Default TTL : {CLOUDFRONT_DEFAULT_TTL}s ({CLOUDFRONT_DEFAULT_TTL // 60} minutes)")
    print(f"  Max TTL     : {CLOUDFRONT_MAX_TTL}s ({CLOUDFRONT_MAX_TTL // 60} minutes)")
    print(f"  Min TTL     : {CLOUDFRONT_MIN_TTL}s")
    print(f"  Note: TTL values are configured via CloudFront cache policy.")
    print(f"  The Cache-Control headers set during S3 upload guide caching")
    print(f"  behaviour within these TTL bounds.")


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

def smoke_test(url):
    """Verify the deployed site returns HTTP 200."""
    if not url:
        print("\n  SKIP: No URL provided for smoke test")
        return True
    print(f"\n--- Smoke test: {url} ---")
    result = run_cmd(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", url],
        description=f"Testing {url}",
        check=False
    )
    status = result.stdout.strip()
    if status == "200":
        print(f"  OK: {url} returned HTTP 200")
        return True
    else:
        print(f"  WARNING: {url} returned HTTP {status} (expected 200)")
        print(f"  CloudFront invalidation may still be in progress")
        return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Deploy a static website to S3 with versioned releases."
    )
    parser.add_argument(
        "--site",
        required=True,
        help="Site identifier (e.g. 'sgraph-ai'). Used in S3 paths: websites/{site}/",
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Version tag for this release (e.g. 'v0.7.6'). Creates releases/{version}/",
    )
    parser.add_argument(
        "--source-dir",
        required=True,
        help="Local directory containing the static site files to deploy.",
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
        "--cloudfront-distribution-id",
        nargs="+",
        default=[],
        help="CloudFront distribution ID(s) for cache invalidation. Multiple IDs can be provided.",
    )
    parser.add_argument(
        "--smoke-test-url",
        default="",
        help="URL to test after deployment (e.g. 'https://sgraph.ai'). Optional.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip file validation checks before deployment.",
    )
    parser.add_argument(
        "--deploy-env",
        default=None,
        help="Environment prefix for S3 path isolation (e.g. 'dev', 'main', 'prod'). "
             "Creates websites/{site}/{env}/releases/ and websites/{site}/{env}/latest/. "
             "Without this, deploys to websites/{site}/ directly (legacy behaviour).",
    )
    parser.add_argument(
        "--version-file",
        default=None,
        help="Path to a version file to upload to the site root as /version. "
             "Makes the app version accessible at e.g. https://sgraph.ai/version. "
             "Typically: sgraph_ai_app_send/version",
    )
    parser.add_argument(
        "--clean-latest",
        action="store_true",
        help="Delete all files in latest/ before overlaying. Use when stale files "
             "contaminate latest/ (e.g. renamed files leaving ghost copies). "
             "WARNING: After cleaning, only the current version's files will be in "
             "latest/ — use --rebuild-latest instead to replay all versions.",
    )
    parser.add_argument(
        "--rebuild-latest",
        action="store_true",
        help="Rebuild latest/ from scratch by replaying all releases in version order. "
             "Deletes latest/, lists all versions in releases/, and overlays them "
             "oldest-first. Produces a clean IFD overlay with no ghost files. "
             "Skips the normal deploy — only rebuilds latest/ from existing releases.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without executing S3 commands.",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    source_dir = Path(args.source_dir).resolve()
    if not source_dir.is_dir():
        print(f"ERROR: source directory does not exist: {source_dir}")
        sys.exit(1)

    # Resolve bucket name
    bucket = args.bucket
    if not bucket:
        if not args.account_id:
            print("ERROR: either --bucket or --account-id must be provided")
            sys.exit(1)
        bucket = resolve_bucket_name(args.account_id, args.region)
    print(f"Site       : {args.site}")
    print(f"Version    : {args.version}")
    print(f"Source     : {source_dir}")
    print(f"Bucket     : {bucket}")
    print(f"Region     : {args.region}")
    if args.deploy_env:
        print(f"Deploy Env : {args.deploy_env}")
        print(f"S3 Path    : websites/{args.site}/{args.deploy_env}/")

    # CloudFront TTL reference
    print_cloudfront_ttl_config()

    if args.dry_run:
        print("\n*** DRY RUN — no changes will be made ***")

    # --- Validation ---
    if not args.skip_validation:
        validate_website_files(source_dir)
        check_broken_links(source_dir)
        if not validate_keys_json(source_dir):
            print("\nERROR: keys.json validation failed — aborting deployment")
            sys.exit(1)

    if args.dry_run:
        ifd_path = version_to_ifd_path(args.version)
        env_segment = f"{args.deploy_env}/" if args.deploy_env else ""
        if args.rebuild_latest:
            print(f"\n[dry-run] Would rebuild latest/ from all releases in s3://{bucket}/websites/{args.site}/{env_segment}releases/")
        else:
            if args.clean_latest:
                print(f"\n[dry-run] Would delete all files in s3://{bucket}/websites/{args.site}/{env_segment}latest/")
            print(f"[dry-run] Would deploy {source_dir} to s3://{bucket}/websites/{args.site}/{env_segment}releases/{ifd_path}/")
            print(f"[dry-run] Would copy release to s3://{bucket}/websites/{args.site}/{env_segment}latest/")
        if args.version_file:
            print(f"[dry-run] Would upload {args.version_file} to s3://{bucket}/websites/{args.site}/{env_segment}latest/version")
        for dist_id in args.cloudfront_distribution_id:
            print(f"[dry-run] Would invalidate CloudFront {dist_id}")
        print("\nDry run complete.")
        sys.exit(0)

    # --- Deploy ---
    if args.rebuild_latest:
        rebuild_latest_from_releases(bucket, args.site, deploy_env=args.deploy_env)
    else:
        deploy_to_s3(source_dir, bucket, args.site, args.version,
                     deploy_env=args.deploy_env, do_clean_latest=args.clean_latest)

    # --- Version file ---
    if args.version_file:
        upload_version_file(args.version_file, bucket, args.site, deploy_env=args.deploy_env)

    # --- CloudFront ---
    for dist_id in args.cloudfront_distribution_id:
        invalidate_cloudfront(dist_id)

    # --- Smoke test ---
    if args.smoke_test_url:
        smoke_test(args.smoke_test_url)

    ifd_path = version_to_ifd_path(args.version)
    env_segment = f"{args.deploy_env}/" if args.deploy_env else ""
    print(f"\n{'='*60}")
    print(f"Deployment complete: {args.site} {args.version}" + (f" [{args.deploy_env}]" if args.deploy_env else ""))
    print(f"  Release : s3://{bucket}/websites/{args.site}/{env_segment}releases/{ifd_path}/")
    print(f"  Latest  : s3://{bucket}/websites/{args.site}/{env_segment}latest/")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
