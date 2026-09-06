"""GTFS.de coverage index and bounded realtime reader, independent of the app.

This is an assessment/import foundation, NOT a production position API. The
index contains national trip metadata and scheduled stop events in named sample
areas. Source data has its own CC/ODbL notices, never the app's MIT license.
"""
from __future__ import annotations
import csv
from collections import Counter, defaultdict
from datetime import date, datetime, time as dt_time, timedelta, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import time
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

UTC = timezone.utc
BERLIN = ZoneInfo('Europe/Berlin')
WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
FEEDS = {k: f'https://download.gtfs.de/germany/{k}_free/latest.zip' for k in ('nv', 'rv', 'fv')}
RT_URL = 'https://realtime.gtfs.de/realtime-free.pb'
UA = 'Linien coverage evaluation/1.0 (+https://github.com/simongmk/rheinlive)'
SCHEMA_VERSION = 1
MAX_RT_AGE = 120


def iso(seconds=None):
    return datetime.fromtimestamp(time.time() if seconds is None else seconds, UTC).isoformat()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.part')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def download(url, destination, limit):
    """One bounded request; atomic replacement only after a complete download."""
    if url not in {*FEEDS.values(), RT_URL}:
        raise ValueError('Source URL is not in the reviewed provider allowlist')
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp = destination.with_suffix(destination.suffix + '.part')
    started = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40) as r:
            if r.status != 200:
                raise ValueError(f'Unexpected HTTP status {r.status}')
            if int(r.headers.get('Content-Length', '0')) > limit:
                raise ValueError('Source exceeds download limit')
            size = 0
            with tmp.open('wb') as f:
                while chunk := r.read(1024 * 1024):
                    size += len(chunk)
                    if size > limit or time.monotonic() - started > 120:
                        raise ValueError('Source exceeds size/time budget')
                    f.write(chunk)
            headers = dict(r.headers)
        if destination.suffix == '.zip':
            with zipfile.ZipFile(tmp) as z:
                validate_zip(z)
        result = {'url': url, 'status': 200, 'fetchedAt': iso(), 'bytes': size,
                  'seconds': round(time.monotonic() - started, 3), 'sha256': digest(tmp), 'headers': headers}
        os.replace(tmp, destination)
        return result
    finally:
        tmp.unlink(missing_ok=True)


def fetch_static(folder):
    folder = Path(folder)
    for feed, url in FEEDS.items():
        # Reuse a verified version after a lightweight HEAD. No browser fetches.
        manifest_path = folder / f'{feed}-download.json'
        target = folder / f'{feed}.zip'
        if target.exists() and manifest_path.exists():
            old = json.loads(manifest_path.read_text())
            with urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA}), timeout=30) as r:
                previous = {k.lower(): v for k, v in old.get('headers', {}).items()}
                unchanged = r.headers.get('ETag') and r.headers.get('ETag') == previous.get('etag')
            if old.get('url') == url and unchanged and digest(target) == old.get('sha256'):
                print(f'{feed}: verified cached source', flush=True)
                continue
        write_json(manifest_path, download(url, target, 400_000_000))
        print(f'{feed}: downloaded reviewed source', flush=True)


def validate_zip(z):
    required = {'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'}
    if not required.issubset(z.namelist()):
        raise ValueError('Missing required GTFS tables')
    if not {'calendar.txt', 'calendar_dates.txt'} & set(z.namelist()):
        raise ValueError('No service calendar')
    if len(z.namelist()) != len(set(z.namelist())):
        raise ValueError('Duplicate ZIP member names')
    if sum(i.file_size for i in z.infolist()) > 4_000_000_000:
        raise ValueError('Uncompressed source exceeds budget')
    if 'frequencies.txt' in z.namelist():
        raise ValueError('Frequency-based service needs a separate instance expansion before assessment')


def records(z, name):
    if name not in z.namelist():
        return iter(())
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline=''))


def seconds(value):
    if not value:
        return None
    if not re.fullmatch(r'\d{1,3}:\d{2}:\d{2}', value):
        raise ValueError(f'Invalid GTFS time {value!r}')
    h, m, s = map(int, value.split(':'))
    if h > 167 or m > 59 or s > 59:
        raise ValueError(f'Out-of-range GTFS time {value!r}')
    return h * 3600 + m * 60 + s


def service_base(day):
    """GTFS origin is local noon minus twelve elapsed hours (including DST)."""
    d = datetime.strptime(day, '%Y%m%d').date() if isinstance(day, str) else day
    return int(datetime.combine(d, dt_time(12), BERLIN).timestamp()) - 12 * 3600


def calendar_days(calendars, exceptions):
    active = defaultdict(set)
    for row in calendars:
        first, last = [datetime.strptime(row[k], '%Y%m%d').date() for k in ('start_date', 'end_date')]
        if not 0 <= (last - first).days <= 730:
            raise ValueError('Calendar range exceeds supported budget')
        d = first
        while d <= last:
            if row.get(WEEKDAYS[d.weekday()]) == '1':
                active[row['service_id']].add(d.strftime('%Y%m%d'))
            d += timedelta(days=1)
    seen = set()
    for row in exceptions:
        key = row['service_id'], row['date']
        if key in seen:
            raise ValueError('Duplicate service exception')
        seen.add(key)
        datetime.strptime(row['date'], '%Y%m%d')
        if row['exception_type'] == '1':
            active[key[0]].add(key[1])
        elif row['exception_type'] == '2':
            active[key[0]].discard(key[1])
        else:
            raise ValueError('Invalid service exception')
    return active


def mode_for(feed, route):
    t = int(route['route_type'])
    if t in (3, 11) or 700 <= t < 800:
        return 'bus'
    if t in (0, 1, 5, 7, 12) or 400 <= t < 500 or 900 <= t < 1000:
        return 'tram_metro'
    if t == 4 or 1000 <= t < 1100 or 1200 <= t < 1300:
        return 'ferry'
    if t == 2 or 100 <= t < 200:
        if feed == 'fv' or t in (101, 102, 105):
            return 'long_distance'
        return 'suburban' if re.match(r'^S\s*\d', route['route_short_name']) else 'regional'
    return 'other'


def distance_km(lat, lon, lat2, lon2):
    a, b = map(math.radians, [lat, lat2])
    delta = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(lon2 - lon) / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(delta)))


def areas_for(lat, lon, definitions):
    radius = definitions['radiusKm']
    return [aid for aid, _name, a, b in definitions['areas']
            if abs(lat - a) <= radius / 110 and abs(lon - b) <= radius / (110 * math.cos(math.radians(a)))
            and distance_km(lat, lon, a, b) <= radius]


SCHEMA = '''
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE routes (feed TEXT, id TEXT, line TEXT, mode TEXT, agency TEXT, PRIMARY KEY(feed,id));
CREATE TABLE trips (feed TEXT, id TEXT, route_id TEXT, service_id TEXT, PRIMARY KEY(feed,id));
CREATE TABLE service_days (feed TEXT, service_id TEXT, day TEXT, base INTEGER, PRIMARY KEY(feed,service_id,day));
CREATE TABLE stops (feed TEXT, id TEXT, name TEXT, lat REAL, lon REAL, parent TEXT, platform TEXT, PRIMARY KEY(feed,id));
CREATE TABLE stop_areas (feed TEXT, stop_id TEXT, area TEXT, PRIMARY KEY(feed,stop_id,area));
CREATE TABLE events (feed TEXT, trip_id TEXT, sequence INTEGER, stop_id TEXT, arrival INTEGER, departure INTEGER);
'''


def import_index(source_folder, db_path, areas_path):
    """Streams CSV; indexes only sample-area events, retaining national metadata."""
    started = time.monotonic()
    definitions = json.loads(Path(areas_path).read_text())
    if not 0 < definitions['radiusKm'] <= 50 or len(definitions['areas']) > 60:
        raise ValueError('Assessment area budget exceeded')
    db_path, source_folder = Path(db_path), Path(source_folder)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = db_path.with_suffix('.importing.sqlite')
    if temporary.exists():
        raise ValueError(f'An incomplete/concurrent import exists: {temporary}')
    db = sqlite3.connect(temporary)
    db.execute('PRAGMA journal_mode=OFF')  # Disposable private temp DB; never served before atomic replace.
    db.execute('PRAGMA synchronous=OFF')
    db.execute('PRAGMA cache_size=-65536')
    db.executescript(SCHEMA)
    statistics, source_manifests, notices = {}, {}, {}
    try:
        for feed, url in FEEDS.items():
            archive = source_folder / f'{feed}.zip'
            manifest = json.loads((source_folder / f'{feed}-download.json').read_text())
            if manifest.get('url') != url or digest(archive) != manifest.get('sha256'):
                raise ValueError(f'{feed}: source identity/checksum mismatch')
            source_manifests[feed] = manifest
            stats = Counter()
            with zipfile.ZipFile(archive) as z:
                validate_zip(z)
                agencies = {r['agency_id']: r for r in records(z, 'agency.txt')}
                if any(a['agency_timezone'] != 'Europe/Berlin' for a in agencies.values()):
                    raise ValueError('This provider adapter currently supports Europe/Berlin feeds only')
                notices[feed] = {n: z.read(n).decode('utf-8-sig') for n in ['attributions.txt','feed_info.txt'] if n in z.namelist()}
                stats['hasShapes'] = 'shapes.txt' in z.namelist()
                route_ids = set()
                for r in records(z, 'routes.txt'):
                    route_ids.add(r['route_id'])
                    db.execute('INSERT INTO routes VALUES (?,?,?,?,?)',
                        (feed, r['route_id'], r['route_short_name'], mode_for(feed,r), agencies[r['agency_id']]['agency_name']))
                calendars = list(records(z,'calendar.txt'))
                exceptions = list(records(z,'calendar_dates.txt'))
                known_services = {r['service_id'] for r in calendars + exceptions}
                active = calendar_days(calendars, exceptions)
                db.executemany('INSERT INTO service_days VALUES (?,?,?,?)',
                    ((feed,s,d,service_base(d)) for s, days in active.items() for d in sorted(days)))
                batch = []
                for t in records(z,'trips.txt'):
                    if t['route_id'] not in route_ids:
                        raise ValueError('Trip references missing route')
                    if t['service_id'] not in known_services:
                        raise ValueError('Trip references missing service calendar')
                    batch.append((feed,t['trip_id'],t['route_id'],t['service_id']))
                    stats['trips'] += 1
                    if len(batch) == 10000:
                        db.executemany('INSERT INTO trips VALUES (?,?,?,?)', batch); batch.clear()
                if batch:
                    db.executemany('INSERT INTO trips VALUES (?,?,?,?)', batch)
                relevant = set()
                for s in records(z,'stops.txt'):
                    lat, lon = float(s['stop_lat']), float(s['stop_lon'])
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        raise ValueError('Invalid station coordinates')
                    db.execute('INSERT INTO stops VALUES (?,?,?,?,?,?,?)',
                        (feed,s['stop_id'],s['stop_name'],lat,lon,s.get('parent_station',''),s.get('platform_code','')))
                    hits = areas_for(lat,lon,definitions)
                    if hits:
                        relevant.add(s['stop_id'])
                        db.executemany('INSERT INTO stop_areas VALUES (?,?,?)', ((feed,s['stop_id'],a) for a in hits))
                    stats['stops'] += 1
                stats['sampleStops'] = len(relevant)
                db.commit()
                # Fast tuple CSV reader: do not allocate a dictionary for every national stop event.
                f = csv.reader(io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig',newline=''))
                header = next(f); idx = {k: header.index(k) for k in ['trip_id','stop_id','stop_sequence','arrival_time','departure_time']}
                batch = []; last_log = time.monotonic()
                for row in f:
                    stats['nationalStopEventsScanned'] += 1
                    if row[idx['stop_id']] not in relevant:
                        continue
                    a, d = seconds(row[idx['arrival_time']]), seconds(row[idx['departure_time']])
                    if a is None and d is None:
                        stats['sampleUntimedEvents'] += 1; continue
                    if a is not None and d is not None and d < a:
                        raise ValueError('Departure precedes arrival')
                    batch.append((feed,row[idx['trip_id']],int(row[idx['stop_sequence']]),row[idx['stop_id']],a,d))
                    stats['sampleTimedEvents'] += 1
                    stats['maximumSeconds'] = max(stats['maximumSeconds'], a or 0, d or 0)
                    if len(batch) >= 10000:
                        db.executemany('INSERT INTO events VALUES (?,?,?,?,?,?)',batch); batch.clear()
                        if time.monotonic() - last_log > 20:
                            db.commit(); last_log = time.monotonic()
                            print(f'{feed}: scanned {stats["nationalStopEventsScanned"]:,} events; indexed {stats["sampleTimedEvents"]:,}',flush=True)
                if batch:
                    db.executemany('INSERT INTO events VALUES (?,?,?,?,?,?)',batch)
                db.commit()
            statistics[feed] = dict(stats)
            print(f'{feed}: imported {stats["trips"]:,} trips, {stats["sampleTimedEvents"]:,} sample events',flush=True)
        db.executescript('''
            CREATE UNIQUE INDEX idx_events_identity ON events(feed,trip_id,sequence);
            CREATE INDEX idx_events_departure ON events(departure);
            CREATE INDEX idx_events_arrival ON events(arrival);
            CREATE INDEX idx_service_days_day ON service_days(day,feed,service_id);
            CREATE INDEX idx_trips_id ON trips(id);
        ''')
        invalid = db.execute('SELECT 1 FROM events e LEFT JOIN trips t ON t.feed=e.feed AND t.id=e.trip_id WHERE t.id IS NULL LIMIT 1').fetchone()
        if invalid:
            raise ValueError('Stop events reference a missing trip')
        metadata = {'schemaVersion': SCHEMA_VERSION,'builtAt':iso(),'scope':'national metadata; sampled-area stop events only',
                    'areas':definitions,'statistics':statistics,'sources':source_manifests,'sourceNotices':notices,
                    'seconds':round(time.monotonic()-started,2)}
        db.execute('INSERT INTO metadata VALUES (?,?)',('import',json.dumps(metadata,ensure_ascii=False)))
        db.commit(); db.execute('PRAGMA optimize'); db.close()
        os.replace(temporary,db_path)
        return metadata
    except BaseException:
        db.close(); temporary.unlink(missing_ok=True)
        raise


def read_index(path):
    db = sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    metadata = json.loads(db.execute("SELECT value FROM metadata WHERE key='import'").fetchone()[0])
    if metadata['schemaVersion'] != SCHEMA_VERSION:
        raise ValueError('Incompatible index schema')
    return db, metadata


def planned(db, start, end, max_seconds):
    """Distinct service-day trip instances; two endpoint ranges include terminal arrivals."""
    result = {}
    dates = db.execute('SELECT DISTINCT day,base FROM service_days WHERE base<=? AND base>=?',(end,start-max_seconds)).fetchall()
    if not dates:
        raise ValueError('No static service dates cover this observation window')
    for day, base in dates:
        lo, hi = start-base, end-base
        if hi < 0 or lo > max_seconds:
            continue
        sql = '''WITH candidate AS (
          SELECT * FROM events WHERE departure>=? AND departure<?
          UNION SELECT * FROM events WHERE arrival>=? AND arrival<?
        ) SELECT e.*,sd.day,sd.base,sa.area,r.line,r.mode,r.agency
        FROM candidate e
        JOIN trips t ON t.feed=e.feed AND t.id=e.trip_id
        JOIN service_days sd ON sd.feed=t.feed AND sd.service_id=t.service_id AND sd.day=?
        JOIN stop_areas sa ON sa.feed=e.feed AND sa.stop_id=e.stop_id
        JOIN routes r ON r.feed=t.feed AND r.id=t.route_id'''
        for row in db.execute(sql,(lo,hi,lo,hi,day)):
            key = (row['area'],row['feed'],row['trip_id'],row['day'])
            if key not in result:
                result[key] = {'area':row['area'],'feed':row['feed'],'tripId':row['trip_id'],'serviceDate':row['day'],
                               'mode':row['mode'],'line':row['line'],'agency':row['agency'],'base':row['base'],'stops':[]}
            result[key]['stops'].append({'sequence':row['sequence'],'stopId':row['stop_id'],
                'arrival':row['arrival'],'departure':row['departure']})
    return list(result.values())


def parse_realtime(body, received_at):
    from google.transit import gtfs_realtime_pb2 as pb
    if len(body) > 64_000_000:
        raise ValueError('Realtime feed exceeds decode limit')
    f = pb.FeedMessage(); f.ParseFromString(body)
    if not f.IsInitialized() or not f.header.HasField('timestamp'):
        raise ValueError('Missing required realtime fields or header timestamp')
    age = received_at - f.header.timestamp
    if age < -30 or age > MAX_RT_AGE:
        raise ValueError(f'Realtime publication stale/future: age={age:.1f}s')
    if f.header.incrementality != pb.FeedHeader.FULL_DATASET:
        raise ValueError('Differential feeds require a stateful assembler')
    updates = defaultdict(list); types = Counter(); timestamps = Counter(); identities = Counter()
    for e in f.entity:
        for kind in ['trip_update','vehicle','alert']:
            if e.HasField(kind):
                types[kind] += 1
        if e.HasField('trip_update') and not e.is_deleted:
            u = e.trip_update
            if not u.HasField('timestamp'):
                timestamps['absent'] += 1
            elif received_at - u.timestamp > MAX_RT_AGE:
                timestamps['olderThan120Seconds'] += 1
            elif received_at - u.timestamp < -30:
                timestamps['futureOver30Seconds'] += 1
            else:
                timestamps['withinPublicationBudget'] += 1
            if u.trip.trip_id and re.fullmatch(r'\d{8}',u.trip.start_date):
                updates[(u.trip.trip_id,u.trip.start_date)].append(u)
            else:
                identities['missingTripIdOrStartDate'] += 1
    return f,updates,{'entityCounts':{k:types[k] for k in ['trip_update','vehicle','alert']},
                      'tripTimestampCounts':dict(timestamps),'identityWarnings':dict(identities),
                      'publicationAt':iso(f.header.timestamp),'headerAgeSeconds':round(age,3)}


def explicit_event(update, planned_stop):
    """Conservative direct evidence only. No silent propagation/interpolation."""
    # NO_DATA and SKIPPED are information but not a stop forecast.
    if update.schedule_relationship in (1, 2):
        return False
    if update.HasField('stop_sequence'):
        if update.stop_sequence != planned_stop['sequence']:
            return False
        if update.stop_id and update.stop_id != planned_stop['stopId']:
            return False
    elif update.stop_id != planned_stop['stopId']:
        return False
    return any(update.HasField(k) and ((getattr(update,k).HasField('time') and getattr(update,k).time>0)
               or (getattr(update,k).HasField('delay') and planned_stop[k] is not None))
               for k in ['arrival','departure'])


def classify(instance, candidates, ambiguous=False):
    if ambiguous or len(candidates) > 1:
        return 'ambiguous'
    if not candidates:
        return 'missing'
    update = candidates[0]
    relationship = update.trip.schedule_relationship
    if relationship == 3:  # CANCELED
        return 'cancelled'
    if relationship != 0:  # Added/duplicated/replacement need an explicit expansion.
        return 'unsupported'
    # Stop-id-only updates cannot resolve repeat visits, even outside this window.
    counts = Counter(s['stopId'] for s in instance['stops'])
    for u in update.stop_time_update:
        if not u.HasField('stop_sequence') and (counts[u.stop_id] > 1 or u.stop_id in instance.get('repeatedStopIds', ())):
            continue
        if any(explicit_event(u,s) for s in instance['stops']):
            return 'explicit_forecast'
    return 'trip_update_only'


def assess(db_path, pb_path, manifest_path, window_minutes=30):
    manifest = json.loads(Path(manifest_path).read_text())
    body = Path(pb_path).read_bytes()
    if hashlib.sha256(body).hexdigest() != manifest['sha256'] or manifest['url'] != RT_URL:
        raise ValueError('Realtime source identity/checksum mismatch')
    received = datetime.fromisoformat(manifest['fetchedAt']).timestamp()
    feed,updates,quality = parse_realtime(body,received)
    start,end = int(received),int(received)+window_minutes*60
    db,metadata = read_index(db_path)
    maximum = max(v.get('maximumSeconds',0) for v in metadata['statistics'].values())
    instances = planned(db,start,end,maximum)
    # Route IDs are per file; realtime trip IDs must be unique across this provider's files.
    duplicate_ids = {r[0] for r in db.execute('SELECT id FROM trips GROUP BY id HAVING count(*)>1')}
    groups = defaultdict(Counter); details=[]
    for i in instances:
        candidates = updates.get((i['tripId'],i['serviceDate']),[])
        if any(not s.HasField('stop_sequence') for u in candidates for s in u.stop_time_update):
            # Every visit to a sampled stop is in the index, not just today's window.
            i['repeatedStopIds'] = {r[0] for r in db.execute(
                'SELECT stop_id FROM events WHERE feed=? AND trip_id=? GROUP BY stop_id HAVING count(*)>1',
                (i['feed'],i['tripId']))}
        state = classify(i,candidates,i['tripId'] in duplicate_ids)
        groups[(i['area'],i['mode'])]['scheduled'] += 1
        groups[(i['area'],i['mode'])][state] += 1
        details.append({k:v for k,v in i.items() if k not in ['stops','base','repeatedStopIds']} | {'state':state})
    db.close()
    rows = []
    for area,name,*_ in metadata['areas']['areas']:
        for mode in ['tram_metro','bus','suburban','regional','long_distance','ferry','other']:
            c=groups[(area,mode)]
            rows.append({'area':area,'name':name,'mode':mode,**{k:c[k] for k in ['scheduled','explicit_forecast','cancelled','trip_update_only','missing','ambiguous','unsupported']},
                'explicitPercent':round(100*c['explicit_forecast']/c['scheduled'],1) if c['scheduled'] else None})
    return {'schemaVersion':1,'kind':'historical-coverage-observation','status':'valid',
            'receivedAt':manifest['fetchedAt'],'windowStart':iso(start),'windowEnd':iso(end),
            'quality':quality,'source':manifest,'staticSources':metadata['sources'],
            'areas':metadata['areas'],'rows':rows,'instances':details,
            'method':f'Unique scheduled trip/service-day per area with an arrival OR departure in the next {window_minutes} minutes. Explicit forecast means at least one directly matching stop update. No delay propagation. Cancellation is separate. Overlapping areas cannot be summed into national coverage.',
            'limitations':['Not measured positions or field accuracy.','A few observations do not establish availability or weekday coverage.',
              'The denominator is this published static schedule, not a verified inventory of all operators.',
              'Conservative direct-stop coverage excludes forecasts obtainable by delay propagation.',
              'Feed publication time is not the operator observation time. Per-trip timestamps are profiled, not used to prove accuracy.',
              'Additional/unscheduled trips are outside this scheduled denominator.'],
            'license':{'static':'CC BY 4.0, GTFS.de / DELFI e.V. (retain supplied OSM notice)','realtime':'CC BY-SA 4.0, GTFS.de and its listed suppliers','adaptation':'Filtered and joined by Linien; derived realtime assessment CC BY-SA 4.0','url':'https://gtfs.de/de/realtime/'}}
