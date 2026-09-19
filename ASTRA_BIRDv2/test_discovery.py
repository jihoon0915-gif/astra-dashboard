import unittest
from urllib.parse import urlencode
from test_server import AccessTests

class DiscoveryTests(AccessTests):
 def get(self,**q):return self.request('/api/discover?'+urlencode(q))
 def test_public_scope_and_forged_identity(self):
  code,d=self.get(company='C01',level='L3')
  self.assertEqual(code,200);self.assertEqual(d['scope'],'public_only');self.assertEqual(d['documents'],[]);self.assertIsNone(d['company'])
  self.assertEqual(d['total'],len(self.server.store.notices))
  self.assertTrue(all(not n['matches'] for n in d['items']))
 def test_tenant_and_l1(self):
  for cid in ['C01','C02','C03','C04','C05']:
   self.request('/api/login',{'company_code':cid,'employee_id':cid+'-0001','password':'000000'})
   self.assertEqual(self.get()[1]['documents'],[])
   self.login(cid,'L2');d=self.get(company='C01',level='L3')[1]
   self.assertEqual(d['company']['company_id'],cid)
   self.assertTrue(all(x['document_id'].startswith(cid) and x['security_level']=='L2' for x in d['documents']))
 def test_budget_validation_and_boundaries(self):
  for q in [dict(min='abc'),dict(min='nan'),dict(max='inf'),dict(min=-1),dict(min=3,max=2),dict(min=2,max=2)]:self.assertEqual(self.get(**q)[0],400)
  d=self.get(min=1,max=2)[1]
  self.assertTrue(all(n['budget'] is not None and 1e8<=n['budget']<2e8 for n in d['items']))
 def test_zero_and_date(self):
  self.assertEqual(self.get(query='no such tender 123XYZ')[1]['total'],0)
  self.assertEqual(self.get(date='2026-02-30')[0],400)
  d=self.get(date='2026-09-18',open=1)[1]
  self.assertEqual(d['total'],0)
  self.assertGreater(self.get(date='2026-04-01',open=1)[1]['total'],0)