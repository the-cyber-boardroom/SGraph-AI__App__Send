#!/usr/bin/env python3
"""
Cold-start / SnapStart concurrency probe.

Sends a burst of concurrent requests to force Lambda scale-out, then
measures response times. Cold starts appear as spikes (>1s). With
SnapStart active the spike should be <300ms even under concurrency.

Usage:
    python tests/qa/test_cold_start__concurrent.py                   # dev only
    python tests/qa/test_cold_start__concurrent.py --env both        # dev + main side-by-side
    python tests/qa/test_cold_start__concurrent.py --bursts 3 --concurrency 15

Options:
    --env           dev | main | both  (default: dev)
    --concurrency   requests per burst (default: 10)
    --bursts        number of bursts   (default: 3)
    --delay         seconds between bursts (default: 2)
    --path          API path to hit (default: /api/presigned/capabilities)


Run with:

 python tests/qa/test_cold_start__concurrent.py --env dev --concurrency 20 --bursts 3

 python tests/qa/test_cold_start__concurrent.py --env both --concurrency 20 --bursts 3
"""

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request     import urlopen, Request
from urllib.error       import URLError

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN  = '\033[92m'
YELLOW = '\033[93m'
RED    = '\033[91m'
CYAN   = '\033[96m'
BOLD   = '\033[1m'
RESET  = '\033[0m'

THRESHOLD_WARM      =  0.3   # ≤300ms  → warm / SnapStart restore
THRESHOLD_SNAPSTART =  1.5   # ≤1.5s   → possible SnapStart or fast cold start
                              # >1.5s   → traditional cold start

def colour(ms):
    if ms <= THRESHOLD_WARM * 1000:
        return GREEN
    if ms <= THRESHOLD_SNAPSTART * 1000:
        return YELLOW
    return RED

def label(ms):
    if ms <= THRESHOLD_WARM * 1000:
        return 'warm'
    if ms <= THRESHOLD_SNAPSTART * 1000:
        return 'snapstart?'
    return 'COLD START'

# ── single request ────────────────────────────────────────────────────────────
def fetch(url, idx):
    t0 = time.perf_counter()
    try:
        req  = Request(url, headers={'Accept': 'application/json'})
        resp = urlopen(req, timeout=30)
        status = resp.status
    except URLError as e:
        status = getattr(getattr(e, 'reason', None), 'errno', -1)
    ms = (time.perf_counter() - t0) * 1000
    return idx, ms, status

# ── one burst ────────────────────────────────────────────────────────────────
def run_burst(url, concurrency, burst_num, env_label):
    print(f'\n  {BOLD}Burst {burst_num}  [{env_label}]  {concurrency} concurrent{RESET}')
    results = []
    t_burst = time.perf_counter()

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(fetch, url, i) for i in range(concurrency)]
        for f in as_completed(futures):
            idx, ms, status = f.result()
            results.append((idx, ms, status))

    burst_ms = (time.perf_counter() - t_burst) * 1000
    results.sort(key=lambda r: r[0])

    cold_count = 0
    for idx, ms, status in results:
        c = colour(ms)
        lbl = label(ms)
        if lbl == 'COLD START':
            cold_count += 1
        print(f'    req {idx:>2}  {c}{ms:>7.0f}ms  {lbl:<14}{RESET}  HTTP {status}')

    times = [r[1] for r in results]
    p50   = sorted(times)[len(times)//2]
    p99   = sorted(times)[int(len(times)*0.99)]
    print(f'  ── p50={p50:.0f}ms  p99={p99:.0f}ms  '
          f'max={max(times):.0f}ms  cold={cold_count}/{concurrency}  '
          f'wall={burst_ms:.0f}ms')
    return times, cold_count

# ── summary ───────────────────────────────────────────────────────────────────
def summarise(label, all_times, all_cold):
    flat   = [t for burst in all_times for t in burst]
    total  = len(flat)
    cold   = sum(all_cold)
    p50    = sorted(flat)[total//2]
    p99    = sorted(flat)[int(total*0.99)]
    print(f'\n{BOLD}  {label} summary{RESET}')
    print(f'  requests : {total}')
    print(f'  cold starts detected (>{THRESHOLD_SNAPSTART*1000:.0f}ms): '
          f'{RED if cold else GREEN}{cold}/{total}{RESET}')
    print(f'  p50={p50:.0f}ms  p99={p99:.0f}ms  '
          f'min={min(flat):.0f}ms  max={max(flat):.0f}ms')

# ── main ──────────────────────────────────────────────────────────────────────
ENDPOINTS = {
    'dev' : 'https://dev.send.sgraph.ai',
    'main': 'https://main.send.sgraph.ai',
}

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--env'        , default='dev' , choices=['dev','main','both'])
    ap.add_argument('--concurrency', default=10    , type=int)
    ap.add_argument('--bursts'     , default=3     , type=int)
    ap.add_argument('--delay'      , default=2     , type=float)
    ap.add_argument('--path'       , default='/api/presigned/capabilities')
    args = ap.parse_args()

    envs = ['dev','main'] if args.env == 'both' else [args.env]

    print(f'\n{BOLD}Cold-start / SnapStart concurrency probe{RESET}')
    print(f'  path        : {args.path}')
    print(f'  concurrency : {args.concurrency} requests/burst')
    print(f'  bursts      : {args.bursts}')
    print(f'  delay       : {args.delay}s between bursts')
    print(f'\n  Thresholds')
    print(f'    {GREEN}≤{THRESHOLD_WARM*1000:.0f}ms{RESET}   warm / SnapStart restore')
    print(f'    {YELLOW}≤{THRESHOLD_SNAPSTART*1000:.0f}ms{RESET}  SnapStart / fast cold start')
    print(f'    {RED}>{THRESHOLD_SNAPSTART*1000:.0f}ms{RESET}  traditional cold start')

    all_results = {}

    for env in envs:
        url = ENDPOINTS[env] + args.path
        print(f'\n{BOLD}{"─"*60}{RESET}')
        print(f'{CYAN}{BOLD}{env.upper()}  →  {url}{RESET}')
        env_times = []
        env_cold  = []
        for b in range(1, args.bursts + 1):
            times, cold = run_burst(url, args.concurrency, b, env)
            env_times.append(times)
            env_cold.append(cold)
            if b < args.bursts:
                time.sleep(args.delay)
        all_results[env] = (env_times, env_cold)
        summarise(env.upper(), env_times, env_cold)

    if len(envs) == 2:
        print(f'\n{BOLD}{"─"*60}')
        print(f'COMPARISON  dev (SnapStart) vs main (classic cold start){RESET}')
        for env in envs:
            times, cold = all_results[env]
            flat       = [t for burst in times for t in burst]
            cold_times = [t for burst_t, burst_c in zip(times, cold)
                          for t in burst_t if t > THRESHOLD_SNAPSTART * 1000]
            warm_times = [t for t in flat if t <= THRESHOLD_SNAPSTART * 1000]
            coldc      = sum(cold)
            bar        = RED if coldc > 0 else GREEN
            cold_avg   = f'{sum(cold_times)/len(cold_times):.0f}ms avg' if cold_times else 'none'
            warm_p50   = f'{sorted(warm_times)[len(warm_times)//2]:.0f}ms' if warm_times else 'n/a'
            print(f'  {BOLD}{env:<6}{RESET}  '
                  f'cold={bar}{coldc}/{len(flat)}{RESET}  '
                  f'cold-start-avg={RED if coldc else GREEN}{cold_avg}{RESET}  '
                  f'warm-p50={GREEN}{warm_p50}{RESET}  '
                  f'worst={RED if max(flat)>THRESHOLD_SNAPSTART*1000 else GREEN}{max(flat):.0f}ms{RESET}')

    print()

if __name__ == '__main__':
    main()
