/* Actual public notices and human extraction sheets; no generated answers. */
(async()=>{
 'use strict';
 const $=q=>document.querySelector(q), core=window.PublicNotices;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('ko-KR').format(v)+'원';
 let records=[],visible=[],selected=null,map=null,engine=null,markers=[],ready=false,terrain=true;
 const padding=()=>innerWidth>1200?{left:375,right:435,top:170,bottom:70}:{left:25,right:25,top:175,bottom:75};
 function showDetail(){
  const r=visible.find(r=>r.id===selected);
  if(!r){$('#detail').innerHTML='<h2>조회 결과가 없습니다.</h2><p class="empty">금액 범위나 검색 조건을 변경하세요.</p>';return;}
  const url=new URL(r.url);const safe=url.protocol==='https:'&&url.hostname==='www.g2b.go.kr';
  $('#detail').innerHTML='<small>'+escape(r.id)+'</small><h2>'+escape(r.title)+'</h2><p>'+escape(r.agency)+'</p>'+
   '<dl><dt>사업금액 · 공고정보 예산</dt><dd>'+money(r.budget)+'</dd><dt>수집 월 / 분야</dt><dd>'+escape(r.month+' / '+r.sector)+'</dd><dt>지도 표시</dt><dd>'+escape(r.region?r.region.name+' 지역 대표점 · 기관명 표기 기준':'위치 미확인 · 지도에 임의 배치하지 않음')+'</dd><dt>수집된 마감 정보</dt><dd>'+escape(r.deadline||'미기재 · 공고 원문 또는 아래 일정 요건 확인')+'</dd><dt>표본 목록의 첨부 수</dt><dd>'+r.attachmentCount+'개 · 첨부 원문은 이 화면에 미탑재</dd></dl>'+
   '<p><a href="rag-observatory.html?bid='+encodeURIComponent(r.id)+'">이 공고 질문하기 ↗</a></p>'+
   (safe?'<a href="'+escape(r.url)+'" target="_blank" rel="noopener noreferrer">나라장터 공고 열기 ↗</a>':'')+
   '<p class="source-note">'+(r.reviewAvailable?'아래는 사람이 작성한 요건 시트입니다. 원문 청크나 RAG 생성 답변이 아닙니다. 미확인·불일치 메모를 함께 확인하세요.':'요건 시트 미제출 · 공고 기본정보만 표시합니다.')+'</p>'+
   r.requirements.map((x,i)=>'<details '+(i===0?'open':'')+'><summary>'+escape(x.label)+'</summary><p class="extracted">'+escape(x.text)+'</p></details>').join('')+
   '<p class="pending">가상 기업·L2/L3 기업 문서 미연결. 참가 적격성 판정과 환각 탐지 결과는 제공하지 않습니다.</p>';
 }
 function renderList(){
  $('#bid-list').innerHTML=visible.length?visible.map(r=>'<button type="button" class="bid-card" data-id="'+escape(r.id)+'" aria-pressed="'+(selected===r.id)+'"><small>'+escape(r.agency)+'</small><strong>'+escape(r.title)+'</strong><span>'+money(r.budget)+' · '+escape(r.region?.name||'위치 미확인')+'</span><small>'+escape(r.month)+' · '+(r.reviewAvailable?'요건 시트 있음':'요건 시트 미제출')+'</small></button>').join(''):'<p class="empty">일치하는 공고가 없습니다.</p>';
 }
 function renderMap(){
  const groups=core.group(visible),mapped=groups.reduce((n,g)=>n+g.records.length,0);
  $('#map-count').textContent=`조회 ${visible.length}건 중 지역 표시 ${mapped}건 · 위치 미확인 ${visible.length-mapped}건 · 지역 점 ${groups.length}개`;
  if(!map||!engine)return;
  markers.forEach(m=>m.remove());markers=[];
  for(const g of groups){const button=document.createElement('button');button.className='region-marker';button.type='button';button.setAttribute('aria-label',g.name+' 지역 공고 '+g.records.length+'건으로 필터');button.innerHTML='<span class="gate-art" aria-hidden="true"><i class="shaft"></i><i class="core"></i><i class="pulse"></i><i class="pulse second"></i></span><span class="gate-label">'+escape(g.name)+' <b>'+g.records.length+'건</b></span>';button.addEventListener('click',()=>{$('#region').value=g.name;apply();});markers.push(new engine.Marker({element:button,anchor:'bottom'}).setLngLat([g.lng,g.lat]).addTo(map));}
 }
 function apply(){
  const range=core.parseRange($('#min').value,$('#max').value);
  $('#filter-error').textContent=range.error||'';$('#min').setAttribute('aria-invalid',String(!!range.error));$('#max').setAttribute('aria-invalid',String(!!range.error));
  document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===$('#min').value+','+$('#max').value)));
  visible=range.error?[]:core.filter(records,{...range,query:$('#query').value,condition:$('#condition').value,sector:$('#sector').value,month:$('#month').value,region:$('#region').value,review:$('#review').checked});
  if(!visible.some(r=>r.id===selected))selected=visible[0]?.id||null;
  $('#count').textContent=range.error?'금액 입력을 확인하세요.':`${visible.length} / ${records.length}건 · 요건 시트 ${visible.filter(r=>r.reviewAvailable).length}건`;
  renderList();showDetail();renderMap();
 }
 $('#filters').addEventListener('submit',e=>{e.preventDefault();apply();});
 $('#filters').addEventListener('input',apply);$('#filters').addEventListener('change',apply);
 // A reset event precedes the browser's reset default action.
 $('#filters').addEventListener('reset',()=>setTimeout(apply,0));
 document.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{[$('#min').value,$('#max').value]=b.dataset.range.split(',');apply();}));
 $('#bid-list').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;selected=b.dataset.id;renderList();showDetail();const r=visible.find(r=>r.id===selected);if(map&&r.region)map.flyTo({center:[r.region.lng,r.region.lat],zoom:9,pitch:50,padding:padding(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:1100});});
 $('#overview').addEventListener('click',()=>map?.flyTo({center:[127.7,36],zoom:5.5,pitch:15,padding:padding(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:900}));
 $('#map-light').addEventListener('click',()=>{if(!ready)return;const mode=document.body.dataset.mapLight==='night'?'dusk':'night';window.paintReality(map,mode);$('#map-light').textContent=mode==='night'?'야간 · NIGHT':'황혼 · DUSK';});
 $('#terrain-toggle').addEventListener('click',()=>{if(!ready)return;terrain=!terrain;map.setTerrain(terrain?{source:'dem',exaggeration:1.6}:null);$('#terrain-toggle').textContent='3D 지형 '+(terrain?'ON':'OFF');$('#terrain-toggle').setAttribute('aria-pressed',String(terrain));});
 try{
  const response=await fetch('public-notices.json');if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();records=data.records.map(r=>({...r,region:core.locate(r.agency)}));
  $('#sector').innerHTML+=[...new Set(records.map(r=>r.sector))].map(c=>'<option>'+escape(c)+'</option>').join('');
  $('#region').innerHTML+=[...new Set(records.filter(r=>r.region).map(r=>r.region.name))].sort().map(c=>'<option>'+escape(c)+'</option>').join('');
  const requested=new URLSearchParams(location.search).get('bid');if(requested){$('#query').value=requested;}apply();
 }catch(e){$('#count').textContent='공고 자료를 불러오지 못했습니다. 실행.bat으로 서버를 실행한 뒤 다시 여세요.';$('#map-status').textContent='공고 자료 로딩 실패';console.error(e);return;}
 try{
  engine=await import('https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.mjs');
  const style=await window.makeRealityStyle();
  map=new engine.Map({container:'map',style,center:[127.7,36],zoom:5.5,pitch:15,maxPitch:70,maxZoom:16,pixelRatio:Math.min(devicePixelRatio,1.25),maxTileCacheSize:240,canvasContextAttributes:{antialias:false}});
  map.on('style.load',()=>{map.setProjection({type:'globe'});window.paintReality(map,'night');map.jumpTo({padding:padding()});ready=true;$('#map-status').textContent='ASTRA 3D 지형 1.6× · 지역별 공고 묶음 · 금액 필터 동시 적용';renderMap();});
  map.on('error',()=>{$('#map-status').textContent='지도 자료 일부를 불러오지 못했습니다. 공고 목록과 요건 조회는 계속 사용할 수 있습니다.';});
 }catch(e){$('#map-status').textContent='지도 엔진을 불러오지 못했습니다. 인터넷·WebGL을 확인하세요. 목록과 요건은 조회할 수 있습니다.';console.error(e);}
})();
