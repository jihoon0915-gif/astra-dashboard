from contextlib import closing
"""V2 additive features; legacy corpus and answers remain immutable."""
import json, sqlite3, secrets, hashlib, time
from pathlib import Path

def initialize(store, root):
    store.v2_db = root/'private/user-state.sqlite'
    with closing(sqlite3.connect(store.v2_db)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS personal (owner TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    config=json.loads((root/'demo-roles.json').read_text(encoding='utf-8'))
    for company in store.catalog:
        cid=company['company_id']; base=store.accounts[(cid,cid+'-1001')][0]
        a=dict(base,employee_id=cid+'-0001',role='public_reader',allowed_security_levels=['L1'])
        if (cid,a['employee_id']) in store.accounts: raise ValueError('Duplicate L1 demo employee')
        salt=secrets.token_bytes(16)
        store.accounts[(cid,a['employee_id'])]=(a,salt,hashlib.pbkdf2_hmac('sha256',b'000000',salt,120000))
    for (cid,eid),(account,_,_) in store.accounts.items():
        account['can_compare']=eid in config['comparison_presenters'] and 'L3' in account['allowed_security_levels']

def personal(store,user,data=None):
    with store.lock:
        return _personal(store,user,data)

def _personal(store,user,data=None):
    owner=user['tenant_id']+':'+user['employee_id']
    with closing(sqlite3.connect(store.v2_db)) as db, db:
        row=db.execute('SELECT payload FROM personal WHERE owner=?',(owner,)).fetchone()
        result=json.loads(row[0]) if row else {'favorites':[],'history':[]}
        if data is not None:
            action=data.get('action'); ids={n['id'] for n in store.notices}
            if action=='favorite':
                ident=data.get('id')
                if ident not in ids: raise ValueError('공고를 확인해주세요.')
                result['favorites']=[x for x in result['favorites'] if x!=ident] if ident in result['favorites'] else result['favorites']+[ident]
            elif action=='history':
                q=data.get('question'); bid=data.get('notice_id'); case=data.get('case_id')
                if not isinstance(q,str) or not q.strip() or len(q)>2000: raise ValueError('질문을 확인해주세요.')
                if bid and bid not in ids: raise ValueError('공고를 확인해주세요.')
                if case and (case not in store.cases or not store.case_allowed(store.cases[case],user)): raise ValueError('사례에 접근할 수 없습니다.')
                result['history'].insert(0,dict(id=secrets.token_hex(8),question=q.strip(),notice_id=bid,case_id=case,created_at=time.time()))
                result['history']=result['history'][:100]
            elif action=='delete_history': result['history']=[x for x in result['history'] if x['id']!=data.get('id')]
            elif action=='clear_history':result['history']=[]
            elif action=='clear_favorites':result['favorites']=[]
            else: raise ValueError('알 수 없는 작업입니다.')
            db.execute('INSERT OR REPLACE INTO personal VALUES (?,?)',(owner,json.dumps(result,ensure_ascii=False)))
        result['history']=[x for x in result['history'] if not x.get('case_id') or (x['case_id'] in store.cases and store.case_allowed(store.cases[x['case_id']],user))]
        return result

def comparison(store,user):
    if not user or not user.get('can_compare') or 'L3' not in user['allowed_security_levels']:return None
    cid=user['company_code']
    notices={n['id']:n for n in store.notices}
    base=next(c for c in store.cases.values() if c['source']=='saved_public' and c.get('contexts') and c.get('bid') in notices)
    public=[ch for ch in base['contexts'] if ch['security_level']=='L1'][:2]
    variants=[]
    for level in ['L1','L2','L3']:
        levels=['L1','L2','L3'][:int(level[1])]
        scoped=dict(user,allowed_security_levels=levels,role='bid_analyst' if level=='L2' else user['role'])
        extra=[]
        for lev in levels[1:]:
            ch=next((x for x in store.chunks.values() if x.get('company_id')==cid and x['security_level']==lev and store.allowed(x,scoped)),None)
            if ch:extra.append(ch)
        contexts=[dict(ch,citation=i+1) for i,ch in enumerate(public+extra)]
        lines=['공고 원문의 조건과 회사 증빙을 함께 검토해야 합니다. 아래는 열람 가능한 원문 발췌이며, 참가 자격 충족을 확정한 판정이 아닙니다.']
        for ch in contexts:lines.append(f"[{ch['citation']}] {ch.get('filename',ch['document_id'])}\n“{ch['text'][:240]}”")
        lines.append('공개 자료만으로 회사의 조건 충족 여부를 확정할 수 없습니다.' if level=='L1' else '회사 자료는 검토 대상입니다. 공고 요건과의 항목별 대응 및 유효기간은 추가 확인이 필요합니다.')
        answer='\n\n'.join(lines)
        variants.append(dict(level=level,contexts=contexts,answer=answer,source='시연용 작성 답변',review_status='사람 검토 대기',detection='미실행',answer_sha256=hashlib.sha256(answer.encode()).hexdigest()))
    return dict(id='comparison-v2-'+cid,company_id=cid,notice=notices[base['bid']],question='우리 회사가 이 공고에 참여할 수 있는지, 확인된 근거와 추가 확인 사항을 설명해 주세요.',data_version='ASTRA-demo-data-v1',basis='2026-04-01 합성 기업 자료',variants=variants)
