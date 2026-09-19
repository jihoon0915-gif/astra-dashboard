"""Development integration: public L1 generation + key-gated internal review.
Loopback only; the internal key is a local development gate, not enterprise RBAC.
"""
import argparse,json,os,secrets,sys,threading,time,urllib.request
from pathlib import Path
import l1_server as base
sys.path.insert(0,str(base.ROOT))
from detector_bridge import Detector

class LocalGenerator(base.ModelGenerator):
 def probe(self):
  try:
   headers={'Authorization':'Bearer '+self.token} if self.token else {}
   request=urllib.request.Request(self.endpoint+'/v1/models',headers=headers)
   with urllib.request.build_opener(urllib.request.ProxyHandler({}),base.NoRedirect()).open(request,timeout=2) as r: data=json.load(r)
   return any(x.get('id')==self.model for x in data.get('data',[]))
  except Exception:return False

class IntegratedService(base.Service):
 def __init__(self,corpus,generator,detector,review_key=None):
  super().__init__(corpus,generator);self.detector=detector;self.review_key=review_key;self.detection_verified=False
  self.probe_time=0;self.probe_result=False;self.request_timeout=600
 def status(self):
  s=super().status()
  if self.mode=='model' and time.monotonic()-self.probe_time>5:
   self.probe_result=self.generator.probe();self.probe_time=time.monotonic()
  return s|dict(model_connected=self.probe_result,model_probe='models_endpoint' if self.mode=='model' else 'not_applicable',model_alias=getattr(self.generator,'model',None),detector=self.detector.status()|dict(inference_verified=self.detection_verified),internal_review_enabled=bool(self.review_key),integration_version='astra-local-1')
 def events(self,body,cancel):
  contexts=[]
  for e in super().events(body,cancel):
   if e["type"]=="retrieval":contexts=e["contexts"]
   if e['type']=='done' and e.get('generated'):
    # Base L1 service has already verified the context returned to the model.
    yield dict(e,type='detecting',detection='running',complete=False)
    result=self.detector.run('\n\n'.join(c['text'] for c in contexts),body['question'],e['answer'],cancel)
    if cancel.is_set():
     yield dict(e,type='error',seq=e['seq']+1,code='CANCELLED',message='요청을 취소했습니다.',retryable=True,complete=False);return
    self.detection_verified |= result['status'] in ['completed','partial'] and result.get('window_count',0)>0
    yield dict(e,seq=e['seq']+1,detection=result['status'],detection_result=result)
   else:yield e

class Handler(base.Handler):
 def do_GET(self):
  path=self.path.split('?',1)[0]
  if path.startswith('/internal-review') or path=='/api/internal/reviews':
   try:
    self.boundary()
    if path=='/api/internal/reviews':
     key=self.server.service.review_key
     if not key or not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+key):raise base.Fault('REVIEW_FORBIDDEN','내부 검수 접근 키가 필요합니다.',403)
     p=base.ROOT/'project-docs/환각라벨링/pilot-25-human-review-v1/adjudication_proposals.jsonl'
     rows=[json.loads(l) for l in p.read_text(encoding='utf-8').splitlines()]
     self.send_json(200,dict(version='pilot-25-human-review-v1',approval='pending',records=rows));return
    names={'/internal-review/':'index.html','/internal-review/review.js':'review.js','/internal-review/review.css':'review.css'}
    if path not in names:raise base.Fault('NOT_FOUND','지원하지 않는 경로입니다.',404)
    p=Path(__file__).parent/'internal-review'/names[path];raw=p.read_bytes()
    ctype={'index.html':'text/html','review.js':'text/javascript','review.css':'text/css'}[names[path]]
    self.headers_for(200,ctype+'; charset=utf-8',len(raw));self.wfile.write(raw)
   except base.Fault as e:self.fault(e)
  else:super().do_GET()

def main():
 p=argparse.ArgumentParser();p.add_argument('--env-file',type=Path);p.add_argument('--port',type=int,default=8769);p.add_argument('--generator',choices=['disconnected','test','model'],default='disconnected');p.add_argument('--index',type=Path,default=base.ROOT/'work/rag-pilot/index.sqlite');p.add_argument('--manifest',type=Path,default=base.ROOT/'project-docs/RAG파일럿/v1/index_manifest.json');a=p.parse_args()
 if a.env_file:
  allowed={'ASTRA_MODEL_URL','ASTRA_MODEL_ALIAS','ASTRA_MODEL_TOKEN','ASTRA_MAX_TOKENS','ASTRA_MODEL_READ_TIMEOUT','ASTRA_REVIEW_KEY','ASTRA_DETECTOR_PATH','ASTRA_DETECTOR_THRESHOLD','ASTRA_DETECTOR_LENGTH','ASTRA_DETECTOR_AGG','ASTRA_DETECTOR_DEVICE'}
  for line in a.env_file.read_text(encoding='utf-8-sig').splitlines():
   if not line.strip() or line.lstrip().startswith('#'):continue
   name,sep,value=line.partition('=')
   if not sep or name.strip() not in allowed:raise ValueError('Invalid environment file key')
   if value.strip():os.environ[name.strip()]=value.strip()
 corpus=base.Corpus(a.index,a.manifest) if a.index.exists() else None
 gen=base.TestGenerator() if a.generator=='test' else None
 if a.generator=='model':gen=LocalGenerator(os.environ.get('ASTRA_MODEL_URL',''),os.environ.get('ASTRA_MODEL_ALIAS',''),os.environ.get('ASTRA_MODEL_TOKEN',''))
 det=Detector(os.environ.get('ASTRA_DETECTOR_PATH'),float(os.environ.get('ASTRA_DETECTOR_THRESHOLD','.5')),int(os.environ.get('ASTRA_DETECTOR_LENGTH','512')),os.environ.get('ASTRA_DETECTOR_AGG','min'))
 key=os.environ.get('ASTRA_REVIEW_KEY')
 if key and len(key)<24:raise ValueError('review key must be at least 24 characters')
 if corpus:
  notices=json.loads((base.DIST/'public-notices.json').read_text(encoding='utf-8'))['records']
  if len(notices)!=51 or set(corpus.by_bid)!={n['id'] for n in notices}:raise ValueError('Approved 51 notice manifest mismatch')
 service=IntegratedService(corpus,gen,det,key);server=base.ThreadingHTTPServer(('127.0.0.1',a.port),Handler);server.daemon_threads=True;server.service=service
 print(f'ASTRA http://127.0.0.1:{a.port} mode={service.mode} detector={bool(det.path)} review={bool(key)}',flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:
  for c in list(service.active.values()):c.set()
  server.server_close()
if __name__=='__main__':main()
