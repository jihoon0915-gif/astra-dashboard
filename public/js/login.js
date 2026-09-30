// LOGIN — 움직이는 배경 영상 + 오른쪽 로그인 카드(회사 ID · 아이디 · 비밀번호)
import { $, api, state, esc, companyLabel, store, go, sleep, reduced, icons } from './core.js';

const N = 6;
const rowPos = i => ({ x: (i - (N - 1) / 2) * 48, y: 0, s: 1, r: 0 });
const ringPos = i => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return { x: Math.cos(a) * 48, y: Math.sin(a) * 48, s: .8, r: 0 }; };
const centerPos = i => ({ x: (i % 3 - 1) * 8, y: (Math.floor(i / 3) - .5) * 8, s: .35, r: i * 40 });

export async function renderLogin(root) {
  document.body.classList.add('is-dark');
  root.innerHTML = `<div class="view login">
    <video class="bg" autoplay muted loop playsinline preload="auto" aria-hidden="true"><source src="/assets/video/login_bg_smooth.mp4" type="video/mp4"><source src="/assets/video/login_bg.mp4" type="video/mp4"></video>
    <div class="shade"></div>
    <a class="back" href="#/"><i>←</i>Blue Jay 홈</a>
    <div class="left-copy"><p class="login-intro-line">실시간 환각 검증 기반의 <strong>공공입찰 AI 어시스턴트</strong></p><span class="meta">Blue Jay · SECURE ACCESS</span></div>
    <main class="login-col">
      <div class="above"><h1>Sign in</h1></div>
      <form class="lcard" id="lcard" novalidate autocomplete="on">
        <div class="handle"></div>
        <h2>회사 계정으로 로그인</h2>
        <p class="desc">회사와 사용자 계정을 선택하고 <b>비밀번호</b>를 입력하세요.</p>
        <div class="lfield" id="fCo"><label for="co"><span>회사 선택</span><span>시연 기업 5곳</span></label><select id="co" name="company" disabled><option value="">회사 목록 불러오는 중…</option></select></div>
        <div class="lfield" id="fId"><label for="uid"><span>사용자 계정 선택</span><span>역할 · 사용자명</span></label><select id="uid" name="username" disabled><option value="">회사를 먼저 선택하세요</option></select></div>
        <div class="pw-tools"><span style="font-size:12.5px">비밀번호</span><button type="button" id="eye" aria-pressed="false">${icons.eye}<span>표시</span></button></div>
        <div class="pin-wrap" id="pinWrap">
          <div class="pin-ring"></div>
          <div class="pins" id="pins">${Array.from({ length: N }, (_, i) => `<div class="pin" data-i="${i}"><span class="dotc"></span><span class="ch"></span></div>`).join('')}</div>
          <input class="pins-input" id="pw" type="password" name="password" autocomplete="current-password" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" aria-label="비밀번호">
          <div class="success-mark">${icons.check}</div>
          <div class="sparks">${Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, d = 70 + (i % 3) * 26; return `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;animation-delay:${(i % 4) * 40}ms"></i>`; }).join('')}</div>
        </div>
        <div class="msg" id="msg" role="alert"></div>
        <button class="submit" id="submit" type="submit" disabled>로그인</button>
        <div class="otp-chip">
          
          
          <button type="button" id="fill">비밀번호 채우기</button><button type="button" id="signup">회원가입</button>
        </div>
      </form>
      <p class="login-foot">회사 코드가 등록되지 않았다면 <button type="button" id="ask">등록 문의</button> · 비활성 계정은 목록에 표시되지만 선택할 수 없습니다.</p>
    </main>
  </div>`;

  const card = $('#lcard'), pins = [...card.querySelectorAll('.pin')], pw = $('#pw'), co = $('#co'), uid = $('#uid'), msg = $('#msg'), submit = $('#submit');
  const bgv = root.querySelector('video.bg'); if (reduced()) bgv.pause();
  let busy = false, filling = false, disposed = false;
  const place = fn => pins.forEach((p, i) => { const q = fn(i); p.style.transform = `translate(${q.x}px, ${q.y}px) scale(${q.s}) rotate(${q.r}deg)`; });
  place(rowPos);
  const paint = () => {
    const v = pw.value;
    pins.forEach((p, i) => {
      p.classList.toggle('filled', i < v.length);
      p.classList.toggle('active', document.activeElement === pw && i === Math.min(v.length, N - 1) && !busy && v.length < N);
      p.querySelector('.ch').textContent = v[i] || '';
    });
    submit.disabled = busy || filling || !(co.value.trim() && uid.value.trim() && v.length === N);
  };
  const setMsg = (t, cls = '') => { msg.className = 'msg ' + cls; msg.innerHTML = t; };
  let companies = [];
  const updateUsers = () => {
    const company = companies.find(c => c.company_code === co.value);
    uid.innerHTML = '<option value="">사용자 계정을 선택하세요</option>' + (company?.users || []).map(u => `<option value="${esc(u.username)}" ${u.active ? '' : 'disabled'}>${esc(u.role_label)} · ${esc(u.username)}${u.active ? '' : ' (비활성)'}</option>`).join('');
    uid.disabled = !company; pw.value = ''; setMsg(''); paint();
  };
  co.addEventListener('change', () => { co.parentElement.classList.remove('err'); updateUsers(); });
  uid.addEventListener('change', () => { uid.parentElement.classList.remove('err'); pw.value = ''; setMsg(''); paint(); });
  pw.addEventListener('input', () => { pw.value = pw.value.replace(/[^0-9]/g, '').slice(0, N); setMsg(''); paint(); if (pw.value.length === N) trySubmit(); });
  pw.addEventListener('focus', paint); pw.addEventListener('blur', paint);
  $('#pinWrap').addEventListener('click', () => pw.focus());
  $('#eye').addEventListener('click', e => { const on = card.classList.toggle('show-pw'); pw.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.querySelector('span').textContent = on ? '숨김' : '표시'; });
  card.addEventListener('submit', e => { e.preventDefault(); trySubmit(); });
  [co, uid].forEach((el, i) => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (i === 0 ? uid : pw).focus(); } }));

  $('#fill').addEventListener('click', async () => {
    if (busy || filling || disposed) return;
    filling = true;
    const controls = [co, uid, pw, $('#fill'), $('#eye')];
    const disabledBefore = controls.map(el => el.disabled);
    controls.forEach(el => el.disabled = true);
    pw.value = ''; setMsg(''); paint();
    for (let i = 1; i <= N; i++) {
      if (!reduced()) await sleep(180);
      if (disposed) return;
      pw.value = '0'.repeat(i); paint();
    }
    // Leave the sixth box visible before the existing verification motion.
    if (!reduced()) await sleep(180);
    if (disposed) return;
    filling = false;
    controls.forEach((el, i) => el.disabled = disabledBefore[i]);
    paint(); trySubmit();
  });
  $('#signup').addEventListener('click', () => inquiry(true));
  $('#ask').addEventListener('click', () => inquiry());

  async function trySubmit() {
    if (busy || filling || disposed) return;
    co.value = co.value.trim().toUpperCase(); uid.value = uid.value.trim();
    let bad = false;
    if (!co.value) { $('#fCo').classList.add('err'); bad = true; }
    if (!uid.value) { $('#fId').classList.add('err'); bad = true; }
    if (!/^[0-9]{6}$/.test(pw.value)) bad = true;
    if (bad) { setMsg('회사와 사용자 계정을 선택하고 6자리 비밀번호를 입력해 주세요.', 'err'); return; }
    busy = true; paint(); pw.blur(); [co, uid, pw, $('#fill'), $('#eye')].forEach(el => el.disabled = true);
    card.classList.add('pending'); place(ringPos); setMsg('서버에서 계정을 확인하고 있습니다…');
    const t0 = performance.now();
    try {
      const res = await api.login(co.value, uid.value, pw.value);
      const left = 1700 - (performance.now() - t0); if (left > 0 && !reduced()) await sleep(left);  // 원형 전환이 끝날 때까지만 대기
      if (disposed) return;
      card.classList.add('verified');
      if (!reduced()) await sleep(420);
      if (disposed) return;
      card.classList.remove('pending'); place(centerPos); card.classList.add('success');
      setMsg(`${esc(companyLabel(res.user.company_name))} · ${esc(res.user.employee_id)} 로그인 성공`, 'ok');
      state.user = res.user;
      store.set('astra_show_discover', true);   // 로그인 직후 한 번: 맞춤 탐색 과정 화면
      await sleep(reduced() ? 0 : 1050);
      if (disposed) return;
      const ret = store.get('astra_return', '#/app'); store.del('astra_return');
      store.set('astra_after_loading', ret === '#/' ? '#/app' : ret); go('#/loading');
    } catch (e) {
      const left = 520 - (performance.now() - t0); if (left > 0) await sleep(left);
      if (disposed) return;
      busy = false; [co, uid, pw, $('#fill'), $('#eye')].forEach(el => el.disabled = false); card.classList.remove('pending', 'verified'); place(rowPos);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pw.value = ''; paint();
      if (e.code === 'UNKNOWN_COMPANY') {
        $('#fCo').classList.add('err');
        setMsg(`등록되지 않은 코드입니다. <button type="button" class="linkbtn" id="rOk" style="color:#fff">확인</button> · <button type="button" class="linkbtn" id="rReg" style="color:#fff">등록 문의</button>`, 'err');
        $('#rOk').addEventListener('click', () => { co.value = uid.value = ''; setMsg(''); paint(); co.focus(); });
        $('#rReg').addEventListener('click', () => inquiry());
      } else if (e.code === 'INVALID_CREDENTIALS') { setMsg('사용자명·비밀번호와 계정 활성 상태를 확인해 주세요.', 'err'); pw.focus(); }
      else setMsg(e.status ? esc(e.message) : '서버에 연결하지 못했습니다. 실행 창이 켜져 있는지 확인해 주세요.', 'err');
    }
  }
  try {
    companies = (await api.demoLoginOptions()).companies;
    co.innerHTML = '<option value="">회사를 선택하세요</option>' + companies.map(c => `<option value="${esc(c.company_code)}">${esc(companyLabel(c.company_name))} (${esc(c.company_code)})</option>`).join('');
    co.disabled = false;
  } catch(e) { setMsg('계정 목록을 불러오지 못했습니다. 새로고침해 주세요.', 'err'); }
  paint();
  setTimeout(() => co.focus({ preventScroll: true }), 400);
  return () => { disposed = true; bgv.pause(); bgv.removeAttribute('src'); };
}

function inquiry(signup = false) {
  const b = document.createElement('div'); b.className = 'modal-back';
  b.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mq"><h3 id="mq">${signup ? "회원가입 안내" : "회사 등록 문의"}</h3>
    <p>${signup ? "가입할 회사의 관리자에게 계정 등록을 요청해 주세요. 회사와 역할이 지정된 후 로그인할 수 있습니다.<br>" : ""}Blue Jay 회사 계정은 회사 관리자가 등록합니다. 시연에서는 아래 예시 번호로 안내합니다.<br><b style="color:#fff">010-1234-5678</b> <span style="font-size:12px">(시연용 예시 번호 · 실제 운영 번호 아님)</span></p>
    <div class="row"><button class="primary" id="mOk">확인</button></div></div>`;
  document.body.appendChild(b);
  const close = () => b.remove();
  b.addEventListener('click', e => { if (e.target === b) close(); });
  b.querySelector('#mOk').addEventListener('click', close); b.querySelector('#mOk').focus();
  b.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
