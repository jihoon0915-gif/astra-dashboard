// Public saved results only. No live endpoint or browser role can grant access.
export function createSavedSource(data) {
 return {
  status:()=>({mode:'saved_replay',connected:false,security:'L1'}),
  examples:bid=>data.cases.filter(c=>c.bid===bid),
  async ask({bid,question},signal) {
   if(signal?.aborted)throw new DOMException('취소됨','AbortError');
   const c=data.cases.find(c=>c.bid===bid&&c.question===question.trim());
   if(!c)throw Object.assign(new Error('생성 서버 미연결 · 이 질문의 새 답변을 생성할 수 없습니다. 아래 저장 예시를 선택해 주세요.'),{code:'NOT_CONNECTED'});
   return structuredClone(c);
  }
 };
}
// Future integration seam, deliberately not a guessed callable endpoint.
export function createDisconnectedSource() {
 return {status:()=>({connected:false,mode:'unconfigured'}),
 async *stream(){throw Object.assign(new Error('서버 계약과 인증 연결이 필요합니다.'),{code:'NOT_CONNECTED'});}};
}
export function validateEvent(e,{requestId,snapshotId,lastSeq}) {
 if(!e||e.request_id!==requestId||e.snapshot_id!==snapshotId||!Number.isInteger(e.seq)||e.seq<=lastSeq)throw Error('stale or invalid event');
 if(!['retrieval','delta','citation','detection','done','error'].includes(e.type))throw Error('unknown event');
 if(e.type==='delta'&&typeof e.text!=='string')throw Error('invalid delta');
 if(e.type==='done'&&(typeof e.answer!=='string'||typeof e.answer_sha256!=='string'))throw Error('invalid done');
 return e.seq;
}
export function canApplyResult(requestEpoch,currentEpoch,bid,currentBid){return requestEpoch===currentEpoch&&bid===currentBid;}

// Presentation only: never changes the answer or the detector contract.
export function detectionSummary(result, mode='model') {
 if(mode==='saved_replay')return '검수 초안 · 새 탐지 미실시';
 if(mode==='test')return '탐지 미실시 · 테스트 응답';
 const count=result?.spans?.length||0;
 switch(result?.status){
  case 'running':return '탐지 처리 중 · 답변 생성 완료';
  case 'completed':return `탐지 완료 · 의심 구절 ${count}건 · 정확성 보증 아님`;
  case 'partial':return `부분 검사 · 검사 범위 내 의심 구절 ${count}건 · 미검사 구간 있음`;
  case 'failed':return '탐지 실패 · 검출 여부 확인 불가';
  case 'cancelled':return '탐지 취소 · 검출 여부 확인 불가';
  default:return '탐지 미실시';
 }
}
