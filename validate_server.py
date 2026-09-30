"""Disposable browser QA profile. Never reads or changes existing personal records."""
import sqlite3, uuid
from contextlib import closing
from server import Store, Handler, ThreadingHTTPServer, ROOT

if __name__=='__main__':
    server=ThreadingHTTPServer(('127.0.0.1',8783),Handler)
    server.store=Store()
    dbpath=ROOT/'private'/('browser-qa-'+uuid.uuid4().hex+'.sqlite')
    assert not dbpath.exists()
    with closing(sqlite3.connect(dbpath)) as db, db:
        db.execute('CREATE TABLE personal(owner TEXT PRIMARY KEY,payload TEXT NOT NULL)')
    server.store.v2_db=dbpath
    print('Disposable QA personal database: '+str(dbpath),flush=True)
    server.serve_forever()
