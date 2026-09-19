export function createGraph({data,onSource,onNotice,onDocument,onAnswer}) {
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null,mode='tree',selected=0,edgeSerial=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');let flowRequested=!reducedMotion.matches;
function syncFlow(){const svg=$('#network'),running=flowRequested&&!reducedMotion.matches&&!document.hidden&&!$('#graph-body').hidden;
svg.dataset.flow=running?'on':'off';if(running)svg.unpauseAnimations();else svg.pauseAnimations();
$('#flow-toggle').setAttribute('aria-pressed',String(running));$('#flow-toggle').textContent=running?'흐름 ON':'흐름 OFF';$('#flow-toggle').disabled=reducedMotion.matches;}
document.addEventListener('visibilitychange',syncFlow);reducedMotion.addEventListener('change',syncFlow);$('#flow-toggle').onclick=()=>{flowRequested=!flowRequested;syncFlow();};
function node(x,y,r,c,label,id){return `<g class="node" data-node="${esc(id)}" tabindex="0" role="button" aria-label="${esc(label||id)}"><rect x="${x-12}" y="${y-16}" width="${label?125:26}" height="32" fill="transparent" pointer-events="all"/><circle class="node-halo" style="--pulse-delay:-${(x+y)%61/10}s" cx="${x}" cy="${y}" r="${r+7}" fill="${c}" opacity=".08"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><text x="${x+16}" y="${y+4}" fill="#cedbed" font-size="11">${esc(label)}</text></g>`;}
function edge(x,y,a,b,on=false){
 const serial=edgeSerial++,d=`M${x},${y} C${(x+a)/2},${y} ${(x+a)/2},${b} ${a},${b}`;
 const base=`<path class="edge ${on?'active':''}" d="${d}"/>`;
 // A sparse subset of the existing edges carries decorative packets, never fabricated links.
 if(mode==='tree'&&serial%3!==0)return base;
 const duration=3.8+(serial%7)*.37,phase=(serial*1.73)%duration,color=a<500?'#62f5dc':on?'#ffe1a4':'#b4a0ff';
 return base+`<g class="flow-decoration" aria-hidden="true" pointer-events="none"><path class="flow-tail" d="${d}" pathLength="100" stroke="${color}" style="--travel:${duration}s;--phase:-${phase}s"/><g><circle r="7" fill="${color}" opacity=".10"/><circle r="3.5" fill="${color}" opacity=".55"/><circle r="1.6" fill="#f4ffff"/><animateMotion dur="${duration}s" begin="-${phase}s" repeatCount="indefinite" path="${d}" calcMode="linear"/></g><circle cx="${a}" cy="${b}" r="8" fill="none" stroke="${color}" class="arrival-ring" style="--travel:${duration}s;--phase:-${phase}s"/></g>`;
}
function graph(){edgeSerial=0;let es='',ns='';if(mode==='tree'){const gs=new Map();for(const d of data.public_documents){if(!gs.has(d.bid_key))gs.set(d.bid_key,[]);gs.get(d.bid_key).push(d);}let k=0;for(const [bid,ds] of gs){const y=28+k*10.3,x=340+Math.sin(k*.9)*45;es+=edge(120,290,x,y);ns+=node(x,y,3,'#58dbcf',k%7===0?bid:'',`bid:${bid}`);ds.forEach((d,j)=>{const dx=610+j*38,dy=y+(j-(ds.length-1)/2)*4;es+=edge(x,y,dx,dy);ns+=node(dx,dy,3,'#aa98f4','',`doc:${d.document_id}`);});k++;}ns+=node(120,290,12,'#58dbcf','공개 공고','root');$('#graph-caption').textContent=`${gs.size}개 공고 → ${data.public_documents.length}개 공개 문서 · 노드를 선택하세요.`;}else{const ds=[...new Set(current.contexts.map(c=>c.document_id))];ds.forEach((d,j)=>{const y=140+j*125;es+=edge(65,280,235,y);ns+=node(235,y,9,'#58dbcf',`문서 ${j+1}`,`document:${d}`);});current.contexts.forEach((c,i)=>{const y=110+i*125,dy=140+ds.indexOf(c.document_id)*125,extra=c.scope==='reference_only_not_in_prompt';es+=edge(235,dy,475,y,selected===i);if(!extra)es+=edge(475,y,720,280,selected===i);ns+=node(475,y,10,extra?'#8998ac':'#aa98f4',extra?'추가 검수':`입력 [${c.citation}]`,`context:${i}`);});ns+=node(65,280,12,'#58dbcf','공고','root')+node(720,280,14,'#f1c27b','답변','answer');if(current.mode==='saved_replay'){es+=edge(720,280,720,465);ns+=node(720,465,9,'#f1c27b','검수 대기','review');}$('#graph-caption').textContent=current.mode==='test'?'공개 문서 → 테스트 입력 → 테스트 응답 · 실제 모델 미실행':current.mode==='model'?'공개 문서 → 생성 입력 → 답변 · '+({completed:'탐지 완료',partial:'탐지 부분 검사',failed:'탐지 실패',not_run:'탐지 미실시'}[current.detection?.status]||'탐지 대기'):'문서 → 입력 청크 → 실제 답변 · 사후 추가 근거는 답변 입력에 연결하지 않습니다.';}$('#network').innerHTML=es+ns;syncFlow();document.querySelector('.legend').innerHTML=mode==='tree'?'<span>● 공개 공고</span><span>● 공개 문서</span>':'<span>● 공고·문서</span><span>● 입력 청크</span><span>● '+(current?.mode==='test'?'테스트 응답':current?.mode==='model'?'답변':'답변·검수')+'</span>';}

function render(){if(!current)mode='tree';$('#path-mode').disabled=!current;$('#path-mode').setAttribute('aria-pressed',String(mode==='path'));$('#tree-mode').setAttribute('aria-pressed',String(mode==='tree'));graph();}
$('#path-mode').onclick=()=>{mode='path';render();};$('#tree-mode').onclick=()=>{mode='tree';render();};
function pick(e){const g=e.target.closest('[data-node]');if(!g)return;const id=g.dataset.node;
if(id.startsWith('context:'))onSource(Number(id.slice(8)));
else if(id.startsWith('document:'))onSource(current.contexts.findIndex(c=>c.document_id===id.slice(9)));
else if(id.startsWith('doc:'))onDocument(data.public_documents.find(d=>d.document_id===id.slice(4)));
else if(id.startsWith('bid:'))onNotice(id.slice(4));else if(id==='answer')onAnswer();}
$('#network').onclick=pick;$('#network').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e);}};
return {setCase(c){current=c;selected=0;mode=c?'path':'tree';render();},select(i){selected=i;mode='path';render();},syncFlow};
}
