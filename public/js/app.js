import {documentHTML} from './document-view.mjs';
import {typewrite} from './typewriter.mjs';
import {presentationCase} from './presentation.mjs';
import {spansToUtf16} from './span-offsets.mjs';
// APP — 얇은 고정 사이드바 + 크기 조절 두 창(왼쪽: LLM 질문 · 오른쪽: 조건 필터 공고)
// 직접 입력한 질문은 로컬 모델 API를 사용하고, 예시 질문은 기존 저장 답변을 재생한다.
import { $, $$, api, state, esc, companyLabel, won, dday, fmtDate, shortSector, asOf, setAsOf, todayKST, DEMO_ASOF, store, go, sleep, reduced, toast, refreshSession, clearPrivate, icons } from './core.js';

const NAV = [
  { k: 'home', label: '홈', color: '#D7F04C', icon: icons.home },
  { k: 'chat', label: '질문', color: '#FF9A3C', icon: icons.chat },
  { k: 'list', label: '공고', color: '#FF4F8B', icon: icons.list },
  { k: 'cart', label: '장바구니', color: '#86E39B', icon: icons.cart },
  { k: 'company', label: '내 회사', color: '#4AE1FF', icon: icons.building },
  { k: 'settings', label: '마이페이지', color: '#B28CFF', icon: icons.sliders },
];
const SRC_LABEL = { live_qwen3: 'Qwen3 실시간 생성', saved_public: '저장 공개 사례', curated_replay: '선별 저장 답변', editorial_example: '편집 예시' };
const DET_LABEL = { live_prediction:'BGE-M3 실시간 의심 구절 검사',live_failed:'탐지 실패 · 미검증', human_draft: '표시: 사람 작성 초안', stored_prediction: '탐지: 저장된 예측 결과', not_run: '탐지 미실행' };

export async function renderApp(root) {
  const user = await refreshSession();
  if (!user) { store.set('astra_return', '#/app'); go('#/login'); return; }
  document.body.classList.remove('is-dark');
  // 필요한 데이터가 없으면(새로고침 등) 다시 불러온다 — 항상 현재 세션 권한 기준
  try {
    if (!state.boot) state.boot = await api.bootstrap();
    if (!state.examples) state.examples = (await api.examples()).items;
  } catch (e) { toast('데이터를 불러오지 못했습니다: ' + e.message); }
  const modelStatus = await api.status();
  const models = modelStatus.models || [];
  let selectedModel = store.get('astra_generation_model',modelStatus.default_model || 'astra-qwen3:8b');
  if (!models.some(m=>m.id===selectedModel && m.available)) selectedModel=models.find(m=>m.available)?.id || modelStatus.default_model;
  const notices = state.boot?.notices || [];
  const examples = state.examples || [];
  const exByBid = new Map();
  examples.forEach(x => (x.bids || []).forEach(b => exByBid.set(b, (exByBid.get(b) || 0) + 1)));
  let personal = await api.personal();
  let cart = personal.favorites.map(id => ({id}));
  const inCart = id => cart.some(x => x.id === id);
  let cartBusy = false;
  let view = store.get('astra_view', 'main');

  root.innerHTML = `<div class="shell view">
    <aside class="side" aria-label="주 메뉴">
      <svg class="bar" id="sideBar" aria-hidden="true"><defs><linearGradient id="sideFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1B1826"/><stop offset="1" stop-color="#15121E"/></linearGradient></defs><path id="sidePath" fill="url(#sideFill)" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/></svg>
      <div class="logo" title="Blue Jay">${icons.brand.replace('<svg', '<svg width="30" height="18"')}</div>
      <span class="glow" id="sGlow"></span>
      <nav>${NAV.map(n => `<button class="item" data-k="${n.k}" aria-label="${n.label}" title="${n.label}">${n.icon}</button>`).join('')}</nav>
      <span class="bubble" id="bubble"></span><span class="blabel" id="blabel"></span>
      <div class="foot"><span class="avatar" title="${esc(companyLabel(user.company_name))} · ${esc(user.employee_id)}">${esc(user.company_code)}</span>
        <button class="out" id="logout" aria-label="로그아웃" title="로그아웃">${icons.logout}</button></div>
    </aside>
    <div class="main" id="main">
      <section class="pane" id="chatPane" aria-label="질문 창">
        <div class="pane-head"><h2>Blue Jay Assistant</h2>
          <button class="linkbtn" id="newChat">새 대화</button></div>
        <div class="chat-scroll" id="chatScroll" data-own-scroll></div>
        <div class="composer">
          <div class="ctx" id="ctx"></div>
          <div class="model-tools"><label for="generationModel">답변 모델</label><select id="generationModel" aria-label="답변 생성 모델">${models.map(m=>`<option value="${esc(m.id)}" ${m.id===selectedModel?'selected':''} ${m.available?'':'disabled'}>${esc(m.label)}${m.available?'':' · 미설치'}</option>`).join('')}</select></div>
          <form class="box" id="ask"><textarea id="q" rows="1" placeholder="공고를 선택하고 질문하세요 · Qwen3 생성 후 BGE-M3 검사" aria-label="질문 입력"></textarea>
          <button class="send" id="send" type="submit" aria-label="보내기" disabled>${icons.send}</button></form>
        </div>
      </section>
      <div class="divider" id="divider" role="separator" aria-orientation="vertical" aria-label="창 크기 조절 (좌우 화살표, Home 키로 초기화)" tabindex="0" aria-valuemin="25" aria-valuemax="75"><i></i><span class="ratio" id="ratio"></span></div>
      <section class="pane" id="listPane" style="flex:1" aria-label="조건 필터 공고 창">
        <div class="pane-head">
          <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-t="list">조건 필터 공고</button><button role="tab" aria-selected="false" data-t="discover">맞춤 탐색</button><button role="tab" aria-selected="false" data-t="company">내 회사 자료</button></div>
          <label class="asof">기준일 <input type="date" id="asof" value="${esc(asOf())}"><button class="linkbtn" id="today" type="button">오늘</button></label>
        </div>
        <div id="listBody" style="display:flex;flex-direction:column;min-height:0;flex:1"></div>
      </section>
    </div>
    <div class="cartview" id="cartView" style="display:none" aria-label="장바구니 화면">
      <section class="cv-card">
        <header class="cv-head"><div class="cv-ttl"><span class="cv-ic">${icons.cart}</span><div><h1>장바구니</h1><p id="cvSub"></p></div></div>
          <button class="cv-back" id="cvBack">${icons.arrowL}<span>공고로 돌아가기</span></button></header>
        <div class="cv-body" id="cvBody" data-own-scroll></div>
      </section>
    </div>
  </div>`;

  const cleanup = [];
  // ---------------- 사이드바 (노치 + 떠오르는 버블) ----------------
  const side = $('.side'), path = $('#sidePath'), bubble = $('#bubble'), blabel = $('#blabel'), glow = $('#sGlow');
  let cy = 0, ty = 0, vy = 0, sraf = 0, active = 'chat';
  const shape = y => {
    const H = side.clientHeight, L = 8, R = 68, T = 8, B = H - 8, rr = 22, n = 31;
    const top = Math.max(T + rr + 2, y - n), bot = Math.min(B - rr - 2, y + n);
    path.setAttribute('d', `M${L + rr},${T} H${R - rr} Q${R},${T} ${R},${T + rr} V${top - 10} Q${R},${top} ${R - 3},${top + 2} A${n} ${n} 0 0 0 ${R - 3},${bot - 2} Q${R},${bot} ${R},${bot + 10} V${B - rr} Q${R},${B} ${R - rr},${B} H${L + rr} Q${L},${B} ${L},${B - rr} V${T + rr} Q${L},${T} ${L + rr},${T} Z`);
    bubble.style.top = blabel.style.top = glow.style.top = y + 'px';
  };
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const slots = () => NAV.map(n => { const b = side.querySelector(`[data-k="${n.k}"]`); return { n, b, y: b.offsetTop + b.offsetHeight / 2 + b.parentElement.offsetTop }; });
  let fromColor = NAV[1].color, toColor = NAV[1].color, y0 = 0, shownIcon = '';
  const showIcon = (icon, pop) => { if (icon === shownIcon) return; shownIcon = icon; bubble.innerHTML = icon; if (pop) { bubble.classList.remove('bpop'); void bubble.offsetWidth; bubble.classList.add('bpop'); } };
  const travel = () => {
    const span = Math.abs(ty - y0) || 1, p = Math.min(1, Math.max(0, 1 - Math.abs(ty - cy) / span));
    side.style.setProperty('--bc', mix(fromColor, toColor, p));
    // 지나가는 칸의 아이콘을 버블에 싣고, 그 칸은 비운다 (사이드바.mp4)
    let near = null, best = 1e9; slots().forEach(s => { const d = Math.abs(s.y - cy); if (d < best) { best = d; near = s; } });
    $$('.side .item').forEach(b => b.classList.toggle('under', b === near.b && best < 26));
    showIcon(near.n.icon, false);
  };
  const springTo = y => {
    y0 = cy; ty = y; if (reduced()) { cy = ty; shape(cy); travel(); settle(); return; }
    cancelAnimationFrame(sraf);
    const step = () => { const f = (ty - cy) * .12; vy = vy * .74 + f; cy += vy; shape(cy); travel(); if (Math.abs(ty - cy) > .3 || Math.abs(vy) > .3) sraf = requestAnimationFrame(step); else { cy = ty; shape(cy); travel(); settle(); } };
    sraf = requestAnimationFrame(step);
  };
  let labelTimer;
  cleanup.push(() => clearTimeout(labelTimer));
  let settle = () => { };
  const setActive = (k, animate = true) => {
    const n = NAV.find(x => x.k === k); if (!n) return; active = k;
    const btn = side.querySelector(`[data-k="${k}"]`);
    $$('.side .item').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-current', b === btn ? 'page' : 'false'); });
    const y = btn.offsetTop + btn.offsetHeight / 2 + btn.parentElement.offsetTop;
    fromColor = getComputedStyle(side).getPropertyValue('--bc').trim() || n.color; if (!/^#[0-9a-f]{6}$/i.test(fromColor)) fromColor = n.color; toColor = n.color;
    clearTimeout(labelTimer); blabel.classList.remove('show'); blabel.textContent = n.label;
    settle = () => { side.style.setProperty('--bc', n.color); showIcon(n.icon, true); blabel.classList.add('show'); labelTimer = setTimeout(() => blabel.classList.remove('show'), 3000); $$('.side .item').forEach(b => b.classList.remove('under')); };
    if (animate && Math.abs(y - cy) > 1) springTo(y); else { cy = ty = y; shape(y); settle(); }
  };
  const sizeBar = () => { const sv = $('#sideBar'); sv.setAttribute('viewBox', `0 0 76 ${side.clientHeight}`); shape(cy); };
  addEventListener('resize', sizeBar); cleanup.push(() => removeEventListener('resize', sizeBar));
  sizeBar(); setActive('chat', false);
  const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); };
  side.addEventListener('click', e => {
    const b = e.target.closest('.item'); if (!b) return;
    const k = b.dataset.k; setActive(k);
    if (k === 'cart') { setView('cart'); return; }
    if ((k === 'chat' || k === 'list' || k === 'company') && view === 'cart') setView('main');
    if (k === 'home') { store.set('astra_view', 'main'); setTimeout(() => go('#/'), 380); }
    if (k === 'chat') { flash($('#chatPane')); $('#q').focus(); }
    if (k === 'list') { flash($('#listPane')); showTab('list'); }
    if (k === 'company') { flash($('#listPane')); showTab('company'); }
    if (k === 'settings') openSettings();
  });
  $('#logout').addEventListener('click', logout);
  async function logout() {
    try { await api.logout(); } catch { }
    clearPrivate(); toast('로그아웃했습니다. 회사 자료·대화 캐시를 지웠습니다.');
    go('#/');
  }

  // ---------------- 창 분할 ----------------
  const main = $('#main'), chatPane = $('#chatPane'), divider = $('#divider'), ratioEl = $('#ratio');
  const DEF = 45, MINPX = 340;
  let ratio = store.lget('astra_split', DEF);
  const applyRatio = r => {
    const W = main.clientWidth - 14 - 36; const minR = Math.min(45, MINPX / W * 100);
    ratio = Math.max(minR, Math.min(100 - minR, r));
    chatPane.style.flex = `0 0 ${ratio}%`; ratioEl.textContent = `${Math.round(ratio)} : ${Math.round(100 - ratio)}`;
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  };
  applyRatio(ratio);
  divider.addEventListener('pointerdown', e => {
    divider.setPointerCapture(e.pointerId); divider.classList.add('drag');
    const r0 = main.getBoundingClientRect();
    const mv = ev => applyRatio((ev.clientX - r0.left - 24) / (r0.width - 36) * 100);
    const up = () => { divider.classList.remove('drag'); divider.removeEventListener('pointermove', mv); store.lset('astra_split', ratio); };
    divider.addEventListener('pointermove', mv); divider.addEventListener('pointerup', up, { once: true }); divider.addEventListener('pointercancel', up, { once: true });
  });
  divider.addEventListener('dblclick', () => { applyRatio(DEF); store.lset('astra_split', ratio); });
  divider.addEventListener('keydown', e => {
    const st = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') applyRatio(ratio - st); else if (e.key === 'ArrowRight') applyRatio(ratio + st); else if (e.key === 'Home') applyRatio(DEF); else return;
    e.preventDefault(); store.lset('astra_split', ratio);
  });
  const onRs = () => applyRatio(ratio); addEventListener('resize', onRs); cleanup.push(() => removeEventListener('resize', onRs));

  // ---------------- 질문 창 ----------------
  const byId = new Map(notices.map(n => [n.id, n]));
  let ctx = store.get('astra_ctx', null);           // {bid}
  if (ctx && !byId.has(ctx.bid)) ctx = null;
  const chatKey = `astra_chat:${user.company_code}:${user.user_id}`;
  let chat = store.get(chatKey, []);           // [{t:'u'|'a'|'sys', text, caseId}]
  const scroll = $('#chatScroll'), q = $('#q'), send = $('#send');
  const saveChat = () => store.set(chatKey, chat.slice(-40));
  const exFor = () => ctx ? examples.filter(x => (x.bids || []).includes(ctx.bid)) : examples;

  const renderCtx = () => {
    const n = ctx && byId.get(ctx.bid);
    $('#ctx').innerHTML = n ? `<span class="badge blue">선택 공고 · ${esc(n.title.slice(0, 34))}${n.title.length > 34 ? '…' : ''}<button aria-label="공고 선택 해제" id="ctxX">✕</button></span>` : '<span>공고를 선택하지 않았습니다 · 오른쪽 목록에서 “이 공고로 질문”을 누르세요</span>';
    $('#ctxX')?.addEventListener('click', () => { ctx = null; store.set('astra_ctx', null); renderCtx(); renderChat(); renderList(); });
  };
  const welcome = () => {
    const list = exFor();
    const n = ctx && byId.get(ctx.bid);
    return `<div class="welcome"><h3>${n ? '이 공고에 대해 물어보세요' : `${esc(companyLabel(user.company_name))}, 무엇을 확인할까요?`}</h3>
      <p>${n ? `“${esc(n.title)}”에 연결된 저장 사례 ${list.length}건입니다. 아래 예시는 저장 답변이며, 직접 입력한 질문은 Qwen3로 새로 생성합니다.` : '공고를 선택해 질문하면 구축한 RAG을 근거로 Qwen3가 답변하고 BGE-M3가 의심 구절을 검사합니다.'}</p>
      <div class="ex-list">${list.slice(0, 7).map(x => `<button class="ex" data-case="${esc(x.id)}"><span class="k">${esc((SRC_LABEL[x.source] || x.source).replace('저장 ', ''))}</span><span>${esc(x.question)}</span></button>`).join('') || '<div class="empty">이 공고에 연결된 저장 사례가 없습니다.</div>'}</div></div>`;
  };
  const md = (raw, spans = []) => {
    let s = raw;
    spans = spansToUtf16(raw,spans);
    [...spans].map((sp, k) => ({ ...sp, k })).sort((a, b) => b.start - a.start).forEach(sp => { if (sp.end <= s.length) s = s.slice(0, sp.start) + `${sp.k}` + s.slice(sp.start, sp.end) + '' + s.slice(sp.end); });
    let h = esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(\d{1,2})\]/g, '<button class="cite" data-n="$1" aria-label="근거 $1 보기">$1</button>')
      .replace(/(\d+)/g, (_, k) => { const sp = spans[+k] || {}; return `<span class="flag" tabindex="0" title="${esc((sp.label || '표시') + ' · ' + (sp.reason || ''))}">`; })
      .replace(//g, '</span>');
    const blocks = h.split(/\n\s*\n/);
    return blocks.map(b => {
      const lines = b.split(/\n/);
      if (lines.every(l => /^\s*-\s/.test(l) || !l.trim())) return `<ul>${lines.filter(l => l.trim()).map(l => `<li>${l.replace(/^\s*-\s/, '')}</li>`).join('')}</ul>`;
      return `<p>${lines.map(l => /^\s*-\s/.test(l) ? '• ' + l.replace(/^\s*-\s/, '') : l).join('<br>')}</p>`;
    }).join('');
  };
  const answerHTML = c => {
    const badges = ['saved_public','curated_replay'].includes(c.source) ? [] : [`<span class="badge">${esc(SRC_LABEL[c.source] || c.source)}${c.source === 'live_qwen3' ? '' : ' 재생'}</span>`];
    if(c.source==='live_qwen3' && c.generation?.model) badges.push(`<span class="badge blue">${esc(models.find(m=>m.id===c.generation.model)?.label || c.generation.model)}</span>`);
    if (c.detection_kind !== "human_draft" && DET_LABEL[c.detection_kind]) badges.push(`<span class="badge ${c.spans?.length ? 'bad' : ''}">${DET_LABEL[c.detection_kind]}${c.spans?.length ? ` · ${c.spans.length}곳` : ''}</span>`);
    if (c.integrity?.answer_hash && c.integrity?.spans) badges.push('<span class="badge ok">저장 원문 일치</span>');
    (c.levels || []).forEach(l => badges.push(`<span class="badge sec-${esc(l)}">${esc(l)}</span>`));
    const ctxs = c.contexts || [];
    return `<div class="who"><span class="ava"><img src="/assets/img/blue-jay-avatar.png" alt="Blue Jay"></span>${badges.join('')}</div>
      <div class="text">${md(c.answer || '', c.spans || [])}</div>
      ${c.label ? `<div class="badge" style="margin-top:6px">${esc(c.label)}</div>` : ''}
      ${ctxs.length ? `<div class="srcs">${ctxs.map((x, i) => `<details class="src" data-n="${x.citation || i + 1}"><summary><span class="n">[${x.citation || i + 1}]</span><span class="fn">${esc(x.filename || x.title || x.document_id)}</span><span class="badge sec-${esc(x.security_level || '')}">${esc(x.security_level || '')}</span></summary><div class="ex-body">${esc(x.text || '')}${x.text_start != null ? `\n\n— 위치: ${x.text_start}–${x.text_end} (문자 오프셋)` : ''}</div></details>`).join('')}</div>` : '<div class="badge" style="margin-top:8px">연결된 근거 원문 없음</div>'}
      <div class="foot"><button data-copy>복사</button>${(c.bids || []).length === 1 && byId.has(c.bids[0]) ? `<button data-open="${esc(c.bids[0])}">공고 보기</button>` : ''}</div>`;
  };
  const cache = new Map();
  const getCase = async id => { const record = await api.caseById(id); cache.set(id,record); return record; };
  let renderVersion=0, typingController;
  cleanup.push(()=>{renderVersion++;typingController?.abort();});
  async function renderChat(animateLast=false) {
    const version=++renderVersion; typingController?.abort();
    if (!chat.length) { scroll.innerHTML = welcome(); return; }
    let html = '';
    for (const m of chat) {
      if (m.t === 'u') html += `<div class="msg-u"><div>${esc(m.text)}</div></div>`;
      else if (m.t === 'sys') html += `<div class="msg-a"><div class="who"><span class="ava"><img src="/assets/img/blue-jay-avatar.png" alt="Blue Jay"></span><span class="badge warn">안내</span></div><div class="text"><p>${m.html}</p></div></div>`;
      else {
        try { const c = await getCase(m.caseId); html += `<div class="msg-a" data-case="${esc(c.id)}">${answerHTML(c)}</div>`; }
        catch (e) { html += `<div class="msg-a"><div class="who"><span class="ava"><img src="/assets/img/blue-jay-avatar.png" alt="Blue Jay"></span><span class="badge bad">${e.status === 403 ? '현재 권한으로 열 수 없음' : '불러오기 실패'}</span></div></div>`; }
      }
    }
    html += `<div style="margin:6px 0 4px"><button class="linkbtn" id="moreEx">예시 질문 다시 보기</button></div>`;
    if(version!==renderVersion) return;
    scroll.innerHTML = html;
    scroll.scrollTop = scroll.scrollHeight;
    if(animateLast && !reduced()) {
      const messages=scroll.querySelectorAll('.msg-a[data-case]');
      const message=messages[messages.length-1];
      if(message) {
        typingController=new AbortController();
        message.classList.add('is-typing');
        await typewrite(message.querySelector('.text'),{signal:typingController.signal,onStep:()=>{
          if(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<140) scroll.scrollTop=scroll.scrollHeight;
        }});
        message.classList.remove('is-typing');
      }
    }
  }
  async function askCase(id) {
    const x = examples.find(e => e.id === id); if (!x || generating) return;
    generating=true; modelSelect.disabled=true; send.disabled=true;
    chat.push({ t: 'u', text: x.question }); saveChat();
    await renderChat();
    const tmp = document.createElement('div'); tmp.className = 'msg-a'; tmp.innerHTML = `<div class="who"><span class="ava"><img src="/assets/img/blue-jay-avatar.png" alt="Blue Jay"></span><span class="badge">저장 답변 불러오는 중</span></div><span class="typing"><i></i><i></i><i></i></span>`;
    scroll.querySelector('#moreEx')?.parentElement.before(tmp); scroll.scrollTop = scroll.scrollHeight;
    try { await Promise.all([getCase(id), sleep(reduced() ? 0 : 360)]); chat.push({ t: 'a', caseId: id });
      try { personal = await api.savePersonal({action:'history',question:x.question,notice_id:x.bids?.length === 1 ? x.bids[0] : null,case_id:id}); } catch(e) { toast('답변은 조회했지만 질문 기록 저장 실패: '+e.message); }
    }
    catch (e) { chat.push({ t: 'sys', html: esc(e.status === 403 ? '현재 권한으로는 이 사례를 열 수 없습니다.' : '사례를 불러오지 못했습니다.') }); }
    saveChat();
    try {await renderChat(true);} finally {generating=false;modelSelect.disabled=false;send.disabled=!q.value.trim();}
  }
  let generating = false, liveView = true;
  const modelSelect = $('#generationModel');
  modelSelect.addEventListener('change',()=>{selectedModel=modelSelect.value;store.set('astra_generation_model',selectedModel);});
  cleanup.push(() => { liveView = false; });
  async function freeAsk(text) {
    if (generating) { toast('이전 질문을 처리 중입니다.'); return; }
    if (!ctx?.bid) { toast('오른쪽 공고 목록에서 “이 공고로 질문”을 먼저 눌러주세요.'); q.value = text; return; }
    if(new URLSearchParams(location.search).get('presentation')==='1') {
      const example=examples.find(x=>x.bids?.includes(ctx.bid)&&x.source==='live_qwen3');
      const notice=byId.get(ctx.bid);
      if(!notice?.title.includes('항공사 데이터 연계') || Number(notice.budget)!==70000000) {toast('연출 모드는 예산 7,000만 원의 항공사 데이터 연계 공고에서만 사용할 수 있습니다.');return;}
      generating=true;send.disabled=true;modelSelect.disabled=true;
      try {
        const base=example ? await getCase(example.id) : {bids:[notice.id],contexts:[{citation:1,filename:'공고 메타데이터',security_level:'L1',text:`title: ${notice.title}\nagency: ${notice.agency}\nbudget: ${notice.budget}\ndeadline: ${notice.deadline}`}]};
        const c=presentationCase(base);
        if(!c.contexts.length) throw Error('연출에 사용할 실제 예산 근거를 찾지 못했습니다.');
        scroll.innerHTML=`<div class="msg-u"><div>${esc(text)}</div></div><div class="msg-a">${answerHTML(c)}</div>`;
        const message=scroll.querySelector('.msg-a');
        message.classList.add('is-typing');
        typingController=new AbortController();
        scroll.scrollTop=0;
        await typewrite(message.querySelector('.text'),{interval:42,signal:typingController.signal});
        message.classList.remove('is-typing');
      } catch(e) {toast(e.message);}
      finally {generating=false;modelSelect.disabled=false;send.disabled=!q.value.trim();}
      return;
    }
    generating = true;
    modelSelect.disabled = true;
    chat.push({t:'u',text}); saveChat(); await renderChat();
    const progress = document.createElement('div'); progress.className = 'msg-a'; progress.setAttribute('role','status'); progress.textContent = '허용 근거 확인 및 Qwen3 준비 중…'; scroll.append(progress); scroll.scrollTop=scroll.scrollHeight;
    send.disabled=true;
    try {
      const job = await api.generate({question:text,notice_id:ctx.bid,model:selectedModel});
      while (liveView) {
        const current = await api.generation(job.id);
        progress.textContent = current.stage + ' · CPU 실행은 시간이 걸릴 수 있습니다.';
        if (current.status === 'failed') throw Error(current.error || '모델 실행 실패');
        if (current.status === 'completed') {chat.push({t:'a',caseId:current.case_id});saveChat();await renderChat(true);break;}
        await sleep(1500);
      }
    } catch(e) { if(liveView) {chat.push({t:'sys',html:esc(e.message)});saveChat();await renderChat();} }
    finally {generating=false;modelSelect.disabled=false;progress.remove();if(liveView)send.disabled=!q.value.trim();}
  }
  scroll.addEventListener('click', e => {
    const ex = e.target.closest('.ex'); if (ex) return askCase(ex.dataset.case);
    if (e.target.id === 'moreEx') { scroll.insertAdjacentHTML('beforeend', welcome()); scroll.scrollTop = scroll.scrollHeight; return; }
    const ct = e.target.closest('.cite');
    if (ct) {
      const msg = ct.closest('.msg-a'); const d = msg?.querySelector(`.src[data-n="${ct.dataset.n}"]`);
      msg.querySelectorAll('.cite.on,.src.on').forEach(x => x.classList.remove('on'));
      ct.classList.add('on');
      if (d) { d.open = true; d.classList.add('on'); scrollInside(d, 'nearest'); }
      else toast('이 번호에 연결된 근거 원문이 없습니다 (연결 미확인).');
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) { const t = cp.closest('.msg-a').querySelector('.text').innerText; navigator.clipboard?.writeText(t).then(() => toast('답변을 복사했습니다.'), () => toast('복사할 수 없습니다.')); return; }
    const op = e.target.closest('[data-open]');
    if (op) { selectNotice(op.dataset.open, true); }
  });
  q.addEventListener('input', () => { send.disabled = generating || !q.value.trim(); q.style.height = 'auto'; q.style.height = Math.min(160, q.scrollHeight) + 'px'; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#ask').requestSubmit(); } });
  $('#ask').addEventListener('submit', e => { e.preventDefault(); const v = q.value.trim(); if (!v || generating) return; q.value = ''; q.dispatchEvent(new Event('input')); freeAsk(v); });
  $('#newChat').addEventListener('click', () => { if(generating){toast('답변 처리 완료 후 새 대화를 시작해주세요.');return;} chat = []; saveChat(); renderChat(); });

  // ---------------- 조건 필터 공고 (서버 /api/discover: 필터 검증 · 회사 조건 대조) ----------------
  const F0 = { q: '', sector: '', regions: [], bmin: '', bmax: '', status: 'open', sort: 'deadline', from: '', to: '', cond: '', review: false };
  let F = { ...F0, ...store.get('astra_filters', {}) };
  const open = new Set(store.get('astra_open', []));
  const saveOpen = () => store.set('astra_open', [...open]);
  const regions = [...new Set(notices.map(n => n.region))].sort((a, b) => a === '지역 미확인' ? 1 : b === '지역 미확인' ? -1 : a.localeCompare(b, 'ko'));
  const sectors = [...new Set(notices.map(n => n.sector))].sort();
  const months = [...new Set(notices.map(n => n.month).filter(Boolean))].sort();
  const conds = [...new Set(notices.flatMap(n => n.conditionMentions || []))].sort((a, b) => a.localeCompare(b, 'ko'));
  let tab = store.get('astra_tab', 'list');
  if (store.get('astra_show_discover', false)) { tab = 'discover'; store.del('astra_show_discover'); }
  function showTab(t) {
    if (tab === 'list') rememberScroll();
    tab = t; store.set('astra_tab', t);
    $$('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
    t === 'list' ? renderList(true) : t === 'discover' ? renderDiscover() : renderCompany();
  }
  $$('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.t); setActive(b.dataset.t === 'company' ? 'company' : 'list'); }));
  const listBody = $('#listBody');

  // 스크롤 위치 기억 → 목록으로 돌아오면 복원
  let restoreScroll = store.get('astra_list_scroll', 0);
  function rememberScroll() { const l = $('#list'); if (l) store.set('astra_list_scroll', l.scrollTop); }
  let scrollTimer = 0;
  const onListScroll = () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(rememberScroll, 120); };

  let disc = null, discErr = '', reqSeq = 0;
  const monthLabel = m => `${m.slice(0, 4)}년 ${+m.slice(5)}월`;
  function params(f) {
    return { query: f.q.trim(), sector: f.sector, from: f.from, to: f.to, min: f.bmin, max: f.bmax, condition: f.cond, review: f.review ? '1' : '', date: asOf(), sort: f.sort };
  }
  async function fetchDiscover() {
    const my = ++reqSeq;
    let res, err = '';
    try { res = await api.discover(params(F)); }
    catch (e) {
      if (e.status !== 400) throw e;
      err = e.message;                               // 서버가 거부한 조건(예산·공고월)은 빼고 다시 요청
      res = await api.discover(params({ ...F, bmin: '', bmax: '', from: '', to: '' }));
    }
    if (my !== reqSeq) return null;                  // 늦게 도착한 오래된 응답은 버림
    disc = res; discErr = err; return res;
  }
  function clientFilter(items) {
    const ref = asOf();
    return items.filter(n => {
      if (F.regions.length && !F.regions.includes(n.region)) return false;
      const d = dday(n.deadline, ref);
      if (F.status === 'open' && !(d.n != null && d.n >= 0)) return false;
      if (F.status === 'd10' && !(d.n != null && d.n >= 0 && d.n <= 10)) return false;
      if (F.status === 'closed' && d.kind !== 'closed') return false;
      return true;
    });
  }
  async function renderList(full = false) {
    if (tab !== 'list') return;
    if (full || !listBody.querySelector('.filters')) {
      listBody.innerHTML = `<div class="filters">
        <div class="frow"><input class="inp search" id="fq" placeholder="공고명 · 기관 · 공고번호 검색" value="${esc(F.q)}" aria-label="키워드">
          <select class="inp" id="fsec" aria-label="분야"><option value="">전체 분야</option>${sectors.map(s => `<option ${F.sector === s ? 'selected' : ''} value="${esc(s)}">${esc(shortSector(s))}</option>`).join('')}</select>
          <select class="inp" id="fsort" aria-label="정렬"><option value="deadline">마감 빠른 순</option><option value="budget">예산 큰 순</option><option value="recent">최근 공고 순</option><option value="match">일치순 (회사 조건)</option></select></div>
        <div class="frow"><div class="seg" role="group" aria-label="모집 상태">${[['all', '전체'], ['open', '모집 중'], ['d10', 'D-10'], ['closed', '마감']].map(([k, l]) => `<button data-st="${k}" aria-pressed="${F.status === k}">${l}</button>`).join('')}</div>
          <div class="budget"><span>예산(억원)</span><input class="inp" id="bmin" inputmode="decimal" placeholder="최소" value="${esc(F.bmin)}" aria-label="최소 예산 억원(이상)"><span>~</span><input class="inp" id="bmax" inputmode="decimal" placeholder="최대" value="${esc(F.bmax)}" aria-label="최대 예산 억원(미만)"></div></div>
        <div class="frow"><div class="budget"><span>공고월</span>
            <select class="inp" id="ffrom" aria-label="시작 공고월"><option value="">처음부터</option>${months.map(m => `<option value="${m}" ${F.from === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select><span>~</span>
            <select class="inp" id="fto" aria-label="종료 공고월"><option value="">끝까지</option>${months.map(m => `<option value="${m}" ${F.to === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></div>
          <select class="inp" id="fcond" aria-label="조건 언급"><option value="">조건 언급 전체</option>${conds.map(c => `<option value="${esc(c)}" ${F.cond === c ? 'selected' : ''}>‘${esc(c)}’ 언급</option>`).join('')}</select>
          <button class="rchip tgl" id="freview" aria-pressed="${F.review}">요건 시트 있는 공고만</button></div>
        <div class="frow" role="group" aria-label="지역(발주기관 기준)">${regions.map(r => `<button class="rchip" data-r="${esc(r)}" aria-pressed="${F.regions.includes(r)}">${esc(r)}</button>`).join('')}</div>
        <div class="active-chips" id="achips"></div>
      </div><div class="list" id="list" data-own-scroll><div class="empty">불러오는 중…</div></div>`;
      $('#fsort').value = F.sort;
      $('#fq').addEventListener('input', e => { F.q = e.target.value; commit(); });
      $('#fsec').addEventListener('change', e => { F.sector = e.target.value; commit(); });
      $('#fsort').addEventListener('change', e => { F.sort = e.target.value; commit(); });
      $('#ffrom').addEventListener('change', e => { F.from = e.target.value; commit(); });
      $('#fto').addEventListener('change', e => { F.to = e.target.value; commit(); });
      $('#fcond').addEventListener('change', e => { F.cond = e.target.value; commit(); });
      $('#freview').addEventListener('click', e => { F.review = !F.review; e.currentTarget.setAttribute('aria-pressed', String(F.review)); commit(); });
      $$('.seg button', listBody).forEach(b => b.addEventListener('click', () => { F.status = b.dataset.st; $$('.seg button', listBody).forEach(x => x.setAttribute('aria-pressed', String(x === b))); commit(); }));
      $$('.rchip[data-r]', listBody).forEach(b => b.addEventListener('click', () => { const r = b.dataset.r; F.regions = F.regions.includes(r) ? F.regions.filter(x => x !== r) : [...F.regions, r]; b.setAttribute('aria-pressed', String(F.regions.includes(r))); commit(); }));
      ['bmin', 'bmax'].forEach(k => $('#' + k).addEventListener('input', e => { const v = e.target.value.trim(); if (v !== '' && !/^\d*\.?\d*$/.test(v)) { e.target.classList.add('err'); return; } e.target.classList.remove('err'); F[k] = v; commit(); }));
      $('#list').addEventListener('click', onListClick);
      $('#list').addEventListener('scroll', onListScroll, { passive: true });
    }
    let res;
    try { res = await fetchDiscover(); } catch (e) { $('#list').innerHTML = `<div class="empty">공고를 불러오지 못했습니다. ${esc(e.message)}<br><button class="linkbtn" id="retryList">다시 시도</button></div>`; $('#retryList')?.addEventListener('click', () => renderList()); return; }
    if (!res || tab !== 'list') return;
    const matchable = res.scope === 'company_review';
    const optMatch = $('#fsort option[value="match"]'); optMatch.disabled = !matchable;
    optMatch.textContent = matchable ? '일치순 (회사 조건)' : '일치순 · L2 이상 로그인 필요';
    const monthErr = /공고월/.test(discErr), budgetErr = /예산/.test(discErr);
    $('#bmin').classList.toggle('err', budgetErr); $('#bmax').classList.toggle('err', budgetErr);
    $('#ffrom').classList.toggle('err', monthErr); $('#fto').classList.toggle('err', monthErr);
    const chips = [];
    if (F.q) chips.push(['q', `“${F.q}”`]); if (F.sector) chips.push(['sector', shortSector(F.sector)]);
    if (F.from || F.to) chips.push(['m', `${F.from ? monthLabel(F.from) : '처음'} ~ ${F.to ? monthLabel(F.to) : '끝'}`]);
    if (F.cond) chips.push(['cond', `‘${F.cond}’ 언급`]); if (F.review) chips.push(['review', '요건 시트 있음']);
    F.regions.forEach(r => chips.push(['r:' + r, r])); if (F.bmin !== '' || F.bmax !== '') chips.push(['b', `${F.bmin || '0'}억 이상 ~ ${F.bmax ? F.bmax + '억 미만' : '∞'}`]);
    $('#achips').innerHTML = (discErr ? `<span class="ferr">${esc(discErr)} 이 조건은 적용하지 않았습니다.</span>` : '') +
      chips.map(([k, l]) => `<span class="badge">${esc(l)}<button data-x="${esc(k)}" aria-label="${esc(l)} 조건 해제">✕</button></span>`).join('') +
      (chips.length || F.status !== F0.status || F.sort !== F0.sort ? '<button class="linkbtn" id="freset">전체 초기화</button>' : '');
    $$('#achips [data-x]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.x; if (k === 'q') F.q = ''; else if (k === 'sector') F.sector = ''; else if (k === 'b') F.bmin = F.bmax = ''; else if (k === 'm') F.from = F.to = ''; else if (k === 'cond') F.cond = ''; else if (k === 'review') F.review = false; else if (k.startsWith('r:')) F.regions = F.regions.filter(x => x !== k.slice(2)); commit(true); }));
    $('#freset')?.addEventListener('click', () => { F = { ...F0, regions: [] }; commit(true); });
    const rows = clientFilter(res.items);
    const ref = asOf(), listEl = $('#list');
    const matched = rows.filter(n => n.matches?.length).length;
    listEl.innerHTML = `<div class="list-meta"><span>${rows.length}건 · 기준일 ${esc(ref)}${ref === DEMO_ASOF ? ' (시연 기준일)' : ''}${matchable ? ` · 회사 조건 일치 <b class="mcount">${matched}</b>건` : ''}</span><span>${matchable ? '<button class="linkbtn" id="toDisc">맞춤 탐색 과정 보기</button>' : '지역은 발주기관명 기준 추정'}</span></div>` +
      (F.sort === 'match' && matchable ? `<div class="rule-note">일치 기준: ${esc(res.rules)}</div>` : '') +
      (rows.length ? rows.map(n => row(n, ref, matchable)).join('') : `<div class="empty">조건에 맞는 공고가 없습니다.<br>${F.status !== 'all' ? '모집 상태를 “전체”로 바꾸거나 ' : ''}조건을 줄여 보세요.<br><button class="linkbtn" id="emptyReset">조건 초기화</button></div>`);
    $('#emptyReset')?.addEventListener('click', () => { F = { ...F0, status: 'all', regions: [] }; commit(true); });
    $('#toDisc')?.addEventListener('click', () => showTab('discover'));
    if (restoreScroll != null) { listEl.scrollTop = restoreScroll; restoreScroll = null; }
  }
  const row = (n, ref, matchable) => {
    const d = dday(n.deadline, ref), sel = ctx?.bid === n.id, ex = exByBid.get(n.id) || 0, m = n.matches || [];
    const cls = d.kind === 'closed' ? 'closed' : d.kind === 'soon' || d.kind === 'today' ? 'soon' : d.kind === 'mid' ? 'mid' : '';
    return `<article class="nrow ${open.has(n.id) ? 'open' : ''} ${sel ? 'sel' : ''}" data-id="${esc(n.id)}">
      <div class="rtop"><button class="hd" aria-expanded="${open.has(n.id)}"><span class="dday ${cls}">${esc(d.label)}</span>
        <span class="tt"><b>${esc(n.title)}</b><span>${esc(n.agency)} · ${esc(n.region)} · ${esc(shortSector(n.sector))} · ${esc(n.month || '')}${ex ? ` · 저장 사례 ${ex}` : ''}</span>
          ${matchable && m.length ? `<span class="mtags">${m.map(x => `<i class="mtag ${x.field}">${x.field === 'region' ? '소재지' : '전문분야'} · ${esc(x.value)}</i>`).join('')}</span>` : ''}</span>
        <span class="amt">${esc(won(n.budget))}<small>${esc(fmtDate(n.deadline).slice(0, 10))}</small></span></button>${cartBtn(n.id)}</div>
      <div class="more">
        <div class="match-box"><div class="mb-col ok"><b>일치한 조건 ${m.length}</b>${m.length ? m.map(x => `<p>✓ ${esc(x.label)}<small>출처 ${esc(x.source)}</small></p>`).join('') : `<p class="none">${matchable ? '회사 전문분야 단어·소재지와 일치하는 항목이 없습니다.' : '공개 L1 범위에서는 회사 조건 대조를 하지 않습니다.'}</p>`}</div>
          <div class="mb-col unk"><b>미확인 조건 ${(n.unknowns || []).length}</b>${(n.unknowns || []).map(u => `<p>? ${esc(u)}</p>`).join('')}</div></div>
        <div class="reqs">${(n.requirements || []).filter(r => !/근거 문서/.test(r.label)).slice(0, 4).map(r => `<div><b>${esc(r.label)}</b>${esc(r.text.length > 260 ? r.text.slice(0, 260) + '…' : r.text)}</div>`).join('')}</div>
        <div class="acts"><button class="ask" data-ask="${esc(n.id)}">이 공고로 질문</button>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">나라장터 원문 ↗</a>` : ''}<span class="badge">사람 정리 요건 · 원문 확인 필요</span></div></div>
    </article>`;
  };
  function onListClick(e) {
    const cb = e.target.closest('[data-cart]'); if (cb) { toggleCart(cb.dataset.cart); return; }
    const a = e.target.closest('[data-ask]'); if (a) { selectNotice(a.dataset.ask); return; }
    const hd = e.target.closest('.hd'); if (!hd) return;
    const id = hd.closest('.nrow').dataset.id; open.has(id) ? open.delete(id) : open.add(id); saveOpen();
    hd.closest('.nrow').classList.toggle('open', open.has(id)); hd.setAttribute('aria-expanded', String(open.has(id)));
  }
  function selectNotice(id, reveal = false) {
    ctx = { bid: id }; store.set('astra_ctx', ctx); open.add(id); saveOpen();
    renderCtx(); if (!chat.length) renderChat(); else { scroll.insertAdjacentHTML('beforeend', welcome()); scroll.scrollTop = scroll.scrollHeight; }
    if (tab !== 'list') showTab('list'); else renderList();
    flash($('#chatPane')); setActive('chat');
    if (reveal) setTimeout(() => scrollInside(listBody.querySelector(`[data-id="${CSS.escape(id)}"]`), 'center'), 250);
    q.focus({ preventScroll: true });
  }
  let ct = 0;
  function commit(full = false) { store.set('astra_filters', F); restoreScroll = 0; clearTimeout(ct); ct = setTimeout(() => renderList(full), full ? 0 : 160); }
  $('#asof').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { setAsOf(e.target.value); tab === 'discover' ? renderDiscover() : renderList(); } });
  $('#today').addEventListener('click', () => { const t = todayKST(); $('#asof').value = t; setAsOf(t); tab === 'discover' ? renderDiscover() : renderList(); toast(`기준일을 오늘(${t})로 바꿨습니다. 수집 공고는 모두 마감 상태일 수 있습니다.`); });
  cleanup.push(() => { if (tab === 'list') rememberScroll(); });

  // ---------------- 맞춤 탐색 과정: 로그인 → 사용자 → 조건 → 후보 ----------------
  let discTimers = [], discResize = null;
  const clearDisc = () => { discTimers.forEach(clearTimeout); discTimers = []; discResize?.disconnect(); discResize = null; };
  cleanup.push(clearDisc);
  async function renderDiscover(skipAnim = false) {
    clearDisc();
    listBody.innerHTML = `<div class="disc" data-own-scroll>
      <div class="disc-head"><div><b>맞춤 탐색 과정</b><span>서버가 실제로 수행한 단계와 회사 조건 일치 결과입니다. AI 추천·참가 자격 판정이 아닙니다.</span></div>
        <div class="disc-btns"><button class="linkbtn" id="dReplay">다시 재생</button><button class="linkbtn" id="dSkip">건너뛰기</button><button class="linkbtn primary3d" id="dList">후보 목록 보기</button></div></div>
      <div class="disc-body"><ol class="disc-steps" id="dSteps"></ol>
      <div class="disc-stage" id="dViewport"><div class="disc-world" id="dStage"><svg class="disc-edges" id="dEdges"></svg></div></div></div>
      <p class="disc-note" id="dNote"></p></div>`;
    $('#dReplay').addEventListener('click', () => renderDiscover());
    $('#dSkip').addEventListener('click', () => renderDiscover(true));
    $('#dList').addEventListener('click', () => { F = { ...F, sort: disc?.scope === 'company_review' ? 'match' : F.sort }; store.set('astra_filters', F); restoreScroll = 0; showTab('list'); });
    let res;
    try { res = await api.discover({ date: asOf(), sort: 'match' }); }
    catch (e) { $('#dStage').innerHTML = `<div class="empty">탐색 결과를 불러오지 못했습니다. ${esc(e.message)}</div>`; return; }
    if (tab !== 'discover') return;
    disc = disc || res;
    const internal = res.scope === 'company_review', co = res.company;
    const ref = asOf();
    const cands = res.items.filter(n => n.matches.length).filter(n => { const d = dday(n.deadline, ref); return d.n != null && d.n >= 0; }).slice(0, 7);
    // 조건 노드: 서버가 반환한 일치 값 + 회사 소재지
    const condMap = new Map();
    res.items.forEach(n => n.matches.forEach(m => { const k = m.field + ':' + m.value; if (!condMap.has(k)) condMap.set(k, { k, field: m.field, value: m.value, n: 0 }); condMap.get(k).n++; }));
    let condList = [...condMap.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    const docsNode = internal ? { k: 'docs', field: 'docs', value: `허용 문서 ${res.documents.length}건`, n: null } : null;
    const lv = (user.allowed_security_levels || []).join('·');
    // 단계 목록 (서버 events + 화면 단계)
    const ev = res.events || [];
    const steps = [
      { t: '로그인 · ' + (ev[0]?.step || '서버 세션 확인'), s: ev[0]?.status || 'completed', d: `${user.employee_id} · ${lv}` },
      { t: '사용자 · ' + (ev[1]?.step || '범위 확인'), s: ev[1]?.status || 'completed', d: internal ? `${companyLabel(co.company_name)} · 문서 ${res.documents.length}건` : '공개 L1 범위' },
      { t: '조건 · 전문분야 단어 · 소재지 대조', s: internal ? 'completed' : 'skipped', d: internal ? `${(co.specialties || []).join(', ')} / ${co.region}` : '회사 자료 권한 없음' },
      { t: '후보 · ' + (ev[2]?.step || '공개 공고 조건 필터'), s: ev[2]?.status || 'completed', d: `공고 ${res.public_total}건 중 일치 ${res.items.filter(n => n.matches.length).length}건 · 모집 중 후보 ${cands.length}건` },
      { t: ev[3]?.step || '참가 자격 자동 판정', s: ev[3]?.status || 'not_run', d: '수행하지 않음 · 원문 확인 필요' },
    ];
    const SL = { completed: '완료', not_run: '미실행', skipped: '해당 없음' };
    $('#dSteps').innerHTML = steps.map((s, i) => `<li data-i="${i}" class="st-${s.s}"><i>${i + 1}</i><span><b>${esc(s.t)}</b><small>${esc(s.d)}</small></span><em>${SL[s.s] || s.s}</em></li>`).join('');
    // 그래프 배치
    let conds0 = 1;
    const stage = $('#dStage'), viewport = $('#dViewport'), W = Math.max(640, viewport.clientWidth), H = Math.max(360, Math.min(760, 80 * Math.max(cands.length, conds0 = (internal ? condList.length + 1 : 1)) + 60));
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const fitGraph = () => { const scale = Math.min(1, viewport.clientWidth / W, viewport.clientHeight / H); stage.style.transform = `translate(${(viewport.clientWidth-W*scale)/2}px, ${(viewport.clientHeight-H*scale)/2}px) scale(${scale})`; };
    discResize = new ResizeObserver(fitGraph); discResize.observe(viewport); fitGraph();
    const colX = [0.02, 0.2, 0.43, 0.68].map(f => f * W);
    const nodes = [];
    const place = (arr, col, cls) => arr.forEach((o, i) => { o.x = colX[col]; o.y = (H / (arr.length + 1)) * (i + 1); o.col = col; o.cls = cls; nodes.push(o); });
    const login = { id: 'login', title: '로그인', sub: user.employee_id }; place([login], 0, 'n-login');
    const me = { id: 'me', title: internal ? companyLabel(co.company_name) : companyLabel(user.company_name), sub: `${lv}${internal ? ` · ${co.region}` : ' · 공개 범위'}` }; place([me], 1, 'n-user');
    const conds = internal ? [...condList.map(c => ({ id: c.k, title: c.field === 'region' ? `소재지 ${c.value}` : `전문분야 “${c.value}”`, sub: `일치 공고 ${c.n}건`, cond: c })), ...(docsNode ? [{ id: 'docs', title: docsNode.value, sub: '대조 대상 · 자동 판정 없음' }] : [])]
      : [{ id: 'pub', title: '회사 조건 대조 없음', sub: 'L2 이상 로그인 시 수행' }];
    place(conds, 2, 'n-cond');
    const candNodes = cands.map(n => ({ id: 'c:' + n.id, title: n.title, sub: `${dday(n.deadline, ref).label} · ${won(n.budget)} · 일치 ${n.matches.length}`, notice: n }));
    place(candNodes.length ? candNodes : [{ id: 'none', title: internal ? '모집 중 일치 후보 없음' : '공개 공고 목록에서 탐색', sub: internal ? '기준일을 바꾸거나 목록에서 확인' : `공고 ${res.public_total}건` }], 3, 'n-cand');
    const edges = [['login', 'me']];
    conds.forEach(c => edges.push(['me', c.id]));
    candNodes.forEach(cn => cn.notice.matches.forEach(m => { const k = m.field + ':' + m.value; if (conds.some(c => c.id === k)) edges.push([k, cn.id]); }));
    if (!candNodes.length) conds.forEach(c => edges.push([c.id, nodes.at(-1).id]));
    const byId = new Map(nodes.map(n => [n.id, n]));
    stage.insertAdjacentHTML('beforeend', nodes.map(n => `<button class="dnode ${n.cls}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px" ${n.notice ? '' : 'tabindex="-1"'}><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></button>`).join(''));
    const svg = $('#dEdges'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // 노드 실제 폭을 반영해 선을 그림
    const box = id => { const el = stage.querySelector(`.dnode[data-id="${CSS.escape(id)}"]`); return { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth, y: el.offsetTop }; };
    svg.innerHTML = edges.map(([a, b], i) => { const A = box(a), B = box(b); return `<path data-col="${byId.get(b).col}" d="M${A.r},${A.y} L${B.l},${B.y}" pathLength="1"/>`; }).join('');
    const showCol = c => { $$(`.dnode`, stage).forEach(el => { if (byId.get(el.dataset.id).col <= c) el.classList.add('in'); }); $$(`path[data-col="${c}"]`, svg).forEach(p => p.classList.add('in')); };
    const showStep = i => $$('#dSteps li').forEach(li => li.classList.toggle('on', +li.dataset.i <= i));
    $('#dNote').textContent = `일치 규칙: ${res.rules} · 기준일 ${ref}${ref === DEMO_ASOF ? '(시연)' : ''}`;
    if (skipAnim || reduced()) { [0, 1, 2, 3].forEach(showCol); showStep(4); }
    else {
      const T = [[0, 0, 200], [1, 1, 900], [2, 2, 1700], [3, 3, 2600], [null, 4, 3300]];
      T.forEach(([c, s, t]) => discTimers.push(setTimeout(() => { if (c != null) showCol(c); showStep(s); }, t)));
    }
    stage.addEventListener('click', e => { const b = e.target.closest('.dnode'); const n = b && byId.get(b.dataset.id); if (n?.notice) selectNotice(n.notice.id, true); });
    stage.addEventListener('mouseover', e => { const b = e.target.closest('.dnode'); $$('path', svg).forEach(p => p.classList.remove('hi')); if (!b) return; const id = b.dataset.id; edges.forEach(([a, c], i) => { if (a === id || c === id) svg.children[i].classList.add('hi'); }); });
  }

  async function renderCompany() {
    listBody.innerHTML = `<div class="list docs" data-own-scroll><div class="empty">불러오는 중…</div></div>`;
    try {
      state.docs = (await api.documents()).items;
      const docs = state.docs;
      listBody.querySelector('.docs').innerHTML = `<div class="list-meta"><span>${esc(companyLabel(user.company_name))} · 현재 권한(${esc(user.allowed_security_levels.join('·'))})으로 열람 가능한 자료 ${docs.length}건</span></div>` +
        (docs.length ? docs.map(d => `<div class="doc"><button class="linkbtn" data-doc="${esc(d.document_id)}">원문 보기</button><span class="lv ${esc(d.security_level)}">${esc(d.security_level)}</span><span style="flex:1;min-width:0">${esc(companyLabel(d.title))}<br><small style="color:var(--d-muted)">${esc(d.kind)} · v${esc(d.document_version)} · 검토 ${d.human_approval === 'pending' ? '대기' : esc(d.human_approval)} · 색인 ${d.index_status === 'not_indexed' ? '미색인' : esc(d.index_status)}</small></span></div>`).join('') : '<div class="empty">열람 가능한 회사 자료가 없습니다.</div>') +
        `<p style="font-size:12px;color:var(--d-muted);padding:4px">합성(가상) 회사 자료입니다. 원문 보기는 현재 계정의 회사·보안등급 권한을 다시 확인합니다.</p>`;
    } catch (e) { listBody.querySelector('.docs').innerHTML = `<div class="empty">${e.status === 401 ? '로그인이 필요합니다.' : '자료를 불러오지 못했습니다.'}</div>`; }
  }

  listBody.addEventListener('click', async e => {
    const button = e.target.closest('[data-doc]'); if (!button) return;
    try { const d = await api.document(button.dataset.doc); showDataDialog(companyLabel(d.metadata.title), `<p>${esc(d.metadata.security_level)} · 합성 회사 자료</p><article class="document-content">${documentHTML(d.text)}</article>`); } catch(e) { toast(e.message); }
  });
  function showDataDialog(title, body) {
    const dialog = document.createElement('dialog'); dialog.className = 'astra-data-dialog';
    dialog.innerHTML = `<header><h2>${esc(title)}</h2><button aria-label="닫기">✕</button></header><div class="document-scroll" data-own-scroll>${body}</div>`;
    document.body.append(dialog); dialog.querySelector('header button').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), {once:true}); dialog.showModal();
  }
  cleanup.push(() => document.querySelectorAll('.astra-data-dialog').forEach(d => d.remove()));

  // 마이페이지 — 마이페이지.png 레퍼런스(부드러운 뉴모피즘): 프로필 · 이름 · 회사 · 권한 · 회사문서
  const ROLE_KO = { bid_analyst: '입찰 분석 담당', bid_approver: '입찰 승인 담당', cost_analyst: '원가 분석 담당' };
  const KIND_KO = { certification: '인증', performance: '실적', company_profile: '기업 현황', personnel: '인력', cost: '원가·마진' };
  const LV_KO = { L1: '공개', L2: '자사 L2', L3: '자사 L3' };
  // 마이페이지 표시용 프로필(시연). 서버 계정 데이터에는 이름·부서가 없다.
  const prof = {name:user.display_name || user.name || '', team:ROLE_KO[user.role] || (user.role === 'viewer' ? '공개 공고 조회자' : user.role)};
  async function openSettings() {
    closeMyPage();
    const back = document.createElement('div'); back.className = 'mp-back';
    const p = document.createElement('aside'); p.className = 'mypage'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', '마이페이지');
    const lv = user.allowed_security_levels || [];
    p.innerHTML = `<div class="mp-top"><span class="mp-title">마이페이지</span><button class="mp-x" id="mpX" aria-label="닫기">✕</button></div>
      <section class="mp-profile">
        <div class="mp-avatar"><div class="mp-avatar-in"><span>${esc(user.company_code)}</span></div></div>
        <div class="mp-name">${esc(prof.name || '이름 미등록')}</div>
        <div class="mp-sub">ID : ${esc(user.employee_id)}</div>
      </section>
      <dl class="mp-info">
        <div><dt>이름</dt><dd>${esc(prof.name || '미등록')}<small>${esc(prof.team || '시연 계정에는 이름 정보가 없습니다')}</small></dd></div>
        <div><dt>회사</dt><dd>${esc(companyLabel(user.company_name))}<small>회사 ID : ${esc(user.company_code)}</small></dd></div>
        <div><dt>권한</dt><dd class="mp-levels">${['L1', 'L2', 'L3'].map(l => `<span class="mp-lv mp-lv-${l} ${lv.includes(l) ? 'on' : ''}">${l}<i>${LV_KO[l]}</i></span>`).join('')}</dd></div>
      </dl>
      <section class="mp-actions"><button class="linkbtn" id="personalHistory">최근 질문</button> ${user.can_compare ? '<button class="linkbtn" id="accessCompare">권한별 비교</button>' : ''}</section><section class="mp-docs"><h4>회사문서 <span id="mpCount"></span></h4><ul id="mpDocs"><li class="mp-empty">불러오는 중…</li></ul></section>`;
    document.body.append(back, p);
    p.querySelector('#personalHistory').onclick = async () => {
      try {
        personal = await api.personal();
        showDataDialog('최근 질문', personal.history.map(h => `<article><button class="linkbtn" data-history-case="${esc(h.case_id || '')}">${esc(h.question)}</button></article>`).join('') || '<p>저장된 질문이 없습니다.</p>');
        document.querySelectorAll('[data-history-case]').forEach(b => b.onclick = () => {if(b.dataset.historyCase) {document.querySelector('.astra-data-dialog').close();closeMyPage();chat.push({t:'a',caseId:b.dataset.historyCase});saveChat();renderChat(true);}});
      } catch(e) {toast(e.message);}
    };
    p.querySelector('#accessCompare')?.addEventListener('click', async () => {
      try { const d = await api.comparison(); showDataDialog('권한별 비교', `<h3>${esc(d.question)}</h3><p>시연용 작성 답변</p>` + d.variants.map(v => `<article><h3>${esc(v.level)}</h3><pre>${esc(v.answer)}</pre></article>`).join('')); } catch(e) {toast(e.message);}
    });
    requestAnimationFrame(() => { back.classList.add('on'); p.classList.add('on'); });
    const prev = document.activeElement; p.querySelector('#mpX').focus();
    const close = () => { closeMyPage(); prev?.focus?.(); setActive(view === 'cart' ? 'cart' : 'chat'); };
    p.querySelector('#mpX').addEventListener('click', close); back.addEventListener('click', close);
    p.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const ul = p.querySelector('#mpDocs');
    try {
      const res = await api.documents();
      if (res.preview) { ul.innerHTML = '<li class="mp-empty">미리보기 버전에는 회사 내부 문서를 넣지 않았습니다.</li>'; return; }
      const docs = state.docs = state.docs || res.items;
      p.querySelector('#mpCount').textContent = `${docs.length}건`;
      ul.innerHTML = docs.length ? docs.map((d, i) => `<li><span class="mp-ic lv-${esc(d.security_level)}">${esc((KIND_KO[d.kind] || d.kind || '문서').slice(0, 2))}</span>
        <span class="mp-dt"><b>${esc(companyLabel(d.title))}</b><small>${esc(KIND_KO[d.kind] || d.kind)} · v${esc(d.document_version)} · 검토 ${d.human_approval === 'pending' ? '대기' : esc(d.human_approval)}</small></span>
        <span class="mp-lvb lv-${esc(d.security_level)}">${esc(d.security_level)}</span></li>`).join('') : '<li class="mp-empty">현재 권한으로 볼 수 있는 회사 문서가 없습니다.</li>';
    } catch (e) { ul.innerHTML = `<li class="mp-empty">${e.status === 401 ? '로그인이 필요합니다.' : '문서를 불러오지 못했습니다.'}</li>`; }
  }
  function closeMyPage() {
    const p = document.querySelector('.mypage'), b = document.querySelector('.mp-back');
    if (!p) return; p.classList.remove('on'); b?.classList.remove('on');
    setTimeout(() => { p.remove(); b?.remove(); }, 380);
  }
  cleanup.push(() => { document.querySelector('.mypage')?.remove(); document.querySelector('.mp-back')?.remove(); });


  // 초기 렌더
  renderCtx(); renderChat(); showTab(tab);
  // 다른 탭에서 로그아웃하면 다시 확인
  const onFocus = async () => { const u = await refreshSession(); if (!u || u.employee_id !== user.employee_id) { clearPrivate(); go('#/login'); } };
  addEventListener('focus', onFocus); cleanup.push(() => removeEventListener('focus', onFocus));
  // ---------------- 장바구니 ----------------
  // 담은 공고는 이 브라우저에 사용자별로 저장(공개 공고 번호만 저장)
  function cartBtn(id) {
    const on = inCart(id);
    return `<button class="cartbtn ${on ? 'on' : ''}" data-cart="${esc(id)}" aria-pressed="${on}" title="${on ? '장바구니에서 빼기' : '장바구니에 담기'}">${icons.cart}<span>${on ? '담김' : '바구니 담기'}</span></button>`;
  }
  async function toggleCart(id) {
    if (cartBusy) return;
    const on = inCart(id);
    cartBusy = true;
    try { personal = await api.savePersonal({action:'favorite',id}); cart = personal.favorites.map(id => ({id})); }
    catch (e) { toast(e.message); return; }
    finally { cartBusy = false; }
    document.querySelectorAll(`.cartbtn[data-cart="${CSS.escape(id)}"]`).forEach(b => { b.outerHTML = cartBtn(id); });
    if (!on) document.querySelector(`.cartbtn[data-cart="${CSS.escape(id)}"]`)?.classList.add('cpop');
    toast(on ? '장바구니에서 뺐습니다.' : '장바구니에 담았습니다.');
    if (view === 'cart') renderCart();
  }
  function renderCart() {
    const ref = asOf();
    const items = cart.map(x => byId.get(x.id)).filter(Boolean);
    $('#cvSub').textContent = `담은 공고 ${items.length}건 · 기준일 ${ref}`;
    $('#cvBody').innerHTML = items.length ? `<div class="cv-list">${items.map(n => {
      const d = dday(n.deadline, ref), cls = d.kind === 'closed' ? 'closed' : d.kind === 'soon' || d.kind === 'today' ? 'soon' : d.kind === 'mid' ? 'mid' : '';
      return `<article class="cv-item"><span class="dday ${cls}">${esc(d.label)}</span>
        <div class="tt"><b>${esc(n.title)}</b><span>${esc(n.agency)} · ${esc(n.region)} · ${esc(shortSector(n.sector))}</span></div>
        <span class="amt">${esc(won(n.budget))}<small>${esc(fmtDate(n.deadline).slice(0, 10))}</small></span>
        <button class="cv-rm" data-rm="${esc(n.id)}" aria-label="장바구니에서 빼기" title="빼기">✕</button></article>`; }).join('')}</div>`
      : `<div class="cv-empty"><span class="cv-ic big">${icons.cart}</span><b>아직 담은 공고가 없습니다</b><p>공고 목록에서 <em>바구니 담기</em>를 눌러 관심 공고를 모아 보세요.</p></div>`;
  }
  function setView(v) {
    view = v === 'cart' ? 'cart' : 'main'; store.set('astra_view', view);
    const c = view === 'cart';
    $('.shell').classList.toggle('is-cart', c);
    $('#main').style.display = c ? 'none' : ''; $('#cartView').style.display = c ? '' : 'none';
    if (c) renderCart(); else applyRatio(ratio);
  }
  $('#cvBody').addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) toggleCart(r.dataset.rm); });
  $('#cvBack').addEventListener('click', () => { setView('main'); setActive('list'); showTab('list'); flash($('#listPane')); });
  if (view === 'cart') { setView('cart'); setActive('cart', false); }

  return () => { cleanup.forEach(f => f()); cancelAnimationFrame(sraf); };
}

// 요소가 보이도록 '자기 스크롤 영역' 안에서만 움직인다(화면 틀·창은 고정)
function scrollInside(el, block = 'nearest') {
  if (!el) return;
  const box = el.parentElement && el.parentElement.closest('[data-own-scroll]'); if (!box) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  let top = box.scrollTop;
  if (block === 'center') top += (r.top - b.top) - (b.height - r.height) / 2;
  else if (r.top < b.top) top += r.top - b.top - 8;
  else if (r.bottom > b.bottom) top += r.bottom - b.bottom + 8;
  box.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
}
