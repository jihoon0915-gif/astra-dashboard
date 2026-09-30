from contextlib import closing
import hashlib
import http.cookiejar
import json
import shutil
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from server import Store, Handler, ThreadingHTTPServer


class UserDBTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.store = Store()
        cls.db = Path(cls.temp.name)/'users.sqlite3'
        shutil.copyfile(cls.store.auth.path, cls.db)
        cls.store.auth.path = cls.db
        cls.store.v2_db = Path(cls.temp.name)/'personal.sqlite'
        with closing(sqlite3.connect(cls.store.v2_db)) as db, db:
            db.execute('CREATE TABLE personal (owner TEXT PRIMARY KEY,payload TEXT NOT NULL)')
        cls.http = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.http.store = cls.store
        cls.base = 'http://127.0.0.1:'+str(cls.http.server_port)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.temp.cleanup()

    def setUp(self):
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self,path,data=None):
        req=urllib.request.Request(self.base+path,json.dumps(data).encode() if data is not None else None)
        try:
            with self.client.open(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)

    def login(self,username,company='C01',**extra):
        return self.request('/api/login',dict(company_code=company,username=username,password='000000',**extra))

    def test_all_25_accounts_and_document_scope(self):
        with closing(sqlite3.connect(self.db)) as db, db:
            rows=db.execute('SELECT username,company_id,account_status,membership_active,role_id FROM users').fetchall()
        self.assertEqual(len(rows),25)
        for username,company,status,member,role in rows:
            self.request('/api/logout',{})
            code,user=self.login(username,company)
            active=status=='active' and member
            self.assertEqual(code,200 if active else 401,username)
            if not active:continue
            self.assertEqual(user['user']['username'],username)
            self.assertTrue(user['user']['display_name'])
            docs=self.request('/api/documents')[1]['items']
            if company=='C01':self.assertEqual(len(docs),{'viewer':0,'bid_analyst':4,'cost_analyst':5,'bid_approver':5}[role])
            for d in self.store.documents:
                allowed=d['company_id']==company and role!='viewer' and (d['security_level']!='L3' or role=='bid_approver' or (role=='cost_analyst' and d['kind'] in ('cost','partner_quote','estimate')))
                self.assertEqual(self.request('/api/documents/'+d['document_id'])[0],200 if allowed else 403)

    def test_previous_password_is_rejected(self):
        self.assertEqual(self.request('/api/login',dict(company_code='C01',username='c01_bid_approver',password='AstraDemo!2026'))[0],401)

    def test_live_account_and_membership_revocation(self):
        self.login('c01_bid_approver')
        for field in ('account_status','membership_active'):
            with closing(sqlite3.connect(self.db)) as db, db:db.execute(f'UPDATE users SET {field}=? WHERE username=?',('inactive' if field=='account_status' else 0,'c01_bid_approver'))
            try:
                self.assertIsNone(self.request('/api/session')[1]['user'])
                self.assertEqual(self.request('/api/documents')[0],401)
                self.assertEqual(self.login('c01_bid_approver')[0],401)
            finally:
                with closing(sqlite3.connect(self.db)) as db, db:db.execute(f'UPDATE users SET {field}=? WHERE username=?',('active' if field=='account_status' else 1,'c01_bid_approver'))

    def test_live_role_change_and_document_kind(self):
        self.login('c01_cost_analyst')
        with closing(sqlite3.connect(self.db)) as db, db:db.execute("UPDATE users SET role_id='viewer' WHERE username='c01_cost_analyst'")
        try:self.assertEqual(self.request('/api/documents')[1]['items'],[])
        finally:
            with closing(sqlite3.connect(self.db)) as db, db:db.execute("UPDATE users SET role_id='cost_analyst' WHERE username='c01_cost_analyst'")
        user=self.store.auth.current('USR-C01-03')
        self.assertIsNotNone(user)
        cost=next(d for d in self.store.documents if d['company_id']=='C01' and d['kind']=='cost')
        restricted=dict(user,allowed_document_kinds=['company_profile'])
        self.assertFalse(self.store.allowed(cost,restricted))

    def test_forged_identity_password_and_old_login(self):
        self.assertEqual(self.login('c01_bid_approver','C02')[0],401)
        self.assertEqual(self.request('/api/login',dict(company_code='C01',username='c01_bid_approver',password='wrong'))[0],401)
        code,data=self.login('c01_viewer',role='bid_approver',tenant_id='astra-c02',security_level='L3')
        self.assertEqual(code,200);self.assertEqual(data['user']['role'],'viewer')
        self.assertEqual(self.request('/api/documents')[1]['items'],[])
        self.assertEqual(self.request('/api/login',dict(company_code='C01',employee_id='C01-2001',password='000000'))[0],400)

    def test_personal_user_id_and_isolation(self):
        self.login('c01_bid_analyst');ident=self.store.notices[0]['id']
        before=self.request('/api/personal')[1]['favorites']
        self.request('/api/personal',dict(action='favorite',id=ident))
        with closing(sqlite3.connect(self.store.v2_db)) as db, db:
            owners=[r[0] for r in db.execute('SELECT owner FROM personal')]
        self.assertIn('astra-c01:USR-C01-02',owners)
        self.login('c02_bid_analyst','C02')
        self.assertNotIn(ident,self.request('/api/personal')[1]['favorites'])

    def test_case_integrity_and_comparison(self):
        self.login('c01_bid_approver')
        self.assertEqual(self.request('/api/comparison')[0],200)
        for example in self.request('/api/examples')[1]['items']:
            code,c=self.request('/api/cases/'+example['id'])
            self.assertEqual(code,200)
            self.assertEqual(hashlib.sha256(c['answer'].encode()).hexdigest(),c['answer_sha256'])
        self.login('c01_viewer')
        self.assertEqual(self.request('/api/comparison')[0],403)
        self.assertTrue(all(e['levels']==['L1'] and e['company_id'] in (None,'C01') for e in self.request('/api/examples')[1]['items']))

    def test_private_database_not_served_and_session_payload(self):
        self.login('c01_bid_approver')
        for path in ('/user-db/users.demo.sqlite3','/private/users.demo.sqlite3','/user-db/users.demo.json'):
            self.assertEqual(self.request(path)[0],404)
        for session in self.store.sessions.values():self.assertEqual(set(session),{'user_id','expires'})
        self.request('/api/logout',{})
        self.assertIsNone(self.request('/api/session')[1]['user'])


if __name__=='__main__':unittest.main(verbosity=2)
