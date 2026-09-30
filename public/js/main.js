// 라우터: #/ (홈) · #/login · #/loading · #/app
import { state, refreshSession, curtain, store } from './core.js';
import { renderHome } from './home.js';
import { renderLogin } from './login.js';
import { renderLoading } from './loading.js';
import { renderApp } from './app.js';

const routes = { '': renderHome, '/': renderHome, '/login': renderLogin, '/loading': renderLoading, '/app': renderApp };
const dark = { '/login': true, '/loading': true };
const root = document.getElementById('app');
let dispose = null, current = null, seq = 0;

async function route() {
  const my = ++seq;
  const path = (location.hash.replace(/^#/, '').split('?')[0]) || '/';
  const fn = routes[path] || renderHome;
  const c = curtain(!!dark[path]);
  if (current !== null) await c.close();
  if (my !== seq) return;                      // 빠른 연속 이동 시 마지막 요청만 반영
  try { dispose && dispose(); } catch { }
  dispose = null; scrollTo(0, 0);
  if (state.user === null && current === null) await refreshSession();
  if (path === '/login' && state.user) { location.replace('#/app'); return; }
  current = path;
  const r = await fn(root);
  if (my !== seq) { try { r && r(); } catch { } return; }
  dispose = typeof r === 'function' ? r : null;
  c.open();
  document.title = { '/login': 'Blue Jay — 로그인', '/loading': 'Blue Jay — 준비 중', '/app': 'Blue Jay — 워크스페이스' }[path] || 'Blue Jay — 공고 탐색과 근거 검증';
}
addEventListener('hashchange', route);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
route();
// 뒤로가기 캐시(bfcache)로 복원된 홈도 맨 위에서 시작
addEventListener('pageshow', e => { if (e.persisted && !location.hash.replace(/^#\/?/, '')) scrollTo(0, 0); });

// Recheck account status and role while the workspace is open.
let checkingSession = false;
async function recheckSession() {
  if (checkingSession || document.hidden || !state.user) return;
  checkingSession = true;
  const previous = JSON.stringify(state.user);
  try { await refreshSession(); if (JSON.stringify(state.user) !== previous) location.reload(); }
  finally { checkingSession = false; }
}
setInterval(recheckSession, 15000);
document.addEventListener('visibilitychange', recheckSession);
