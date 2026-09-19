"""Deterministic, session-scoped discovery. No generation or eligibility inference."""
import re, math
from datetime import datetime, timezone, timedelta

KST=timezone(timedelta(hours=9))
def discover(store,user,q):
 def value(k):return q.get(k,[''])[0]
 bounds={}
 for k in ['min','max']:
  try: bounds[k]=float(value(k))*1e8 if value(k) else None
  except ValueError:raise ValueError('예산은 숫자로 입력해주세요.')
  if bounds[k] is not None and (not math.isfinite(bounds[k]) or bounds[k]<0):raise ValueError('예산은 0 이상의 유한한 숫자여야 합니다.')
 if all(v is not None for v in bounds.values()) and bounds['min']>=bounds['max']:raise ValueError('최소 예산은 최대 예산보다 작아야 합니다.')
 if value('from') and value('to') and value('from')>value('to'):raise ValueError('시작 공고월은 종료월 이후일 수 없습니다.')
 basis=value('date')
 try:today=datetime.strptime(basis,'%Y-%m-%d').replace(tzinfo=KST) if basis else datetime.now(KST)
 except ValueError:raise ValueError('기준일을 확인해주세요.')
 company=next((c for c in store.catalog if user and c['company_id']==user['company_code']),None)
 internal=bool(user and 'L2' in user['allowed_security_levels'])
 docs=[{k:d[k] for k in ['document_id','title','security_level','kind','document_version']} for d in store.documents if store.allowed(d,user)] if internal else []
 terms=sorted({w for s in (company.get('specialties',[]) if internal else []) for w in re.split(r'[^가-힣A-Za-z0-9]+',s) if len(w)>=2})
 items=[]
 for n in store.notices:
  if value('query').lower() not in (' '.join(str(n.get(k,'')) for k in ['title','agency','id'])).lower():continue
  if any(value(k) and n.get(k)!=value(k) for k in ['sector','region','month']):continue
  if value('from') and n['month']<value('from'):continue
  if value('to') and n['month']>value('to'):continue
  if value('condition') and value('condition') not in n.get('conditionMentions',[]):continue
  if value('review')=='1' and not n.get('reviewAvailable'):continue
  b=n.get('budget')
  if bounds['min'] is not None and (b is None or b<bounds['min']):continue
  if bounds['max'] is not None and (b is None or b>=bounds['max']):continue
  try:
   raw=n['deadline'];end=datetime.fromisoformat(raw).replace(tzinfo=KST)
   if len(raw)==10:end=end.replace(hour=23,minute=59,second=59)
   opened=end>today
  except (ValueError,TypeError,KeyError):opened=False
  if value('open')=='1' and not opened:continue
  matched=[{'label':f'회사 공개 전문분야 단어 “{t}”가 공고 제목에 존재','field':'title','value':t,'source':'companies_catalog.specialties'} for t in terms if t.lower() in n['title'].lower()]
  if internal and n['region']!='지역 미확인' and company['region'].startswith(n['region']):matched.append({'label':'회사 소재지와 기관명 추정 지역 일치 · 참가 지역 판정 아님','field':'region','value':n['region'],'source':'companies_catalog.region / agency'})
  items.append(dict(n,matches=matched,unknowns=['참가 필수 자격과 증빙의 항목별 대응 미확인','사업 수행지·참가 지역 제한은 원문 확인','합성 기업 자료는 실제 발급 증빙이 아님'] if internal else ['참가 자격은 원문 확인'],open=opened))
 sort=value('sort')
 if sort=='budget':items.sort(key=lambda n:-(n['budget'] if n['budget'] is not None else -1))
 elif sort=='recent':items.sort(key=lambda n:n['month'],reverse=True)
 elif sort=='match':items.sort(key=lambda n:(-len(n['matches']),n.get('deadline') or '9999'))
 else:items.sort(key=lambda n:n.get('deadline') or '9999')
 return dict(items=items,total=len(items),public_total=len(store.notices),basis=today.isoformat(),demo_date=bool(basis),company=company if internal else None,documents=docs,scope='company_review' if internal else 'public_only',rules='제목의 전문분야 단어 및 기관명 추정 지역의 단순 일치. AI 유사도·참가 자격 판정 아님.',events=[{'step':'서버 세션 확인','status':'completed'},{'step':'허용 회사 문서 조회' if internal else '공개 범위 확인','status':'completed'},{'step':'공개 공고 조건 필터','status':'completed','count':len(items)},{'step':'참가 자격 자동 판정','status':'not_run'}])
