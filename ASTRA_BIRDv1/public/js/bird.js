// 인트로 영상이 끝난 뒤 이어지는 "살아있는 파랑새" — 영상 마지막 프레임을 배경·몸·머리 레이어로 분리해
// 고개 움직임 · 눈 깜빡임 · 머리 돌리기 · 몸 돌리기(깡충) · 숨쉬기를 절차적으로 끝없이 반복한다.
const load = src => new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = no; i.src = src; });
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

export class LiveBird {
  constructor(canvas, { base = '/assets/img/', word = 'ASTRA' } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.base = base; this.word = word;
    this.running = false; this.visible = true; this.t0 = 0; this.mx = 0; this.my = 0; this.tmx = 0; this.tmy = 0;
    this.wordA = 0; this.wordTarget = 0;
    // 상태값 (현재 → 목표로 보간)
    this.head = { a: 0, x: 0, y: 0, ta: 0, tx: 0, ty: 0, speed: 14, flip: 1, flipT: 1, flipP: 1 };
    this.body = { flip: 1, flipFrom: 1, flipP: 1, hop: 0, shake: 0 };
    this.lid = { b: 0, t: -1, dbl: false };
    this.next = { look: 1.2, blink: 1.8, headTurn: rnd(6, 9), bodyTurn: rnd(14, 18), shake: rnd(9, 13) };
  }
  async init() {
    const [meta, plate, body, head] = await Promise.all([
      fetch(this.base + 'bird_meta.json').then(r => r.json()),
      load(this.base + 'bird_plate.webp'), load(this.base + 'bird_body.webp'), load(this.base + 'bird_head.webp')]);
    Object.assign(this, { meta, plate, bodyImg: body, headImg: head });
    this.eye = { x: 758, y: 194, rx: 31, ry: 29 };
    this.pivot = { x: meta.pivot[0], y: meta.pivot[1] };
    this.headAxis = 745;        // 머리 좌우 반전 축(목 중심)
    this.bodyAxis = 705;        // 몸 반전 축
    this.resize();
    addEventListener('resize', this._rs = () => this.resize());
    return this;
  }
  resize() {
    const r = this.c.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.min(Math.round(r.width * dpr), 2600);
    this.c.width = w; this.c.height = Math.round(w * this.meta.H / this.meta.W);
    this.s = w / this.meta.W;
    if (!this.running) this.draw(performance.now() / 1000);
  }
  pointer(nx, ny) { this.tmx = nx; this.tmy = ny; }         // -1..1
  showWord(on = true) { this.wordTarget = on ? 1 : 0; }
  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.t0 = this.last / 1000; const loop = now => { if (!this.running) return; this.tick(now); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  destroy() { this.stop(); removeEventListener('resize', this._rs); }

  schedule(t) {
    const h = this.head, n = this.next;
    // 1) 새처럼 짧게 끊어 고개를 움직이고 멈춘다
    if (t > n.look) {
      const up = -this.tmy * 3.2;                         // 커서 높이에 따라 살짝 올려보기
      h.ta = rnd(-6.5, 5) + up; h.tx = rnd(-8, 8); h.ty = rnd(-6, 5); h.speed = rnd(10, 22);
      n.look = t + (Math.random() < .25 ? rnd(.25, .5) : rnd(.8, 2.6));
    }
    // 2) 눈 깜빡임 (가끔 두 번)
    if (t > n.blink && this.lid.t < 0) { this.lid.t = 0; this.lid.dbl = Math.random() < .28; n.blink = t + rnd(2.2, 5.2); }
    // 3) 머리 돌리기 — 반대쪽을 보고 잠시 뒤 돌아온다
    if (t > n.headTurn && h.flipP >= 1 && this.body.flipP >= 1) {
      h.flipFrom = h.flip; h.flipT = -h.flip; h.flipP = 0;
      n.headTurn = t + (h.flipT === this.body.flip ? rnd(6, 10) : rnd(1.4, 3.2));
      n.blink = Math.min(n.blink, t + .05);
    }
    // 4) 몸 돌리기 — 깡충 뛰며 방향 전환
    if (t > n.bodyTurn && h.flipP >= 1 && this.body.flipP >= 1) {
      const b = this.body; b.flipFrom = b.flip; b.flip = -b.flip; b.flipP = 0; h.flip = h.flipT = b.flip;
      n.bodyTurn = t + rnd(12, 20); n.headTurn = Math.max(n.headTurn, t + rnd(3, 5));
    }
    // 5) 깃털 털기
    if (t > n.shake && this.body.flipP >= 1) { this.body.shake = 1; n.shake = t + rnd(10, 16); }
  }
  tick(now) {
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const t = now / 1000 - this.t0;
    this.schedule(t);
    const h = this.head, b = this.body, k = 1 - Math.exp(-h.speed * dt);
    h.a = lerp(h.a, h.ta, k); h.x = lerp(h.x, h.tx, k); h.y = lerp(h.y, h.ty, k);
    if (h.flipP < 1) { h.flipP = Math.min(1, h.flipP + dt / .16); h.flip = lerp(h.flipFrom ?? 1, h.flipT, easeIO(h.flipP)); }
    if (b.flipP < 1) { b.flipP = Math.min(1, b.flipP + dt / .42); }
    if (b.shake > 0) b.shake = Math.max(0, b.shake - dt / .5);
    if (this.lid.t >= 0) { this.lid.t += dt; const L = this.lid.dbl ? .38 : .17; if (this.lid.t > L) this.lid.t = -1; }
    this.mx = lerp(this.mx, this.tmx, 1 - Math.exp(-3 * dt)); this.my = lerp(this.my, this.tmy, 1 - Math.exp(-3 * dt));
    this.wordA = lerp(this.wordA, this.wordTarget, 1 - Math.exp(-1.6 * dt));
    this.draw(t);
  }
  lidAmount() {
    const L = this.lid; if (L.t < 0) return 0;
    const one = .17, x = L.dbl ? (L.t % one) : L.t;
    const p = x / one; return p < .45 ? ease(p / .45) : 1 - ease((p - .45) / .55);
  }
  draw(t) {
    const { ctx, meta, s } = this; if (!meta) return;
    const W = meta.W, H = meta.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // 배경 (살짝 시차)
    const px = this.mx * 10, py = this.my * 6;
    ctx.drawImage(this.plate, -14 + px * .4, -10 + py * .4, W + 28, H + 20);
    // 새 뒤의 대형 워드마크
    if (this.wordA > .01) {
      ctx.save();
      ctx.globalAlpha = this.wordA * .78;
      ctx.font = `200 ${Math.round(H * .44)}px Pretendard, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(H * .03)}px`;
      const g = ctx.createLinearGradient(0, H * .15, 0, H * .6);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,.25)');
      ctx.fillStyle = g; ctx.fillText(this.word, W / 2 + px * .8, H * .36 + py * .6 + (1 - this.wordA) * 30);
      ctx.restore();
    }
    // 새 전체 변환: 숨쉬기 + 몸 돌리기(깡충) + 털기
    const b = this.body, br = Math.sin(t * 2 * Math.PI / 3.6);
    let bsx = 1, hop = 0;
    if (b.flipP < 1) { const p = b.flipP; bsx = lerp(b.flipFrom, b.flip, easeIO(p)); hop = Math.sin(p * Math.PI) * 26; }
    else bsx = b.flip;
    const shake = b.shake > 0 ? Math.sin(t * 70) * b.shake * 1.4 : 0;
    const ax = this.bodyAxis + px, ay = H;
    ctx.save();
    ctx.translate(ax, ay - hop);
    ctx.rotate(shake * Math.PI / 180);
    ctx.scale(bsx * (1 - br * .003), 1 + br * .007);
    ctx.translate(-ax, -ay);
    if (b.flipP < 1 && 'filter' in ctx) ctx.filter = `blur(${(Math.sin(b.flipP * Math.PI) * 2.2).toFixed(2)}px)`;
    ctx.translate(px, py * .5);
    ctx.drawImage(this.bodyImg, meta.body[0], meta.body[1]);
    // 머리
    const h = this.head;
    const hf = (b.flipP < 1 ? 1 : h.flip * b.flip);      // 몸 기준 머리 방향
    ctx.save();
    ctx.translate(this.pivot.x + h.x, this.pivot.y + h.y + br * -1.2);
    ctx.rotate(h.a * Math.PI / 180);
    ctx.translate(-this.pivot.x, -this.pivot.y);
    if (hf !== 1) { ctx.translate(this.headAxis, 0); ctx.scale(hf, 1); ctx.translate(-this.headAxis, 0); }
    ctx.drawImage(this.headImg, meta.head[0], meta.head[1]);
    this.drawLid(this.lidAmount());
    ctx.restore();
    ctx.filter = 'none';
    ctx.restore();
  }
  drawLid(v) {
    if (v <= .01) return;
    // 실제 깃털 질감을 사용한 눈꺼풀: 눈 위(아래) 영역을 잘라 눈동자 위로 내린다(올린다)
    const { ctx, meta } = this, e = this.eye, rx = 30, ry = 27, Hs = ry * 2 + 8, hx = meta.head[0], hy = meta.head[1];
    ctx.save();
    ctx.beginPath(); ctx.ellipse(e.x, e.y, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    const up = v * Hs * .78, lo = v * Hs * .3;
    const sxU = e.x - rx - 4 - hx, syU = e.y - ry - Hs - hy;
    ctx.drawImage(this.headImg, sxU, syU, rx * 2 + 8, Hs, e.x - rx - 4, e.y - ry - Hs + up, rx * 2 + 8, Hs);
    ctx.drawImage(this.headImg, sxU, e.y + ry - hy, rx * 2 + 8, Hs, e.x - rx - 4, e.y + ry - lo, rx * 2 + 8, Hs);
    const edgeU = e.y - ry + up, edgeL = e.y + ry - lo;
    ctx.strokeStyle = `rgba(40,20,30,${.55 * Math.min(1, v * 1.6)})`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(e.x - rx, edgeU - 6); ctx.quadraticCurveTo(e.x, edgeU + 6, e.x + rx, edgeU - 6); ctx.stroke();
    ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(e.x - rx, edgeL + 5); ctx.quadraticCurveTo(e.x, edgeL - 4, e.x + rx, edgeL + 5); ctx.stroke();
    ctx.restore();
  }
}
