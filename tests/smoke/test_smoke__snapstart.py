#!/usr/bin/env python3
"""
SnapStart smoke test — polls the snapstart alias Function URL until healthy.

Runs as a separate CI action AFTER the deploy action. SnapStart snapshot
initialisation can take up to ~75s after publish_version (Lambda returns
504 Gateway Timeout while the snapshot warms up). This script retries
patiently rather than timing out like a deploy test would.

Usage:
    python tests/smoke/test_smoke__snapstart.py --stage user-dev
    python tests/smoke/test_smoke__snapstart.py --stage user-main --timeout 180
    python tests/smoke/test_smoke__snapstart.py --stage user-dev --path /api/presigned/capabilities

Options:
    --stage    Lambda stage name (required)
    --path     Health-check path  (default: /info/health)
    --timeout  Total seconds to keep trying (default: 120)
    --interval Seconds between attempts     (default: 10)
"""

import argparse
import sys
import time


def poll_snapstart_url(stage, path, timeout, interval):
    from sgraph_ai_app_send.lambda__user.lambda_function.deploy.Deploy__Service import Deploy__Service

    deploy  = Deploy__Service(stage=stage)
    url     = deploy.lambda_function().function_url(deploy.SNAPSTART_ALIAS)
    if not url:
        print(f'ERROR: no Function URL found for alias "{deploy.SNAPSTART_ALIAS}" on stage "{stage}"')
        return False

    full_url = url + path
    headers  = {deploy.api_key__name(): deploy.api_key__value()}
    print(f'\nSnapStart smoke test')
    print(f'  stage   : {stage}')
    print(f'  url     : {full_url}')
    print(f'  timeout : {timeout}s  (interval: {interval}s)\n')

    from osbot_utils.utils.Http import GET_json
    deadline = time.time() + timeout
    attempt  = 0

    while time.time() < deadline:
        attempt += 1
        t0 = time.time()
        try:
            result  = GET_json(full_url, headers=headers)
            elapsed = (time.time() - t0) * 1000
            print(f'  attempt {attempt}: {elapsed:.0f}ms → {result}')
            if result == {'status': 'ok'}:
                print(f'\n  PASS — SnapStart alias is healthy after {attempt} attempt(s)')
                return True
            print(f'  unexpected response — retrying')
        except Exception as exc:
            elapsed = (time.time() - t0) * 1000
            print(f'  attempt {attempt}: {elapsed:.0f}ms → {type(exc).__name__}: {exc}')

        remaining = deadline - time.time()
        if remaining <= 0:
            break
        wait = min(interval, remaining)
        print(f'  waiting {wait:.0f}s  ({remaining:.0f}s remaining)...')
        time.sleep(wait)

    print(f'\n  FAIL — snapstart URL did not become healthy within {timeout}s')
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--stage'   , required=True              )
    ap.add_argument('--path'    , default='/info/health'     )
    ap.add_argument('--timeout' , default=120  , type=int    )
    ap.add_argument('--interval', default=10   , type=int    )
    args = ap.parse_args()

    ok = poll_snapstart_url(args.stage, args.path, args.timeout, args.interval)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
