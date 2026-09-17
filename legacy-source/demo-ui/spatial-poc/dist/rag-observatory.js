import {createHttpSource} from './rag-http.mjs';
import {createSavedSource,canApplyResult,detectionSummary} from './rag-source.mjs';
import {renderAnswer,escapeHTML as esc} from './rag-render.mjs';
import {createGraph} from './rag-graph.js';
const $=s=>document.querySelector(s);let data,notices,source,graph,bid,current=null,epoch=0,controller=null,httpSource=null,serverStatus=null;
function busy(value){$('#run').disabled=value;$('#cancel-request').hidden=!value;$('#execution-mode').disabled=value;$('#connection').disabled=value;$('.answer-card').setAttribute('aria-busy',String(value));}
function syncAnswerState(){
 const mode=current?.mode||($('#execution-mode').value==='saved'?'saved_replay':serverStatus?.mode);
 if(!current && $('#execution-mode').value==='server')$('#answer').innerHTML='<div class="empty"><span>↗</span><h3>답변을 기다리고 있습니다</h3><p>선택 공고에 질문을 보내면 여기에 답변이 표시됩니다. 생성 서버와 색인이 필요합니다.</p></div>';
 $('#answer-kind').textContent=current?.abstained?'자료부족 안내 · 생성 안 함':mode==='saved_replay'?'저장 답변 · 새 생성 아님':mode==='test'?'테스트 응답 · 실제 생성 아님':current?'실제 생성 응답':'답변 대기';
 $('#detection-state').textContent=detectionSummary(current?.detection,mode);
 $('#answer-progress').textContent=current?.incomplete?'요청 미완료 · 부분 응답':current?.complete?'응답 완료':current?'응답 처리 중':'';
}

function refreshMode(){
 const server=$('#execution-mode').value==='server';
 $('#mode-badge').textContent=server?(serverStatus?.mode==='test'?'테스트 응답 · 실제 모델 생성 아님':serverStatus?.mode==='model'?(serverStatus.model_connected?'실제 생성 · '+serverStatus.model_alias:'모델 서버 미연결'):'생성 서버 미연결'):'저장 결과 데모';
 $('#mode-hint').textContent=server?(serverStatus?.mode==='test'?'실제 L1 검색 + 테스트 생성기 · 공고 판단 답변 아님':'공개 L1 검색 · 답변 완료 후 탐지 연결 상태에 따라 검사합니다.'):'자유 질문은 생성 서버 연결 후 사용할 수 있습니다.';
 $('#run').textContent=server?(serverStatus?.mode==='test'?'테스트 질문 전송':'질문 전송'):'저장 답변 확인';
 $('#test-controls').hidden=!(server&&serverStatus?.mode==='test');
 syncAnswerState();
 document.querySelector('footer').textContent=server?'공개 L1 질문 서버 · '+(serverStatus?.mode==='test'?'테스트 응답 · 실제 모델 미실행':'생성 서버 모드')+' · 탐지 미실시':'공개 L1 자료 · 저장 결과 재생 · 형광펜은 검수 초안';
 if(current?.detection)document.querySelector('footer').textContent='공개 L1 · '+detectionSummary(current.detection,current.mode);
}
async function connectionStatus(){
 try{serverStatus=await httpSource.connect();$('#server-option').disabled=false;$('#server-option').textContent=serverStatus.mode==='test'?'L1 테스트 서버':serverStatus.mode==='model'?(serverStatus.model_connected?'실제 생성 · '+serverStatus.model_alias:'L1 모델 서버 · 미연결'):'L1 서버 · 생성 미연결';}
 catch{serverStatus=null;$('#server-option').disabled=true;$('#server-option').textContent='질문 서버 미연결';}
 refreshMode();
}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function info(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;openDialog('#info-dialog');}
function clearAnswer(){$('#retry-request').hidden=true;current=null;$('#answer').innerHTML='<div class="empty"><span>↗</span><h3>예시 질문으로 시작하세요</h3><p>저장 결과를 선택하면 답변과 입력 근거를 확인할 수 있습니다.</p></div>';$('#answered-question').textContent='';$('#quality').textContent='';$('#highlights').checked=false;['copy','sources','highlights'].forEach(id=>$('#'+id).disabled=true);$('#source-dialog').close();graph?.setCase(null);syncAnswerState();}
function chooseNotice(id,push=true){
 const n=notices.find(n=>n.id===id);if(!n)return;
 controller?.abort();epoch++;busy(false);bid=id;clearAnswer();$('#question').value='';$('#question-count').textContent='0 / 2,000자';$('#notice-title').textContent=n.title;$('#notice-title').title=n.title;$('#notice-meta').textContent=n.id+' · 공개 L1';
 $('#notice-link').href='public-notices.html?bid='+encodeURIComponent(bid);
 const examples=source.examples(bid);$('#examples').innerHTML=examples.length?examples.map(c=>'<button type="button" data-example="'+esc(c.id)+'">'+esc(c.question)+'</button>').join(''):'<p>이 공고에는 공개 저장 예시가 없습니다. 공고 요건은 지도에서 확인할 수 있습니다.</p>';
 if(!examples.length&&$('#execution-mode').value==='saved')$('#answer').innerHTML='<div class="empty"><span>↗</span><h3>저장 답변이 없는 공고입니다</h3><p>공고 지도에서 요건을 살펴보거나, 저장 예시가 있는 공고를 선택해 주세요.</p></div>';
 $('#status').textContent=examples.length?'예시 질문을 선택하고 저장 답변을 확인하세요.':'생성 서버 미연결 · 새 답변 생성은 아직 사용할 수 없습니다.';
 if($('#execution-mode').value==='server'){
  $('#status').textContent='선택 공고의 공개 L1 자료에 질문할 수 있습니다. 현재 서버 모드를 확인하세요.';
  $('#answer').innerHTML='<div class="empty"><h3>새 공고에 질문해 보세요</h3><p>이전 공고의 답변과 출처는 초기화했습니다.</p></div>';
 }
 $('#notice-dialog').close();const u=new URL(location.href);u.searchParams.set('bid',bid);if(push)history.pushState({bid},'',u);else history.replaceState({bid},'',u);
}
function render(){if(!current)return;syncAnswerState();$('#answer').innerHTML=renderAnswer(current.answer,current.contexts,current.spans,$('#highlights').checked);$('#answered-question').textContent=current.question;
 $('#quality').innerHTML=current.quality_notes.map(t=>'<p>추가 확인 · '+esc(t)+'</p>').join('')+(current.detection?'<details><summary>탐지 상세</summary><p>답변 완료 후 검사 · '+esc(current.detection.status)+'</p>'+current.spans.map((s,i)=>'<button data-detection-span="'+i+'">'+esc(s.quote)+'</button>').join('')+'<pre>'+esc(JSON.stringify({model:current.detection.model,threshold:current.detection.threshold,unchecked_ranges:current.detection.unchecked_ranges},null,2))+'</pre></details>':'');}
function evidence(i){if(!current||!current.contexts[i])return;const c=current.contexts[i];graph.select(i);
 $('#source-nav').innerHTML=current.contexts.map((c,j)=>'<button data-source="'+j+'" aria-pressed="'+(i===j)+'">'+(c.citation===null?'추가 자료':'근거 ['+c.citation+']')+'</button>').join('');
 $('#evidence').innerHTML='<p class="badge">'+(c.scope==='test_input'?'테스트 생성기에 전달한 근거 · 모델 미실행':c.scope==='generation_input'?'생성 요청용 근거 · 요청 실패 시 사용 여부 미확인':c.scope==='prompt_context'?'생성 시 사용한 근거':'사후 추가 자료 · 생성 입력에 없었음')+'</p><h3>'+esc(c.filename)+'</h3><p class="muted">아래 구간이 답변의 모든 주장을 지지한다고 보장하지 않습니다.</p><pre>'+esc(c.text)+'</pre><details><summary>추적 정보</summary><code>문서 '+esc(c.document_id)+'</code><code>청크 '+esc(c.chunk_id)+'</code><p>버전 '+esc(c.document_version)+' · L1</p><p>정본 문자 ['+c.text_start+', '+c.text_end+') · Unicode 코드 포인트 · 0부터, 끝 제외</p></details>';
 openDialog('#source-dialog');
}
$('#ask-form').onsubmit=async e=>{
 e.preventDefault();const question=$('#question').value.trim();
 if(!question){$('#status').textContent='질문을 입력하거나 예시를 선택해 주세요.';$('#question').focus();return;}
 if(Array.from(question).length>2000){$('#status').textContent='질문은 2,000자 이하로 입력하세요.';return;}
 const requestBid=bid,requestEpoch=++epoch;controller?.abort();controller=new AbortController();
 const signal=controller.signal;clearAnswer();busy(true);
 const valid=()=>canApplyResult(requestEpoch,epoch,requestBid,bid)&&!signal.aborted;
 try{
  if($('#execution-mode').value==='saved'){
   const result=await source.ask({bid:requestBid,question},signal);if(!valid())return;
   current={...result,complete:true};render();graph.setCase(current);$('#copy').disabled=false;$('#sources').disabled=!current.contexts.length;$('#highlights').disabled=!current.spans.length;
   $('#status').textContent='저장 답변 표시 · '+(current.quality_notes.some(t=>t.includes('잘림'))?'출력 잘림 · 추가 확인 필요':current.quality_notes.length?'추가 확인 필요 · 검수 메모 참조':'새 검색·생성은 실행하지 않았습니다.');
  }else{
   if(!serverStatus)throw Error('질문 서버 미연결 · 연결 상태를 다시 확인하세요.');
   if(serverStatus.snapshot_id===null)throw Error('검색 색인 미연결 · 저장 결과 모드에서 예시를 확인하세요.');
   if(serverStatus.mode==='disconnected')throw Error('생성 서버 미연결 · 저장 결과 모드에서 예시를 확인하세요.');
   $('#status').textContent=serverStatus?.mode==='test'?'테스트 요청 중 · 실제 모델 생성 아님':'요청 중 · 공개 근거 검색';
   current={bid:requestBid,question,answer:'',contexts:[],spans:[],quality_notes:[],mode:serverStatus.mode};
   render();
   let streamFailed=false;
   for await(const event of httpSource.ask({requestId:crypto.randomUUID(),bid:requestBid,question,behavior:$('#test-behavior').value},signal)){
    if(!valid())return;
    if(event.type==='retrieval'){current.contexts=event.contexts;graph.setCase(current);$('#sources').disabled=!event.contexts.length;}
    if(event.type==='delta'){current.answer+=event.text;render();$('#status').textContent=(serverStatus.mode==='test'?'테스트 응답 수신 중 · 모델 미실행':'답변 수신 중')+' · 아직 완료되지 않음';}
    if(event.type==='detecting'){current.detection={status:'running',spans:[]};syncAnswerState();$('#status').textContent=serverStatus?.detector?.configured?'답변 생성 완료 · 탐지 처리 중':'답변 생성 완료 · 탐지 연결 확인';$('#detection-state').textContent=detectionSummary(current.detection,current.mode);}
    if(event.type==='done'){current.complete=true;current.abstained=event.abstained;current.answer=event.answer;if(event.generated)current.contexts=current.contexts.map(c=>({...c,scope:'prompt_context'}));current.answer_sha256=event.answer_sha256;render();$('#copy').disabled=false;$('#status').textContent=event.abstained?'자료부족 안내 · 답변 생성 안 함':serverStatus.mode==='test'?'테스트 스트림 완료 · 실제 모델 생성 아님 · 탐지 미실시':'답변 생성 완료';
     if(event.detection_result){const d=event.detection_result;current.spans=d.spans;current.detection=d;const label=detectionSummary(d,current.mode);$('#detection-state').textContent=label;$('#status').textContent+=' · '+label;$('#highlights').disabled=!d.spans.length;$('#highlights').checked=!!d.spans.length;current.quality_notes=d.unchecked_ranges?.length?['답변에 탐지하지 못한 구간이 있습니다.']:[];render();graph.setCase(current);document.querySelector('footer').textContent='공개 L1 · 실제 생성 · '+label;}
    }
    if(event.type==='error'){streamFailed=true;current.incomplete=true;current.complete=false;if(current.detection?.status==='running')current.detection={status:event.code==='CANCELLED'?'cancelled':'failed',spans:[]};$('#status').textContent=event.message;$('#retry-request').hidden=!event.retryable;current.quality_notes=['요청 미완료 · 표시된 내용은 부분 응답일 수 있습니다.'];render();}
   }
   if(streamFailed)$('#copy').disabled=true;
  }
 }catch(error){
  if(requestEpoch!==epoch||requestBid!==bid)return;
  $('#status').textContent=signal.aborted?'요청 취소됨 · 완료 답변이 아닙니다.':error.message;
  if(current){current.incomplete=true;current.complete=false;if(current.detection?.status==='running')current.detection={status:signal.aborted?'cancelled':'failed',spans:[]};current.quality_notes=['요청 미완료 · 부분 응답'];render();}
  $('#copy').disabled=true;$('#retry-request').hidden=signal.aborted||$('#execution-mode').value==='saved'||!serverStatus||serverStatus.mode==='disconnected'||serverStatus.snapshot_id===null;
 }finally{if(requestEpoch===epoch)busy(false);}
};
$('#cancel-request').onclick=()=>controller?.abort();
$('#retry-request').onclick=()=>$('#ask-form').requestSubmit();
$('#execution-mode').onchange=()=>{controller?.abort();epoch++;busy(false);clearAnswer();refreshMode();$('#status').textContent=$('#execution-mode').value==='server'?'질문을 입력해 주세요. 현재 모드를 확인한 뒤 전송하세요.':'저장 예시를 선택해 주세요.';};
$('#question').addEventListener('input',()=>{$('#question-count').textContent=Array.from($('#question').value).length+' / 2,000자';});
$('#examples').onclick=e=>{const b=e.target.closest('[data-example]');if(!b)return;$('#question').value=data.cases.find(c=>c.id===b.dataset.example).question;$('#question').dispatchEvent(new Event('input'));$('#status').textContent=$('#execution-mode').value==='server'?'예시 질문 선택됨 · 현재 서버 모드로 전송합니다.':'예시 선택됨 · 저장 답변 확인을 눌러 주세요.';$('#run').focus();};
$('#quality').onclick=e=>{const b=e.target.closest('[data-detection-span]');if(b){const s=current.spans[Number(b.dataset.detectionSpan)];info('탐지 구절','<p>'+esc(s.quote)+'</p><p>'+esc(s.reason)+'</p><p>점수 '+esc(s.probability)+' · 정본 ['+s.start+', '+s.end+')</p><p>모델이 특정 근거 조항을 확정 연결한 결과는 아닙니다. 출처 보기에서 생성 입력을 확인하세요.</p>');}};
$('#highlights').onchange=render;$('#sources').onclick=()=>evidence(0);
$('#answer').onclick=e=>{const b=e.target.closest('[data-citation]');if(b)evidence(current.contexts.findIndex(c=>c.citation===Number(b.dataset.citation)));};
$('#source-nav').onclick=e=>{const b=e.target.closest('[data-source]');if(b)evidence(Number(b.dataset.source));};
$('#copy').onclick=async()=>{if(!current)return;try{await navigator.clipboard.writeText(current.answer);$('#status').textContent='정본 답변을 복사했습니다.';}catch{$('#status').textContent='클립보드 접근이 거부되었습니다. 답변을 선택해 직접 복사해 주세요.';}};
function noticeOptions(){const q=$('#notice-search').value.toLowerCase();$('#notice-options').innerHTML=notices.filter(n=>(n.id+n.title).toLowerCase().includes(q)).map(n=>'<button data-bid="'+esc(n.id)+'">'+esc(n.title)+'<small>'+esc(n.id)+(source.examples(n.id).length?' · 저장 예시 있음':'')+'</small></button>').join('')||'<p>일치하는 공고가 없습니다.</p>';}
$('#change-notice').onclick=()=>{noticeOptions();openDialog('#notice-dialog');$('#notice-search').focus();};$('#notice-search').oninput=noticeOptions;
$('#notice-options').onclick=e=>{const b=e.target.closest('[data-bid]');if(b)chooseNotice(b.dataset.bid);};
window.onpopstate=()=>chooseNotice(new URL(location.href).searchParams.get('bid')||notices[0].id,false);
$('#collapse').onclick=()=>{$('#graph-body').hidden=!$('#graph-body').hidden;$('#collapse').textContent=$('#graph-body').hidden?'펼치기':'접기';$('#collapse').setAttribute('aria-expanded',String(!$('#graph-body').hidden));graph.syncFlow();};
function expand(value){$('.graph').classList.toggle('expanded',value);$('#expand').setAttribute('aria-pressed',String(value));$('#expand').textContent=value?'축소':'확대';if(value){$('#graph-body').hidden=false;$('#collapse').textContent='접기';$('#collapse').setAttribute('aria-expanded','true');}graph.syncFlow();}
$('#expand').onclick=()=>expand(!$('.graph').classList.contains('expanded'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.graph').classList.contains('expanded')){expand(false);$('#expand').focus();}});
$('#connection').onclick=async()=>{
 await connectionStatus();
 info('연결 상태','<p>로컬 개발 환경 · 자유 질문은 공개 L1만 허용</p><p>생성 모델: '+esc(serverStatus?.model_alias||'미설정')+' · '+(serverStatus?.model_connected?'모델 목록 응답 확인':'연결 미확인')+'</p><p>탐지기: '+(serverStatus?.detector?.configured?'체크포인트 설정됨':'체크포인트 미설정')+' · '+(serverStatus?.detector?.inference_verified?'실제 추론 완료 이력 있음':'실제 추론 미검증')+'</p><p>저장 결과의 모델과 현재 생성 모델은 별개입니다. 모델 목록 응답은 생성 성공을 의미하지 않습니다.</p><a href="/internal-review/">내부 검수 화면 열기</a>');
};
$('#data-button').onclick=()=>{const s=data.stats;info('데이터 현황','<p>기존 파일럿 기록입니다. 이 화면에서 새로 실행한 수가 아닙니다.</p><table><tr><td>공고</td><td>51건</td></tr><tr><td>전체 색인 문서 / 청크</td><td>'+s.documents+' / '+s.chunks+'</td></tr><tr><td>기존 생성 답변 / 정상 차단</td><td>'+s.generated+' / '+s.denied+'</td></tr><tr><td>공개 재생 예시</td><td>'+data.cases.length+'개 · L1만</td></tr></table><details><summary>기술 정보</summary><p>기준 실행 '+esc(data.source_revision)+' · 사람 승인 pending</p><p>L2·L3 본문은 이 화면에 제공하지 않습니다. 이 재생 JSON은 검색 코퍼스가 아닙니다.</p><a href="rag-pipeline.svg">파이프라인 구조도</a></details>');};
$('#settings-button').onclick=()=>info('권한 시연 설정','<p class="badge">실제 인증 기능 아님</p><p>현재 공개 L1 문서만 볼 수 있습니다. 회사·역할 선택으로 L2·L3 권한을 부여하지 않습니다.</p><label>회사 문맥 <select disabled><option>공개 자료 검토</option></select></label><label>역할 <select disabled><option>미인증 · 공개 L1</option></select></label><p class="muted">회사별 문서 접근은 향후 서버 세션과 권한 필터 연결 후 제공됩니다. 팀 내부 라벨 검수 화면은 별도 파일입니다.</p>');
$('#states-button').onclick=()=>{info('UI 상태 시연','<p class="badge">화면 상태 예제 · 실제 RAG 실행 아님</p><div><button data-state="loading">로딩</button><button data-state="error">오류</button><button data-state="missing">자료부족</button></div><div id="state-preview" role="status">상태를 선택하세요.</div>');};
$('#info-content').onclick=e=>{const s=e.target.closest('[data-state]')?.dataset.state;if(!s)return;$('#state-preview').innerHTML=({loading:'<p>시연: 답변을 기다리는 화면</p><button data-state="cancel">취소</button>',cancel:'<p>시연: 요청이 취소되었습니다.</p>',error:'<p>시연: 연결 오류가 발생했습니다.</p><button data-state="loading">재시도 시연</button>',missing:'<p>시연: 제공된 문서만으로 확인하기 어렵습니다. 추가 자료가 필요합니다.</p>'})[s];};
try{const responses=await Promise.all(['rag-observatory.json','public-notices.json'].map(async u=>{const r=await fetch(u);if(!r.ok)throw Error('자료 응답 오류');return r.json();}));[data,{records:notices}]=responses;source=createSavedSource(data);httpSource=createHttpSource(data.public_documents);
graph=createGraph({data,onSource:evidence,onNotice:chooseNotice,onAnswer:()=>$('#answer').scrollIntoView({block:'nearest'}),onDocument:d=>{if(!d)return;$('#source-nav').innerHTML='';$('#evidence').innerHTML='<h3>'+esc(d.filename)+'</h3><p>공개 문서 정보입니다. 전체 원문은 이 서버에 제공되지 않습니다.</p><details><summary>추적 정보</summary><code>'+esc(d.document_id)+'</code><p>청크 '+d.chunks+'개</p></details>';openDialog('#source-dialog');}});
const requested=new URL(location.href).searchParams.get('bid');chooseNotice(notices.some(n=>n.id===requested)?requested:data.cases[0].bid,false);
void connectionStatus();
if(requested&&!notices.some(n=>n.id===requested))$('#status').textContent='해당 공고를 찾지 못해 저장 예시 공고를 열었습니다.';
}catch(e){$('#status').textContent='자료를 불러오지 못했습니다. 로컬 서버와 파일을 확인한 뒤 새로고침해 주세요.';console.error(e);}
