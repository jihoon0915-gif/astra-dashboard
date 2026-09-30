import unittest
import json,sqlite3,tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from contextlib import closing
from server import Store
from live_models import retrieve,CONTEXT_TOKENS

class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.store=Store()
    def test_scope_before_ranking(self):
        s=self.store;bid=s.notices[0]['id']
        for cid in range(1,6):
            for role in ('viewer','bid_analyst','cost_analyst','bid_approver'):
                u=s.auth.login(f'C{cid:02}',f'c{cid:02}_{role}','000000')
                contexts=retrieve(s,u,'원가 인건비 견적 입찰 전략',bid)
                self.assertTrue(contexts)
                for c in contexts:
                    if c['security_level']=='L1':self.assertEqual(c.get('bid_key'),bid)
                    else:
                        self.assertEqual(c['company_id'],f'C{cid:02}')
                        self.assertNotEqual(role,'viewer')
                        if role=='bid_analyst':self.assertNotEqual(c['security_level'],'L3')
                        if role=='cost_analyst':self.assertNotEqual(c.get('kind'),'bidding_strategy')
    def test_invalid_notice(self):
        u=self.store.auth.login('C01','c01_viewer','000000')
        with self.assertRaises(ValueError):retrieve(self.store,u,'질문','not-a-notice')
    def test_company_evidence_survives_notice_ranking(self):
        s=self.store
        bid=next(n['id'] for n in s.notices if '항공사 데이터 연계' in n['title'])
        u=s.auth.login('C01','c01_bid_approver','000000')
        for question,level in [('우리 회사의 기술 인력과 수행 실적을 공고와 비교해줘','L2'),('우리 회사의 원가 인건비 견적 입찰 전략을 근거로 예산을 검토해줘','L3')]:
            with self.subTest(level=level):
                c=retrieve(s,u,question,bid)
                self.assertIn(level,{ch['security_level'] for ch in c})
                self.assertEqual(len(c),7)
                self.assertEqual([ch['citation'] for ch in c],list(range(1,8)))
                self.assertTrue(all(len(ch['text'])<=800 for ch in c))
                self.assertEqual(sum(ch.get('bid_key')==bid for ch in c),4)
    def check_generation_and_detection(self,model):
        s=self.store;engine=s.live
        u=s.auth.login('C01','c01_bid_approver','000000')
        contexts=retrieve(s,u,'우리 회사의 원가 인건비 견적 입찰 전략',s.notices[0]['id'])
        self.assertIn('L3',{ch['security_level'] for ch in contexts})
        job=dict(id='unit-company-context',owner=u['user_id'],contexts=contexts,model=model)
        calls=[];detector_inputs=[]
        def fake_rpc(path,payload=None,**kw):
            calls.append((path,payload))
            return {'message':{'content':'테스트 답변'},'done_reason':'stop','prompt_eval_count':4500} if path=='/api/chat' else {}
        def fake_detector(*args,**kw):
            detector_inputs.append(json.loads(kw['input']))
            return SimpleNamespace(returncode=0,stdout=json.dumps({'status':'completed','spans':[]}).encode())
        with tempfile.TemporaryDirectory() as tmp:
            dbpath=Path(tmp)/'generated.sqlite3'
            with closing(sqlite3.connect(dbpath)) as db,db:db.execute('CREATE TABLE generated (id TEXT PRIMARY KEY,payload TEXT NOT NULL)')
            try:
                with patch.object(engine,'db',dbpath),patch('live_models.rpc',side_effect=fake_rpc),patch('live_models.subprocess.run',side_effect=fake_detector),patch('v2_store.personal'):
                    engine.run(job,'질문',s.notices[0]['id'])
                self.assertEqual(job['status'],'completed',job)
                self.assertEqual(calls[0][1]['options']['num_ctx'],8192)
                self.assertEqual(CONTEXT_TOKENS,8192)
                self.assertEqual(calls[0][1]['model'],model)
                self.assertEqual(calls[1][1]['model'],model)
                self.assertEqual(s.cases['live-'+job['id']]['generation']['model'],model)
                context=detector_inputs[0]['context']
                self.assertIn(context,calls[0][1]['messages'][1]['content'])
                for ch in contexts:self.assertIn(ch['text'],context)
            finally:s.cases.pop('live-'+job['id'],None)
    def test_generation_8b(self):self.check_generation_and_detection('astra-qwen3:8b')
    def test_generation_4b(self):self.check_generation_and_detection('astra-qwen3:4b')
    def test_generation_17b(self):self.check_generation_and_detection('astra-qwen3:1.7b')
    def test_unknown_model_rejected(self):
        for model in ('unexpected:latest',None,{},''):
            with self.assertRaises(ValueError):self.store.live.start({},'질문','notice',model)
    def test_generated_record_owner(self):
        a=self.store.auth.login('C01','c01_bid_approver','000000')
        b=self.store.auth.login('C01','c01_cost_analyst','000000')
        c=dict(source='live_qwen3',owner_user_id=a['user_id'],company_id='C01',levels=['L1'],contexts=[])
        self.assertTrue(self.store.case_allowed(c,a))
        self.assertFalse(self.store.case_allowed(c,b))

if __name__=='__main__':unittest.main(verbosity=2)
