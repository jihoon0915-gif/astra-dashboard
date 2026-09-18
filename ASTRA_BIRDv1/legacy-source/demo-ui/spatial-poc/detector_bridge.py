"""Local-only trained detector bridge. No training, downloads, or silent fallback."""
import hashlib,json,multiprocessing,os,time
from pathlib import Path

def fingerprint(path):
 h=hashlib.sha256()
 for p in sorted(Path(path).glob('*.safetensors')):
  with p.open('rb') as f:
   for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def _worker(conn,path,context,question,answer,threshold,max_length,agg):
 try:
  os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
  from demo.detector import HalluDetector
  from safetensors import safe_open
  files=list(Path(path).glob('*.safetensors'))
  keys=[]
  for file in files:
   with safe_open(file,framework='pt',device='cpu') as f:keys.extend(f.keys())
  if not any('classifier' in k and 'weight' in k for k in keys):raise ValueError('trained token classifier weights missing')
  det=HalluDetector(path,max_length=max_length,threshold=threshold,device=os.environ.get('ASTRA_DETECTOR_DEVICE','cpu'),agg=agg)
  if det.model.config.num_labels!=2:raise ValueError('Expected training labels 0/1')
  encoded=det.tok(answer,add_special_tokens=False,return_offsets_mapping=True)
  offsets=encoded['offset_mapping'];spans=[];checked=[];windows=0
  # Bound work and always leave room for evidence; never run answer-only inference.
  for i in range(0,len(offsets),192):
   chunk=offsets[i:i+192]
   if windows>=32:break
   a,b=chunk[0][0],chunk[-1][1]
   if b<=a:continue
   segment=answer[a:b]
   prompt=f'질문: {question.strip()}\n\n문서:\n{context.strip()}'
   prompt_count=len(det.tok(prompt,add_special_tokens=False)['input_ids'])
   budget=max_length-len(det.tok(segment,add_special_tokens=False)['input_ids'])-det.n_special
   if budget<64:raise ValueError('insufficient evidence budget')
   count=1 if prompt_count<=budget else 1+(prompt_count-budget+max(1,budget//2)-1)//max(1,budget//2)
   if windows+count>64:break
   windows+=count
   for s in det.spans(context,question,segment,window=True):
    start,end=a+s['start'],a+s['end'];spans.append(dict(start=start,end=end,quote=answer[start:end],probability=s['prob'],label='MODEL_SUSPECT',reason='학습된 탐지기의 근거 불일치 의심 예측 · 확정 판정 아님'))
   checked.append([a,b])
  end=checked[-1][1] if checked else 0
  conn.send(dict(status='completed' if end>=len(answer.rstrip()) else 'partial',spans=spans,checked_ranges=checked,unchecked_ranges=[] if end>=len(answer.rstrip()) else [[end,len(answer)]],window_count=windows,threshold=threshold,aggregation=agg,threshold_status='configured_not_calibrated_on_procurement',offset_unit='unicode_codepoint_end_exclusive',timing='after_generation',segmentation='nonoverlapping_answer_192_tokens_with_context_sliding_windows'))
 except Exception as e:conn.send(dict(status='failed',spans=[],reason=type(e).__name__,unchecked_ranges=[[0,len(answer)]]))
 finally:conn.close()

class Detector:
 def __init__(self,path=None,threshold=.5,max_length=512,agg='min'):
  self.path=Path(path).resolve() if path else None;self.threshold=threshold;self.max_length=max_length;self.agg=agg
  if not 0<threshold<1 or max_length<256 or max_length>4096 or agg not in ['min','min2','mean']:raise ValueError('Invalid detector settings')
  self.identity=None
  if self.path:
   if os.environ.get('ASTRA_DETECTOR_DEVICE','cpu') not in ['cpu','cuda']:raise ValueError('Detector device must be cpu or cuda')
   config=json.loads((self.path/'config.json').read_text(encoding='utf-8'))
   if config.get('id2label')!={'0':'SUPPORTED','1':'HALLUCINATED'}:raise ValueError('Checkpoint label mapping must match training')
   if max_length>config.get('max_position_embeddings',max_length)-2:raise ValueError('Configured length exceeds checkpoint capacity')
   if not list(self.path.glob('*.safetensors')) or not (self.path/'tokenizer.json').exists():raise ValueError('Local safetensors and fast tokenizer required')
   if not any('TokenClassification' in x for x in config.get('architectures',[])):raise ValueError('Not a token classification checkpoint')
   self.identity=dict(model_type=config.get('model_type'),checkpoint_name=self.path.name,weights_sha256=fingerprint(self.path),labels={'0':'SUPPORTED','1':'HALLUCINATED'},input_format='CLS + 질문/문서 + SEP + answer + SEP')
 def status(self):return dict(configured=bool(self.path),identity=self.identity,inference_verified=False)
 def run(self,context,question,answer,cancel,timeout=180):
  if not self.path:return dict(status='not_run',reason='checkpoint_not_configured',spans=[],unchecked_ranges=[[0,len(answer)]])
  ctx=multiprocessing.get_context('spawn');parent,child=ctx.Pipe(False)
  p=ctx.Process(target=_worker,args=(child,str(self.path),context,question,answer,self.threshold,self.max_length,self.agg));p.start();child.close();deadline=time.monotonic()+timeout
  try:
   while time.monotonic()<deadline:
    if cancel.is_set():return dict(status='cancelled',spans=[],unchecked_ranges=[[0,len(answer)]])
    if parent.poll(.1):
     try:return parent.recv()|dict(model=self.identity)
     except EOFError:break
    if not p.is_alive():break
   return dict(status='failed',reason='detector_timeout_or_exit',spans=[],unchecked_ranges=[[0,len(answer)]])
  finally:
   if p.is_alive():p.terminate()
   p.join(5);parent.close()
