"""Small synthetic protocol fixtures only. No fixture is served as live traffic."""
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from gtfs.pipeline import (FEEDS, RT_URL, calendar_days, service_base, seconds, mode_for,
    explicit_event, classify, parse_realtime, import_index, read_index, planned, assess, areas_for)
from google.transit import gtfs_realtime_pb2 as pb

T = int(datetime(2026,9,6,10,0,tzinfo=timezone.utc).timestamp())


def update(trip='nv-trip', day='20260906'):
    u=pb.TripUpdate()
    u.trip.trip_id=trip;u.trip.start_date=day
    return u


def stop_update(u, seq=0, stop='A', delay=0):
    s=u.stop_time_update.add();s.stop_sequence=seq;s.stop_id=stop;s.departure.delay=delay
    return s


def fixture_archive(folder, feed, time='12:00:00', extra_events=()):
    def text(header,rows):
        out=io.StringIO(); w=csv.writer(out);w.writerow(header.split(','));w.writerows(rows);return out.getvalue()
    trip=feed+'-trip'
    data={
        'agency.txt':text('agency_id,agency_name,agency_url,agency_timezone',[['a','Test','https://example.invalid','Europe/Berlin']]),
        'routes.txt':text('route_id,route_short_name,route_type,agency_id',[['1','S19' if feed=='rv' else '1','3' if feed=='nv' else '2','a']]),
        'trips.txt':text('route_id,service_id,trip_id',[['1','s',trip]]),
        'calendar.txt':text('service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
            [['s',0,0,0,0,0,1,1,'20260905','20260906']]),
        'stops.txt':text('stop_id,stop_name,stop_lat,stop_lon',[['A','Test A',50,7],['B','Test B',50.01,7]]),
        'stop_times.txt':text('trip_id,stop_sequence,stop_id,arrival_time,departure_time',
            [[trip,0,'A',time,time]]+[[trip,*e] for e in extra_events])}
    path=folder/(feed+'.zip')
    with zipfile.ZipFile(path,'w') as z:
        for n,s in data.items():z.writestr(n,s)
    (folder/(feed+'-download.json')).write_text(json.dumps({'url':FEEDS[feed],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))


class Semantics(unittest.TestCase):
    def test_service_exceptions_override_weekday_and_add_calendarless_services(self):
        c={'service_id':'s','start_date':'20260905','end_date':'20260907',**{d:'1' for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']}}
        result=calendar_days([c],[{'service_id':'s','date':'20260906','exception_type':'2'}, {'service_id':'x','date':'20260906','exception_type':'1'}])
        self.assertEqual(result['s'],{'20260905','20260907'});self.assertEqual(result['x'],{'20260906'})

    def test_gtfs_noon_origin_handles_both_dst_transitions(self):
        self.assertEqual(service_base('20260329'),int(datetime(2026,3,28,22,tzinfo=timezone.utc).timestamp()))
        self.assertEqual(service_base('20261025'),int(datetime(2026,10,24,23,tzinfo=timezone.utc).timestamp()))
        self.assertEqual(seconds('25:01:02'),90062)
        for s in ['12:60:00','-1:00:00','12:00','168:00:00']:
            with self.assertRaises(ValueError):seconds(s)

    def test_bus_replacement_in_long_distance_file_remains_bus(self):
        self.assertEqual(mode_for('fv',{'route_type':'3','route_short_name':'ICE Ersatz'}),'bus')
        self.assertEqual(mode_for('rv',{'route_type':'2','route_short_name':'S19'}),'suburban')
        self.assertEqual(mode_for('fv',{'route_type':'2','route_short_name':'ICE'}),'long_distance')

    def test_zero_delay_is_a_forecast_but_absent_default_zero_is_not(self):
        u=update();s=stop_update(u)
        p={'sequence':0,'stopId':'A','arrival':43200,'departure':43200}
        self.assertTrue(explicit_event(s,p))
        s.departure.ClearField('delay');self.assertFalse(explicit_event(s,p))
        s.departure.delay=-60;self.assertTrue(explicit_event(s,p))
        s.schedule_relationship=pb.TripUpdate.StopTimeUpdate.NO_DATA;self.assertFalse(explicit_event(s,p))
        s.schedule_relationship=pb.TripUpdate.StopTimeUpdate.SKIPPED;self.assertFalse(explicit_event(s,p))

    def test_wrong_sequence_or_stop_does_not_count(self):
        u=update();s=stop_update(u,seq=2)
        p={'sequence':1,'stopId':'A','arrival':43200,'departure':43200}
        self.assertFalse(explicit_event(s,p))
        s.stop_sequence=1;s.stop_id='B';self.assertFalse(explicit_event(s,p))

    def test_cancellation_ambiguity_and_trip_only_are_separate(self):
        i={'stops':[{'sequence':0,'stopId':'A','arrival':43200,'departure':43200}]}
        u=update();stop_update(u)
        self.assertEqual(classify(i,[u]),'explicit_forecast')
        self.assertEqual(classify(i,[]),'missing')
        self.assertEqual(classify(i,[u,u]),'ambiguous')
        self.assertEqual(classify(i,[u],True),'ambiguous')
        u.trip.schedule_relationship=pb.TripDescriptor.CANCELED
        self.assertEqual(classify(i,[u]),'cancelled')
        u.trip.schedule_relationship=pb.TripDescriptor.SCHEDULED;u.ClearField('stop_time_update')
        self.assertEqual(classify(i,[u]),'trip_update_only')

    def test_published_timestamp_does_not_replace_missing_start_date(self):
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=T
        e=f.entity.add();e.id='one';e.trip_update.CopyFrom(update(day=''));stop_update(e.trip_update)
        _,updates,_=parse_realtime(f.SerializeToString(),T+30)
        self.assertEqual(len(updates),0)
        for received in [T+121,T-31]:
            with self.assertRaises(ValueError):parse_realtime(f.SerializeToString(),received)
        f.header.incrementality=pb.FeedHeader.DIFFERENTIAL
        with self.assertRaises(ValueError):parse_realtime(f.SerializeToString(),T)

    def test_geographic_selection_is_a_circle(self):
        d={'radiusKm':10,'areas':[['test','Test',50,7]]}
        self.assertEqual(areas_for(50,7,d),['test'])
        self.assertEqual(areas_for(50.5,7,d),[])

    def test_stop_id_only_cannot_resolve_repeat_visit_outside_window(self):
        u=update();s=stop_update(u);s.ClearField('stop_sequence')
        i={'stops':[{'sequence':0,'stopId':'A','arrival':43200,'departure':43200}], 'repeatedStopIds':{'A'}}
        self.assertEqual(classify(i,[u]),'trip_update_only')
        s.stop_sequence=0
        self.assertEqual(classify(i,[u]),'explicit_forecast')


class IndexIntegration(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.areas=self.root/'areas.json';self.areas.write_text(json.dumps({'radiusKm':10,'areas':[['test','Test',50,7]]}))
        self.db_path=self.root/'assessment.sqlite'
        for feed in FEEDS:fixture_archive(self.root,feed)

    def tearDown(self):self.tmp.cleanup()

    def test_namespaced_routes_distinct_trip_instances_and_arrival_endpoint(self):
        fixture_archive(self.root,'nv',extra_events=[[1,'B','12:30:00','12:30:00']])
        m=import_index(self.root,self.db_path,self.areas)
        db,_=read_index(self.db_path)
        instances=planned(db,T,T+1800,90000)
        self.assertEqual(len(instances),3)
        self.assertEqual({i['mode'] for i in instances},{'bus','suburban','long_distance'})
        self.assertTrue(all(len(i['stops'])==1 for i in instances))
        db.close()
        self.assertFalse(self.db_path.with_suffix('.importing.sqlite').exists())

    def test_yesterday_after_midnight_includes_correct_service_date(self):
        fixture_archive(self.root,'nv',time='24:05:00')
        import_index(self.root,self.db_path,self.areas)
        db,_=read_index(self.db_path)
        midnight=int(datetime(2026,9,5,22,tzinfo=timezone.utc).timestamp())
        rows=planned(db,midnight,midnight+1800,90000)
        self.assertEqual([(r['tripId'],r['serviceDate']) for r in rows],[('nv-trip','20260905')])
        db.close()

    def test_checksum_failure_never_replaces_previous_index(self):
        import_index(self.root,self.db_path,self.areas); before=self.db_path.read_bytes()
        with (self.root/'nv.zip').open('ab') as f:f.write(b'corrupt')
        with self.assertRaises(ValueError):import_index(self.root,self.db_path,self.areas)
        self.assertEqual(self.db_path.read_bytes(),before)
        self.assertFalse(self.db_path.with_suffix('.importing.sqlite').exists())

    def test_real_protocol_to_index_denominator_and_separate_modes(self):
        import_index(self.root,self.db_path,self.areas)
        f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=T
        e=f.entity.add();e.id='bus';e.trip_update.CopyFrom(update());stop_update(e.trip_update)
        e=f.entity.add();e.id='rail';e.trip_update.CopyFrom(update('rv-trip'));e.trip_update.trip.schedule_relationship=pb.TripDescriptor.CANCELED
        body=f.SerializeToString();(self.root/'realtime.pb').write_bytes(body)
        (self.root/'download.json').write_text(json.dumps({'url':RT_URL,'sha256':hashlib.sha256(body).hexdigest(),'fetchedAt':datetime.fromtimestamp(T,timezone.utc).isoformat()}))
        r=assess(self.db_path,self.root/'realtime.pb',self.root/'download.json')
        groups={a['mode']:a for a in r['rows']}
        self.assertEqual(groups['bus']['explicitPercent'],100)
        self.assertEqual(groups['suburban']['cancelled'],1)
        self.assertEqual(groups['long_distance']['missing'],1)
        self.assertIsNone(groups['ferry']['explicitPercent'])
        self.assertEqual(r['quality']['entityCounts']['vehicle'],0)


if __name__=='__main__':unittest.main()
