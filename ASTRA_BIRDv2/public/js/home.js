// HOME — 파랑새 인트로 → 살아있는 파랑새, 인기 HOT / 마감 D-10 카드 레일, 전체 공고 보기
import { $, $$, api, state, esc, won, dday, fmtDate, shortSector, pickHot, pickDue, asOf, todayKST, store, reduced, go, icons } from './core.js';
import { LiveBird } from './bird.js';
import { smoothScroll } from './smooth.js';

const railCleanups = [];
const TONES_HOT = ['#E9E5FF', '#FFE4EE', '#DDF4EC', '#DCEBFF', '#FFF1D6'];
const TONES_DUE = ['#FFE8DE', '#FFE1E8', '#FDEBD3', '#F3E6FF'];

function illustration(sector, i) {
  const dev = /개발/.test(sector);
  const c1 = ['#7B61FF', '#FF4F8B', '#19B37D', '#2F6BFF', '#F59E0B'][i % 5];
  if (dev) return `<svg class="ill" viewBox="0 0 112 100" aria-hidden="true">
    <defs><linearGradient id="g${i}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c1}" stop-opacity=".35"/></linearGradient></defs>
    <rect x="10" y="18" width="84" height="62" rx="12" fill="url(#g${i}a)" stroke="${c1}" stroke-opacity=".5"/>
    <rect x="10" y="18" width="84" height="14" rx="12" fill="${c1}" opacity=".85"/>
    <circle cx="20" cy="25" r="2.6" fill="#fff"/><circle cx="28" cy="25" r="2.6" fill="#fff" opacity=".7"/>
    <path d="m38 48-8 8 8 8M66 48l8 8-8 8M56 44l-8 26" stroke="${c1}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="92" cy="80" r="14" fill="${c1}"/><path d="m86 80 4 4 8-8" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg class="ill" viewBox="0 0 112 100" aria-hidden="true">
    <defs><linearGradient id="g${i}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c1}" stop-opacity=".4"/></linearGradient></defs>
    <path d="M56 12 88 24v24c0 22-14 36-32 42-18-6-32-20-32-42V24z" fill="url(#g${i}b)" stroke="${c1}" stroke-opacity=".55"/>
    <circle cx="56" cy="50" r="15" fill="none" stroke="${c1}" stroke-width="5" stroke-dasharray="7 5"/>
    <circle cx="56" cy="50" r="6" fill="${c1}"/>
    <rect x="76" y="66" width="28" height="22" rx="7" fill="${c1}"/><path d="M83 77h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function card(n, i, kind) {
  const d = dday(n.deadline);
  const tone = (kind === 'hot' ? TONES_HOT : TONES_DUE)[i % (kind === 'hot' ? 5 : 4)];
  const ddCls = kind === 'hot' ? (i < 3 ? 'hot' : '') : (d.n != null && d.n <= 3 ? 'soon' : '');
  return `<button class="ncard" data-id="${esc(n.id)}" style="--tone:${tone}" aria-label="${esc(n.title)} · ${esc(d.label)}">
    <div class="top">
      <div class="cat">${esc(shortSector(n.sector))}</div>
      <span class="dd ${ddCls}">${kind === 'hot' ? (i < 3 ? 'HOT ' : '') : ''}${esc(d.label)}</span>
      ${kind === 'hot' ? `<span class="rank">${String(i + 1).padStart(2, '0')}</span>` : ''}
      ${illustration(n.sector, i + (kind === 'hot' ? 0 : 2))}
    </div>
    <div class="body">
      <h3>${esc(n.title)}</h3>
      <div class="agency">${esc(n.agency)} · ${esc(n.region || '지역 미확인')}</div>
      <div class="row"><span>${esc(fmtDate(n.deadline).slice(0, 10))} 마감</span><b>${esc(won(n.budget))}</b></div>
    </div></button>`;
}

function railSection(id, title, tags, note, chips) {
  return `<section class="sec" id="${id}">
    <span class="bgword" aria-hidden="true">${id === 'hot' ? 'HOT' : 'D-10'}</span>
    <div class="sec-head reveal">
      <div><h2>${title}</h2><div class="tags">${tags}</div>${note ? `<div class="note">${note}</div>` : ''}</div>
      <div class="rail-ctrl"><button class="circle-btn prev" aria-label="이전 카드">${icons.arrowL}</button><button class="circle-btn next" aria-label="다음 카드">${icons.chevR}</button></div>
    </div>
    ${chips ? `<div class="chips reveal" role="group" aria-label="분야">${chips}</div>` : ''}
    <div class="rail-wrap reveal"><div class="rail" tabindex="0" aria-label="${title} 카드 목록"></div></div>
    <div class="progress-line reveal"><i></i></div>
  </section>`;
}

export async function renderHome(root) {
  document.body.classList.remove('is-dark');
  const user = state.user;
  const ref = asOf();
  const seen = store.get('astra_intro_seen', false) || reduced();
  root.innerHTML = `<div class="view home">
    <header class="topbar" id="topbar">
      <a class="brand" href="#/" aria-label="ASTRA 홈">${icons.brand}<span>ASTRA</span></a>
      ${user
        ? `<button class="login-btn" id="toApp">${esc(user.company_name)} · 워크스페이스<span class="dot">${icons.arrowR}</span></button>`
        : `<button class="login-btn" id="toLogin">로그인<span class="dot">${icons.arrowR}</span></button>`}
    </header>
    <section class="hero" id="hero">
      <div class="hero-stage" id="stage">
        <img src="/assets/img/bird_poster.jpg" alt="" aria-hidden="true">
        <video id="intro" muted playsinline preload="auto" poster="/assets/img/bird_poster.jpg" aria-hidden="true"><source src="/assets/video/bird_intro.mp4" type="video/mp4"><source src="/assets/video/bird_intro.webm" type="video/webm"></video>
        <canvas id="bird" aria-label="움직이는 파랑새 일러스트" role="img"></canvas>
      </div>
      <div class="hero-vignette"></div><div class="hero-mist"></div>
      <div class="hero-copy" id="heroCopy">
        <div class="eyebrow meta rise"><i></i>PUBLIC BID · RAG · EVIDENCE</div>
        <h1 class="rise d1">Find. Compare.<br><em>&amp;</em> Verify.<span class="ko">공고를 찾고, 근거로 확인하세요.</span></h1>
        <p class="rise d2">나라장터 공고를 탐색하고, 회사 조건과 대조하고, 답변의 원문 근거까지 한 화면에서 확인합니다.</p>
        <div class="actions rise d3">
          <button class="btn btn-primary" id="ctaBrowse">공고 둘러보기<span class="dot">${icons.arrowR}</span></button>
          <button class="btn btn-white" id="ctaLogin">${user ? '워크스페이스' : '로그인'}</button>
        </div>
      </div>
      <div class="hero-cards" id="heroCards"></div>
      <button class="skip-intro" id="skip" ${seen ? 'hidden' : ''}>인트로 건너뛰기</button>
      <div class="scroll-hint meta" aria-hidden="true"><span></span>SCROLL</div>
    </section>
    ${railSection('hot', '인기 HOT 공고', '#예산규모상위 #지금모집중',
      `조회수 데이터가 없어 시연 기준일(${ref})에 모집 중인 공고를 예산 규모·첨부 자료 수 순으로 골랐습니다.`,
      `<button class="chip" aria-pressed="true" data-s="">전체</button><button class="chip" aria-pressed="false" data-s="개발">SW·시스템 개발</button><button class="chip" aria-pressed="false" data-s="운영">운영·유지관리</button>`)}
    ${railSection('due', '마감 D-10 공고', '#마감임박 #서두르세요', `시연 기준일(${ref}, 한국 표준시)부터 10일 안에 마감되는 공고입니다.`, '')}
    <section class="sec" id="all">
      <button class="allcta reveal" id="allBtn" aria-label="전체 공고 보러가기 — 로그인 화면으로 이동">
        <span class="pill-gloss" aria-hidden="true"></span>
        <span class="ttl">전체 공고 보러가기</span>
        <span class="tswitch" aria-hidden="true"><span class="meadow"></span><span class="knob"></span></span>
      </button>
    </section>
    <footer class="site-foot">
      <span>ASTRA 시연판 · 공고 데이터: 나라장터 수집본(기존 ASTRA 시연 데이터 v1) · 시연 기준일 ${esc(ref)} (실제 오늘 ${esc(todayKST())})</span>
      <span>파랑새 영상: 사용자 제공 레퍼런스 가공 · 글꼴: Pretendard · Geist Mono · JetBrains Mono (<a href="/assets/fonts/LICENSE-Pretendard.txt">OFL</a>)</span>
    </footer>
  </div>`;

  const cleanup = [];
  // ---------- 헤더 · 버튼 ----------
  const toLogin = () => { store.set('astra_return', '#/app'); go('#/login'); };
  $('#toLogin')?.addEventListener('click', toLogin);
  $('#toApp')?.addEventListener('click', () => go('#/app'));
  $('#ctaLogin').addEventListener('click', () => user ? go('#/app') : toLogin());
  $('#allBtn').addEventListener('click', e => { const b = e.currentTarget; if (b.classList.contains('go')) return; b.classList.add('go'); setTimeout(() => user ? go('#/app') : toLogin(), reduced() ? 0 : 520); });

  // ---------- 스크롤 ----------
  const sm = smoothScroll();
  cleanup.push(() => sm.stop());
  $('#ctaBrowse').addEventListener('click', () => sm.to($('#hot').offsetTop - 40));
  const bgw = $$('.bgword', root);
  const topbar = $('#topbar'), stage = $('#stage'), copy = $('#heroCopy'), cards = $('#heroCards');
  const onY = y => {
    topbar.classList.toggle('scrolled', y > 40);
    const p = Math.min(1.2, y / innerHeight);
    stage.style.transform = `translate(-50%, calc(-50% + ${y * .32}px)) scale(${1 + p * .08})`;
    copy.style.opacity = cards.style.opacity = String(Math.max(0, 1 - p * 1.6));
    copy.style.translate = `0 ${-y * .12}px`; cards.style.translate = `0 ${-y * .2}px`;
    bgw.forEach(el => { const r = el.parentElement.getBoundingClientRect(); el.style.transform = `translate3d(${r.top * .08}px, ${r.top * -.18}px, 0)`; });
  };
  sm.onScroll(onY); const nat = () => onY(scrollY); addEventListener('scroll', nat, { passive: true }); cleanup.push(() => removeEventListener('scroll', nat));
  onY(scrollY);
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { threshold: .12 });
  $$('.reveal', root).forEach(el => io.observe(el));
  cleanup.push(() => io.disconnect());

  // ---------- 파랑새 ----------
  const hero = $('#hero'), video = $('#intro'), canvas = $('#bird');
  const bird = new LiveBird(canvas); window.__astraBird = bird;
  const birdReady = bird.init().catch(() => null);
  let live = false;
  const goLive = async () => {
    if (live) return; live = true;
    hero.classList.add('in'); hero.classList.remove('early'); $('#skip').hidden = true; store.set('astra_intro_seen', true);
    const ok = await birdReady;
    if (!ok) return;                          // 레이어 로딩 실패 시 영상 마지막 프레임 유지
    bird.resize(); bird.draw(0);
    stage.classList.add('live');
    if (!reduced()) bird.start();
    setTimeout(() => bird.showWord(true), reduced() ? 0 : 600);
    if (reduced()) { bird.wordA = 1; bird.draw(0); }
  };
  if (seen) { video.remove(); goLive(); }
  else {
    // 0~2.0초: 첫 화면 등장(앉아 있던 파랑새가 날아오름) → 이후 기존 인트로(다시 날아와 착지)
    const PRE = 2.0;
    hero.classList.add('early');
    video.addEventListener('timeupdate', () => { if (video.currentTime > PRE + .3) hero.classList.remove('early'); if (video.currentTime > PRE + 2.55) hero.classList.add('in'); });
    video.addEventListener('ended', goLive);
    video.addEventListener('error', goLive);
    const p = video.play(); if (p && p.catch) p.catch(goLive);
    setTimeout(() => { if (!live && video.currentTime < .05) goLive(); }, 5000);
    $('#skip').addEventListener('click', () => { video.pause(); goLive(); });
  }
  hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); bird.pointer((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); });
  const vis = new IntersectionObserver(([e]) => { if (!live || reduced()) return; e.isIntersecting && !document.hidden ? bird.start() : bird.stop(); }, { threshold: .02 });
  vis.observe(hero);
  const onVis = () => { if (!live || reduced()) return; document.hidden ? bird.stop() : bird.start(); };
  document.addEventListener('visibilitychange', onVis);
  cleanup.push(() => { vis.disconnect(); document.removeEventListener('visibilitychange', onVis); bird.destroy(); });

  // ---------- 데이터 ----------
  let notices = [];
  try { state.boot = state.boot || await api.bootstrap(); notices = state.boot.notices || []; }
  catch (e) { $$('.rail', root).forEach(r => r.outerHTML = `<div class="rail-empty">공고 데이터를 불러오지 못했습니다. 서버 실행 상태를 확인해 주세요. (${esc(e.message)})</div>`); }
  const due = pickDue(notices, ref);
  const months = [...new Set(notices.map(n => n.month).filter(Boolean))].sort();
  cards.innerHTML = `
    <div class="gcard rise d2"><span class="tag">공개 공고</span><div class="big">${notices.length}<small>건</small></div><div class="sub">나라장터 수집 공고<br>${months.length ? `${months[0].replace('-', '.')}–${months.at(-1).slice(5)}월 게시분` : ''}</div><span class="arrow">↗</span></div>
    <div class="gcard tall rise d3"><div class="orb"></div><div class="big">${due.length}<small>건</small></div><div class="sub">마감 D-10 공고<br>기준일 ${esc(ref.replace(/-/g, '.'))} (KST)</div><span class="arrow">↗</span></div>
    <div class="gcard rise d4"><span class="tag">근거 검증</span><div class="big" style="font-size:38px">L1–L3</div><div class="sub">공개 · 회사 L2 · L3<br>권한별 원문 근거 열람</div><span class="arrow">↗</span></div>`;
  const [c1, c2, c3] = cards.children;
  c1.addEventListener('click', () => user ? go('#/app') : toLogin());
  c2.addEventListener('click', () => sm.to($('#due').offsetTop - 40));
  c3.addEventListener('click', () => user ? go('#/app') : toLogin());

  const byId = new Map(notices.map(n => [n.id, n]));
  const fillRail = (sec, list, kind) => {
    const rail = $(`#${sec} .rail`); if (!rail) return;
    rail.innerHTML = list.length ? list.map((n, i) => card(n, i, kind)).join('')
      : `<div class="rail-empty" style="margin:0">기준일에 해당하는 공고가 없습니다. 시연 기준일을 바꾸면 다시 계산됩니다.</div>`;
    setupRail($(`#${sec}`));
  };
  const hotAll = pickHot(notices, ref, 10);
  fillRail('hot', hotAll, 'hot'); fillRail('due', due, 'due');
  $$('#hot .chip').forEach(ch => ch.addEventListener('click', () => {
    $$('#hot .chip').forEach(c => c.setAttribute('aria-pressed', String(c === ch)));
    const s = ch.dataset.s; fillRail('hot', s ? pickHot(notices.filter(n => n.sector.includes(s)), ref, 10) : hotAll, 'hot');
  }));
  root.addEventListener('click', e => {
    const c = e.target.closest('.ncard'); if (!c) return;
    const n = byId.get(c.dataset.id); if (n) openSheet(n, user, toLogin);
  });
  cleanup.push(() => { railCleanups.splice(0).forEach(f => f()); });
  return () => cleanup.forEach(f => f());
}

function setupRail(sec) {
  const rail = sec.querySelector('.rail'), prev = sec.querySelector('.prev'), next = sec.querySelector('.next'), bar = sec.querySelector('.progress-line i');
  if (!rail || rail._setup) { if (rail) rail._update?.(); return; }
  rail._setup = true;
  const step = () => { const c = rail.querySelector('.ncard'); return c ? c.getBoundingClientRect().width + 18 : 300; };
  const update = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    prev.disabled = rail.scrollLeft <= 2; next.disabled = rail.scrollLeft >= max - 2;
    const w = rail.scrollWidth ? rail.clientWidth / rail.scrollWidth : 1;
    bar.style.width = `${Math.min(100, w * 100)}%`;
    bar.style.transform = `translateX(${max > 0 ? (rail.scrollLeft / max) * ((1 - w) / w) * 100 : 0}%)`;
  };
  rail._update = update;
  let down = false, sx = 0, sl = 0, moved = false, vx = 0, lx = 0, lt = 0, raf = 0;
  prev.addEventListener('click', () => rail.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
  next.addEventListener('click', () => rail.scrollBy({ left: step() * 2, behavior: 'smooth' }));
  rail.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  const onMove = e => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (!moved && Math.abs(dx) > 6) { moved = true; rail.classList.add('dragging'); }
    if (moved) { rail.scrollLeft = sl - dx; const now = performance.now(); vx = (e.clientX - lx) / Math.max(1, now - lt); lx = e.clientX; lt = now; }
  };
  const onUp = () => {
    if (!down) return; down = false;
    if (!moved) return;
    let v = -vx * 16;
    const glide = () => { rail.scrollLeft += v; v *= .92; if (Math.abs(v) > .5) raf = requestAnimationFrame(glide); else rail.classList.remove('dragging'); };
    raf = requestAnimationFrame(glide);
    rail.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    setTimeout(() => rail.classList.remove('dragging'), 900);
  };
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
  railCleanups.push(() => { removeEventListener('resize', update); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); cancelAnimationFrame(raf); });
  rail.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; sx = lx = e.clientX; sl = rail.scrollLeft; lt = performance.now(); vx = 0; cancelAnimationFrame(raf);
  });
  requestAnimationFrame(update);
}

function openSheet(n, user, toLogin) {
  const d = dday(n.deadline);
  const back = document.createElement('div'); back.className = 'sheet-back';
  const sh = document.createElement('aside'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', '공고 미리보기');
  const reqs = (n.requirements || []).filter(r => !/근거 문서/.test(r.label)).slice(0, 5);
  sh.innerHTML = `<header>
      <button class="x" aria-label="닫기">✕</button>
      <span style="color:var(--ink-3);font-size:13px">${esc(shortSector(n.sector))} · <b class="mono">${esc(d.label)}</b></span>
      <h3>${esc(n.title)}</h3>
      <div class="kv"><div><span>발주기관</span>${esc(n.agency)}</div><div><span>예산</span>${esc(won(n.budget))}</div>
      <div><span>마감</span>${esc(fmtDate(n.deadline))}</div><div><span>지역(기관명 기준)</span>${esc(n.region || '지역 미확인')}</div></div>
    </header>
    <div class="scroll" data-own-scroll>${reqs.length ? reqs.map(r => `<div class="req"><b>${esc(r.label)}</b><p>${esc(r.text)}</p></div>`).join('') : '<p style="color:var(--ink-3)">정리된 요건이 없습니다.</p>'}
      <p style="font-size:12px;color:var(--ink-3)">사람이 정리한 요건 요약입니다. 원문 확인이 필요합니다.</p></div>
    <footer><small>공고 번호 ${esc(n.id)}</small>
      <button class="btn btn-primary" id="sheetGo">${user ? '이 공고로 질문하기' : '로그인하고 분석하기'}<span class="dot">${icons.arrowR}</span></button></footer>`;
  document.body.append(back, sh);
  requestAnimationFrame(() => { back.classList.add('on'); sh.classList.add('on'); });
  const prevFocus = document.activeElement;
  sh.querySelector('.x').focus();
  const close = () => { back.classList.remove('on'); sh.classList.remove('on'); setTimeout(() => { back.remove(); sh.remove(); }, 520); removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  back.addEventListener('click', close); sh.querySelector('.x').addEventListener('click', close);
  sh.querySelector('#sheetGo').addEventListener('click', () => {
    store.set('astra_ctx', { bid: n.id }); close();
    if (user) go('#/app'); else toLogin();
  });
}
