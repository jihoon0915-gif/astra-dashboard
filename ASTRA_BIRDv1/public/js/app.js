// APP — 얇은 고정 사이드바 + 크기 조절 두 창(왼쪽: LLM 질문 · 오른쪽: 조건 필터 공고)
// 본 화면은 이후 보충·재구축 예정. 현재는 기존 서버 API(저장 답변 재생 · 권한별 문서)만 사용한다.
import { $, $$, api, state, esc, won, dday, fmtDate, shortSector, asOf, setAsOf, todayKST, DEMO_ASOF, store, go, sleep, reduced, toast, refreshSession, clearPrivate, icons } from './core.js';

const NAV = [
  { k: 'home', label: '홈', color: '#D7F04C', icon: icons.home },
  { k: 'chat', label: '질문', color: '#FF9A3C', icon: icons.chat },
  { k: 'list', label: '공고', color: '#FF4F8B', icon: icons.list },
  { k: 'company', label: '내 회사', color: '#4AE1FF', icon: icons.building },
  { k: 'settings', label: '설정', color: '#B28CFF', icon: icons.sliders },
];
const SRC_LABEL = { saved_public: '저장 공개 사례', curated_replay: '선별 저장 답변', editorial_example: '편집 예시' };
const DET_LABEL = { human_draft: '표시: 사람 작성 초안', stored_prediction: '탐지: 저장된 예측 결과', not_run: '탐지 미실행' };

export async function renderApp(root) {
  const user = await refreshSession();
  if (!user) { store.set('astra_return', '#/app'); go('#/login'); return; }
  document.body.classList.remove('is-dark');
  // 필요한 데이터가 없으면(새로고침 등) 다시 불러온다 — 항상 현재 세션 권한 기준
  try {
    if (!state.boot) state.boot = await api.bootstrap();
    if (!state.examples) state.examples = (await api.examples()).items;
  } catch (e) { toast('데이터를 불러오지 못했습니다: ' + e.message); }
  const notices = state.boot?.notices || [];
  const examples = state.examples || [];
  const exByBid = new Map();
  examples.forEach(x => (x.bids || []).forEach(b => exByBid.set(b, (exByBid.get(b) || 0) + 1)));

  root.innerHTML = `<div class="shell view">
    <aside class="side" aria-label="주 메뉴">
      <svg class="bar" id="sideBar" aria-hidden="true"><defs><linearGradient id="sideFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1B1826"/><stop offset="1" stop-color="#15121E"/></linearGradient></defs><path id="sidePath" fill="url(#sideFill)" stroke="rgba(255,255,255,.16)" stroke-width="1.2"/></svg>
      <div class="logo" title="ASTRA">${icons.brand.replace('<svg', '<svg width="30" height="18"')}</div>
      <span class="glow" id="sGlow"></span>
      <nav>${NAV.map(n => `<button class="item" data-k="${n.k}" aria-label="${n.label}" title="${n.label}">${n.icon}</button>`).join('')}</nav>
      <span class="bubble" id="bubble"></span><span class="blabel" id="blabel"></span>
      <div class="foot"><span class="avatar" title="${esc(user.company_name)} · ${esc(user.employee_id)}">${esc(user.company_code)}</span>
        <button class="out" id="logout" aria-label="로그아웃" title="로그아웃">${icons.logout}</button></div>
    </aside>
    <div class="main" id="main">
      <section class="pane" id="chatPane" aria-label="질문 창">
        <div class="pane-head"><h2>ASTRA Assistant <span class="badge warn">생성 모델 미연결 · 저장 답변 재생</span></h2>
          <button class="linkbtn" id="newChat">새 대화</button></div>
        <div class="chat-scroll" id="chatScroll" data-own-scroll></div>
        <div class="composer">
          <div class="ctx" id="ctx"></div>
          <form class="box" id="ask"><textarea id="q" rows="1" placeholder="공고에 대해 질문하세요 · 저장된 사례가 있는 질문만 답변을 재생합니다" aria-label="질문 입력"></textarea>
          <button class="send" id="send" type="submit" aria-label="보내기" disabled>${icons.send}</button></form>
        </div>
      </section>
      <div class="divider" id="divider" role="separator" aria-orientation="vertical" aria-label="창 크기 조절 (좌우 화살표, Home 키로 초기화)" tabindex="0" aria-valuemin="25" aria-valuemax="75"><i></i><span class="ratio" id="ratio"></span></div>
      <section class="pane" id="listPane" style="flex:1" aria-label="조건 필터 공고 창">
        <div class="pane-head">
          <div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-t="list">조건 필터 공고</button><button role="tab" aria-selected="false" data-t="company">내 회사 자료</button></div>
          <label class="asof">기준일 <input type="date" id="asof" value="${esc(asOf())}"><button class="linkbtn" id="today" type="button">오늘</button></label>
        </div>
        <div id="listBody" style="display:flex;flex-direction:column;min-height:0;flex:1"></div>
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
    y0 = cy; ty = y; if (reduced()) { cy = ty; shape(cy); travel(); return; }
    cancelAnimationFrame(sraf);
    const step = () => { const f = (ty - cy) * .12; vy = vy * .74 + f; cy += vy; shape(cy); travel(); if (Math.abs(ty - cy) > .3 || Math.abs(vy) > .3) sraf = requestAnimationFrame(step); else { cy = ty; shape(cy); travel(); settle(); } };
    sraf = requestAnimationFrame(step);
  };
  let settle = () => { };
  const setActive = (k, animate = true) => {
    const n = NAV.find(x => x.k === k); if (!n) return; active = k;
    const btn = side.querySelector(`[data-k="${k}"]`);
    $$('.side .item').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-current', b === btn ? 'page' : 'false'); });
    const y = btn.offsetTop + btn.offsetHeight / 2 + btn.parentElement.offsetTop;
    fromColor = getComputedStyle(side).getPropertyValue('--bc').trim() || n.color; if (!/^#[0-9a-f]{6}$/i.test(fromColor)) fromColor = n.color; toColor = n.color;
    blabel.classList.remove('show'); blabel.textContent = n.label;
    settle = () => { side.style.setProperty('--bc', n.color); showIcon(n.icon, true); blabel.classList.add('show'); $$('.side .item').forEach(b => b.classList.remove('under')); };
    if (animate && Math.abs(y - cy) > 1) springTo(y); else { cy = ty = y; shape(y); settle(); }
  };
  const sizeBar = () => { const sv = $('#sideBar'); sv.setAttribute('viewBox', `0 0 76 ${side.clientHeight}`); shape(cy); };
  addEventListener('resize', sizeBar); cleanup.push(() => removeEventListener('resize', sizeBar));
  sizeBar(); setActive('chat', false);
  const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); };
  side.addEventListener('click', e => {
    const b = e.target.closest('.item'); if (!b) return;
    const k = b.dataset.k; setActive(k);
    if (k === 'home') setTimeout(() => go('#/'), 380);
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
  let chat = store.get('astra_chat', []);           // [{t:'u'|'a'|'sys', text, caseId}]
  const scroll = $('#chatScroll'), q = $('#q'), send = $('#send');
  const saveChat = () => store.set('astra_chat', chat.slice(-40));
  const exFor = () => ctx ? examples.filter(x => (x.bids || []).includes(ctx.bid)) : examples;

  const renderCtx = () => {
    const n = ctx && byId.get(ctx.bid);
    $('#ctx').innerHTML = n ? `<span class="badge blue">선택 공고 · ${esc(n.title.slice(0, 34))}${n.title.length > 34 ? '…' : ''}<button aria-label="공고 선택 해제" id="ctxX">✕</button></span>` : '<span>공고를 선택하지 않았습니다 · 오른쪽 목록에서 “이 공고로 질문”을 누르세요</span>';
    $('#ctxX')?.addEventListener('click', () => { ctx = null; store.set('astra_ctx', null); renderCtx(); renderChat(); renderList(); });
  };
  const welcome = () => {
    const list = exFor();
    const n = ctx && byId.get(ctx.bid);
    return `<div class="welcome"><h3>${n ? '이 공고에 대해 물어보세요' : `${esc(user.company_name)}, 무엇을 확인할까요?`}</h3>
      <p>${n ? `“${esc(n.title)}”에 연결된 저장 사례 ${list.length}건입니다.` : `현재 권한(${esc(user.allowed_security_levels.join('·'))})으로 열람 가능한 저장 사례 ${list.length}건 중 일부입니다.`} 답변은 새로 생성하지 않고 저장된 결과를 근거와 함께 재생합니다.</p>
      <div class="ex-list">${list.slice(0, 7).map(x => `<button class="ex" data-case="${esc(x.id)}"><span class="k">${esc((SRC_LABEL[x.source] || x.source).replace('저장 ', ''))}</span><span>${esc(x.question)}</span></button>`).join('') || '<div class="empty">이 공고에 연결된 저장 사례가 없습니다.</div>'}</div></div>`;
  };
  const md = (raw, spans = []) => {
    let s = raw;
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
    const badges = [`<span class="badge">${esc(SRC_LABEL[c.source] || c.source)} 재생</span>`];
    if (c.human_approval === 'pending' || c.review_status === 'draft') badges.push('<span class="badge warn">사람 검토 대기</span>');
    if (DET_LABEL[c.detection_kind]) badges.push(`<span class="badge ${c.spans?.length ? 'bad' : ''}">${DET_LABEL[c.detection_kind]}${c.spans?.length ? ` · ${c.spans.length}곳` : ''}</span>`);
    if (c.integrity?.answer_hash && c.integrity?.spans) badges.push('<span class="badge ok">답변 해시 일치</span>');
    (c.levels || []).forEach(l => badges.push(`<span class="badge blue">${esc(l)}</span>`));
    const ctxs = c.contexts || [];
    return `<div class="who"><span class="ava">A</span>${badges.join('')}</div>
      <div class="text">${md(c.answer || '', c.spans || [])}</div>
      ${c.label ? `<div class="badge" style="margin-top:6px">${esc(c.label)}</div>` : ''}
      ${ctxs.length ? `<div class="srcs">${ctxs.map((x, i) => `<details class="src" data-n="${x.citation || i + 1}"><summary><span class="n">[${x.citation || i + 1}]</span><span class="fn">${esc(x.filename || x.title || x.document_id)}</span><span class="badge ${x.security_level === 'L1' ? '' : 'blue'}">${esc(x.security_level || '')}</span></summary><div class="ex-body">${esc(x.text || '')}${x.text_start != null ? `\n\n— 위치: ${x.text_start}–${x.text_end} (문자 오프셋)` : ''}</div></details>`).join('')}</div>` : '<div class="badge" style="margin-top:8px">연결된 근거 원문 없음</div>'}
      <div class="foot"><button data-copy>복사</button>${(c.bids || []).length === 1 && byId.has(c.bids[0]) ? `<button data-open="${esc(c.bids[0])}">공고 보기</button>` : ''}</div>`;
  };
  const cache = new Map();
  const getCase = async id => { if (!cache.has(id)) cache.set(id, await api.caseById(id)); return cache.get(id); };
  async function renderChat() {
    if (!chat.length) { scroll.innerHTML = welcome(); return; }
    let html = '';
    for (const m of chat) {
      if (m.t === 'u') html += `<div class="msg-u"><div>${esc(m.text)}</div></div>`;
      else if (m.t === 'sys') html += `<div class="msg-a"><div class="who"><span class="ava">A</span><span class="badge warn">생성 모델 미연결</span></div><div class="text"><p>${m.html}</p></div></div>`;
      else {
        try { const c = await getCase(m.caseId); html += `<div class="msg-a" data-case="${esc(c.id)}">${answerHTML(c)}</div>`; }
        catch (e) { html += `<div class="msg-a"><div class="who"><span class="ava">A</span><span class="badge bad">${e.status === 403 ? '현재 권한으로 열 수 없음' : '불러오기 실패'}</span></div></div>`; }
      }
    }
    html += `<div style="margin:6px 0 4px"><button class="linkbtn" id="moreEx">예시 질문 다시 보기</button></div>`;
    scroll.innerHTML = html;
    scroll.scrollTop = scroll.scrollHeight;
  }
  async function askCase(id) {
    const x = examples.find(e => e.id === id); if (!x) return;
    chat.push({ t: 'u', text: x.question }); saveChat();
    await renderChat();
    const tmp = document.createElement('div'); tmp.className = 'msg-a'; tmp.innerHTML = `<div class="who"><span class="ava">A</span><span class="badge">저장 답변 불러오는 중</span></div><span class="typing"><i></i><i></i><i></i></span>`;
    scroll.querySelector('#moreEx')?.parentElement.before(tmp); scroll.scrollTop = scroll.scrollHeight;
    try { await Promise.all([getCase(id), sleep(reduced() ? 0 : 360)]); chat.push({ t: 'a', caseId: id }); }
    catch (e) { chat.push({ t: 'sys', html: esc(e.status === 403 ? '현재 권한으로는 이 사례를 열 수 없습니다.' : '사례를 불러오지 못했습니다.') }); }
    saveChat(); renderChat();
  }
  function freeAsk(text) {
    chat.push({ t: 'u', text });
    const toks = text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 2);
    const scored = exFor().map(x => ({ x, s: toks.reduce((a, w) => a + (x.question.includes(w) ? 1 : 0), 0) })).filter(o => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
    chat.push({ t: 'sys', html: `생성 모델이 아직 연결되지 않아 새 답변을 만들지 않습니다.${scored.length ? ' 비슷한 저장 사례를 골라 보세요:</p><div class="ex-list">' + scored.map(o => `<button class="ex" data-case="${esc(o.x.id)}"><span class="k">유사</span><span>${esc(o.x.question)}</span></button>`).join('') + '</div><p style="display:none">' : ' 아래 “예시 질문 다시 보기”에서 저장 사례를 선택해 주세요.'}` });
    saveChat(); renderChat();
  }
  scroll.addEventListener('click', e => {
    const ex = e.target.closest('.ex'); if (ex) return askCase(ex.dataset.case);
    if (e.target.id === 'moreEx') { scroll.insertAdjacentHTML('beforeend', welcome()); scroll.scrollTop = scroll.scrollHeight; return; }
    const ct = e.target.closest('.cite');
    if (ct) {
      const msg = ct.closest('.msg-a'); const d = msg?.querySelector(`.src[data-n="${ct.dataset.n}"]`);
      msg.querySelectorAll('.cite.on,.src.on').forEach(x => x.classList.remove('on'));
      ct.classList.add('on');
      if (d) { d.open = true; d.classList.add('on'); d.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }
      else toast('이 번호에 연결된 근거 원문이 없습니다 (연결 미확인).');
      return;
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) { const t = cp.closest('.msg-a').querySelector('.text').innerText; navigator.clipboard?.writeText(t).then(() => toast('답변을 복사했습니다.'), () => toast('복사할 수 없습니다.')); return; }
    const op = e.target.closest('[data-open]');
    if (op) { selectNotice(op.dataset.open, true); }
  });
  q.addEventListener('input', () => { send.disabled = !q.value.trim(); q.style.height = 'auto'; q.style.height = Math.min(160, q.scrollHeight) + 'px'; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#ask').requestSubmit(); } });
  $('#ask').addEventListener('submit', e => { e.preventDefault(); const v = q.value.trim(); if (!v) return; q.value = ''; q.dispatchEvent(new Event('input')); const hit = exFor().find(x => x.question === v); hit ? askCase(hit.id) : freeAsk(v); });
  $('#newChat').addEventListener('click', () => { chat = []; saveChat(); renderChat(); });

  // ---------------- 조건 필터 공고 ----------------
  const F0 = { q: '', sector: '', regions: [], bmin: '', bmax: '', status: 'open', sort: 'deadline' };
  let F = { ...F0, ...store.get('astra_filters', {}) };
  const open = new Set();
  const regions = [...new Set(notices.map(n => n.region))].sort((a, b) => a === '지역 미확인' ? 1 : b === '지역 미확인' ? -1 : a.localeCompare(b, 'ko'));
  const sectors = [...new Set(notices.map(n => n.sector))].sort();
  let tab = 'list';
  function showTab(t) { tab = t; $$('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t))); t === 'list' ? renderList(true) : renderCompany(); }
  $$('.tabs [role=tab]').forEach(b => b.addEventListener('click', () => { showTab(b.dataset.t); setActive(b.dataset.t === 'list' ? 'list' : 'company'); }));
  const listBody = $('#listBody');

  function filtered() {
    const ref = asOf();
    const mn = F.bmin === '' ? null : +F.bmin * 1e8, mx = F.bmax === '' ? null : +F.bmax * 1e8;
    let r = notices.filter(n => {
      if (F.q && !(`${n.title} ${n.agency}`.toLowerCase().includes(F.q.toLowerCase()))) return false;
      if (F.sector && n.sector !== F.sector) return false;
      if (F.regions.length && !F.regions.includes(n.region)) return false;
      if (mn != null && !(n.budget >= mn)) return false;
      if (mx != null && !(n.budget <= mx)) return false;
      const d = dday(n.deadline, ref);
      if (F.status === 'open' && !(d.n != null && d.n >= 0)) return false;
      if (F.status === 'd10' && !(d.n != null && d.n >= 0 && d.n <= 10)) return false;
      if (F.status === 'closed' && d.kind !== 'closed') return false;
      return true;
    });
    const key = { deadline: (a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'), budget: (a, b) => (b.budget || 0) - (a.budget || 0), recent: (a, b) => (b.month || '').localeCompare(a.month || '') || b.id.localeCompare(a.id) }[F.sort];
    return r.sort(key);
  }
  function budgetErr() { return F.bmin !== '' && F.bmax !== '' && +F.bmin > +F.bmax; }
  function renderList(full = false) {
    if (tab !== 'list') return;
    if (full || !listBody.querySelector('.filters')) {
      listBody.innerHTML = `<div class="filters">
        <div class="frow"><input class="inp search" id="fq" placeholder="공고명 · 기관 검색" value="${esc(F.q)}" aria-label="키워드">
          <select class="inp" id="fsec" aria-label="분야"><option value="">전체 분야</option>${sectors.map(s => `<option ${F.sector === s ? 'selected' : ''} value="${esc(s)}">${esc(shortSector(s))}</option>`).join('')}</select>
          <select class="inp" id="fsort" aria-label="정렬"><option value="deadline">마감 빠른 순</option><option value="budget">예산 큰 순</option><option value="recent">최근 공고 순</option></select></div>
        <div class="frow"><div class="seg" role="group" aria-label="모집 상태">${[['all', '전체'], ['open', '모집 중'], ['d10', 'D-10'], ['closed', '마감']].map(([k, l]) => `<button data-st="${k}" aria-pressed="${F.status === k}">${l}</button>`).join('')}</div>
          <div class="budget"><span>예산(억원)</span><input class="inp" id="bmin" inputmode="decimal" placeholder="최소" value="${esc(F.bmin)}" aria-label="최소 예산 억원"><span>~</span><input class="inp" id="bmax" inputmode="decimal" placeholder="최대" value="${esc(F.bmax)}" aria-label="최대 예산 억원"></div></div>
        <div class="frow" role="group" aria-label="지역(발주기관 기준)">${regions.map(r => `<button class="rchip" data-r="${esc(r)}" aria-pressed="${F.regions.includes(r)}">${esc(r)}</button>`).join('')}</div>
        <div class="active-chips" id="achips"></div>
      </div><div class="list" id="list" data-own-scroll></div>`;
      $('#fsort').value = F.sort;
      $('#fq').addEventListener('input', e => { F.q = e.target.value; commit(); });
      $('#fsec').addEventListener('change', e => { F.sector = e.target.value; commit(); });
      $('#fsort').addEventListener('change', e => { F.sort = e.target.value; commit(); });
      $$('.seg button', listBody).forEach(b => b.addEventListener('click', () => { F.status = b.dataset.st; $$('.seg button', listBody).forEach(x => x.setAttribute('aria-pressed', String(x === b))); commit(); }));
      $$('.rchip', listBody).forEach(b => b.addEventListener('click', () => { const r = b.dataset.r; F.regions = F.regions.includes(r) ? F.regions.filter(x => x !== r) : [...F.regions, r]; b.setAttribute('aria-pressed', String(F.regions.includes(r))); commit(); }));
      ['bmin', 'bmax'].forEach(k => $('#' + k).addEventListener('input', e => { const v = e.target.value.trim(); if (v !== '' && !/^\d*\.?\d*$/.test(v)) { e.target.classList.add('err'); return; } F[k] = v; commit(); }));
      $('#list').addEventListener('click', onListClick);
    }
    const err = budgetErr();
    $('#bmin').classList.toggle('err', err); $('#bmax').classList.toggle('err', err);
    const chips = [];
    if (F.q) chips.push(['q', `“${F.q}”`]); if (F.sector) chips.push(['sector', shortSector(F.sector)]);
    F.regions.forEach(r => chips.push(['r:' + r, r])); if (F.bmin !== '' || F.bmax !== '') chips.push(['b', `${F.bmin || '0'}~${F.bmax || '∞'}억`]);
    $('#achips').innerHTML = (err ? '<span class="ferr">최소 예산이 최대 예산보다 큽니다. 예산 조건은 적용하지 않았습니다.</span>' : '') +
      chips.map(([k, l]) => `<span class="badge">${esc(l)}<button data-x="${esc(k)}" aria-label="${esc(l)} 조건 해제">✕</button></span>`).join('') +
      (chips.length || F.status !== F0.status ? '<button class="linkbtn" id="freset">전체 초기화</button>' : '');
    $$('#achips [data-x]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.x; if (k === 'q') F.q = ''; else if (k === 'sector') F.sector = ''; else if (k === 'b') F.bmin = F.bmax = ''; else if (k.startsWith('r:')) F.regions = F.regions.filter(x => x !== k.slice(2)); commit(true); }));
    $('#freset')?.addEventListener('click', () => { F = { ...F0, regions: [] }; commit(true); });
    const saved = { ...F }; if (err) { F = { ...F, bmin: '', bmax: '' }; }
    const rows = filtered(); F = saved;
    const ref = asOf();
    $('#list').innerHTML = `<div class="list-meta"><span>${rows.length}건 · 기준일 ${esc(ref)}${ref === DEMO_ASOF ? ' (시연 기준일)' : ''}</span><span>지역은 발주기관명 기준 추정</span></div>` +
      (rows.length ? rows.map(n => row(n, ref)).join('') : `<div class="empty">조건에 맞는 공고가 없습니다.<br>${F.status !== 'all' ? '모집 상태를 “전체”로 바꾸거나 ' : ''}조건을 줄여 보세요.<br><button class="linkbtn" id="emptyReset">조건 초기화</button></div>`);
    $('#emptyReset')?.addEventListener('click', () => { F = { ...F0, status: 'all', regions: [] }; commit(true); });
  }
  const row = (n, ref) => {
    const d = dday(n.deadline, ref), sel = ctx?.bid === n.id, ex = exByBid.get(n.id) || 0;
    const cls = d.kind === 'closed' ? 'closed' : d.kind === 'soon' || d.kind === 'today' ? 'soon' : d.kind === 'mid' ? 'mid' : '';
    return `<article class="nrow ${open.has(n.id) ? 'open' : ''} ${sel ? 'sel' : ''}" data-id="${esc(n.id)}">
      <button class="hd" aria-expanded="${open.has(n.id)}"><span class="dday ${cls}">${esc(d.label)}</span>
        <span class="tt"><b>${esc(n.title)}</b><span>${esc(n.agency)} · ${esc(n.region)} · ${esc(shortSector(n.sector))}${ex ? ` · 저장 사례 ${ex}` : ''}</span></span>
        <span class="amt">${esc(won(n.budget))}<small>${esc(fmtDate(n.deadline).slice(0, 10))}</small></span></button>
      <div class="more"><div class="reqs">${(n.requirements || []).filter(r => !/근거 문서/.test(r.label)).slice(0, 4).map(r => `<div><b>${esc(r.label)}</b>${esc(r.text.length > 260 ? r.text.slice(0, 260) + '…' : r.text)}</div>`).join('')}</div>
        <div class="acts"><button class="ask" data-ask="${esc(n.id)}">이 공고로 질문</button>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">나라장터 원문 ↗</a>` : ''}<span class="badge">사람 정리 요건 · 원문 확인 필요</span></div></div>
    </article>`;
  };
  function onListClick(e) {
    const a = e.target.closest('[data-ask]'); if (a) { selectNotice(a.dataset.ask); return; }
    const hd = e.target.closest('.hd'); if (!hd) return;
    const id = hd.closest('.nrow').dataset.id; open.has(id) ? open.delete(id) : open.add(id);
    hd.closest('.nrow').classList.toggle('open', open.has(id)); hd.setAttribute('aria-expanded', String(open.has(id)));
  }
  function selectNotice(id, reveal = false) {
    ctx = { bid: id }; store.set('astra_ctx', ctx); open.add(id);
    renderCtx(); if (!chat.length) renderChat(); else { scroll.insertAdjacentHTML('beforeend', welcome()); scroll.scrollTop = scroll.scrollHeight; }
    if (tab !== 'list') showTab('list'); else renderList();
    flash($('#chatPane')); setActive('chat');
    if (reveal) listBody.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    q.focus();
  }
  let ct = 0;
  function commit(full = false) { store.set('astra_filters', F); clearTimeout(ct); ct = setTimeout(() => renderList(full), full ? 0 : 90); }
  $('#asof').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { setAsOf(e.target.value); renderList(); } });
  $('#today').addEventListener('click', () => { const t = todayKST(); $('#asof').value = t; setAsOf(t); renderList(); toast(`기준일을 오늘(${t})로 바꿨습니다. 수집 공고는 모두 마감 상태일 수 있습니다.`); });

  async function renderCompany() {
    listBody.innerHTML = `<div class="list docs" data-own-scroll><div class="empty">불러오는 중…</div></div>`;
    try {
      state.docs = state.docs || (await api.documents()).items;
      const docs = state.docs;
      listBody.querySelector('.docs').innerHTML = `<div class="list-meta"><span>${esc(user.company_name)} · 현재 권한(${esc(user.allowed_security_levels.join('·'))})으로 열람 가능한 자료 ${docs.length}건</span></div>` +
        (docs.length ? docs.map(d => `<div class="doc"><span class="lv ${esc(d.security_level)}">${esc(d.security_level)}</span><span style="flex:1;min-width:0">${esc(d.title)}<br><small style="color:var(--d-muted)">${esc(d.kind)} · v${esc(d.document_version)} · 검토 ${d.human_approval === 'pending' ? '대기' : esc(d.human_approval)} · 색인 ${d.index_status === 'not_indexed' ? '미색인' : esc(d.index_status)}</small></span></div>`).join('') : '<div class="empty">열람 가능한 회사 자료가 없습니다.</div>') +
        `<p style="font-size:12px;color:var(--d-muted);padding:4px">합성(가상) 회사 자료입니다. 문서 원문 뷰어는 본 화면 재구축 때 연결됩니다.</p>`;
    } catch (e) { listBody.querySelector('.docs').innerHTML = `<div class="empty">${e.status === 401 ? '로그인이 필요합니다.' : '자료를 불러오지 못했습니다.'}</div>`; }
  }

  async function openSettings() {
    $('.pop')?.remove();
    const p = document.createElement('div'); p.className = 'pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', '설정');
    p.innerHTML = `<h4>설정 · 상태</h4><dl id="stat"><dt>계정</dt><dd>${esc(user.company_name)} · ${esc(user.employee_id)}</dd><dt>권한</dt><dd>${esc(user.allowed_security_levels.join(' · '))} (${esc(user.role)})</dd></dl>
      <div class="row"><button id="pClose">닫기</button><button class="primary" id="pOut">로그아웃</button></div>`;
    side.appendChild(p);
    p.querySelector('#pClose').addEventListener('click', () => { p.remove(); setActive('chat'); });
    p.querySelector('#pOut').addEventListener('click', logout);
    try {
      const s = state.status || await api.status();
      p.querySelector('#stat').insertAdjacentHTML('beforeend', `<dt>모드</dt><dd>${esc(s.mode)}</dd><dt>생성</dt><dd>${esc(s.generation)}</dd><dt>검색</dt><dd>${esc(s.retriever)}</dd><dt>탐지</dt><dd>${esc(s.detector)}</dd><dt>공고</dt><dd>${esc(s.public_notices)}건</dd><dt>회사 문서</dt><dd>${esc(s.company_documents)}건</dd><dt>기준일</dt><dd>${esc(asOf())}</dd>`);
    } catch { }
  }

  // 초기 렌더
  renderCtx(); renderChat(); renderList(true);
  if (ctx) { open.add(ctx.bid); renderList(); listBody.querySelector(`[data-id="${CSS.escape(ctx.bid)}"]`)?.scrollIntoView({ block: 'center' }); }
  // 다른 탭에서 로그아웃하면 다시 확인
  const onFocus = async () => { const u = await refreshSession(); if (!u || u.employee_id !== user.employee_id) { clearPrivate(); go('#/login'); } };
  addEventListener('focus', onFocus); cleanup.push(() => removeEventListener('focus', onFocus));
  return () => { cleanup.forEach(f => f()); cancelAnimationFrame(sraf); };
}
