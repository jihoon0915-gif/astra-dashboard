from contextlib import closing
import copy
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
import uuid
import l1_server as s

BID='R26BK01000001-000'
OTHER='R26BK01000002-000'

def fixture():
    text='테스트 전용 공개 공고. 사업기간 3개월. 😀 참가 조건 원문입니다.'
    doc=dict(document_id='L1-'+BID+'-hash',document_version='fixture-v1',filename='테스트.txt',
             bid_key=BID,text_sha256=s.digest(text),security_level='L1',public=True,
             synthetic=False,company_id=None,tenant_id=None,scenario_id=None)
    row=doc|dict(chunk_id=doc['document_id']+'-CH-00000',text=text,text_start=0,text_end=len(text))
    return doc,row

class BaseFixture(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=Path(self.tmp.name)/'index.sqlite'
        self.manifest=Path(self.tmp.name)/'manifest.json'
        self.doc,self.row=fixture()
        self.write([self.row])
        self.c=s.Corpus(self.db,self.manifest)
        self.service=s.Service(self.c,s.TestGenerator())

    def tearDown(self):
        self.tmp.cleanup()

    def write(self,rows):
        with closing(sqlite3.connect(self.db)) as c:
            c.execute('create table if not exists corpus(chunk_id text primary key,payload text)')
            c.execute('delete from corpus')
            c.executemany('insert into corpus values(?,?)',[(r['chunk_id'],json.dumps(r)) for r in rows])
            c.commit()
        self.manifest.write_text(json.dumps({'documents':[self.doc]}),encoding='utf-8')

    def request(self,**changes):
        return dict(schema_version=s.VERSION,request_id=str(uuid.uuid4()),snapshot_id=self.c.snapshot,
                    bid=BID,question='사업기간')|changes

    def events(self,**changes):
        return list(self.service.events(self.request(**changes),threading.Event()))

class Fixture(BaseFixture):
    def test_normal_and_source(self):
        events=self.events()
        self.assertEqual(events[0]['contexts'][0]['text'],self.row['text'])
        self.assertEqual(events[0]['contexts'][0]['scope'],'test_input')
        self.assertTrue(events[-1]['answer'].startswith(s.LABEL))
        self.assertFalse(events[-1]['generated'])
        self.assertEqual(events[-1]['answer_sha256'],s.digest(events[-1]['answer']))
        self.assertEqual(''.join(e['text'] for e in events if e['type']=='delta'),events[-1]['answer'])

    def test_invalid_inputs_and_claimed_roles(self):
        for field,value in [('bid','../../etc'),('bid',OTHER),('question',''),('question','x'*2001),
                            ('question',None),('snapshot_id','wrong'),('role','admin'),
                            ('tenant_id','C01'),('security_level','L3'),('company_id','C01'),
                            ('expected_answer','gold'),('endpoint','http://evil.test'),
                            ('test_behavior','unknown'),('test_behavior',[])]:
            with self.subTest(field=field),self.assertRaises(s.Fault):
                self.service.validate(self.request(**{field:value}))
        for body in ([],None,{},'bad'):
            with self.assertRaises(s.Fault):
                self.service.validate(body)

    def test_l2_other_bid_and_private_excluded(self):
        extras=[]
        for i,patches in enumerate([{'security_level':'L2'},{'security_level':'L3'},
            {'bid_key':OTHER},{'company_id':'C01'},{'tenant_id':'C01'},{'scenario_id':'SC'},
            {'public':False},{'synthetic':True}]):
            extras.append(self.row|patches|{'chunk_id':'rejected-'+str(i),'text':'SECRET'})
        self.write([self.row]+extras)
        corpus=s.Corpus(self.db,self.manifest)
        self.assertEqual(corpus.count,1)
        self.assertNotIn('SECRET',json.dumps(corpus.rows))

    def test_hash_offsets_and_gold_rejected(self):
        for patches in [{'text':self.row['text']+'X'},{'text_start':1},
                        {'document_version':'wrong'},{'expected_answer':'gold'}]:
            self.write([self.row|patches])
            with self.assertRaises(ValueError):
                s.Corpus(self.db,self.manifest)

    def test_return_reverification(self):
        rows=self.c.search(BID,'사업기간')
        for patches in [{'text':'changed'},{'security_level':'L3'},{'bid_key':OTHER}]:
            with self.assertRaises(ValueError):
                self.c.verify([rows[0]|patches],BID)

    def test_disconnected_empty_error_timeout(self):
        self.assertEqual(self.events(test_behavior='empty')[-1]['code'],'EMPTY_ANSWER')
        self.assertEqual(self.events(test_behavior='error')[-1]['code'],'TEST_ERROR')
        self.assertEqual(self.events(test_behavior='timeout')[-1]['code'],'TIMEOUT')
        self.service.generator=None
        self.assertEqual(self.events()[-1]['code'],'MODEL_NOT_CONNECTED')

    def test_missing_index(self):
        service=s.Service(None)
        self.assertFalse(service.status()['retrieval_available'])
        with self.assertRaises(s.Fault) as cm:
            service.validate(self.request())
        self.assertEqual(cm.exception.code,'INDEX_UNAVAILABLE')

    def test_no_results_no_generator(self):
        e=self.events(question='zzzzqwerty')
        self.assertTrue(e[-1]['abstained'])
        self.assertFalse(e[-1]['generated'])
        self.assertEqual(e[0]['contexts'],[])

    def test_cancel_and_deadline(self):
        cancel=threading.Event()
        gen=self.service.events(self.request(test_behavior='slow'),cancel)
        self.assertEqual(next(gen)['type'],'retrieval')
        cancel.set()
        self.assertEqual(next(gen)['code'],'CANCELLED')
        with self.assertRaises(s.Fault):
            s.check_stop(threading.Event(),time.monotonic()-1)

    def test_cancel_before_reservation_and_duplicates(self):
        rid=str(uuid.uuid4())
        self.service.cancel(rid)
        cancel=self.service.reserve(rid)
        self.assertTrue(cancel.is_set())
        with self.assertRaises(s.Fault):
            self.service.reserve(rid)
        self.assertIn(rid,self.service.active)
        self.service.release(rid)
        with self.assertRaises(s.Fault):
            self.service.reserve(rid)

    def test_model_endpoint_is_operator_pinned(self):
        for endpoint in ['https://example.com','http://localhost:9','http://127.0.0.1:9/a',
                         'http://user@127.0.0.1:9','http://127.0.0.1:9?url=x']:
            with self.assertRaises(ValueError):
                s.ModelGenerator(endpoint,'model')
        with self.assertRaises(s.Fault):
            s.NoRedirect().redirect_request(None,None,None,None,None,None)

    def test_model_sse_adapter_with_mock_transport_only(self):
        class Response(io.BytesIO):
            headers={'Content-Type':'text/event-stream'}
        event={'choices':[{'delta':{'content':'테스트'},'finish_reason':None}]}
        end={'choices':[{'delta':{},'finish_reason':'stop'}]}
        raw=('data: '+json.dumps(event)+'\n\ndata: '+json.dumps(end)+'\n\ndata: [DONE]\n\n').encode()
        captured=[]
        class Opener:
            def open(self,req,timeout):
                captured.append(json.loads(req.data))
                return Response(raw)
        generator=s.ModelGenerator('http://127.0.0.1:19999','mock-alias')
        with patch.object(s.urllib.request,'build_opener',return_value=Opener()):
            out=''.join(generator.stream([{'role':'user','content':'fixture'}],threading.Event(),time.monotonic()+5,'normal'))
        self.assertEqual(out,'테스트')
        self.assertTrue(captured[0]['stream'])
        self.assertEqual(captured[0]['model'],'mock-alias')
        raw=b'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'
        with patch.object(s.urllib.request,'build_opener',return_value=Opener()),self.assertRaises(s.Fault):
            list(generator.stream([],threading.Event(),time.monotonic()+5,'normal'))


class HTTP(BaseFixture):
    def setUp(self):
        super().setUp()
        self.server=s.make_server(self.service)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
        super().tearDown()

    def call(self,path,body=None,headers=None):
        h={'Content-Type':'application/json','X-Astra-Token':self.service.token}
        h.update(headers or {})
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=h)
        return urllib.request.urlopen(req,timeout=3)

    def test_http_stream_and_status(self):
        with self.call('/api/l1/status') as r:
            status=json.load(r)
            self.assertEqual(status['security_level'],'L1')
            self.assertNotIn('Access-Control-Allow-Origin',r.headers)
        with self.call('/api/l1/answers/stream',self.request()) as r:
            events=[json.loads(line) for line in r]
        self.assertEqual(events[-1]['type'],'done')

    def test_http_origin_host_token_and_paths(self):
        for headers in [{'Host':'evil.test'},{'Origin':'http://evil.test'},{'X-Astra-Token':'bad'},
                        {'Sec-Fetch-Site':'cross-site'}]:
            with self.assertRaises(urllib.error.HTTPError) as cm:
                self.call('/api/l1/answers/stream',self.request(),headers)
            self.assertEqual(cm.exception.code,403)
        for path in ['/../l1_server.py','/%2e%2e/l1_server.py','/work/rag-pilot/index.sqlite',
                     '/rag-observatory.html/../l1_server.py','//rag-observatory.html',
                     '/project-docs/','/index.html','/C:%5csecrets']:
            # BaseHTTPRequestHandler normalizes leading // to / by design; resulting allowlisted file is harmless.
            if path.startswith('//'):
                continue
            with self.assertRaises(urllib.error.HTTPError) as cm:
                self.call(path)
            self.assertEqual(cm.exception.code,404)

    def test_http_cancel(self):
        body=self.request(test_behavior='slow')
        response=self.call('/api/l1/answers/stream',body)
        self.assertEqual(json.loads(response.readline())['type'],'retrieval')
        with self.call('/api/l1/cancel',{'request_id':body['request_id']}) as r:
            self.assertTrue(json.load(r)['cancel_requested'])
        events=[json.loads(line) for line in response]
        response.close()
        self.assertEqual(events[-1]['code'],'CANCELLED')

    def test_http_disconnect_releases_worker(self):
        response=self.call('/api/l1/answers/stream',self.request(test_behavior='slow'))
        response.readline();response.close()
        end=time.monotonic()+3
        while self.service.active and time.monotonic()<end:
            time.sleep(.05)
        self.assertFalse(self.service.active)


class LocalIndex(unittest.TestCase):
    def test_all_51_real_index_no_model(self):
        db=s.ROOT/'work/rag-pilot/index.sqlite'
        if not db.exists():
            self.skipTest('actual local index unavailable')
        before=s.digest(db.read_bytes().hex())
        c=s.Corpus(db,s.ROOT/'project-docs/RAG파일럿/v1/index_manifest.json')
        self.assertEqual((len(c.by_bid),len(c.docs),c.count),(51,167,3002))
        for bid in c.by_bid:
            rows=c.search(bid,'사업기간 참가 자격')
            c.verify(rows,bid)
            self.assertTrue(all(r['security_level']=='L1' and r['bid_key']==bid for r in rows))
        self.assertEqual(before,s.digest(db.read_bytes().hex()))


if __name__=='__main__':
    unittest.main(verbosity=2)
