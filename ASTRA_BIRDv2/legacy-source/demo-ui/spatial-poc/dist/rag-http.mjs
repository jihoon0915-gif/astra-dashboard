// Versioned L1-only adapter. Based on live-design/api.mjs NDJSON framing.
// This is an implemented /api/l1 contract, not the earlier proposed /api/v1 contract.
export const VERSION='l1-http-1';
export async function* decodeLines(reader){
 const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';
 try {
  while(true){
   const {value,done}=await reader.read();
   pending+=done?decoder.decode():decoder.decode(value,{stream:true});
   let pos;
   while((pos=pending.indexOf('\n'))>=0){
    if(pos>250000)throw Error('스트림 이벤트 크기 초과');
    const line=pending.slice(0,pos);pending=pending.slice(pos+1);
    if(line.trim())yield JSON.parse(line);
   }
   if(pending.length>250000)throw Error('스트림 이벤트 크기 초과');
   if(done){if(pending.trim())throw Error('완료되지 않은 스트림 레코드');break;}
  }
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export function eventGuard({requestId,bid,snapshot,mode,documents}){
 let seq=0,phase='start',answer='';
 const allowed=new Set(documents.filter(d=>d.bid_key===bid&&d.security_level==='L1').map(d=>d.document_id));
 return {
  async accept(e){
   if(!e||e.schema_version!==VERSION||e.request_id!==requestId||e.bid!==bid||e.snapshot_id!==snapshot||e.mode!==mode||!(e.detection==='not_run'||(e.type==='detecting'&&e.detection==='running')||(e.type==='done'&&e.detection_result?.status===e.detection&&['completed','partial','failed','cancelled'].includes(e.detection)))||e.seq!==seq+1)throw Error('요청·순서·범위가 다른 응답');
   if(phase==='done'||phase==='error')throw Error('완료 후 이벤트');
   if(e.type==='retrieval'){
    if(phase!=='start'||!Array.isArray(e.contexts)||e.contexts.length>3)throw Error('잘못된 검색 이벤트');
    const ids=new Set();
    for(let i=0;i<e.contexts.length;i++){
     const c=e.contexts[i];
     const keys=['chunk_id','document_id','document_version','filename','text','text_start','text_end','security_level','bid_key','citation','scope','text_sha256','page','offset_unit'];
     if(!c||Object.keys(c).some(k=>!keys.includes(k))||keys.some(k=>!(k in c)))throw Error('잘못된 출처 스키마');
     if(c.bid_key!==bid||c.security_level!=='L1'||!allowed.has(c.document_id)||typeof c.chunk_id!=='string'||!c.chunk_id.startsWith(c.document_id+'-CH-')||ids.has(c.chunk_id)||c.citation!==i+1)throw Error('권한 밖 또는 중복 근거');
     if(typeof c.filename!=='string'||typeof c.document_version!=='string'||typeof c.text!=='string'||Array.from(c.text).length>10000||!Number.isInteger(c.text_start)||c.text_start<0||!Number.isInteger(c.text_end)||c.text_end-c.text_start!==Array.from(c.text).length||c.page!==null)throw Error('근거 문자 위치 오류');
     if(c.scope!==(mode==='test'?'test_input':'generation_input')||await sha(c.text)!==c.text_sha256)throw Error('근거 해시·용도 불일치');
     ids.add(c.chunk_id);
    }
    phase='retrieved';
   }else if(e.type==='delta'){
    if(!['retrieved','streaming'].includes(phase)||typeof e.text!=='string'||Array.from(answer+e.text).length>32000)throw Error('잘못된 답변 조각');
    answer+=e.text;phase='streaming';
   }else if(e.type==='detecting'){
    if(mode!=='model'||phase!=='streaming'||e.answer!==answer||e.complete!==false||await sha(answer)!==e.answer_sha256)throw Error('잘못된 탐지 시작');
    phase='detecting';
   }else if(e.type==='done'){
    if(!['retrieved','streaming','detecting'].includes(phase)||e.complete!==true||typeof e.answer!=='string'||!e.answer.trim()||typeof e.abstained!=='boolean'||e.generated!==(mode==='model'&&!e.abstained))throw Error('잘못된 완료 응답');
    if(e.abstained?(phase!=='retrieved'):(e.answer!==answer))throw Error('최종 정본 불일치');
    if(await sha(e.answer)!==e.answer_sha256)throw Error('정본 해시 불일치');
    if(mode==='test'&&!e.abstained&&!e.answer.startsWith('테스트 응답 · 실제 모델 생성 아님'))throw Error('테스트 표시 누락');
    if(e.detection_result){
     const d=e.detection_result,n=Array.from(e.answer).length;
     if(mode!=='model'||phase!=='detecting'||!['not_run','completed','partial','failed','cancelled'].includes(d.status)||!Array.isArray(d.spans)||d.spans.length>10000)throw Error('잘못된 탐지 결과');
     for(const s of d.spans){if(!['completed','partial'].includes(d.status)||!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end>n||s.start>=s.end||Array.from(e.answer).slice(s.start,s.end).join('')!==s.quote||!Number.isFinite(s.probability)||s.probability<0||s.probability>1)throw Error('탐지 구절 위치 오류');}
    }
    phase='done';
   }else if(e.type==='error'){
    if(typeof e.code!=='string'||typeof e.message!=='string'||typeof e.retryable!=='boolean'||e.complete!==false)throw Error('잘못된 오류 이벤트');
    phase='error';
   }else throw Error('지원하지 않는 이벤트');
   seq=e.seq;return e;
  },
  finish(){if(!['done','error'].includes(phase))throw Error('완료 전 연결 종료');}
 };
}
export function createHttpSource(documents){
 let status=null;
 async function connect(){
  const r=await fetch('/api/l1/status',{signal:AbortSignal.timeout(3000),credentials:'same-origin'});
  if(!r.ok)throw Error('질문 서버 미연결');
  const s=await r.json();
  if(s.schema_version!==VERSION||s.security_level!=='L1'||!['test','model','disconnected'].includes(s.mode)||typeof s.csrf_token!=='string'||(s.snapshot_id!==null&&typeof s.snapshot_id!=='string'))throw Error('지원하지 않는 서버 계약');
  status=s;return {...s,csrf_token:undefined};
 }
 async function cancel(requestId){
  if(!status)return;
  await fetch('/api/l1/cancel',{method:'POST',signal:AbortSignal.timeout(2000),credentials:'same-origin',headers:{'Content-Type':'application/json','X-Astra-Token':status.csrf_token},body:JSON.stringify({request_id:requestId})}).catch(()=>{});
 }
 async function* ask({requestId,bid,question,behavior='normal'},signal){
  if(!status)throw Error('질문 서버 미연결');
  const body={schema_version:VERSION,request_id:requestId,snapshot_id:status.snapshot_id,bid,question};
  if(status.mode==='test')body.test_behavior=behavior;
  const onAbort=()=>{void cancel(requestId);};signal.addEventListener('abort',onAbort,{once:true});
  try{
   const r=await fetch('/api/l1/answers/stream',{method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(900000)]),credentials:'same-origin',headers:{'Content-Type':'application/json','X-Astra-Token':status.csrf_token},body:JSON.stringify(body)});
   if(!r.ok){const error=await r.json();throw Error(error.message||'요청 실패');}
   if(!r.headers.get('Content-Type')?.includes('application/x-ndjson')||!r.body)throw Error('잘못된 서버 응답 형식');
   const guard=eventGuard({requestId,bid,snapshot:status.snapshot_id,mode:status.mode,documents});
   for await(const e of decodeLines(r.body.getReader()))yield await guard.accept(e);
   guard.finish();
  }catch(e){void cancel(requestId);throw e;}
  finally{signal.removeEventListener('abort',onAbort);}
 }
 return {connect,ask,cancel};
}
