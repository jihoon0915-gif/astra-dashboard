/* Pure filtering and conservative regional grouping, shared with tests. */
(function(root){
 const regions=[
  ['서울','서울특별시',126.978,37.5665],['부산','부산광역',129.0756,35.1796],
  ['대구','대구광역',128.6014,35.8714],['인천','인천',126.7052,37.4563],
  ['대전','대전',127.3845,36.3504],['광주','광주광역',126.8526,35.1595],
  ['울산','울산광역',129.3114,35.5384],['경기','경기도',127.0095,37.275],
  ['강원','강원특별',127.7298,37.8813],['충북','충청북도',127.489,36.6424],
  ['충남','충청남도',126.8,36.65],['전북','전북',127.108,35.82],
  ['전남','전라남도',126.463,34.816],['경북','경상북도',128.505,36.576],
  ['경남','경상남도',128.692,35.238],['제주','제주특별',126.5312,33.4996]
 ];
 // Match only an explicit regional name, not e.g. a university named Sejong.
 function locate(agency){const r=regions.find(r=>agency.includes(r[1]));return r?{name:r[0],lng:r[2],lat:r[3],basis:'기관명 지역 표기'}:null;}
 function parseRange(min,max){
  const read=v=>String(v).trim()===''?null:Number(v);
  const lo=read(min),hi=read(max);
  if([lo,hi].some(n=>n!==null&&(!Number.isFinite(n)||n<0)))return {error:'금액은 0 이상의 숫자로 입력하세요.'};
  if(lo!==null&&hi!==null&&lo>=hi)return {error:'최대 금액은 최소 금액보다 커야 합니다.'};
  return {min:lo===null?null:lo*1e8,max:hi===null?null:hi*1e8};
 }
 function filter(records,f){return records.filter(r=>
  (f.min==null||r.budget>=f.min)&&(f.max==null||r.budget<f.max)&&
  (!f.sector||r.sector===f.sector)&&(!f.month||r.month===f.month)&&
  (!f.review||r.reviewAvailable)&&(!f.condition||r.conditionMentions?.includes(f.condition))&&(!f.region||(r.region?.name||'미확인')===f.region)&&
  (!f.query||[r.id,r.title,r.agency].some(v=>v.toLowerCase().includes(f.query.toLowerCase().trim()))));}
 function group(records){const g=new Map();for(const r of records){if(!r.region)continue;const key=r.region.name;if(!g.has(key))g.set(key,{...r.region,records:[]});g.get(key).records.push(r);}return [...g.values()];}
 const api={locate,parseRange,filter,group};root.PublicNotices=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
