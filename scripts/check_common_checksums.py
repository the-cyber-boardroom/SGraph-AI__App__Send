#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# Byte-identical-`_common/` check for the v0.4.x share + open trees.
#
# Both __share/ and __open/ carry their own copy of `_common/` utilities at
# v0.4.0 (the duplication is the deliberate trade-off documented in the plan
# at team/roles/architect/reviews/05/10/v0.27.29__plan__v0.4.0-major-release.md
# §3.3 and §9). Until those utilities are extracted to tools.sgraph.ai
# (§14 deferred follow-up), this check catches drift early.
#
# Exit code 0 if every file in the manifest matches between trees, OR if at
# least one side does not yet have the file (Phase A0 starts with empty
# trees, so missing files are tolerated). Exit code 1 if both sides have the
# file but their SHA-256 differs.
# ---------------------------------------------------------------------------
import hashlib
import sys
from pathlib import Path

REPO_ROOT  = Path(__file__).resolve().parent.parent
SHARE_BASE = REPO_ROOT / "sgraph_ai_app_send__ui__share/v0/v0.4/v0.4.0/en-gb/_common"
OPEN_BASE  = REPO_ROOT / "sgraph_ai_app_send__ui__open/v0/v0.4/v0.4.0/en-gb/_common"

# Files expected to be byte-identical between the two trees' `_common/`.
# Keep this list in sync with §3.3 and §9 of the v0.4.0 plan.
MANIFEST = [
    "js/api-client.js",
    "js/crypto.js",
    "js/friendly-crypto.js",
    "js/i18n.js",
    "js/send-icons.js",
    "js/qr-code.js",
    "js/base/send-component.js",
    "js/base/send-helpers.js",
    "js/base/send-component-paths.js",
    "js/components/send-header/send-header.js",
    "js/components/send-footer/send-footer.js",
    "js/components/send-locale/send-locale.js",
    "js/components/send-access-gate/send-access-gate.js",
    "js/components/send-transparency/send-transparency.js",
    "js/components/sg-vault-picker/sg-vault-picker.js",
]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    drift  = []
    checked = 0
    skipped = 0
    for rel in MANIFEST:
        share_path = SHARE_BASE / rel
        open_path  = OPEN_BASE  / rel
        if not share_path.exists() or not open_path.exists():
            skipped += 1
            continue
        share_hash = sha256_of(share_path)
        open_hash  = sha256_of(open_path)
        checked   += 1
        if share_hash != open_hash:
            drift.append((rel, share_hash, open_hash))

    print(f"Checked  : {checked}")
    print(f"Skipped  : {skipped} (missing on at least one side — tolerated)")
    print(f"Drift    : {len(drift)}")

    if drift:
        print()
        print("DRIFT detected — these files differ between share and open trees:")
        for rel, sh, op in drift:
            print(f"  {rel}")
            print(f"    share : {sh}")
            print(f"    open  : {op}")
        print()
        print("Fix: re-sync the diverged file between trees, OR extract it to")
        print("tools.sgraph.ai per v0.4.0 plan §14.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
