export const MOTION={expressionInterval:1000,placeholderInterval:4000,diveDuration:1100,orbitDuration:42000,maxHeadAngle:5};
const names={'11':'서울','21':'부산','22':'대구','23':'인천','24':'광주','25':'대전','26':'울산','29':'세종','31':'경기','32':'강원','33':'충북','34':'충남','35':'전북','36':'전남','37':'경북','38':'경남','39':'제주'};
const labels={서울:[126.99,37.64],인천:[125.85,37.38],경기:[127.35,37.15],강원:[128.25,37.95],충북:[127.95,36.85],충남:[126.63,36.48],세종:[126.8,36.8],대전:[127.38,36.18],전북:[127.15,35.82],광주:[126.35,35.22],전남:[127.05,34.65],경북:[128.85,36.35],대구:[128.52,35.85],경남:[128.15,35.21],울산:[129.64,35.68],부산:[129.45,35.02],제주:[126.6,33.42]};
export function mapSvg(geo,counts){
 const p=([x,y])=>[(x-125.2)*47,(38.85-y)*59];
 const max=Math.max(1,...Object.values(counts));
 let paths='',texts='';
 for(const f of geo.features){const name=names[f.properties.code];const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 const d=polygons.map(poly=>poly.map(ring=>ring.map((pt,i)=>(i?'L':'M')+p(pt).map(n=>n.toFixed(1)).join(',')).join('')+'Z').join('')).join('');
 const n=counts[name]||0;const t=n/max;const color=n?`rgb(${Math.round(167-113*t)},${Math.round(204-88*t)},${Math.round(185-68*t)})`:'#e0e8d8';
 paths+=`<path d="${d}" fill="${color}" data-region="${name}" tabindex="0" role="button" aria-label="${name} ${n}건"><title>${name} ${n}건</title></path>`;
 const [x,y]=p(labels[name]);texts+=`<text x="${x}" y="${y}" text-anchor="middle">${name}<tspan class="region-count" x="${x}" dy="12">${n}건</tspan></text>`;
 }return `<svg class="map-svg" viewBox="0 0 290 345" aria-label="대한민국 시도별 공고 건수">${paths}${texts}</svg>`;
}
export function animateHero(root,companies,onCompany,isPaused,isReduced){
 const scene=root.querySelector('.scene'),head=root.querySelector('.boss-head');if(!scene||!head)return()=>{};
 const nodes=[...scene.querySelectorAll('.building')],heads=[...head.children];let raf,elapsed=0,last=performance.now(),expressionTime=0,idx=0,ready=false;
 Promise.all(heads.map(im=>im.decode().catch(()=>{im.dataset.failed='true'}))).then(()=>{ready=heads.every(im=>!im.dataset.failed)});
 const show=i=>heads.forEach((im,j)=>im.classList.toggle('active',j===i));
 const move=e=>{if(isReduced()||isPaused())return;const r=scene.getBoundingClientRect();const x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/(r.width/2))),y=Math.max(-1,Math.min(1,(e.clientY-r.top-r.height/2)/(r.height/2)));head.style.transform=`translate(${x*5}px,${y*3}px) rotate(${x*MOTION.maxHeadAngle}deg)`;};
 const reset=()=>head.style.transform='';document.addEventListener('pointermove',move);document.documentElement.addEventListener('pointerleave',reset);
 nodes.forEach((n,i)=>n.onclick=()=>onCompany(companies[i]));
 function frame(now){const dt=now-last;last=now;const pause=isPaused()||document.hidden;const reduced=isReduced();if(!pause&&!reduced)elapsed+=dt;
 nodes.forEach((n,i)=>{const a=elapsed/MOTION.orbitDuration*Math.PI*2+i*Math.PI*2/5;const z=Math.sin(a),scale=.77+.18*(z+1);const x=Math.cos(a)*scene.clientWidth*.34,y=z*scene.clientHeight*.22;n.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${scale})`;n.style.zIndex=z>0?'5':'1';n.style.filter=`brightness(${.86+.07*(z+1)})`;});
 if(pause||reduced){show(0);expressionTime=0;idx=0;reset();}else if(ready){expressionTime+=dt;if(expressionTime>=MOTION.expressionInterval){expressionTime%=MOTION.expressionInterval;idx=(idx+1)%heads.length;show(idx);scene.dataset.expression=String(idx);}}
 raf=requestAnimationFrame(frame);}raf=requestAnimationFrame(frame);
 return()=>{cancelAnimationFrame(raf);document.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',reset)};
}
export function graphMarkup(notices,selected,filter='all',page=0){
 const nodes=[{id:'root',label:'공고 DB',kind:'root',x:400,y:320,r:23}],edges=[];
 const groups=new Map();for(const n of notices){const key=filter==='region'?n.region:filter==='agency'?n.agency:n.sector;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);}
 [...groups].forEach(([key,items],i)=>{const a=i/Math.max(1,groups.size)*Math.PI*2-Math.PI/2;const x=400+Math.cos(a)*210,y=320+Math.sin(a)*210;const id='g'+i;nodes.push({id,label:key,kind:'group',x,y,r:12});edges.push(['root',id]);
 const expanded=selected===id||items.some(n=>n.id===selected);const shown=items.slice((page%Math.ceil(items.length/12))*12,(page%Math.ceil(items.length/12))*12+12);if(expanded)shown.forEach((n,j)=>{const t=j/shown.length*Math.PI*2-Math.PI/2;const nx=400+Math.cos(t)*270,ny=320+Math.sin(t)*240;nodes.push({id:n.id,label:n.title,kind:'notice',x:nx,y:ny,r:6});edges.push([id,n.id])});});
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return `<svg viewBox="0 0 800 640" id="network" aria-label="공고 분류 관계 그래프"><g id="graph-transform">${edges.map(([a,b])=>{const p=nodes.find(n=>n.id===a),q=nodes.find(n=>n.id===b);return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`}).join('')}${nodes.map(n=>`<g data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.label)}"><circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.kind==='root'?'#c8d8a0':n.kind==='group'?'#8bbaa7':'#edd4ad'}"/><text x="${n.x}" y="${n.y+n.r+17}" text-anchor="middle">${esc(n.label.length>19?n.label.slice(0,19)+'…':n.label)}</text><title>${esc(n.label)}</title></g>`).join('')}</g></svg>`;
}
