// 관성 스크롤: 휠 입력만 부드럽게 보간한다. 키보드·스크롤바·터치는 브라우저 기본 동작 유지.
import { reduced } from './core.js';

export function smoothScroll({ ease = .085 } = {}) {
  if (reduced() || matchMedia('(pointer: coarse)').matches) return { stop() { }, to(y) { scrollTo(0, y); }, onScroll() { } };
  let target = scrollY, current = scrollY, raf = 0, active = false, listeners = new Set();
  const max = () => document.documentElement.scrollHeight - innerHeight;
  const frame = () => {
    current += (target - current) * ease;
    if (Math.abs(target - current) < .4) { current = target; active = false; }
    scrollTo(0, current);
    listeners.forEach(f => f(current));
    raf = active ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!active) { active = true; raf = requestAnimationFrame(frame); } };
  const onWheel = e => {
    if (e.ctrlKey || e.defaultPrevented) return;
    // 가로 레일 위의 가로 스크롤, 내부 스크롤 영역은 건드리지 않음
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const inner = e.target.closest && e.target.closest('[data-own-scroll]');
    if (inner) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1;
    if (!active) { current = scrollY; target = scrollY; }
    target = Math.max(0, Math.min(max(), target + e.deltaY * unit));
    kick();
  };
  const onNative = () => { if (!active) { target = current = scrollY; listeners.forEach(f => f(scrollY)); } };
  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('scroll', onNative, { passive: true });
  return {
    to(y) { if (!active) current = scrollY; target = Math.max(0, Math.min(max(), y)); kick(); },
    onScroll(f) { listeners.add(f); },
    stop() { cancelAnimationFrame(raf); removeEventListener('wheel', onWheel); removeEventListener('scroll', onNative); listeners.clear(); },
  };
}
