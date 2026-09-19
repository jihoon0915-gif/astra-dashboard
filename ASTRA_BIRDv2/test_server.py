import unittest,threading,json,urllib.request,urllib.error,http.cookiejar,hashlib
from server import Store,Handler,ThreadingHTTPServer,ROOT

class AccessTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.server.store=Store();cls.base='http://127.0.0.1:'+str(cls.server.server_port);threading.Thread(target=cls.server.serve_forever,daemon=True).start()
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
 def setUp(self):self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 def request(self,path,data=None,headers=None):
  r=urllib.request.Request(self.base+path,json.dumps(data).encode() if data is not None else None,headers or {})
  try:
   with self.client.open(r) as response:return response.status,json.load(response)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def login(self,company,level):return self.request('/api/login',{'company_code':company,'employee_id':company+('-1001' if level=='L2' else '-2001'),'password':'000000'})
 def test_guest_and_static_boundary(self):
  self.assertIsNone(self.request('/api/session')[1]['user'])
  self.assertEqual(self.request('/api/documents')[0],401)
  for p in ['/private/accounts.json','/private/corpus.sqlite','/../private/researcher.key','/public/../private/curated.json','/legacy-source/config.py','/api/research']:
   self.assertIn(self.request(p)[0],[403,404])
  cases=self.request('/api/examples')[1]['items'];self.assertTrue(all(c['source'] in ['saved_public','editorial_example'] for c in cases));self.assertTrue(all(c['company_id'] is None for c in cases))
 def test_all_accounts_tenant_and_level_enforcement(self):
  s=self.server.store
  for cid in ['C01','C02','C03','C04','C05']:
   for level in ['L2','L3']:
    self.assertEqual(self.login(cid,level)[0],200)
    docs=self.request('/api/documents')[1]['items'];self.assertTrue(docs)
    self.assertTrue(all(d['company_id']==cid for d in docs))
    if level=='L2':self.assertTrue(all(d['security_level']=='L2' for d in docs))
    for d in s.documents:
     code,_=self.request('/api/documents/'+d['document_id'])
     self.assertEqual(code,200 if d['company_id']==cid and (level=='L3' or d['security_level']=='L2') else 403)
    listed=self.request('/api/examples')[1]['items']
    self.assertTrue(all(not c['company_id'] or c['company_id']==cid for c in listed))
    if level=='L2':self.assertTrue(all('L3' not in c['levels'] for c in listed))
    for c in s.cases.values():
     if c.get('company_id') and (c['company_id']!=cid or (level=='L2' and 'L3' in c['levels'])):self.assertEqual(self.request('/api/cases/'+c['id'])[0],403)
    self.assertEqual(self.request('/api/research')[0],403)
    self.request('/api/logout',{});self.assertIsNone(self.request('/api/session')[1]['user']);self.assertEqual(self.request('/api/documents')[0],401)
 def test_bad_login_and_origin(self):
  self.assertEqual(self.request('/api/login',{'company_code':'NONE','employee_id':'X','password':'000000'})[1]['code'],'UNKNOWN_COMPANY')
  self.assertEqual(self.request('/api/login',{'company_code':'C01','employee_id':'C02-1001','password':'000000'})[0],401)
  self.assertEqual(self.request('/api/login',{'company_code':'C01','employee_id':'C01-1001','password':'wrong'})[0],401)
  self.assertEqual(self.request('/api/login',{'company_code':'C01','employee_id':'C01-1001','password':0})[0],400)
  self.assertEqual(self.request('/api/logout',{}, {'Origin':'https://evil.example'})[0],403)
 def test_canonical_integrity_and_l2_l3_notice_mapping(self):
  s=self.server.store;self.assertEqual(sum(m['evidence_matched'] for m in s.mapping),100)
  self.assertTrue(all(m['integrity']['answer_hash'] and m['integrity']['spans'] for m in s.mapping))
  for lev in ['L2','L3']:self.assertTrue(any(lev in m['levels'] and m['bids'] for m in s.mapping))
  for c in s.curated['items']:
   derived=s.cases[c['id']];self.assertEqual(derived['answer'],c['answer'])
   if derived['source']=='curated_replay':self.assertNotIn('reference',derived);self.assertNotIn('outcome',derived)
  self.assertEqual(self.request('/api/research',headers={'Authorization':'Bearer '+s.review_key})[0],200)
 def test_original_files_preserved(self):
  expected=json.loads((ROOT/'evidence/original-sha256.json').read_text(encoding='utf-8'))
  for path,digest in expected.items():self.assertEqual(hashlib.sha256((ROOT/'legacy-source'/path).read_bytes()).hexdigest(),digest)

if __name__=='__main__':unittest.main(verbosity=2)
