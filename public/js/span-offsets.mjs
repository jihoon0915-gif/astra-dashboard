export function spansToUtf16(raw, spans) {
  const points = Array.from(raw);
  return spans.filter(sp => Number.isInteger(sp.start) && Number.isInteger(sp.end) && sp.start >= 0 && sp.end > sp.start && sp.end <= points.length)
    .map(sp => ({...sp, start:points.slice(0,sp.start).join('').length, end:points.slice(0,sp.end).join('').length}));
}
