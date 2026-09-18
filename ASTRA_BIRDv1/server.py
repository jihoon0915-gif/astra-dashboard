"""ASTRA v1.2 presentation adapter. Legacy generator/stream contracts stay untouched."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from http.cookies import SimpleCookie
from urllib.parse import urlparse,parse_qs,unquote
import argparse,json,sqlite3,hashlib,hmac,secrets,time,mimetypes,threading
import v2_store
for _ext,_type in {'.woff2':'font/woff2','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain; charset=utf-8'}.items():mimetypes.add_type(_type,_ext)

ROOT=Path(__file__).resolve().parent
PRIVATE=ROOT/'private'; STATIC=ROOT/'public'; LEGACY=ROOT/'legacy-source'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def sha(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()
REGIONS={'서울':['서울특별시'],'부산':['부산광역'],'대구':['대구광역'],'인천':['인천광역','인천광역시'],'광주':['광주광역'],'대전':['대전광역','대전'],'울산':['울산광역'],'세종':['세종특별자치'],'경기':['경기도'],'강원':['강원특별','강원도'],'충북':['충청북도'],'충남':['충청남도'],'전북':['전북특별','전라북도'],'전남':['전라남도'],'경북':['경상북도'],'경남':['경상남도'],'제주':['제주특별','제주도']}
class Store:
 def __init__(self):
  self.catalog=read(PRIVATE/'companies/public/companies_catalog.json')['companies']
  self.notices=read(LEGACY/'demo-ui/spatial-poc/dist/public-notices.json')['records']
  for n in self.notices:
   n['region']=next((r for r,aliases in REGIONS.items() if any(a in n['agency'] for a in aliases)),'지역 미확인')
  with sqlite3.connect(PRIVATE/'corpus.sqlite') as db:self.chunks={cid:json.loads(p) for cid,p in db.execute('select chunk_id,payload from corpus')}
  self.documents=[]
  for co in self.catalog:
   for d in read(PRIVATE/f"companies/internal/manifests/{co['company_id']}.json")['documents']:
    self.documents.append(dict(d,company_id=co['company_id'],tenant_id=co['tenant_id']))
  self.accounts={}
  for account in read(PRIVATE/'accounts.json')['accounts']:
   a=dict(account);password=a.pop('demo_password');salt=secrets.token_bytes(16)
   self.accounts[(a['company_code'],a['employee_id'])]=(a,salt,hashlib.pbkdf2_hmac('sha256',password.encode(),salt,120000))
  self.sessions={};self.lock=threading.Lock();self.failures={}
  self.cases={};self.mapping=[]
  for c in read(LEGACY/'demo-ui/spatial-poc/dist/rag-observatory.json')['cases']:
   x=dict(c,source='saved_public',company_id=None,levels=['L1'],bids=[c['bid']],detection_kind='human_draft')
   x['integrity']=self.integrity(c,c.get('spans',[]));self.cases[x['id']]=x
  self.curated=read(PRIVATE/'curated.json')
  for c in self.curated['items']:
   contexts=[];valid=True
   for ref in c['evidence_references']:
    ch=self.chunks.get(ref['chunk_id'])
    if not ch or sha(ch['text'])!=ref['text_sha256']:valid=False;continue
    contexts.append(dict(ch,citation=ref['citation'],chunk_text_sha256=ref['text_sha256'],scope='prompt_context'))
   bids=sorted({ch['bid_key'] for ch in contexts if ch.get('bid_key')})
   x={k:v for k,v in c.items() if k not in ['reference','outcome','partition']}
   x.update(source='curated_replay',contexts=contexts,levels=sorted({ch['security_level'] for ch in contexts}),bids=bids,bid=bids[0] if len(bids)==1 else None,detection_kind='stored_prediction',spans=c['prediction']['spans'],evidence_matched=valid)
   x['integrity']=self.integrity(c,x['spans']);self.cases.setdefault(x['id'],x)
   self.mapping.append({'id':c['id'],'company_id':c['company_id'],'levels':x['levels'],'bids':bids,'evidence_matched':valid,'integrity':x['integrity']})
  for c in read(PRIVATE/'editorial.json')['items']:
   x={k:v for k,v in c.items() if k!='source_file'};x.update(source='editorial_example',bids=[],contexts=[],spans=[],levels=[c['security_level']],detection_kind='not_run',answer_sha256=sha(c['answer']),integrity={'answer_hash':True,'spans':True})
   self.cases[x['id']]=x
  keyfile=PRIVATE/'researcher.key'
  if not keyfile.exists():keyfile.write_text(secrets.token_urlsafe(32),encoding='utf-8')
  self.review_key=keyfile.read_text().strip()
  v2_store.initialize(self,ROOT)
  (ROOT/'evidence/replay-mapping.json').write_text(json.dumps(self.mapping,ensure_ascii=False,indent=2),encoding='utf-8')
 def integrity(self,c,spans):
  return {'answer_hash':sha(c['answer'])==c.get('answer_sha256'),'spans':all(isinstance(s.get('start'),int) and 0<=s['start']<s['end']<=len(c['answer']) and c['answer'][s['start']:s['end']]==s.get('quote',c['answer'][s['start']:s['end']]) for s in spans)}
 def allowed(self,d,user):
  level=d.get('security_level')
  if level in ('L1','PUBLIC_CATALOG'):return True
  return bool(user and d.get('company_id')==user['company_code'] and d.get('tenant_id',user['tenant_id'])==user['tenant_id'] and level in user['allowed_security_levels'] and (not d.get('allowed_roles') or user['role'] in d['allowed_roles']))
 def case_allowed(self,c,user):
  if c.get('company_id') and (not user or c['company_id']!=user['company_code']):return False
  if c['source']=='curated_replay' and (not c['evidence_matched'] or not c['contexts']):return False
  return all(self.allowed({'security_level':lev,'company_id':c.get('company_id')},user) for lev in c['levels']) and all(self.allowed(ch,user) for ch in c['contexts'])

class Handler(BaseHTTPRequestHandler):
 server_version='ASTRA/3-preview'
 def log_message(self,fmt,*args):pass
 @property
 def store(self):return self.server.store
 def user(self):
  cookie=SimpleCookie()
  try:cookie.load(self.headers.get('Cookie',''))
  except Exception:return None
  token=cookie.get('astra_session');session=self.store.sessions.get(token.value) if token else None
  return session['user'] if session and session['expires']>time.time() else None
 def send(self,value,status=200,cookie=None):
  data=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.headers_common();self.send_header('Content-Length',str(len(data)))
  if cookie:self.send_header('Set-Cookie',cookie)
  self.end_headers();self.wfile.write(data)
 def headers_common(self):
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Frame-Options','DENY')
 def valid_host(self):return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')
 def do_GET(self):
  if not self.valid_host():return self.send({'error':'호스트가 허용되지 않습니다.'},403)
  url=urlparse(self.path);path=unquote(url.path);q=parse_qs(url.query);s=self.store;user=self.user()
  if path=='/api/personal':
   if not user:return self.send({'error':'로그인이 필요합니다.'},401)
   return self.send(v2_store.personal(s,user))
  if path=='/api/comparison':
   result=v2_store.comparison(s,user)
   return self.send(result if result else {'error':'해당 회사 L3 및 시연 비교 권한이 필요합니다.'},200 if result else 403)
  if path=='/api/session':return self.send({'user':user})
  if path=='/api/bootstrap':return self.send({'user':user,'companies':s.catalog,'notices':s.notices,'regions':list(REGIONS),'mode':'saved_replay','generator_connected':False})
  if path=='/api/examples':
   cases=[c for c in s.cases.values() if s.case_allowed(c,user)];bid=q.get('bid',[''])[0]
   if bid:cases=[c for c in cases if bid in c['bids']]
   return self.send({'items':[{k:c.get(k) for k in ['id','question','source','company_id','levels','bids','bid','detection_kind']} for c in cases]})
  if path.startswith('/api/cases/'):
   c=s.cases.get(path.split('/')[-1])
   if not c or not s.case_allowed(c,user):return self.send({'error':'접근할 수 없는 사례입니다.'},403)
   return self.send(c)
  if path=='/api/documents':
   if not user:return self.send({'error':'회사 로그인이 필요합니다.'},401)
   return self.send({'items':[{k:v for k,v in d.items() if k not in ['json_path','markdown_path']} for d in s.documents if s.allowed(d,user)]})
  if path.startswith('/api/documents/'):
   d=next((d for d in s.documents if d['document_id']==path.split('/')[-1]),None)
   if not d or not s.allowed(d,user):return self.send({'error':'접근할 수 없는 문서입니다.'},403)
   return self.send({'metadata':{k:v for k,v in d.items() if k not in ['json_path','markdown_path']},'text':(PRIVATE/'companies'/d['markdown_path']).read_text(encoding='utf-8')})
  if path=='/api/status':return self.send({'mode':'저장 답변 재생','generation':'미연결 · 다운로드하지 않음','retriever':'E5 가중치 보유 · 새 벡터 검색 미연결','detector':'KLUE 가중치 보유 · 현재 추론 미실행','public_notices':len(s.notices),'company_documents':sum(s.allowed(d,user) for d in s.documents),'corpus':str(sum(s.allowed(ch,user) for ch in s.chunks.values()))+'개 열람 가능 청크 · 세션 권한 기준','review':'최종 승인 전 · 별도 연구원 권한 필요','curated':'목표 비율에 맞춘 사후 구성 데이터 · 실시간 평가 아님','user':user})
  if path=='/api/research':
   token=self.headers.get('Authorization','').removeprefix('Bearer ')
   if not hmac.compare_digest(token,s.review_key):return self.send({'error':'별도 연구원 키가 필요합니다.'},403)
   review=LEGACY/'project-docs/환각라벨링/pilot-25-human-review-v1/adjudication_proposals.jsonl'
   return self.send({'curated':s.curated,'reviews':[json.loads(l) for l in review.read_text(encoding='utf-8').splitlines() if l.strip()] if review.exists() else [],'note':'최종 승인 전 · reference는 예측이 아닌 검수 참조 라벨입니다.'})
  if path.startswith('/api/'):return self.send({'error':'없는 API입니다.'},404)
  if path in ['/rag-observatory.html','/public-notices.html','/internal-review/']:return self.send({'message':'기존 화면은 보존된 legacy-source의 실행.cmd로 포트 8769에서 실행할 수 있습니다. 새 화면은 / 입니다.'},410)
  target=(STATIC/('index.html' if path=='/' else path.lstrip('/'))).resolve()
  if not target.is_relative_to(STATIC.resolve()) or not target.is_file() or target.suffix not in ('.html','.css','.js','.mjs','.png','.svg','.geojson','.json','.webp','.ico','.jpg','.mp4','.webm','.woff2','.txt'):return self.send({'error':'없는 파일입니다.'},404)
  data=target.read_bytes();ctype=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
  rng=self.headers.get('Range','')
  if rng.startswith('bytes=') and target.suffix in ('.mp4','.webm'):
   try:
    a,b=rng[6:].split(',')[0].split('-');total=len(data)
    start=int(a) if a else max(0,total-int(b));end=int(b) if (a and b) else total-1;end=min(end,total-1)
    if start>end or start>=total:raise ValueError()
   except Exception:
    self.send_response(416);self.send_header('Content-Range',f'bytes */{len(data)}');self.end_headers();return
   part=data[start:end+1];self.send_response(206);self.send_header('Content-Type',ctype);self.headers_common();self.send_header('Accept-Ranges','bytes');self.send_header('Content-Range',f'bytes {start}-{end}/{len(data)}');self.send_header('Content-Length',str(len(part)));self.end_headers();self.wfile.write(part);return
  self.send_response(200);self.send_header('Content-Type',ctype);self.headers_common()
  if target.suffix in ('.mp4','.webm'):self.send_header('Accept-Ranges','bytes')
  self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if not self.valid_host() or self.headers.get('Origin',f'http://{self.headers.get("Host")}')!=f'http://{self.headers.get("Host")}':return self.send({'error':'요청 출처가 올바르지 않습니다.'},403)
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length>8192:raise ValueError()
   data=json.loads(self.rfile.read(length))
  except Exception:return self.send({'error':'잘못된 요청입니다.'},400)
  s=self.store
  if self.path=='/api/personal':
   user=self.user()
   if not user:return self.send({'error':'로그인이 필요합니다.'},401)
   try:return self.send(v2_store.personal(s,user,data))
   except ValueError as e:return self.send({'error':str(e)},400)
  if self.path=='/api/login':
   if not all(isinstance(data.get(k),str) and data[k] for k in ['company_code','employee_id','password']):return self.send({'error':'세 항목을 모두 입력해주세요.'},400)
   code=data['company_code'].strip().upper();employee=data['employee_id'].strip().upper()
   if code not in [c['company_id'] for c in s.catalog]:return self.send({'error':'등록되지 않은 회사 코드입니다.','code':'UNKNOWN_COMPANY'},401)
   record=s.accounts.get((code,employee));salt=record[1] if record else b'unknown-account!'
   check=hashlib.pbkdf2_hmac('sha256',data['password'].encode(),salt,120000)
   if not record or not hmac.compare_digest(check,record[2]):return self.send({'error':'사번 또는 비밀번호를 확인해주세요.','code':'INVALID_CREDENTIALS'},401)
   token=secrets.token_urlsafe(32)
   with s.lock:s.sessions[token]={'user':record[0],'expires':time.time()+8*3600}
   return self.send({'user':record[0]},cookie=f'astra_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800')
  if self.path=='/api/logout':
   c=SimpleCookie();c.load(self.headers.get('Cookie',''));t=c.get('astra_session')
   if t:
    with s.lock:s.sessions.pop(t.value,None)
   return self.send({'user':None},cookie='astra_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
  return self.send({'error':'생성 모델 미연결 · 저장 예시를 선택해주세요.'},503)

def main():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8770);args=p.parse_args();server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.store=Store();print(f'ASTRA V2 preview http://127.0.0.1:{args.port}',flush=True);server.serve_forever()
if __name__=='__main__':main()
