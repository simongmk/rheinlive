#!/usr/bin/env python3
"""Download only the reviewed German GTFS + dated Geofabrik sources."""
import argparse
from datetime import date,timedelta
import hashlib
import os
from pathlib import Path
import time
import urllib.request
import zipfile
from gtfs.pipeline import digest,iso,validate_zip,write_json


def fetch(url,path,limit,seconds,md5=None):
    path.parent.mkdir(parents=True,exist_ok=True)
    partial=path.with_suffix(path.suffix+'.part');started=time.monotonic();progress=started
    sha=hashlib.sha256();check=hashlib.md5();size=0
    try:
        with urllib.request.urlopen(url,timeout=40) as r:
            expected=int(r.headers.get('Content-Length','0'))
            if r.status!=200 or expected>limit:raise ValueError('Source unavailable or oversized')
            with partial.open('wb') as f:
                while chunk:=r.read(1024*1024):
                    size+=len(chunk)
                    if size>limit or time.monotonic()-started>seconds:raise ValueError('Source exceeds budget')
                    f.write(chunk);sha.update(chunk);check.update(chunk)
                    if time.monotonic()-progress>20:print(f'{path.name}: {size/1e9:.2f} GB',flush=True);progress=time.monotonic()
            headers=dict(r.headers)
        if expected and size!=expected:raise ValueError('Incomplete source')
        if md5 and check.hexdigest()!=md5:raise ValueError('Geofabrik checksum mismatch')
        if path.suffix=='.zip':
            with zipfile.ZipFile(partial) as z:validate_zip(z)
        os.replace(partial,path)
        return {'url':url,'fetchedAt':iso(),'bytes':size,'seconds':round(time.monotonic()-started,2),'sha256':sha.hexdigest(),'md5':md5,'headers':headers}
    finally:partial.unlink(missing_ok=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',choices=['gtfs','osm'])
    p.add_argument('--workdir',type=Path,default=Path(__file__).resolve().parents[1]/'.cache/motis')
    p.add_argument('--osm-date',type=date.fromisoformat,default=date.today()-timedelta(days=1))
    a=p.parse_args();folder=a.workdir/'sources'
    if a.source=='gtfs':
        result=fetch('https://download.gtfs.de/germany/free/latest.zip',folder/'de.zip',500_000_000,180)
        result['license']='CC BY 4.0';write_json(folder/'de-download.json',result)
    else:
        filename='germany-'+a.osm_date.strftime('%y%m%d')+'.osm.pbf'
        url='https://download.geofabrik.de/europe/'+filename
        with urllib.request.urlopen(url+'.md5',timeout=30) as r:checksum=r.read(512).decode().split()[0]
        if len(checksum)!=32 or any(c not in '0123456789abcdef' for c in checksum):raise ValueError('Invalid checksum')
        result=fetch(url,folder/filename,6_000_000_000,1800,checksum)
        result['license']='ODbL 1.0';write_json(folder/'osm-download.json',result)
    print('Source verified:',result['bytes'],'bytes',result['sha256'])


if __name__=='__main__':main()
