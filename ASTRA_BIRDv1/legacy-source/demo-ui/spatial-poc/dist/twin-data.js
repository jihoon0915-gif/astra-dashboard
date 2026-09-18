window.TWIN_SECTORS=[
 {id:'T01',name:'뉴럴 AI 특구',company:'뉴럴웨이브',title:'네오-판교 AI 연산센터 고도화',color:'#38bdf8',body:'#0a1930',x:-1800,z:-1800,budget:12.8,required:10,actual:7},
 {id:'T02',name:'양자 나노 산단',company:'퀀텀코어',title:'네오-구미 양자 파운드리 3차 증설',color:'#f59e0b',body:'#171a20',x:1800,z:-1800,budget:14.5,required:12,actual:8},
 {id:'T03',name:'자율로봇 클러스터',company:'오토노마',title:'네오-화성 로봇 생산라인 자동화',color:'#deff9a',body:'#21122f',x:1800,z:1800,budget:18,required:15,actual:11},
 {id:'T04',name:'에너지 그리드 특구',company:'루멘에너지',title:'네오-대전 분산전력 관제 구축',color:'#b794ff',body:'#18182b',x:-1800,z:1800,budget:9.6,required:8,actual:9}
];
const ecosystemSpecs=[
['AI 데이터 밸리','AI 연합 관제국','뉴럴 코어 5만 노드 냉각 클러스터 증설 입찰','평탄한 연산 그리드와 초고층 슬림 타워. 연산·전력·냉각 자율 운영.','COOL','냉각 분배 모듈 50식',50,'PUMP','순환 펌프 12식',12,'50,000개 연산 노드의 냉각 부하를 지원하고 N+1 예비 순환 구성을 제시한다.'],
['양자 신소재 산단','양자재료공학원','협곡 심층부 양자 파운드리 차폐 모듈 공급 입찰','분화구·협곡에 반매립 큐브와 돔 공정동을 배치. 소재 생산·차폐·검사 자율 운영.','SHIELD','차폐 모듈 64식',64,'TEST','차폐 검사 장비 8식',8,'차폐 모듈 접합부의 누설 검사를 실시하고 검사 성적서를 제출한다.'],
['자율로보틱스 림','림 오토메이션','단차 극복형 자율 물류 로버 300대 및 도킹 스테이션 구축','5단 테라스와 공중 스카이브릿지. 층간 물류·충전·도킹 자율 운영.','ROVER','자율 물류 로버 300대',300,'DOCK','도킹 스테이션 30식',30,'지정된 단차 시험 코스를 통과하고 로버 300대와 도킹 30식의 연계 시험을 수행한다.'],
['바이오-마린 특구','해양바이오컨소시엄','수중 생체 데이터 수집 바이오 센서망 2단계 구축','수로·호수 분지 위 부유식 플랫폼. 수질·생체 계측·통신 자율 운영.','SENSOR','바이오 센서 120식',120,'BUOY','통신 부표 16식',16,'수중 센서 120식의 교정 기록을 제공하고 통신 부표 16식의 수집 연속성을 검증한다.']
];
window.TWIN_SECTORS.forEach((s,k)=>{const a=ecosystemSpecs[k];[s.name,s.company,s.title,s.ecosystem]=a;s.period='8개월';s.color=k===3?'#d879fa':s.color;s.requirement=a[10];s.equipment=[{id:s.id+'-'+a[4],label:a[5],count:a[6]},{id:s.id+'-'+a[7],label:a[8],count:a[9]}];
const content=[s.requirement,'설치·연계·검수 단계별 수행계획을 제출한다.',s.equipment.map(e=>e.label+' ('+e.id+')').join(' 및 ')+'을 공급한다.','8개월 내 구축과 시험을 완료하고 장애 대응 절차를 제출한다.','예산 '+s.budget+'억 원. 본 입찰과 발주기관은 모두 가상이다.','공급 수량과 인터페이스 목록을 명시하고 시험 결과를 추적 가능하게 기록한다.','현장 설치 조건과 안전 절차는 가상 운영 기준에 따른다.','제안 기업의 확인된 유사 사업 단일 실적은 '+s.actual+'억 원이다.',s.requirement,'모듈·설비별 수량 및 단가를 구분하고 전체 예산 '+s.budget+'억 원 이내로 제안한다.',s.ecosystem,'유사 사업 단일 계약 실적 '+s.required+'억 원 이상을 요구한다. 제안 기업의 확인된 실적은 '+s.actual+'억 원이다.'];
s.docs=window.ASTRA_DOCS.map((name,i)=>({name,id:s.id+'-DOC-'+String(i+1).padStart(2,'0'),section:i===11?'제4조 참가 자격':'§'+(i+1)+'.1',text:content[i]+' (합성 시연 문서)'}));});
window.twinAudit=(required,actual)=>({pass:actual>=required,required,actual,gap:Math.max(0,required-actual)});
