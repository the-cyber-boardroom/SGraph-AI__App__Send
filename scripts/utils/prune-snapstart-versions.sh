#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="${1:-}"
MODE="${2:---dry-run}"

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "Usage: $0 <lambda-function-name-or-arn> [--dry-run|--execute]"
  exit 1
fi

if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "Invalid mode: $MODE"
  echo "Usage: $0 <lambda-function-name-or-arn> [--dry-run|--execute]"
  exit 1
fi

command -v aws >/dev/null || {
  echo "Error: aws CLI is required"
  exit 1
}

command -v jq >/dev/null || {
  echo "Error: jq is required"
  exit 1
}

echo "Finding Lambda versions with SnapStart enabled for:"
echo "  $FUNCTION_NAME"
echo

SNAPSTART_VERSIONS=$(
  aws lambda list-versions-by-function \
    --function-name "$FUNCTION_NAME" \
    --output json |
  jq -r '
    .Versions[]
    | select(.Version != "$LATEST")
    | select(.SnapStart.ApplyOn == "PublishedVersions")
    | .Version
  '
)

if [[ -z "$SNAPSTART_VERSIONS" ]]; then
  echo "No published versions with SnapStart enabled found."
  exit 0
fi

echo "SnapStart-enabled versions found:"
echo "$SNAPSTART_VERSIONS" | sed 's/^/  version /'
echo

if [[ "$MODE" == "--dry-run" ]]; then
  echo "Dry run only. No versions were deleted."
  echo
  echo "To delete these versions, run:"
  echo "  $0 \"$FUNCTION_NAME\" --execute"
  exit 0
fi

echo "Deleting SnapStart-enabled versions..."
echo

while read -r VERSION; do
  [[ -z "$VERSION" ]] && continue

  echo "Deleting version $VERSION..."

  aws lambda delete-function \
    --function-name "$FUNCTION_NAME" \
    --qualifier "$VERSION"

done <<< "$SNAPSTART_VERSIONS"

echo
echo "Done."