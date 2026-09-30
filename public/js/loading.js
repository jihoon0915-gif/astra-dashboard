import { $, api, state, esc, companyLabel, store, go, reduced, refreshSession } from './core.js';
export async function renderLoading(root) {
  document.body.classList.remove('is-dark');
  const user=state.user || await refreshSession();
  if(!user){go('#/login');return;}
  root.innerHTML=`<div class="bluebird-loading-screen" data-theme="light">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"></div>
      <div class="brand-name">Blue Jay</div>
    </div>
    <!-- 추후 메뉴/텍스트 영역 (자리 표시자) -->
    <div class="loader-account">${esc(companyLabel(user.company_name))}</div><ul class="loader-steps" id="loaderSteps"></ul>
</aside>

  <main class="main">
    <div class="loading-stage">
      <div class="orb-wrap">
        <video id="loadingVideo" autoplay loop muted playsinline preload="auto" aria-hidden="true">
          <source src="/assets/video/loading-orb.mp4" type="video/mp4">
        </video>
      </div>
      <div class="loading-text">
        <div class="loading-title">
          <span class="wave-group accent"><span class="wave-char" style="animation-delay:0.00s">파</span><span class="wave-char" style="animation-delay:0.06s">랑</span><span class="wave-char" style="animation-delay:0.12s">새</span></span><span class="wave-group plain"><span class="wave-char" style="animation-delay:0.18s">가</span></span><span class="wave-char" style="animation-delay:0.24s">&nbsp;</span><span class="wave-group"><span class="wave-char" style="animation-delay:0.30s">공</span><span class="wave-char" style="animation-delay:0.36s">고</span><span class="wave-char" style="animation-delay:0.42s">를</span></span><span class="wave-char" style="animation-delay:0.48s">&nbsp;</span><span class="wave-group"><span class="wave-char" style="animation-delay:0.54s">골</span><span class="wave-char" style="animation-delay:0.60s">라</span><span class="wave-char" style="animation-delay:0.66s">내</span><span class="wave-char" style="animation-delay:0.72s">는</span><span class="wave-char" style="animation-delay:0.78s">중</span></span>
        </div>
        <div class="loading-subtitle">잠시만 기다려주세요 <span class="dot">.</span><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
      </div>
    </div>
  <div class="loader-controls"><p id="loaderStatus" role="status">워크스페이스를 준비하고 있습니다.</p><progress id="loaderProgress" max="5" value="0" aria-label="워크스페이스 준비"></progress><button class="loader-enter" id="loaderEnter" disabled>준비 중…</button></div></main>
</div>`;
  const video=$('#loadingVideo'),status=$('#loaderStatus'),progress=$('#loaderProgress'),button=$('#loaderEnter');
  let alive=true,ready=false,timer;
  const started=performance.now();
  if(reduced()){video.autoplay=false;video.pause();}else video.play().catch(()=>{});
  const enter=()=>{if(!alive||!ready)return;alive=false;clearTimeout(timer);video.pause();const to=store.get('astra_after_loading','#/app');store.del('astra_after_loading');go(to||'#/app');};
  button.addEventListener('click',enter);
  const steps=[
    ['세션 확인',async()=>{const s=await api.session();if(!s.user)throw Object.assign(new Error('세션 만료'),{status:401});state.user=s.user;}],
    ['공개 공고',async()=>{state.boot=await api.bootstrap();}],
    ['회사 문서',async()=>{state.docs=(await api.documents()).items;}],
    ['저장 답변',async()=>{state.examples=(await api.examples()).items;}],
    ['모델 상태',async()=>{state.status=await api.status();}],
  ];
  const list=$('#loaderSteps');list.innerHTML=steps.map(([name])=>`<li>${esc(name)}<span>진행 중</span></li>`).join('');
  const run=async()=>{
    let failed=false;
    for(let i=0;i<steps.length;i++){
      if(!alive)return;const row=list.children[i];
      const stepStarted=performance.now();
      try{await steps[i][1]();
        // Keep fast local requests readable while preserving real completion order.
        if(!reduced())await new Promise(resolve=>setTimeout(resolve,Math.max(0,700-(performance.now()-stepStarted))));
        if(!alive)return;row.classList.add('done');row.querySelector('span').textContent='완료';}
      catch(error){if(!alive)return;if(error.status===401){state.user=null;alive=false;video.pause();go('#/login');return;}failed=true;row.classList.add('failed');row.querySelector('span').textContent='실패';}
      progress.value=i+1;
    }
    if(!alive)return;ready=true;button.disabled=false;button.textContent='바로 입장 →';
    status.textContent=failed?'일부 자료를 불러오지 못했습니다. 입장 후 다시 확인해 주세요.':'워크스페이스 준비 완료';
    timer=setTimeout(enter,reduced()?300:Math.max(500,3600-(performance.now()-started)));
  };
  run();
  return()=>{alive=false;clearTimeout(timer);video.pause();video.removeAttribute('src');video.querySelectorAll('source').forEach(s=>s.remove());video.load();};
}
