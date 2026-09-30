export function deadline(value, now=Date.now()) {
 if(!value || !/^\d{4}-\d\d-\d\d(?:[ T]\d\d:\d\d(?::\d\d)?)?$/.test(value))return {label:'마감일 확인 필요',open:false};
 const date=value.slice(0,10), timed=value.length>10, end=Date.parse(date+'T'+(timed?value.slice(11):'23:59:59')+'+09:00');
 if(!Number.isFinite(end)||new Date(Date.parse(date+'T00:00:00Z')).toISOString().slice(0,10)!==date)return {label:'마감일 확인 필요',open:false};
 if(end<=now)return {label:'마감',open:false,end};
 const today=new Date(now+9*3600000).toISOString().slice(0,10), days=Math.round((Date.parse(date)-Date.parse(today))/86400000);
 const seconds=Math.floor((end-now)/1000);
 return {label:days>0?`D-${days}`:'D-DAY',open:true,end,countdown:days===0&&timed?`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분 ${seconds%60}초 남음`:''};
}
export const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function evidenceGraph(host, record, onSource, reduced=false){
 const contexts=record.contexts||[], nodes=[], edges=[];
 const add=(id,type,title,col,row,ref)=>{nodes.push({id,type,title,x:25+col*210,y:45+row*95,ref});return id};
 if(record.proof){
  add('q','공고',record.title,0,0);add('company','기업',record.company,2,0);
  (record.requirements?.length?record.requirements:[{label:'작성 요건 없음 · 원문 확인'}]).slice(0,8).forEach((r,i)=>{add('req'+i,'요건',r.label,1,i);edges.push(['q','req'+i,'공고 요건'],['req'+i,'company','검토 대상 · 충족 판정 아님'])});
  (record.documents||[]).forEach((d,i)=>{add('doc'+i,'증빙',d.title,3,i,{...d,filename:d.title,chunk_id:d.document_id,text:'문서를 열어 요건과 대조해주세요.'});edges.push(['company','doc'+i,'보유 자료 · 직접 요건 매핑 미확인'])});
 }else{
 const q=add('q','질문',record.question||'공통 질문',0,0),bid=add('bid','공고',record.bid||record.notice_id||'연결 공고',1,0);edges.push([q,bid,'관련 공고']);
 const selected=contexts.slice(0,12);
 selected.forEach((ch,i)=>{const d=add('d'+i,'문서',ch.filename||ch.document_id,2,i,ch),e=add('e'+i,'근거',ch.text?.slice(0,48),3,i,ch),c=add('c'+i,'인용','['+ch.citation+'] '+ch.security_level,4,i,ch);edges.push([bid,d,'연결 자료'],[d,e,'포함'],[e,c,'인용']);
 if((record.answer||'').includes('['+ch.citation+']')){const a=add('a'+i,'답변',record.answer.split('\n').find(x=>x.includes('['+ch.citation+']'))||'답변 내 인용',5,i,ch);edges.push([c,a,'인용 대응']);}});
 }
 const height=Math.max(340,...nodes.map(n=>n.y+90)),width=record.proof?900:1280;let step=-1,timer,zoom=1,pan={x:0,y:0},drag=null;
 host.innerHTML=`<div class="flow-toolbar"><strong>근거 경로 재생</strong><button data-flow="play">재생</button><button data-flow="pause">일시정지</button><button data-flow="prev">이전</button><button data-flow="next">다음</button><button data-flow="reset">처음</button><select aria-label="재생 속도"><option value="1200">1×</option><option value="600">2×</option><option value="2400">0.5×</option></select><button data-flow="in">＋</button><button data-flow="out">−</button><button data-flow="fit">전체 맞춤</button><button data-flow="focus">현재 경로 맞춤</button><span class="flow-step">전체 경로</span></div><p class="muted">저장된 인용 관계 · 실제 검색 실행 로그 아님 · ${contexts.length}개 근거${contexts.length>12?' (앞 12개 표시)':''}</p><svg class="flow-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="질문에서 답변 근거까지"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#bed3db"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/><g class="flow-world">${edges.map(([a,b,label])=>{const n=nodes.find(x=>x.id===a),m=nodes.find(x=>x.id===b);return `<g class="flow-edge" data-a="${a}" data-b="${b}"><path d="M${n.x+165},${n.y+25} C${n.x+195},${n.y+25} ${m.x-25},${m.y+25} ${m.x},${m.y+25}"/><title>${label}</title></g>`}).join('')}${nodes.map(n=>`<g class="flow-node" tabindex="0" role="button" aria-label="${safe(n.type+' '+n.title)}" data-id="${n.id}" data-step="${Math.round((n.x-25)/210)}" transform="translate(${n.x} ${n.y})"><rect width="165" height="57" rx="10"/><text x="10" y="18" class="flow-type">${n.type}${n.ref?' · '+safe(n.ref.security_level):''}</text><text x="10" y="39">${safe(String(n.title||'연결 미확인').slice(0,15))}</text><title>${safe(n.title)}</title></g>`).join('')}</g></svg>`;
 const svg=host.querySelector('svg'),world=host.querySelector('.flow-world');
 const transform=()=>world.setAttribute('transform',`translate(${pan.x} ${pan.y}) scale(${zoom})`);
 const clear=()=>{host.querySelectorAll('.dim,.focus').forEach(x=>x.classList.remove('dim','focus'));};
 const paint=()=>{clear();host.querySelector('.flow-step').textContent=step<0?'전체 경로':['질문','공고','문서','근거','인용','답변'][step];host.querySelectorAll('.flow-node').forEach(n=>{n.classList.toggle('dim',step>=0&&+n.dataset.step>step);n.classList.toggle('focus',+n.dataset.step===step)});};
 const pause=()=>clearInterval(timer);
 const select=node=>{pause();clear();const chain=new Set([node.id]);const descendants=new Set([node.id]);let progress=true;while(progress){progress=false;for(const [a,b]of edges)if(descendants.has(a)&&!descendants.has(b)){descendants.add(b);progress=true;}}descendants.forEach(x=>chain.add(x));let changed=true;while(changed){changed=false;for(const [a,b]of edges)if(chain.has(b)&&!chain.has(a)){chain.add(a);changed=true;}};if(node.ref)nodes.filter(x=>x.ref?.chunk_id===node.ref.chunk_id).forEach(x=>chain.add(x.id));host.querySelectorAll('.flow-node').forEach(n=>n.classList.toggle('dim',!chain.has(n.dataset.id)));host.querySelectorAll('.flow-edge').forEach(n=>n.classList.toggle('dim',!chain.has(n.dataset.a)||!chain.has(n.dataset.b)));if(node.ref)onSource(node.ref);};
 host.querySelectorAll('.flow-node').forEach(el=>{el.onclick=()=>select(nodes.find(n=>n.id===el.dataset.id));el.onkeydown=e=>{if(e.key==='Enter')el.onclick()}});
 host.querySelectorAll('[data-flow]').forEach(b=>b.onclick=()=>{const a=b.dataset.flow;if(a==='play'){pause();if(step>=5)step=-1;timer=setInterval(()=>{step++;paint();if(step>=5)pause()},+host.querySelector('select').value);if(reduced){pause();step=5;paint()}}else if(a==='pause')pause();else if(a==='next'||a==='prev'){pause();step=Math.max(-1,Math.min(5,step+(a==='next'?1:-1)));paint()}else if(a==='reset'){pause();step=-1;paint()}else if(a==='in'||a==='out'){zoom=Math.max(.4,Math.min(3,zoom*(a==='in'?1.2:1/1.2)));transform()}else if(a==='fit'){zoom=1;pan={x:0,y:0};transform()}else{zoom=1.1;pan={x:-(Math.max(step,0)*170),y:0};transform()}});
 svg.onpointerdown=e=>{if(e.target.closest('.flow-node'))return;pause();clear();drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};svg.setPointerCapture(e.pointerId)};svg.onpointermove=e=>{if(!drag)return;const scale=width/svg.getBoundingClientRect().width;pan={x:drag.px+(e.clientX-drag.x)*scale,y:drag.py+(e.clientY-drag.y)*scale};transform()};svg.onpointerup=()=>drag=null;svg.onkeydown=e=>{if(e.key==='Escape'){clear();pause()}};
 return pause;
}
