// ASTRA v3 공통 유틸 · API · 데이터 규칙
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const store = {
  get(k, d = null) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 차단 시 무시 */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { } },
  lget(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  lset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};

// ---------- API (기존 서버 계약 그대로 사용) ----------
async function call(path, opt = {}) {
  const res = await fetch(path, { credentials: 'same-origin', headers: opt.body ? { 'Content-Type': 'application/json' } : {}, ...opt });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) { const e = new Error((data && data.error) || `요청 실패 (${res.status})`); e.status = res.status; e.code = data && data.code; throw e; }
  return data;
}
export const api = {
  session: () => call('/api/session'),
  bootstrap: () => call('/api/bootstrap'),
  examples: bid => call('/api/examples' + (bid ? `?bid=${encodeURIComponent(bid)}` : '')),
  caseById: id => call('/api/cases/' + encodeURIComponent(id)),
  documents: () => call('/api/documents'),
  document: id => call('/api/documents/' + encodeURIComponent(id)),
  status: () => call('/api/status'),
  discover: params => call('/api/discover?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false))),
  login: (company_code, employee_id, password) => call('/api/login', { method: 'POST', body: JSON.stringify({ company_code, employee_id, password }) }),
  logout: () => call('/api/logout', { method: 'POST', body: '{}' }),
};

// 세션 캐시(서버가 기준. 여기서는 화면 분기용으로만 사용)
export const state = { user: null, boot: null, examples: null, docs: null, status: null };
export async function refreshSession() {
  try { const s = await api.session(); state.user = s.user; } catch { state.user = null; }
  return state.user;
}
export function clearPrivate() {
  state.user = null; state.examples = null; state.docs = null; state.status = null;
  store.del('astra_chat'); store.del('astra_ctx'); store.del('astra_open'); store.del('astra_list_scroll'); store.del('astra_tab'); store.del('astra_show_discover');
}

// ---------- 날짜 · 금액 (KST 기준) ----------
export const DEMO_ASOF = '2026-05-11'; // 시연 기준일. 수집 데이터(2026-04~06 공고)의 모집 기간 안.
export function asOf() {
  const q = new URLSearchParams(location.search).get('asof');
  const v = q || store.get('astra_asof') || DEMO_ASOF;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEMO_ASOF;
}
export function setAsOf(v) { store.set('astra_asof', v); }
export function todayKST() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return d.toISOString().slice(0, 10);
}
const dayNum = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
// 반환: {n, label, kind}  kind: none|closed|today|soon|mid|far
export function dday(deadline, ref = asOf()) {
  if (!deadline) return { n: null, label: '확인 필요', kind: 'none' };
  const n = dayNum(deadline.slice(0, 10)) - dayNum(ref);
  if (n < 0) return { n, label: '마감', kind: 'closed' };
  if (n === 0) return { n, label: 'D-DAY', kind: 'today' };
  return { n, label: `D-${n}`, kind: n <= 3 ? 'soon' : n <= 10 ? 'mid' : 'far' };
}
export function won(v) {
  if (v == null || !isFinite(v) || v <= 0) return '금액 미상';
  if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억원';
  return Math.round(v / 1e4).toLocaleString('ko-KR') + '만원';
}
export const fmtDate = s => s ? s.slice(0, 16).replace(/-/g, '.').replace(' ', ' · ') : '마감일 확인 필요';
export const shortSector = s => (s || '').replace(/^용역·/, '');

// HOT: 조회수 데이터가 없으므로 "기준일 모집 중 + 예산 규모 + 첨부 수"로 선정 (화면에 기준 표기)
export function pickHot(notices, ref = asOf(), n = 10) {
  return notices.filter(x => { const d = dday(x.deadline, ref); return d.n != null && d.n >= 0; })
    .sort((a, b) => (b.budget || 0) - (a.budget || 0) || (b.attachmentCount || 0) - (a.attachmentCount || 0))
    .slice(0, n);
}
export function pickDue(notices, ref = asOf(), within = 10) {
  return notices.filter(x => { const d = dday(x.deadline, ref); return d.n != null && d.n >= 0 && d.n <= within; })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

// ---------- 화면 전환 ----------
export function curtain(dark = false) {
  const c = document.getElementById('curtain');
  c.classList.toggle('dark', dark);
  return {
    async close() { if (reduced()) return; c.classList.add('on'); await sleep(430); },
    open() { requestAnimationFrame(() => c.classList.remove('on')); },
  };
}
export function go(hash) { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); }

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400);
}

export const icons = {
  arrowR: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  arrowL: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  chevR: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  arrowUR: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3"/><path d="m20.2 18.2 1.8 1.8"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="11" height="18" rx="1.5"/><path d="M15 9h4a1 1 0 0 1 1 1v11M8 7h3M8 11h3M8 15h3"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  logout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  msg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.2A8.5 8.5 0 1 1 21 12z"/></svg>',
  check: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#3DDC97" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  brand: '<svg viewBox="0 0 60 36" fill="none"><path d="M2 20C14 8 30 4 58 6 44 10 36 14 30 22c10-4 18-4 24-2-14 2-26 8-34 14 2-6 4-10 8-14-8 0-16 0-26-0z" fill="currentColor"/></svg>',
};
