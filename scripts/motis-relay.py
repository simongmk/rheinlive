#!/usr/bin/env python3
from pathlib import Path
import argparse
from gtfs.relay import serve

p=argparse.ArgumentParser(description='Run the reviewed GTFS.de relay on loopback only')
p.add_argument('--workdir',type=Path,default=Path(__file__).resolve().parents[1]/'.cache/motis/relay')
p.add_argument('--port',type=int,default=8788)
a=p.parse_args()
if not 1024<=a.port<=65535:p.error('Use an unprivileged port')
serve(a.workdir,a.port)
