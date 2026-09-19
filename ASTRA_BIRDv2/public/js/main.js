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
  document.title = { '/login': 'ASTRA — 로그인', '/loading': 'ASTRA — 준비 중', '/app': 'ASTRA — 워크스페이스' }[path] || 'ASTRA — 공고 탐색과 근거 검증';
}
addEventListener('hashchange', route);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
route();
