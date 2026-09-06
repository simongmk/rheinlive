#!/usr/bin/env python3
"""Download/import/audit reviewed GTFS.de feeds. See docs/GTFS-PIPELINE.md."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import sys
import time

from gtfs.pipeline import (fetch_static, import_index, download, write_json, assess, RT_URL)

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workdir', type=Path, default=ROOT/'.cache/gtfs')
sub = parser.add_subparsers(dest='command', required=True)
sub.add_parser('fetch')
imp = sub.add_parser('import')
imp.add_argument('--sources', type=Path)
imp.add_argument('--areas', type=Path, default=ROOT/'scripts/gtfs/areas.json')
sample = sub.add_parser('sample')
sample.add_argument('--count', type=int, default=1)
sample.add_argument('--interval', type=int, default=60)
sample.add_argument('--output', type=Path)
args = parser.parse_args()
args.workdir.mkdir(parents=True,exist_ok=True)
with (args.workdir/'pipeline.lock').open('a') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error('A pipeline command is already running in this workdir')
    if args.command == 'fetch':
        fetch_static(args.workdir/'sources')
    elif args.command == 'import':
        metadata=import_index(args.sources or args.workdir/'sources',args.workdir/'assessment.sqlite',args.areas)
        write_json(args.workdir/'import.json',metadata)
        print(json.dumps({k:metadata[k] for k in ['builtAt','seconds','statistics']},indent=2))
    else:
        if not 1<=args.count<=10 or args.interval<30:
            parser.error('Use 1–10 observations, at least 30 seconds apart')
        destination=args.output or args.workdir/'observations'
        for i in range(args.count):
            started=time.monotonic()
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            directory=destination/stamp
            directory.mkdir(parents=True,exist_ok=False)
            try:
                metadata=download(RT_URL,directory/'realtime.pb',64_000_000)
                write_json(directory/'download.json',metadata)
                result=assess(args.workdir/'assessment.sqlite',directory/'realtime.pb',directory/'download.json')
                write_json(directory/'coverage.json',result)
                print(json.dumps({'observation':stamp,'status':result['status'],'quality':result['quality'],
                                  'areaModeRows':len(result['rows'])}),flush=True)
            except Exception as e:
                # Failure is recorded as unavailable, never as zero coverage or a fresh old snapshot.
                write_json(directory/'failure.json',{'at':datetime.now(timezone.utc).isoformat(),'status':'unavailable','error':str(e)})
                print(f'{stamp}: unavailable: {e}',file=sys.stderr,flush=True)
                raise
            if i+1<args.count:
                time.sleep(max(0,args.interval-(time.monotonic()-started)))
