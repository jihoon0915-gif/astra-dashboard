// LOGIN — 움직이는 배경 영상 + 오른쪽 로그인 카드(회사 ID · 아이디 · 6자리 비밀번호)
import { $, api, state, esc, store, go, sleep, reduced, icons } from './core.js';

const N = 6;
const rowPos = i => ({ x: (i - (N - 1) / 2) * 56, y: 0, s: 1, r: 0 });
const ringPos = i => { const a = (i / N) * Math.PI * 2 - Math.PI / 2; return { x: Math.cos(a) * 48, y: Math.sin(a) * 48, s: .8, r: (i / N) * 360 }; };
const centerPos = i => ({ x: (i % 3 - 1) * 8, y: (Math.floor(i / 3) - .5) * 8, s: .35, r: i * 40 });

export async function renderLogin(root) {
  document.body.classList.add('is-dark');
  root.innerHTML = `<div class="view login">
    <video class="bg" autoplay muted loop playsinline aria-hidden="true" poster=""><source src="/assets/video/login_bg.mp4" type="video/mp4"><source src="/assets/video/login_bg.webm" type="video/webm"></video>
    <div class="shade"></div>
    <a class="back" href="#/"><i>←</i>ASTRA 홈</a>
    <div class="left-copy"><span class="meta">ASTRA · SECURE ACCESS</span><h2>회사 권한으로<br>근거를 여는 곳.</h2></div>
    <main class="login-col">
      <div class="above"><div class="meta">ASTRA · ACCESS</div><h1>Sign in<sup>v3</sup></h1></div>
      <form class="lcard" id="lcard" novalidate autocomplete="on">
        <div class="handle"></div>
        <h2>회사 계정으로 로그인</h2>
        <p class="desc">회사 ID와 아이디를 입력하고 <b>6자리 비밀번호</b>를 입력하세요.</p>
        <div class="lfield" id="fCo"><label for="co"><span>회사 ID</span><span>예: C01</span></label><input id="co" name="company" autocomplete="organization" placeholder="C01" maxlength="12" spellcheck="false"></div>
        <div class="lfield" id="fId"><label for="uid"><span>아이디</span><span>사번</span></label><input id="uid" name="username" autocomplete="username" placeholder="C01-2001" maxlength="24" spellcheck="false"></div>
        <div class="pw-tools"><span style="font-size:12.5px">비밀번호</span><button type="button" id="eye" aria-pressed="false">${icons.eye}<span>표시</span></button></div>
        <div class="pin-wrap" id="pinWrap">
          <div class="pin-ring"></div>
          <div class="pins" id="pins">${Array.from({ length: N }, (_, i) => `<div class="pin" data-i="${i}"><span class="dotc"></span><span class="ch"></span></div>`).join('')}</div>
          <input class="pins-input" id="pw" type="password" name="password" autocomplete="current-password" maxlength="${N}" aria-label="비밀번호 6자리">
          <div class="success-mark">${icons.check}</div>
          <div class="sparks">${Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, d = 70 + (i % 3) * 26; return `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;animation-delay:${(i % 4) * 40}ms"></i>`; }).join('')}</div>
        </div>
        <div class="msg" id="msg" role="alert"></div>
        <button class="submit" id="submit" type="submit" disabled>로그인</button>
        <div class="otp-chip">
          <span class="ic">${icons.msg}</span>
          <span class="t"><b class="demo">시연용 계정</b></span>
          <button type="button" id="fill">채우기</button>
        </div>
      </form>
      <p class="login-foot">회사 코드가 등록되지 않았다면 <button type="button" id="ask">등록 문의</button> · 다른 시연 계정: C01~C05 / Cxx-1001(L2), Cxx-2001(L2·L3)</p>
    </main>
  </div>`;

  const card = $('#lcard'), pins = [...card.querySelectorAll('.pin')], pw = $('#pw'), co = $('#co'), uid = $('#uid'), msg = $('#msg'), submit = $('#submit');
  const bgv = root.querySelector('video.bg'); if (reduced()) bgv.pause();
  let busy = false, filling = false;
  const place = fn => pins.forEach((p, i) => { const q = fn(i); p.style.transform = `translate(${q.x}px, ${q.y}px) scale(${q.s}) rotate(${q.r}deg)`; });
  place(rowPos);
  const paint = () => {
    const v = pw.value;
    pins.forEach((p, i) => {
      p.classList.toggle('filled', i < v.length);
      p.classList.toggle('active', document.activeElement === pw && i === Math.min(v.length, N - 1) && !busy && v.length < N);
      p.querySelector('.ch').textContent = v[i] || '';
    });
    submit.disabled = busy || !(co.value.trim() && uid.value.trim() && v.length > 0);
  };
  const setMsg = (t, cls = '') => { msg.className = 'msg ' + cls; msg.innerHTML = t; };
  [co, uid].forEach(el => el.addEventListener('input', () => { el.parentElement.classList.remove('err'); paint(); }));
  co.addEventListener('blur', () => { co.value = co.value.trim().toUpperCase(); });
  uid.addEventListener('blur', () => { uid.value = uid.value.trim().toUpperCase(); });
  pw.addEventListener('input', () => { if (pw.value.length > N) pw.value = pw.value.slice(0, N); paint(); if (pw.value.length === N && !filling) trySubmit(); });
  pw.addEventListener('focus', paint); pw.addEventListener('blur', paint);
  $('#pinWrap').addEventListener('click', () => pw.focus());
  $('#eye').addEventListener('click', e => { const on = card.classList.toggle('show-pw'); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.querySelector('span').textContent = on ? '숨김' : '표시'; });
  card.addEventListener('submit', e => { e.preventDefault(); trySubmit(); });
  [co, uid].forEach((el, i) => el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (i === 0 ? uid : pw).focus(); } }));

  async function type(el, text) { el.value = ''; for (const ch of text) { el.value += ch; el.dispatchEvent(new Event('input')); await sleep(reduced() ? 0 : 55); } }
  $('#fill').addEventListener('click', async () => {
    if (busy) return; filling = true;
    co.focus(); await type(co, 'C01'); uid.focus(); await type(uid, 'C01-2001'); pw.focus(); await type(pw, '000000');
    filling = false; trySubmit();
  });
  $('#ask').addEventListener('click', () => inquiry());

  async function trySubmit() {
    if (busy) return;
    co.value = co.value.trim().toUpperCase(); uid.value = uid.value.trim().toUpperCase();
    let bad = false;
    if (!co.value) { $('#fCo').classList.add('err'); bad = true; }
    if (!uid.value) { $('#fId').classList.add('err'); bad = true; }
    if (!pw.value) bad = true;
    if (bad) { setMsg('회사 ID, 아이디, 비밀번호를 모두 입력해 주세요.', 'err'); return; }
    busy = true; paint(); pw.blur();
    card.classList.add('pending'); place(ringPos); setMsg('서버에서 계정을 확인하고 있습니다…');
    const t0 = performance.now();
    try {
      const res = await api.login(co.value, uid.value, pw.value);
      const left = 700 - (performance.now() - t0); if (left > 0 && !reduced()) await sleep(left);  // 원형 전환이 끝날 때까지만 대기
      pw.value = '';
      card.classList.remove('pending'); place(centerPos); card.classList.add('success');
      setMsg(`${esc(res.user.company_name)} · ${esc(res.user.employee_id)} 로그인 성공`, 'ok');
      state.user = res.user;
      await sleep(reduced() ? 0 : 1050);
      const ret = store.get('astra_return', '#/app'); store.del('astra_return');
      store.set('astra_after_loading', ret === '#/' ? '#/app' : ret); go('#/loading');
    } catch (e) {
      const left = 520 - (performance.now() - t0); if (left > 0) await sleep(left);
      busy = false; card.classList.remove('pending'); place(rowPos);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pw.value = ''; paint();
      if (e.code === 'UNKNOWN_COMPANY') {
        $('#fCo').classList.add('err');
        setMsg(`등록되지 않은 코드입니다. <button type="button" class="linkbtn" id="rOk" style="color:#fff">확인</button> · <button type="button" class="linkbtn" id="rReg" style="color:#fff">등록 문의</button>`, 'err');
        $('#rOk').addEventListener('click', () => { co.value = uid.value = ''; setMsg(''); paint(); co.focus(); });
        $('#rReg').addEventListener('click', () => inquiry());
      } else if (e.code === 'INVALID_CREDENTIALS') { setMsg('아이디 또는 비밀번호를 확인해 주세요.', 'err'); pw.focus(); }
      else setMsg(e.status ? esc(e.message) : '서버에 연결하지 못했습니다. 실행 창이 켜져 있는지 확인해 주세요.', 'err');
    }
  }
  paint();
  setTimeout(() => co.focus({ preventScroll: true }), 400);
  return () => { bgv.pause(); bgv.removeAttribute('src'); };
}

function inquiry() {
  const b = document.createElement('div'); b.className = 'modal-back';
  b.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mq"><h3 id="mq">회사 등록 문의</h3>
    <p>ASTRA 회사 계정은 회사 관리자가 등록합니다. 시연에서는 아래 예시 번호로 안내합니다.<br><b style="color:#fff">010-1234-5678</b> <span style="font-size:12px">(시연용 예시 번호 · 실제 운영 번호 아님)</span></p>
    <div class="row"><button class="primary" id="mOk">확인</button></div></div>`;
  document.body.appendChild(b);
  const close = () => b.remove();
  b.addEventListener('click', e => { if (e.target === b) close(); });
  b.querySelector('#mOk').addEventListener('click', close); b.querySelector('#mOk').focus();
  b.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
