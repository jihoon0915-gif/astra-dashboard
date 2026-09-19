import json,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from test_l1_server import BaseFixture
from integrated_server import IntegratedService,Handler,base
from detector_bridge import Detector
class FakeModel:
 mode='model'
 def probe(self):return False
 def stream(self,prompt,cancel,deadline,behavior):yield '테스트 픽스처 답변 😀'
class IntegrationTests(BaseFixture):
 def test_model_then_unconfigured_detector(self):
  service=IntegratedService(self.c,FakeModel(),Detector());events=list(service.events(self.request(),threading.Event()))
  self.assertEqual([e['type'] for e in events],['retrieval','delta','detecting','done']);self.assertEqual(events[-1]['detection_result']['status'],'not_run')
  self.assertEqual([e['seq'] for e in events],[1,2,3,4])
 def test_test_mode_does_not_run_detector(self):
  events=list(IntegratedService(self.c,base.TestGenerator(),Detector()).events(self.request(),threading.Event()))
  self.assertNotIn('detecting',[e['type'] for e in events]);self.assertFalse(events[-1]['generated'])
 def test_detector_context_exact(self):
  outer=self
  class D:
   def run(self,context,question,answer,cancel):outer.assertEqual(context,outer.row['text']);return dict(status='not_run',spans=[])
  events=list(IntegratedService(self.c,FakeModel(),D()).events(self.request(),threading.Event()));self.assertEqual(events[-1]['type'],'done')
 def test_cancel_at_detection(self):
  class D:
   def run(self,context,question,answer,cancel):cancel.set();return dict(status='cancelled',spans=[])
  events=list(IntegratedService(self.c,FakeModel(),D()).events(self.request(),threading.Event()));self.assertEqual(events[-1]['code'],'CANCELLED')
 def test_detector_missing(self):self.assertEqual(Detector().run('a','b','😀c',threading.Event())['unchecked_ranges'],[[0,2]])
 def test_detector_config_rejects_base_embedding(self):
  p=Path(self.tmp.name);(p/'config.json').write_text(json.dumps({'architectures':['XLMRobertaModel']}));(p/'tokenizer.json').write_text('{}');(p/'model.safetensors').write_bytes(b'not model')
  with self.assertRaises(ValueError):Detector(p)
 def test_detector_reversed_labels_rejected(self):
  p=Path(self.tmp.name);(p/'config.json').write_text(json.dumps({'architectures':['RobertaForTokenClassification'],'id2label':{'0':'HALLUCINATED','1':'SUPPORTED'}}))
  with self.assertRaisesRegex(ValueError,'label mapping'):Detector(p)
 def test_detector_excess_length_rejected(self):
  p=Path(self.tmp.name);(p/'config.json').write_text(json.dumps({'id2label':{'0':'SUPPORTED','1':'HALLUCINATED'},'max_position_embeddings':514}))
  with self.assertRaisesRegex(ValueError,'capacity'):Detector(p,max_length=1024)
 def test_detector_threshold_invalid(self):
  with self.assertRaises(ValueError):Detector(threshold=2)
 def test_review_gate_and_static_boundary(self):
  service=IntegratedService(self.c,None,Detector(),'unit-test-only-local-review-key');server=base.ThreadingHTTPServer(('127.0.0.1',0),Handler);server.service=service
  t=threading.Thread(target=server.serve_forever,daemon=True);t.start();url='http://127.0.0.1:'+str(server.server_port)
  try:
   for path,headers in [('/api/internal/reviews',{}),('/api/internal/reviews',{'Authorization':'Bearer wrong'}),('/internal-review/../received/T01.xlsx',{}),('/work/internal-review.key',{}),('/project-docs/환각라벨링',{})]:
    if not path.isascii():continue
    with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(urllib.request.Request(url+path,headers=headers))
   with urllib.request.urlopen(url+'/internal-review/') as r:self.assertNotIn('expected_answer',r.read().decode('utf-8'))
   req=urllib.request.Request(url+'/api/internal/reviews',headers={'Authorization':'Bearer unit-test-only-local-review-key'})
   with urllib.request.urlopen(req) as r:data=json.load(r)
   self.assertEqual(len(data['records']),25);self.assertEqual(data['approval'],'pending')
   self.assertTrue(all(x['training_ready'] is False for x in data['records']))
  finally:server.shutdown();server.server_close();t.join()
 def test_public_status_has_no_review_secret(self):
  status=IntegratedService(self.c,None,Detector(),'unit-test-only-local-review-key').status()
  self.assertNotIn('unit-test-only-local-review-key',json.dumps(status));self.assertFalse(status['detector']['inference_verified'])
if __name__=='__main__':unittest.main(verbosity=2)
