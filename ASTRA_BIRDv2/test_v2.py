from contextlib import closing
import unittest, tempfile, pathlib, json, hashlib, contextlib, uuid
from test_server import AccessTests

class V2Tests(AccessTests):
 def test_l1_and_compare_boundaries(self):
  self.assertEqual(self.request('/api/comparison')[0],403)
  for company in ['C01','C02','C03','C04','C05']:
   self.assertEqual(self.request('/api/login',{'company_code':company,'employee_id':company+'-0001','password':'000000'})[0],200)
   self.assertEqual(self.request('/api/documents')[1]['items'],[])
   self.assertEqual(self.request('/api/comparison')[0],403)
   self.login(company,'L2');self.assertEqual(self.request('/api/comparison')[0],403)
   self.login(company,'L3');self.assertEqual(self.request('/api/comparison')[0],200 if company=='C01' else 403)
  self.login('C01','L3');data=self.request('/api/comparison')[1]
  for v in data['variants']:
   self.assertTrue(all(ch['security_level']<=v['level'] for ch in v['contexts']))
   self.assertTrue(all(ch['security_level']=='L1' or ch['company_id']=='C01' for ch in v['contexts']))
   self.assertEqual(hashlib.sha256(v['answer'].encode()).hexdigest(),v['answer_sha256'])
 def test_personal_scope_and_revalidation(self):
  with contextlib.nullcontext(pathlib.Path(__file__).parent/'private') as tmp:
   old=self.server.store.v2_db;self.server.store.v2_db=pathlib.Path(tmp)/('test-'+uuid.uuid4().hex+'.sqlite')
   import sqlite3
   with closing(sqlite3.connect(self.server.store.v2_db)) as db, db:db.execute('CREATE TABLE personal(owner TEXT PRIMARY KEY,payload TEXT NOT NULL)')
   try:
    self.assertEqual(self.request('/api/personal')[0],401)
    self.login('C01','L2');bid=self.server.store.notices[0]['id']
    self.assertEqual(self.request('/api/personal',{'action':'favorite','id':bid})[0],200)
    self.request('/api/personal',{'action':'history','question':'검증 질문','notice_id':bid})
    self.login('C01','L3');self.assertEqual(self.request('/api/personal')[1],{'favorites':[],'history':[]})
    self.login('C02','L2');self.assertEqual(self.request('/api/personal')[1]['favorites'],[])
    self.login('C01','L2');self.assertEqual(self.request('/api/personal')[1]['favorites'],[bid])
    foreign=next(c['id'] for c in self.server.store.cases.values() if c.get('company_id')=='C02')
    self.assertEqual(self.request('/api/personal',{'action':'history','question':'x','case_id':foreign})[0],400)
    self.assertEqual(self.request('/api/personal',{'action':'favorite','id':'missing'})[0],400)
    self.request('/api/personal',{'action':'clear_history'});self.request('/api/personal',{'action':'clear_favorites'})
    self.assertEqual(self.request('/api/personal')[1],{'favorites':[],'history':[]})
   finally:
    self.server.store.v2_db.unlink(missing_ok=True)
    self.server.store.v2_db=old

if __name__=='__main__':unittest.main()
