"""Offline context selection only; not a substitute for a server auth service."""
import validate_company_master as v


def evaluation_request(question):
    """Allowlist for a future run. Gold, curated evidence and private audit never enter it."""
    return {key:question[key] for key in ('question_id','question','company_id','user_context','bid_key','scenario_id','scenario_version','decision_as_of')}


def state_at(scenario,day):
    change=scenario['state_change']
    if day<change['effective_from']:return change['baseline']
    if change['effective_until'] and day>change['effective_until']:return 'expired_synthetic_assumption'
    return change['assumed_state']


def allowed(session,document,company_id,scenario_id,scenario_version):
    if document.get('company_id')!=company_id or not v.can_access(session,document):return False
    if document['security_level'] not in session.get('allowed_security_levels',[]):return False
    sid=document.get('scenario_id')
    return sid is None or (sid==scenario_id and document.get('scenario_version',document['document_version'])==scenario_version)


def select(session,documents,company_id,scenario,day):
    """State overlay replaces conflicting baseline source categories, never merges silently.

    Common unmodified facts remain allowed. The STATE document explicitly carries both
    the baseline and the assumed state with effective dates; reader must use state_at.
    Before effective date the scenario STATE is excluded, leaving baseline facts only.
    After expiry it is also excluded and state_at reports expired, not auto-renewed.
    """
    active=state_at(scenario,day)==scenario['state_change']['assumed_state']
    replaced={'C01':('PROFILE',),'C02':('CERT',),'C03':('PERF',),'C04':('CERT',),'C05':('PERF',)}[company_id]
    result=[]
    for d in documents:
        if not allowed(session,d,company_id,scenario['scenario_id'],scenario['version']):continue
        is_state='-QA300-STATE-' in d['document_id']
        if is_state and not active:continue
        if active and d.get('scenario_id') is None and any('-'+suffix+'-' in d['document_id'] for suffix in replaced):continue
        result.append(d)
    return dict(documents=result,state=state_at(scenario,day),baseline_overridden=active,
      limitation='STATE는 기존 사실과 구분한 가정 분기. 실제 제출 자격/증빙 확보를 뜻하지 않음.')
