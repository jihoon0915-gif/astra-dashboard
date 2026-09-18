// LOADING — 회사 배경 위에서 "RAG 구축" 모형이 빠르고 웅장하게 조립된다.
// 모형은 연출이며, 실제 처리 결과는 왼쪽 아래 단계 목록(실제 API 호출)으로만 표시한다.
import { $, api, state, esc, store, go, sleep, reduced, refreshSession } from './core.js';

const COLORS = [[88, 150, 255], [70, 225, 255], [170, 120, 255], [255, 95, 160], [215, 240, 76]];

class RagBuild {
  constructor(cv) { this.cv = cv; this.ctx = cv.getContext('2d'); this.t0 = performance.now(); this.running = false; this.resize(); this.build(); }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * dpr; this.cv.height = this.h * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.R = Math.min(this.w, this.h) * .36;
  }
  build() {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
    // 클러스터 중심
    const centers = COLORS.map((_, i) => { const a = i / COLORS.length * Math.PI * 2 + .4, y = Math.sin(i * 1.7) * .6; return norm([Math.cos(a), y, Math.sin(a)]); });
    // 문서 시트 → 청크 입자
    this.sheets = []; this.P = [];
    const S = 40, PER = 36;
    for (let s = 0; s < S; s++) {
      const dir = norm([gauss(), gauss() * .6, gauss()]);
      const start = dir.map(x => x * 3.4), mid = dir.map(x => x * 1.75);
      const burst = rnd(.45, 1.15), cl = s % centers.length;
      const sheet = { start, mid, burst, cl, rot: rnd(-1, 1) };
      this.sheets.push(sheet);
      for (let k = 0; k < PER; k++) {
        const c = centers[cl];
        const tv = norm([c[0] + gauss() * .62, c[1] + gauss() * .62, c[2] + gauss() * .62]);
        const r = rnd(.78, 1.12);
        this.P.push({ sheet, cl, target: tv.map(x => x * r), delay: burst + rnd(0, .25), dur: rnd(.8, 1.3), off: [gauss() * .08, gauss() * .1, gauss() * .02], size: rnd(1, 2.4), tw: rnd(0, 6) });
      }
    }
    // 같은 클러스터 안에서 가까운 두 점 연결 (색인 그래프)
    this.E = [];
    for (let i = 0; i < this.P.length; i++) {
      const a = this.P[i]; let best = [];
      for (let j = 0; j < this.P.length; j++) {
        if (i === j || this.P[j].cl !== a.cl) continue;
        const b = this.P[j], d = (a.target[0] - b.target[0]) ** 2 + (a.target[1] - b.target[1]) ** 2 + (a.target[2] - b.target[2]) ** 2;
        best.push([d, j]); if (best.length > 6) { best.sort((x, y) => x[0] - y[0]); best.length = 2; }
      }
      best.sort((x, y) => x[0] - y[0]); best.slice(0, 2).forEach(([, j]) => { if (i < j) this.E.push([i, j, Math.random()]); });
    }
    // 중심으로 향하는 쿼리 펄스용 허브 연결
    this.hubs = centers.map(c => c.map(x => x * .35));
    this.pulses = Array.from({ length: 60 }, () => ({ e: Math.floor(Math.random() * this.E.length), p: Math.random(), v: .6 + Math.random() * 1.2 }));
  }
  proj(v, ry, rx, scale) {
    let [x, y, z] = v;
    const cy = Math.cos(ry), sy = Math.sin(ry); [x, z] = [x * cy - z * sy, x * sy + z * cy];
    const cx = Math.cos(rx), sx = Math.sin(rx); [y, z] = [y * cx - z * sx, y * sx + z * cx];
    const f = 2.6 / (2.6 + z);
    return [this.w / 2 + x * this.R * scale * f, this.h / 2 + y * this.R * scale * f, f, z];
  }
  start() { this.running = true; const loop = () => { if (!this.running) return; this.draw((performance.now() - this.t0) / 1000); this.raf = requestAnimationFrame(loop); }; loop(); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  draw(t) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const ry = t * (.25 + Math.min(1, t / 2.5) * .35), rx = .38 + Math.sin(t * .4) * .06;
    const scale = .82 + Math.min(1, t / 3.2) * .22 + Math.sin(t * .8) * .01;
    const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    ctx.globalCompositeOperation = 'lighter';
    // 궤도 링
    const ringA = ease((t - 1.3) / 1.2);
    if (ringA > 0) {
      for (let k = 0; k < 3; k++) {
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(t * (.15 + k * .07) * (k % 2 ? -1 : 1) + k);
        ctx.scale(1, .28 + k * .12);
        ctx.strokeStyle = `rgba(140,180,255,${.22 * ringA})`; ctx.lineWidth = 1;
        ctx.setLineDash([2, 10 + k * 4]); ctx.beginPath(); ctx.arc(0, 0, this.R * (1.28 + k * .16) * scale, 0, Math.PI * 2 * ringA); ctx.stroke();
        ctx.restore();
      }
      ctx.setLineDash([]);
    }
    // 빛줄기
    const rayA = ease((t - 1.8) / 1.4);
    if (rayA > 0) {
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * Math.PI * 2 + t * .12, L = this.R * (1.6 + (k % 3) * .25);
        const g = ctx.createLinearGradient(w / 2, h / 2, w / 2 + Math.cos(a) * L, h / 2 + Math.sin(a) * L);
        g.addColorStop(0, `rgba(120,170,255,${.10 * rayA})`); g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + Math.cos(a) * L, h / 2 + Math.sin(a) * L); ctx.stroke();
      }
    }
    // 와이어 구체(임베딩 공간)
    const wireA = ease((t - .9) / 1.1);
    if (wireA > 0) {
      ctx.lineWidth = .6;
      const ring = (fn, n = 64) => { ctx.beginPath(); for (let k = 0; k <= n; k++) { const [x, y] = this.proj(fn(k / n * Math.PI * 2), ry, rx, scale); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); };
      for (let k = 1; k < 7; k++) { const la = -Math.PI / 2 + k * Math.PI / 7, r = Math.cos(la) * 1.18, yy = Math.sin(la) * 1.18; ctx.strokeStyle = `rgba(120,160,255,${.07 * wireA})`; ring(a => [Math.cos(a) * r, yy, Math.sin(a) * r]); }
      for (let k = 0; k < 8; k++) { const lo = k / 8 * Math.PI; ctx.strokeStyle = `rgba(120,160,255,${.06 * wireA})`; ring(a => [Math.cos(a) * Math.cos(lo) * 1.18, Math.sin(a) * 1.18, Math.cos(a) * Math.sin(lo) * 1.18]); }
    }
    // 색인 완성 충격파
    for (const st of [1.55, 2.3]) {
      const p = (t - st) / 1.1;
      if (p > 0 && p < 1) { ctx.strokeStyle = `rgba(180,210,255,${(1 - p) * .5})`; ctx.lineWidth = 2 * (1 - p) + .5; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, this.R * (.2 + p * 1.9) * scale, this.R * (.2 + p * 1.9) * scale * .42, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    // 문서 시트
    for (const s of this.sheets) {
      if (t > s.burst + .05) continue;
      const p = ease(t / s.burst), pos = s.start.map((v, i) => v + (s.mid[i] - v) * p);
      const [x, y, f] = this.proj(pos, ry, rx, scale); const sw = 22 * f, sh = 28 * f, c = COLORS[s.cl];
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.rot + t);
      ctx.fillStyle = `rgba(${c},${.16})`; ctx.strokeStyle = `rgba(${c},.9)`; ctx.lineWidth = 1;
      ctx.fillRect(-sw / 2, -sh / 2, sw, sh); ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.fillStyle = `rgba(255,255,255,.55)`; for (let l = 0; l < 4; l++) ctx.fillRect(-sw * .32, -sh * .3 + l * sh * .16, sw * (l === 3 ? .35 : .64), 1.2);
      ctx.restore();
    }
    // 입자 위치
    const pts = this.pts || (this.pts = new Array(this.P.length));
    for (let i = 0; i < this.P.length; i++) {
      const q = this.P[i];
      let pos;
      if (t < q.delay) pos = null;
      else {
        const p = ease((t - q.delay) / q.dur);
        const from = q.sheet.mid.map((v, k) => v + q.off[k]);
        const arc = Math.sin(p * Math.PI) * .35;
        pos = from.map((v, k) => v + (q.target[k] - v) * p + (k === 1 ? -arc : 0));
      }
      pts[i] = pos ? this.proj(pos, ry, rx, scale) : null;
      q.p = pos ? ease((t - q.delay) / q.dur) : 0;
    }
    // 연결선 (정착한 점끼리)
    const edgeA = ease((t - 1.6) / 1.0);
    if (edgeA > 0) {
      ctx.lineWidth = .7;
      for (const [i, j] of this.E) {
        const a = pts[i], b = pts[j]; if (!a || !b || this.P[i].p < .95 || this.P[j].p < .95) continue;
        const c = COLORS[this.P[i].cl], al = .2 * edgeA * Math.min(a[2], b[2]);
        ctx.strokeStyle = `rgba(${c},${al.toFixed(3)})`; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      // 허브 → 중심 연결
      for (let k = 0; k < this.hubs.length; k++) {
        const hp = this.proj(this.hubs[k], ry, rx, scale), c = COLORS[k];
        ctx.strokeStyle = `rgba(${c},${.18 * edgeA})`; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
      }
      // 펄스
      for (const pl of this.pulses) {
        pl.p += .016 * pl.v; if (pl.p > 1) { pl.p = 0; pl.e = Math.floor(Math.random() * this.E.length); }
        const [i, j] = this.E[pl.e], a = pts[i], b = pts[j]; if (!a || !b) continue;
        const x = a[0] + (b[0] - a[0]) * pl.p, y = a[1] + (b[1] - a[1]) * pl.p, c = COLORS[this.P[i].cl];
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7); g.addColorStop(0, `rgba(255,255,255,${.9 * edgeA})`); g.addColorStop(.3, `rgba(${c},${.6 * edgeA})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 7, y - 7, 14, 14);
      }
    }
    // 입자
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; if (!a) continue;
      const q = this.P[i], c = COLORS[q.cl], tw = .65 + .35 * Math.sin(t * 3 + q.tw);
      const s = q.size * a[2] * (q.p < 1 ? 1.4 : 1);
      ctx.fillStyle = `rgba(${c},${(.55 + .45 * tw) * Math.min(1, a[2])})`;
      if (q.p < .98) ctx.fillRect(a[0] - s, a[1] - s, s * 2, s * 2);
      else { ctx.beginPath(); ctx.arc(a[0], a[1], s, 0, Math.PI * 2); ctx.fill(); }
    }
    // 중심 광원
    const core = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, this.R * .9);
    core.addColorStop(0, `rgba(120,160,255,${.20 + .06 * Math.sin(t * 3)})`); core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
}

export async function renderLoading(root) {
  document.body.classList.add('is-dark');
  const user = state.user || await refreshSession();
  if (!user) { go('#/login'); return; }
  root.innerHTML = `<div class="loading" id="ld">
    <div class="bgimg"></div><div class="tint"></div>
    <canvas id="rag" aria-hidden="true"></canvas>
    <div class="who">${esc(user.company_name)} · ${esc(user.employee_id)} · ${esc(user.allowed_security_levels.join('/'))}</div>
    <button class="skip" id="skip" disabled>준비 중…</button>
    <div class="spin" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="워크스페이스 준비">
      <svg viewBox="0 0 176 176" aria-hidden="true">
        <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9CC3FF"/><stop offset=".5" stop-color="#4AE1FF"/><stop offset="1" stop-color="#FF5FA0"/></linearGradient></defs>
        <circle cx="88" cy="88" r="80" fill="rgba(8,10,18,.86)" stroke="rgba(255,255,255,.08)"/>
        <g class="r2"><circle cx="88" cy="88" r="72" fill="none" stroke="rgba(255,255,255,.18)" stroke-dasharray="2 8"/></g>
        <g class="r1"><circle cx="88" cy="88" r="64" fill="none" stroke="url(#sg)" stroke-width="4" stroke-linecap="round" stroke-dasharray="120 282"/></g>
        <circle id="arc" cx="88" cy="88" r="80" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 503" transform="rotate(-90 88 88)" style="transition:stroke-dasharray .5s"/>
      </svg>
      <div class="pct" id="pct">0%</div>
      <div class="lbl" id="lbl">RAG 워크스페이스 구성 중</div>
    </div>
    <div class="steps"><h4>실제 처리 단계 · 서버 응답 기준</h4><ul id="steps"></ul></div>
    <div class="note">가운데 구축 모형은 시각 연출입니다.<br>검색 색인·임베딩을 새로 만들지 않습니다.</div>
  </div>`;
  const cv = $('#rag'), anim = new RagBuild(cv);
  const onR = () => anim.resize(); addEventListener('resize', onR);
  if (reduced()) anim.draw(4); else anim.start();

  const steps = [
    ['세션 확인', async () => { const s = await api.session(); if (!s.user) throw new Error('세션 만료'); state.user = s.user; return s.user.role; }],
    ['공개 공고 메타데이터', async () => { state.boot = await api.bootstrap(); return `${state.boot.notices.length}건`; }],
    ['열람 가능 회사 문서', async () => { state.docs = (await api.documents()).items; return `${state.docs.length}건`; }],
    ['저장 답변 사례', async () => { state.examples = (await api.examples()).items; return `${state.examples.length}건`; }],
    ['모델·색인 상태', async () => { state.status = await api.status(); return state.status.generation?.startsWith('미연결') ? '생성 미연결' : '확인'; }],
  ];
  const ul = $('#steps'); ul.innerHTML = steps.map(([n]) => `<li><i></i><span>${n}</span><em></em></li>`).join('');
  const lis = [...ul.children], pct = $('#pct'), arc = $('#arc'), lbl = $('#lbl'), bar = root.querySelector('.spin');
  let done = 0, failed = false, alive = true;
  const setP = v => { pct.textContent = `${Math.round(v)}%`; arc.setAttribute('stroke-dasharray', `${v / 100 * 503} 503`); bar.setAttribute('aria-valuenow', String(Math.round(v))); };
  const t0 = performance.now();
  for (let i = 0; i < steps.length && alive; i++) {
    lis[i].className = 'run'; lbl.textContent = steps[i][0] + ' 중…';
    try { lis[i].querySelector('em').textContent = await steps[i][1](); lis[i].className = 'done'; }
    catch (e) {
      lis[i].className = 'fail'; lis[i].querySelector('i').textContent = '!'; lis[i].querySelector('em').textContent = e.status === 401 ? '권한 없음' : '실패'; failed = true;
      if (i === 0) { lbl.textContent = '세션이 만료되었습니다. 다시 로그인해 주세요.'; await sleep(1400); go('#/login'); return () => { anim.stop(); removeEventListener('resize', onR); }; }
    }
    done++; setP(done / steps.length * 100);
    if (!reduced()) await sleep(120);
  }
  lbl.textContent = failed ? '일부 단계 실패 · 가능한 기능만 엽니다' : '워크스페이스 준비 완료';
  const skip = $('#skip'); skip.disabled = false; skip.textContent = '바로 입장 →';
  const enter = async () => { if (!alive) return; alive = false; $('#ld').classList.add('out'); await sleep(reduced() ? 0 : 560); const to = store.get('astra_after_loading', '#/app'); store.del('astra_after_loading'); go(to || '#/app'); };
  skip.addEventListener('click', enter);
  const minShow = 3600 - (performance.now() - t0);  // 연출 최소 노출 시간(건너뛰기 가능)
  setTimeout(enter, reduced() ? 300 : Math.max(500, minShow));
  return () => { alive = false; anim.stop(); removeEventListener('resize', onR); };
}
