#!/usr/bin/env python3
"""Pin and configure an independent MOTIS engine; no cloud account required.

Source archives must have adjacent download manifests with URL + SHA-256.
Large data, binaries and generated configuration stay outside Git in .cache.
"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import platform
import tarfile
import urllib.request
from gtfs.pipeline import digest, write_json

VERSION='2.11.2'
RELEASES={
    ('Darwin','arm64'):('macos-arm64','00b6f544424107af57bcc8da3d4a03f602360cb2aa8beb2ad4ca54fda7a28a8f'),
    ('Linux','aarch64'):('linux-arm64','236175665bda3714481aa26879b5ebd9078e29950b8bc35bdd07d9d49cfcb3da'),
    ('Linux','x86_64'):('linux-amd64','653213464b224034a995fed6303f0c0a336a81c8d9398816b26c4db1eb940a31'),
}


def install(folder):
    target,checksum=RELEASES[(platform.system(),platform.machine())]
    url=f'https://github.com/motis-project/motis/releases/download/v{VERSION}/motis-{target}.tar.bz2'
    archive=folder/f'motis-{target}-v{VERSION}.tar.bz2'
    if not archive.exists() or digest(archive)!=checksum:
        with urllib.request.urlopen(url,timeout=60) as r:
            body=r.read(100_000_001)
        if len(body)>100_000_000 or hashlib.sha256(body).hexdigest()!=checksum:
            raise ValueError('Release digest does not match the reviewed upstream release')
        archive.write_bytes(body)
    with tarfile.open(archive,'r:bz2') as t:
        matches=[m for m in t.getmembers() if m.name in ('motis','./motis') and m.isfile()]
        if len(matches)!=1 or matches[0].size>300_000_000:
            raise ValueError('Unexpected MOTIS archive')
        binary=folder/'bin/motis';binary.parent.mkdir(parents=True,exist_ok=True)
        with t.extractfile(matches[0]) as source:binary.write_bytes(source.read())
        binary.chmod(0o755)
    write_json(folder/'release.json',{'version':VERSION,'url':url,'sha256':checksum,'license':'MIT'})


def verified(path,manifest,kind):
    m=json.loads(manifest.read_text())
    if digest(path)!=m.get('sha256'):raise ValueError('Source digest mismatch: '+str(path))
    if kind=='gtfs' and m.get('url')!='https://download.gtfs.de/germany/free/latest.zip':raise ValueError('Wrong GTFS source')
    if kind=='osm' and not m.get('url','').startswith('https://download.geofabrik.de/europe/germany-'):raise ValueError('Wrong OSM source')
    return str(path.resolve())


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--workdir',type=Path,default=Path(__file__).resolve().parents[1]/'.cache/motis')
    p.add_argument('--osm',type=Path,required=True)
    p.add_argument('--first-day',type=date.fromisoformat,default=date.today())
    a=p.parse_args();folder=a.workdir.resolve();folder.mkdir(parents=True,exist_ok=True)
    gtfs=verified(folder/'sources/de.zip',folder/'sources/de-download.json','gtfs')
    osm=verified(a.osm,folder/'sources/osm-download.json','osm')
    install(folder)
    config={
        'server':{'host':'127.0.0.1','port':8787,'n_threads':4,'data_attribution_link':'https://gtfs.de/de/realtime/'},
        'osm':osm,'street_routing':True,'geocoding':False,'osr_footpath':False,
        'timetable':{'first_day':a.first_day.isoformat(),'num_days':14,'railviz':True,'with_shapes':True,
                     'update_interval':30,'http_timeout':20,'incremental_rt_update':False,
                     'route_shapes':{'mode':'missing','n_threads':4,'clasz':{'COACH':False},'max_stops':250},
                     'datasets':{'de':{'path':gtfs,'extend_calendar':False,'rt':[{'url':'http://127.0.0.1:8788/feed.pb','protocol':'gtfsrt'}]}}},
        'logging':{'log_level':'info'}}
    write_json(folder/'config.yml',config)
    print('Verified engine and sources; import configuration:',folder/'config.yml')


if __name__=='__main__':main()
