"""Loopback-only GTFS.de relay: one validated download, explicit freshness."""
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time

from .pipeline import download, parse_realtime, RT_URL, write_json


class FeedCache:
    def __init__(self, folder, clock=time.time, loader=None):
        self.folder=Path(folder)
        self.clock=clock
        self.loader=loader or self._download
        self.lock=threading.Lock()
        self.body=None
        self.metadata=None
        self.error=None
        self.last_attempt=float('-inf')
        self.last_served=None

    def _download(self):
        manifest=download(RT_URL,self.folder/'current.pb',64_000_000)
        body=(self.folder/'current.pb').read_bytes()
        return body,manifest

    def status(self):
        m=self.metadata
        now=self.clock()
        fresh=(self.body is not None and not self.error and m is not None
               and -30<=now-m['publicationTimestamp']<=120
               and -5<=now-m['receivedTimestamp']<=120)
        return {'provider':'gtfs.de','ready':fresh,'sourceUrl':RT_URL,
                'publicationAt':m['publicationAt'] if m else None,
                'receivedAt':m['receivedAt'] if m else None,
                'lastServedAt':self.last_served,'sha256':m['sha256'] if m else None,
                'entityCounts':m['entityCounts'] if m else None,
                'error':self.error,'positionType':'estimated','license':'CC BY-SA 4.0'}

    def get(self):
        with self.lock:
            now=self.clock()
            if now-self.last_attempt>=25:
                self.last_attempt=now
                try:
                    body,manifest=self.loader()
                    received=datetime.fromisoformat(manifest['fetchedAt']).timestamp()
                    _,_,quality=parse_realtime(body,received)
                    publication=datetime.fromisoformat(quality['publicationAt']).timestamp()
                    self.body=body
                    self.metadata={'publicationTimestamp':publication,'receivedTimestamp':received,
                                   'receivedAt':manifest['fetchedAt'],**quality,'sha256':manifest['sha256']}
                    self.error=None
                    write_json(self.folder/'download.json',manifest)
                except Exception:
                    self.error='Feed download or validation failed'
                    self.body=None
            if not self.status()['ready']:
                raise RuntimeError('Realtime feed unavailable or stale')
            self.last_served=self.clock()
            return self.body,self.status()


def serve(folder,port=8788):
    cache=FeedCache(folder)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):
            if self.path=='/feed.pb':
                try:
                    body,state=cache.get();status=200;content_type='application/x-protobuf'
                except RuntimeError:
                    body=b'Current realtime data unavailable';status=503;content_type='text/plain'
            elif self.path=='/status':
                state=cache.status();status=200 if state['ready'] else 503
                body=json.dumps(state).encode();content_type='application/json'
            else:
                body=b'Not found';status=404;content_type='text/plain'
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            try:self.wfile.write(body)
            except (BrokenPipeError,ConnectionResetError):pass
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(f'Validated GTFS relay on 127.0.0.1:{port}',flush=True)
    try:server.serve_forever()
    finally:server.server_close()
