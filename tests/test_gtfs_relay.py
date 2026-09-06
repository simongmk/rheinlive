"""Synthetic feeds verify transport freshness; never served by app runtime."""
from datetime import datetime,timezone
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from gtfs.relay import FeedCache
from google.transit import gtfs_realtime_pb2 as pb
T=1788688800


def feed(published=T,received=T,incremental=False):
    f=pb.FeedMessage();f.header.gtfs_realtime_version='2.0';f.header.timestamp=published
    if incremental:f.header.incrementality=pb.FeedHeader.DIFFERENTIAL
    body=f.SerializeToString()
    return body,{'url':'https://realtime.gtfs.de/realtime-free.pb','fetchedAt':datetime.fromtimestamp(received,timezone.utc).isoformat(),'sha256':hashlib.sha256(body).hexdigest()}


class Relay(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
    def test_coalesces_concurrent_consumers_without_renewing_publication(self):
        now=[T];calls=[]
        def loader():calls.append(1);return feed()
        c=FeedCache(self.temp.name,clock=lambda:now[0],loader=loader)
        with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:c.get(),range(8)))
        self.assertEqual(len(calls),1);self.assertEqual(len({r[0] for r in results}),1)
        now[0]+=24;c.get();self.assertEqual(len(calls),1)
        self.assertEqual(c.status()['publicationAt'],datetime.fromtimestamp(T,timezone.utc).isoformat())
        self.assertNotIn('origin',c.status())
    def test_stale_future_differential_and_corrupt_sources_fail_closed(self):
        for case in [feed(T-121),feed(T+31),feed(incremental=True),(b'corrupt',feed()[1])]:
            c=FeedCache(self.temp.name,clock=lambda:T,loader=lambda:case)
            with self.assertRaises(RuntimeError):c.get()
            self.assertFalse(c.status()['ready']);self.assertIsNone(c.body)
    def test_failed_refresh_hides_cached_data_then_recovers_after_backoff(self):
        now=[T];fail=[False];calls=[]
        def loader():
            calls.append(1)
            if fail[0]:raise OSError('offline')
            return feed(now[0],now[0])
        c=FeedCache(self.temp.name,clock=lambda:now[0],loader=loader);c.get()
        now[0]+=25;fail[0]=True
        with self.assertRaises(RuntimeError):c.get()
        fail[0]=False
        with self.assertRaises(RuntimeError):c.get()
        self.assertEqual(len(calls),2)
        now[0]+=25;c.get();self.assertTrue(c.status()['ready']);self.assertEqual(len(calls),3)
    def test_status_expires_without_any_further_network_request(self):
        now=[T];c=FeedCache(self.temp.name,clock=lambda:now[0],loader=feed);c.get()
        now[0]+=121;self.assertFalse(c.status()['ready'])
        with self.assertRaises(RuntimeError):c.get()
    def test_repeated_successful_download_of_old_payload_does_not_reset_age(self):
        now=[T];c=FeedCache(self.temp.name,clock=lambda:now[0],loader=lambda:feed(T,now[0]));c.get()
        now[0]+=60;c.get();now[0]+=61
        with self.assertRaises(RuntimeError):c.get()
        self.assertFalse(c.status()['ready'])


if __name__=='__main__':unittest.main()
