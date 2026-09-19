// All procurement records and organisations are fictional. Locations are demo anchors.
window.ORBIT_BIDS=[
{id:'DEMO-PG-001',title:'판교 공공 AI 데이터 플랫폼 구축',agency:'가상 미래디지털진흥원',city:'판교',english:'Pangyo / Sector 01',month:5,budget:1200000000,period:'8개월',deadline:'2026-05-28 14:00',minimum:10,companyRecord:7,tags:['데이터 통합','RAG 검색','보안 운영'],location:{lng:127.1112,lat:37.3947,alt:null,kind:'demo_regional_anchor',accuracy:'illustrative',source:'팀 제작 시연 좌표 · 실제 사업장 미확인'},bearing:35},
{id:'DEMO-HS-002',title:'화성 산업 안전 디지털트윈 시범 구축',agency:'가상 산업안전융합원',city:'화성',english:'Hwaseong / Sector 02',month:5,budget:1800000000,period:'10개월',deadline:'2026-05-29 16:00',minimum:15,companyRecord:11,tags:['디지털트윈','센서 연계','위험 모니터링'],location:{lng:127.067,lat:37.208,alt:null,kind:'demo_regional_anchor',accuracy:'illustrative',source:'팀 제작 시연 좌표 · 실제 사업장 미확인'},bearing:-65},
{id:'DEMO-GM-003',title:'구미 제조 데이터 허브 고도화',agency:'가상 스마트제조지원원',city:'구미',english:'Gumi / Sector 03',month:6,budget:950000000,period:'6개월',deadline:'2026-06-24 15:00',minimum:8,companyRecord:5,tags:['제조 데이터','품질 분석','표준 API'],location:{lng:128.3446,lat:36.1195,alt:null,kind:'demo_regional_anchor',accuracy:'illustrative',source:'팀 제작 시연 좌표 · 실제 사업장 미확인'},bearing:115}
];

// Representative city points, not surveyed procurement sites.
[
 ['DJ','대전','Daejeon',127.3845,36.3504,'공공 연구 데이터 클라우드 전환',14,30],
 ['BS','부산','Busan',129.0756,35.1796,'항만 물류 관제 플랫폼 구축',22,-35],
 ['IC','인천','Incheon',126.7052,37.4563,'도시 교통 데이터 연계 구축',16,75],
 ['GJ','광주','Gwangju',126.8526,35.1595,'AI 시민 서비스 플랫폼 구축',11,-80],
 ['JJ','제주','Jeju',126.5312,33.4996,'관광 환경 데이터 허브 구축',8,45]
].forEach(([code,city,en,lng,lat,title,budget,bearing],i)=>window.ORBIT_BIDS.push({id:'DEMO-'+code+'-00'+(i+4),city,english:en+' / Sector 0'+(i+4),title:city+' '+title,agency:'가상 '+city+'디지털사업단',month:6,budget:budget*1e8,period:'8개월',deadline:'2026-06-26 14:00',minimum:8+i,companyRecord:5+i,tags:['정보 시스템','데이터 연계','보안 운영'],location:{lng,lat,alt:null,kind:'demo_regional_anchor',accuracy:'illustrative',source:'시연용 대표점 · 실제 사업장 아님'},bearing}));
window.ORBIT_BIDS.forEach((b,i)=>{b.color=['#54dfff','#b775ff','#ff527e','#ffcc60','#55ffd1','#7f9dff','#ff995e','#f67bea'][i];b.gate=['spire','rift','flare','crown','spire','rift','flare','crown'][i];});

window.ASTRA_CATEGORIES=['스마트제조/공장자동화','AI·빅데이터','ICT 클라우드','엔지니어링/건설'];
window.ASTRA_DOCS=['제안요청','과업지시','과업내용','과업수행','입찰공고','규격서','시방서','제안서','요구사항','산출내역','과업설명','RFP'];
window.ORBIT_BIDS.forEach((b,i)=>{b.category=window.ASTRA_CATEGORIES[[1,0,0,2,3,2,1,3][i]];b.color=i%2?'#c1ff67':'#52ffe0';b.infrastructure={park:1.2+i*.3,station:.8+i*.4,synthetic:true};b.documents=window.ASTRA_DOCS.map((d,j)=>'['+d+' · 합성 조항 §'+(j+1)+'.1] '+b.title+' 사업의 '+['수행계획과 평가 절차를 제시한다.','데이터 연계 및 보안 운영 과업을 수행한다.','결과물과 검수 절차를 정의한다.','수행 일정과 담당 인력을 제시한다.','제출 기한은 '+b.deadline+'이다.','상세 기능 규격은 발주기관 협의 후 확정한다.','설치 및 시험 기준을 준수한다.','사업 수행 경험과 제안 방법을 제시한다.','기능·보안·운영 요구사항을 구분한다.','예산은 '+(b.budget/1e8)+'억 원이며 상세 내역은 별도 작성한다.','사업 목적과 범위를 설명한다.','참가 실적은 '+b.minimum+'억 원 이상을 요구한다.'][j]);});
