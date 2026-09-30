// Explicit, local presentation fixture. Never persisted or sent to model APIs.
export function presentationCase(base) {
  const answer = '회사 인건비와 사업 예산을 함께 비교하겠습니다. 이 공고의 예산은 9,000만 원입니다. [1]\n\n하지만 연결된 공고 근거의 예산은 7,000만 원입니다. 예산 숫자가 근거와 다르므로 표시된 구절과 원문을 대조해야 합니다. [1]\n\n지원 여부는 회사 인건비 외에도 투입 인원·기간·클라우드 비용·목표 마진을 함께 검토해야 합니다. 현재 자료만으로 수익성을 확정하지 않습니다.';
  const phrase = '9,000만 원';
  const start = answer.indexOf(phrase);
  return {
    ...base, id:'presentation-only', source:'연출된 검증 시나리오',
    generation:null, integrity:null, detection_kind:'presentation',
    answer, spans:[{start,end:start+phrase.length,label:'연출된 의심 표시',reason:'근거 예산 7,000만 원과 다른 숫자를 의도적으로 삽입'}],
    label:'시연용 답변·형광펜 연출 · 실제 Qwen 생성/BGE 검사 결과 아님',
    contexts:(base.contexts||[]).filter(c=>Number(c.citation)===1), levels:['L1']
  };
}
