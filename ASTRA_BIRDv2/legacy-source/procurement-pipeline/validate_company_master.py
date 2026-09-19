"""Offline synthetic-master checks. This is not authentication or bid adjudication.

No external dependencies. The schema walker implements only the keywords used by
the two shipped schemas, not the entire JSON Schema specification. Semantic checks
add cross-record constraints that JSON Schema alone cannot express.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT = REPO / 'project-docs/가상기업/v1'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def pointer(document, path):
    require(path.startswith('/'), f'invalid JSON pointer: {path}')
    value = document
    for key in path[1:].split('/'):
        key = key.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def schema_check(value, schema, root=None, path='$'):
    """Validate the explicitly supported JSON Schema keyword subset, fail closed."""
    root = schema if root is None else root
    known = {'$schema', '$id', '$defs', '$ref', 'title', 'description', 'type',
             'enum', 'properties', 'required', 'additionalProperties', 'items',
             'minItems', 'maxItems', 'minLength', 'pattern', 'format', 'minimum', 'maximum'}
    require(not (set(schema) - known), f'{path}: unsupported schema keywords')
    if '$ref' in schema:
        require(schema['$ref'].startswith('#/'), 'only local schema refs allowed')
        return schema_check(value, pointer(root, schema['$ref'][1:]), root, path)
    if 'enum' in schema:
        require(any(type(value) is type(x) and value == x for x in schema['enum']), f'{path}: enum')
    types = schema.get('type', [])
    types = [types] if isinstance(types, str) else types
    match = {'object': isinstance(value, dict), 'array': isinstance(value, list),
             'string': isinstance(value, str), 'null': value is None,
             'boolean': type(value) is bool, 'integer': type(value) is int,
             'number': type(value) in (int, float)}
    require(not types or any(match[t] for t in types), f'{path}: type {types}')
    if isinstance(value, dict):
        require(set(schema.get('required', [])) <= set(value), f'{path}: required fields')
        props = schema.get('properties', {})
        if schema.get('additionalProperties') is False:
            require(set(value) <= set(props), f'{path}: unknown fields')
        for key, item in value.items():
            if key in props:
                schema_check(item, props[key], root, path + '/' + key)
    if isinstance(value, list):
        require(len(value) >= schema.get('minItems', 0), f'{path}: minItems')
        require(len(value) <= schema.get('maxItems', float('inf')), f'{path}: maxItems')
        for i, item in enumerate(value):
            schema_check(item, schema.get('items', {}), root, f'{path}/{i}')
    if isinstance(value, str):
        require(len(value) >= schema.get('minLength', 0), f'{path}: minLength')
        if 'pattern' in schema:
            require(re.search(schema['pattern'], value), f'{path}: pattern')
        if schema.get('format') == 'date':
            require(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), f'{path}: ISO date')
            date.fromisoformat(value)
    if type(value) in (int, float):
        require(schema.get('minimum', -float('inf')) <= value <= schema.get('maximum', float('inf')), f'{path}: numeric range')


def walk(value, path=''):
    yield path, value
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk(item, path + '/' + key)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from walk(item, path + '/' + str(i))


def unique(items, label):
    require(len(items) == len(set(items)), 'duplicate ' + label)


def cert_valid(cert, when):
    """Validity within synthetic records; never proof of a real issued certificate."""
    return (cert['evidence_state'] == 'synthetic_record' and
            cert['valid_from'] is not None and cert['valid_until'] is not None and
            cert['valid_from'] <= when <= cert['valid_until'])


def can_access(session, document):
    """Executable policy example for fixtures only. Service integration is separate."""
    if document.get('security_level') == 'L1':
        return document.get('public') is True
    if document.get('security_level') not in ('L2', 'L3'):
        return False
    return bool(session.get('authenticated') and session.get('membership_active') and
                session.get('tenant_id') and session['tenant_id'] == document.get('tenant_id') and
                session.get('role') in document.get('allowed_roles', []))


def validate_capacity(person, extra=()):
    spans = person['existing_assignments'] + list(extra)
    for a in spans:
        require(person['joined_on'] <= a['start'] <= a['end'], 'assignment dates/employment')
        if person['employment_end']:
            require(a['end'] <= person['employment_end'], 'assignment beyond employment')
        require(0 < a['allocation_fte']['value'] <= 1, 'invalid FTE')
    # Closed day intervals: sum allocations at all starts and the days after ends.
    boundaries = {a['start'] for a in spans}
    boundaries |= {(date.fromisoformat(a['end']) + timedelta(days=1)).isoformat() for a in spans}
    for day in boundaries:
        assigned = sum(a['allocation_fte']['value'] for a in spans if a['start'] <= day <= a['end'])
        require(assigned <= person['capacity_fte']['value'] + 1e-9, 'overlapping personnel allocation')
        if day >= person['availability'][0]['start'] and assigned:
            slots = [a['capacity_fte']['value'] for a in person['availability'] if a['start'] <= day <= a['end']]
            require(slots and assigned <= max(slots) + 1e-9, 'allocation outside availability')


def validate_master(master, schema):
    schema_check(master, schema)
    cs = master['companies']; er = master['evidence_registry']
    unique([c['company_id'] for c in cs], 'company IDs')
    unique([c['tenant_id'] for c in cs], 'tenant IDs')
    unique([e['evidence_id'] for e in er], 'evidence IDs')
    evidence = {e['evidence_id']: e for e in er}
    entity_ids = []
    snapshot = master['snapshot_as_of']
    require(snapshot <= master['created_on'], 'snapshot after creation')
    for ci, c in enumerate(cs):
        cid = c['company_id']; tenant = c['tenant_id']
        require(tenant == 'astra-' + cid.lower(), 'tenant/company mismatch')
        require(c['snapshot_as_of'] == snapshot and c['founded_on'] <= snapshot, 'company snapshot/founding')
        require(c['version'] == master['data_version'], 'company data version mismatch')
        require(c['headquarters']['effective_from'] >= c['founded_on'], 'HQ before founding')
        require(c['headquarters']['effective_from'] <= snapshot, 'HQ after snapshot')
        require(c['headquarters']['effective_to'] is None or c['headquarters']['effective_to'] >= snapshot, 'HQ expired before snapshot')
        require(c['headcount']['value'] == len(c['personnel']), 'headcount does not match complete roster')
        unique(c['evidence_ids'], 'company evidence list')
        own = {e['evidence_id'] for e in er if e['company_id'] == cid}
        require(set(c['evidence_ids']) == own, 'company evidence registry mismatch')
        subjects = {cid}
        for collection, key in [('registrations', 'registration_id'), ('certifications', 'certification_id'),
                                ('projects', 'project_id'), ('personnel', 'person_id'), ('services', 'service_id')]:
            for item in c[collection]:
                entity_ids.append(item[key]); subjects.add(item[key])
        for e in er:
            if e['company_id'] == cid:
                require(e['tenant_id'] == tenant and e['subject_id'] in subjects, 'evidence tenant/subject mismatch')
        for path, item in walk(c):
            if isinstance(item, dict) and 'evidence_id' in item:
                eid = item['evidence_id']
                require(eid in own, 'foreign or unknown evidence reference')
                if 'evidence_state' in item:
                    require(item['evidence_state'] == evidence[eid]['status'], 'evidence state mismatch')
            if isinstance(item, dict) and set(item) == {'value', 'unit', 'origin', 'formula'}:
                if item['origin'] == 'calculated':
                    require(item['formula'], 'calculated value missing formula')
                require(item['origin'] != 'source_extracted', 'source numeric data embedded as company fact')
            if type(item) in (int, float):
                require(path.endswith('/value'), 'untyped numeric company fact')
        for r in c['registrations']:
            require(evidence[r['evidence_id']]['subject_id']==r['registration_id'], 'registration evidence subject')
            require(r['holder_id'] == cid, 'registration holder')
            require(c['founded_on'] <= r['registered_on'] <= snapshot, 'registration dates')
            require(r['valid_until'] is None or r['registered_on'] <= r['valid_until'], 'registration validity')
        for a in c['known_absences']:
            require(a['as_of'] <= snapshot, 'absence after snapshot')
            require(a['code'] not in {r['code'] for r in c['registrations'] if r['status'] == 'registered'}, 'held and not-held contradiction')
        services = {s['service_id']: s for s in c['services']}
        for cert in c['certifications']:
            require(evidence[cert['evidence_id']]['subject_id']==cert['certification_id'], 'certificate evidence subject')
            require(cert['holder_id'] == cid if cert['holder_type'] == 'company' else cert['holder_id'] in services, 'certificate holder')
            if cert['evidence_state'] == 'synthetic_record':
                require(all(cert[k] is not None for k in ('issued_on','valid_from','valid_until')), 'certificate missing dates')
                require(c['founded_on'] <= cert['issued_on'] <= cert['valid_from'] <= cert['valid_until'], 'certificate dates')
                require(cert['issued_on'] <= snapshot, 'certificate issued after snapshot')
            else:
                require(all(cert[k] is None for k in ('issued_on','valid_from','valid_until')), 'missing certificate dates invented')
        for svc in c['services']:
            require(svc['operator_company_id'] == cid, 'service operator tenant')
            require(all(any(x['certification_id'] == certid and x['holder_id'] == svc['service_id'] for x in c['certifications']) for certid in svc['certification_ids']), 'service certificate link')
        projects = {p['project_id']: p for p in c['projects']}
        for p in c['projects']:
            require(evidence[p['evidence_id']]['subject_id']==p['project_id'], 'performance evidence subject')
            require(c['founded_on'] <= p['contracted_on'] <= p['started_on'] <= p['scheduled_end'], 'project before founding or invalid dates')
            require(p['contracted_on'] <= snapshot, 'future contract treated as fact')
            if p['status'] == 'completed':
                require(p['completed_on'] is not None and p['started_on'] <= p['completed_on'] <= snapshot, 'invalid completion date')
                require(p['completed_on'] <= p['scheduled_end'], 'completion after planned end requires revision')
            else:
                require(p['completed_on'] is None and p['scheduled_end'] >= snapshot, 'in-progress/completed contradiction')
            require(0 < p['joint_share']['value'] <= 100, 'joint share range')
            require(p['amount_scope']==('joint_total' if p['joint_share']['value']<100 else 'company_contract'), 'contract amount scope/share mismatch')
            require(not p['subcontractor'] or p['customer']['type']=='fictional_private_company', 'subcontract customer must be a fictional prime contractor')
            m=p['contract_amount']; gross=m['gross']['value']; net=m['net']['value']; vat=m['vat']['value']
            require(all(type(x) is int for x in (gross,net,vat)) and gross > 0, 'money must be integer KRW')
            require(net + vat == gross and net == (gross * 10 + 5)//11 and m['vat_rate']['value'] == 10, 'VAT reconciliation')
        for p in c['personnel']:
            require(evidence[p['evidence_id']]['subject_id']==p['person_id'], 'personnel evidence subject')
            require(p['company_id'] == cid, 'personnel tenant')
            require(p['career_started_on'] <= p['joined_on'] <= snapshot, 'career/employment dates')
            require(p['joined_on'] >= c['founded_on'], 'employment before founding')
            require(p['employment_end'] is None or p['employment_end'] >= snapshot, 'ended employment on roster')
            require(p['capacity_fte']['value'] == 1, 'v1 whole-person capacity')
            for q in p['qualifications']:
                require(evidence[q['evidence_id']]['subject_id']==p['person_id'], 'qualification evidence subject')
                entity_ids.append(q['qualification_id'])
                require(p['career_started_on'] <= q['issued_on'] <= snapshot, 'qualification date')
                require(q['valid_until'] is None or q['issued_on'] <= q['valid_until'], 'qualification validity')
            for a in p['availability']:
                require(p['joined_on'] <= a['start'] <= a['end'], 'availability dates')
                require(0 < a['capacity_fte']['value'] <= 1, 'availability FTE')
                require(p['employment_end'] is None or a['end'] <= p['employment_end'], 'availability beyond employment')
            for a in p['existing_assignments']:
                entity_ids.append(a['assignment_id'])
                require(a['project_id'] in projects, 'assignment unknown/foreign project')
                pr = projects[a['project_id']]
                require(pr['started_on'] <= a['start'] <= a['end'] <= pr['scheduled_end'], 'assignment outside project')
            validate_capacity(p)
        policy = c['l3_policy']
        require(0 <= policy['minimum_gross_margin']['value'] <= policy['target_gross_margin']['value'] < 100, 'margin bounds')
        for rate in policy['labor_rates']:
            require(rate['monthly_base']['value'] > 0 and rate['employer_burden']['value'] < 100, 'labor cost range')
        require({p['role'] for p in c['personnel']} <= {r['role'] for r in policy['labor_rates']}, 'role without labor rate')
    unique(entity_ids, 'global entity IDs')
    require(all(e['company_id'] in {c['company_id'] for c in cs} for e in er), 'orphan evidence owner')
    return {'companies':len(cs),'personnel':sum(len(c['personnel']) for c in cs),
            'projects':sum(len(c['projects']) for c in cs),'evidence_records':len(er)}


def load_bundle(folder=DEFAULT):
    names={'master':'company_master.json','schema':'company_master.schema.json',
           'inventory':'document_inventory.json','mappings':'condition_mappings.json',
           'sources':'source_references.json','qa':'evaluation/qa_pilot_5.json',
           'plans':'scenario_plans.json','analysis':'requirements_analysis.json',
           'document_schema':'generated_document.schema.json'}
    return {key:read(Path(folder)/name) for key,name in names.items()}


def validate_bundle(b, source_cache=None, source_root=None):
    m=b['master']; counts=validate_master(m,b['schema'])
    companies={c['company_id']:c for c in m['companies']}
    docs=b['inventory']['documents']; refs=b['sources']['references']; maps=b['mappings']['mappings']
    plans=b['plans']['scenarios']; qa=b['qa']['questions']
    for rows,key in [(docs,'document_id'),(refs,'source_id'),(maps,'mapping_id'),(plans,'scenario_id'),(qa,'question_id')]:
        unique([r[key] for r in rows], key)
    refs_by={r['source_id']:r for r in refs}; maps_by={r['mapping_id']:r for r in maps}
    for r in refs:
        require(r['origin']=='source_extracted' and r['quote'], 'source provenance/quote')
        if r['review_status']=='pdf_visual_checked':
            require(r['page'] is not None and r['page']>0 and r['text_start'] is None and r['text_end'] is None and r['text_sha256'] is None, 'visual reference has fabricated offsets')
        else:
            require(r['review_status']=='extracted_text_checked' and type(r['text_start']) is int and r['text_start']>=0 and r['text_end']-r['text_start']==len(r['quote']), 'invalid extracted source offsets')
    plans_by={r['scenario_id']:r for r in plans}; docs_by={r['document_id']:r for r in docs}
    for doc in docs:
        c=companies[doc['company_id']]
        require(doc['tenant_id']==c['tenant_id'], 'document tenant')
        require(doc['status']=='planned_not_generated' and doc['rag_ingest'] is False, 'planned document ingested')
        expected = ['bid_analyst','cost_analyst','bid_approver'] if doc['security_level']=='L2' else (['bid_approver'] if doc['kind']=='bidding_strategy' else ['cost_analyst','bid_approver'])
        require(doc['allowed_roles']==expected, 'document role grants')
        for ptr in doc['master_pointers']:
            pointer(m,ptr)
            require(m['companies'][int(ptr.split('/')[2])]['company_id']==c['company_id'],'document pointer foreign tenant')
            require(doc['security_level']!='L2' or '/l3_policy' not in ptr, 'L3 source in L2 document')
    require(b['inventory']['access_policy']['implemented_in_service'] is False, 'unverified live security claim')
    for key in ('sources','mappings','qa'):
        require(b[key]['rag_ingest'] is False, 'evaluation/design material ingested')
    for p in plans:
        c=companies[p['company_id']]
        require(p['status']=='draft_not_submitted', 'v1 proposals must remain drafts')
        require(p['cost_sheet'] is None and p['bid_price'] is None, 'unrequested bid/cost generation')
        grouped={}
        for a in p['staffing']:
            person=next((x for x in c['personnel'] if x['person_id']==a['person_id']),None)
            require(person is not None,'scenario foreign/unknown person')
            grouped.setdefault(person['person_id'],[]).append(a)
        for pid, extra in grouped.items():
            validate_capacity(next(x for x in c['personnel'] if x['person_id']==pid),extra)
        if p['joint_members']:
            ids=[x['company_id'] for x in p['joint_members']]; unique(ids,'joint company IDs')
            require(set(ids)<=set(companies),'joint unknown company')
            require(sum(x['share']['value'] for x in p['joint_members'])==100,'joint shares sum')
    for x in maps:
        c=companies[x['company_id']]
        require(x['bid_key']==x['notice_id']+'-'+x['notice_version'],'notice version mismatch')
        require(x['scope']=='individual_condition_only' and x['overall_eligibility'] is None,'blanket eligibility')
        require(x['status'] in ('충족','미충족','자료부족','원문충돌'),'invalid status')
        require(x['source_ids'] and all(s in refs_by and refs_by[s]['bid_key']==x['bid_key'] for s in x['source_ids']),'source ID/notice reference')
        require(set(x['evidence_ids'])<=set(c['evidence_ids']),'mapping foreign evidence')
        for ptr in x['master_pointers']:
            pointer(m,ptr)
            require(m['companies'][int(ptr.split('/')[2])]['company_id']==c['company_id'],'mapping foreign pointer')
        if x['scenario_id']:
            require(x['scenario_id'] in plans_by and plans_by[x['scenario_id']]['bid_key']==x['bid_key'] and plans_by[x['scenario_id']]['company_id']==x['company_id'],'mapping scenario mismatch')
        comp=x['comparison']
        if comp:
            require(comp['operator']=='>=' and comp['left']['unit']==comp['right']['unit'],'comparison units/operator')
            require(comp['left']['origin']=='synthetic_setting' and comp['right']['origin']=='source_extracted','comparison provenance')
            require((comp['left']['value']>=comp['right']['value']) is comp['result'],'comparison result')
    # Actual field linkage for the two confirmed currency boundary checks.
    for mid,pi in [('M01',0),('M02',1)]:
        x=maps_by[mid]; gross=companies['C01']['projects'][pi]['contract_amount']['gross']['value']
        require(x['comparison']['left']['value']==gross and x['comparison']['right']['value']==70000000,'boundary not linked to master')
        require('7천만원(부가세 포함)' in refs_by['S-WB-AMOUNT']['quote'],'boundary source wording')
    ic=plans_by['SC-IC-C03']['joint_members']
    require(len(ic)<=3 and min(x['share']['value'] for x in ic)==maps_by['M10']['comparison']['left']['value'],'joint boundary not linked')
    require(not cert_valid(next(x for x in companies['C02']['certifications'] if x['code']=='8111159901'), '2026-04-01'),'expired certificate treated valid')
    require(not cert_valid(next(x for x in companies['C04']['certifications'] if x['code']=='CSAP'), '2026-06-24'),'missing service certificate treated valid')
    require(len(qa)==5 and len({(q['bid_key'],q['company_id']) for q in qa})==1,'pilot must be one notice/company, five questions')
    require(b['qa']['master_dataset_id']==m['dataset_id'] and b['qa']['master_data_version']==m['data_version'],'QA master version mismatch')
    for q in qa:
        x=maps_by[q['mapping_id']]
        require(q['expected_status']==x['status'],'QA status mismatch')
        require(q['bid_key']==x['bid_key'] and q['company_id']==x['company_id'],'QA pair mismatch')
        require(q['evidence']['source_ids']==x['source_ids'] and q['evidence']['master_pointers']==x['master_pointers'] and q['evidence']['synthetic_evidence_ids']==x['evidence_ids'],'QA evidence mismatch')
        require(q['rag_ingest'] is False and q['actual_generated_answer'] is None and q['hallucination_spans'] is None,'gold leakage or fabricated span labeling')
        require(q['expected_overall_eligibility'] is None,'QA blanket eligibility')
    source_checks={'quote_offsets':'not_run_without_local_cache','raw_sha256':'not_run_without_local_source_root'}
    visual_count=sum(r['review_status']=='pdf_visual_checked' for r in refs)
    source_checks['visual_review_records']=visual_count
    source_checks['visual_review_note']='기록된 수동 PDF 시각 확인 이력; 자동 재판독 검사가 아님'
    if source_cache:
        cached=read(source_cache); lookup={(d['bid'],d['name']):d for d in cached}
        for r in refs:
            d=lookup[(r['bid_key'],r['filename'])]; t=d['text']
            require(d['sha256']==r['sha256'],'source cache identity')
            if r['review_status']=='pdf_visual_checked':
                continue
            require(hashlib.sha256(t.encode()).hexdigest()==r['text_sha256'],'source text hash changed')
            require(t[r['text_start']:r['text_end']]==r['quote'],'source quote/offset mismatch')
        source_checks['quote_offsets']=f'passed:{len(refs)-visual_count}'
    if source_root:
        root=Path(source_root).resolve()
        for r in refs:
            p=(root/Path(r['relative_source_path'].replace('\\','/'))).resolve()
            require(p.is_relative_to(root),'source path traversal')
            require(hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256'],'raw file hash mismatch')
        source_checks['raw_sha256']=f'passed:{len(refs)}'
    source_checks['input_csv_hashes'] = []
    for inp in b['analysis']['input_files']:
        raw = (REPO/inp['path']).read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        # Historical Windows hashes predate Git LF checkout on Linux. Only this
        # CSV metadata check allows exact CRLF reconstruction; source binaries,
        # parsed text and citation offsets still require byte-exact hashes.
        crlf = raw.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        compatible = inp['path'].endswith('.csv') and hashlib.sha256(crlf).hexdigest() == inp['sha256']
        require(actual == inp['sha256'] or compatible, 'input CSV changed: regenerate analysis and review master')
        source_checks['input_csv_hashes'].append(dict(path=inp['path'], actual_sha256=actual,
            recorded_sha256=inp['sha256'], match='exact' if actual == inp['sha256'] else 'CRLF_reconstructed'))
    counts.update(document_templates=len(docs),condition_mappings=len(maps),pilot_questions=len(qa),source_excerpts=len(refs))
    return dict(status='passed',validated_on=date.today().isoformat(),counts=counts,source_checks=source_checks,
                limitations=['실제 입찰 적격 판정·보안 서버·모델 성능 검증이 아니다.',
                             '인용의 문자열·해시 일치는 원문 표 전체·쪽수·법적 우선순위 검증이 아니다.',
                             '현재 문서·증빙 파일은 생성 목록 단계; 마스터 증빙 레코드만 존재한다.'])


def validate_generated_document(doc, b):
    """Future ingestion preflight. Caller must enforce real session authorization."""
    schema_check(doc,b['document_schema'])
    templates={d['document_id']:d for d in b['inventory']['documents']}
    require(doc['template_id'] in templates,'unknown document template')
    t=templates[doc['template_id']]
    for key in ('company_id','tenant_id','security_level','allowed_roles','kind'):
        require(doc[key]==t[key], 'generated document template boundary: '+key)
    require(not doc['rag_ingest'] or doc['review_status']=='approved','unreviewed ingestion')
    require(doc['master_version']==b['master']['data_version'],'master data version mismatch')
    require(doc['master_dataset_id']==b['master']['dataset_id'],'master dataset mismatch')
    if t['scope']=='notice_specific':
        require(doc['notice_id'] and re.fullmatch(r'R\d{2}BK\d+',doc['notice_id']) and doc['notice_version'] and re.fullmatch(r'\d{3}',doc['notice_version']),'notice version required')
        plan=next((p for p in b['plans']['scenarios'] if p['scenario_id']==doc['scenario_id']),None)
        require(plan is not None and plan['company_id']==doc['company_id'] and plan['bid_key']==doc['notice_id']+'-'+doc['notice_version'],'generated scenario mismatch')
    else:
        require(doc['notice_id'] is None and doc['notice_version'] is None and doc['scenario_id'] is None,'common facts attached to a notice')
    c=next(c for c in b['master']['companies'] if c['company_id']==doc['company_id'])
    unique([ch['chunk_id'] for ch in doc['chunks']],'chunk IDs')
    for ch in doc['chunks']:
        for key in ('document_id','document_version','tenant_id','security_level','allowed_roles'):
            require(ch[key]==doc[key],'chunk permission/version boundary')
        require(0<=ch['text_start']<ch['text_end']<=len(doc['content']),'chunk offsets')
        require(doc['content'][ch['text_start']:ch['text_end']]==ch['text'],'chunk content mismatch')
        for fact in ch['source_fact_refs']:
            ptr=fact['master_pointer']; pointer(b['master'],ptr)
            require(ptr.startswith('/companies/') and b['master']['companies'][int(ptr.split('/')[2])]['company_id']==c['company_id'],'chunk foreign master facts')
            require(fact['evidence_id'] in c['evidence_ids'],'chunk foreign evidence')
            require(doc['security_level']!='L2' or '/l3_policy' not in ptr,'L3 facts in L2 chunk')
            selected=pointer(b['master'],ptr)
            require(doc['security_level']!='L2' or not any(isinstance(value,dict) and ('l3_policy' in value or value.get('security_level')=='L3') for _,value in walk(selected)), 'L2 pointer includes nested L3 data')
            require(any(ptr==p or ptr.startswith(p+'/') for p in t['master_pointers']) or t['scope']=='notice_specific','fact outside document projection')
    return True


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data',type=Path,default=DEFAULT)
    p.add_argument('--source-cache',type=Path)
    p.add_argument('--source-root',type=Path)
    p.add_argument('--report',type=Path)
    a=p.parse_args()
    result=validate_bundle(load_bundle(a.data),a.source_cache,a.source_root)
    if a.report:
        a.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
