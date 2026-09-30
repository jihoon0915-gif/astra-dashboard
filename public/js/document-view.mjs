const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function documentHTML(text) {
  const lines = String(text ?? '').replace(/가상\s+(?=한빛IT|해온시스템|인우블록|누리클라우드|새온에너지SW)/g, '').split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i++].trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        if (cells.every(s => /^:?-+:?$/.test(s))) continue;
        rows.push(cells);
      }
      result.push('<div class="document-table"><table>' + rows.map((r,n) => '<tr>' + r.map(c => `<${n ? 'td' : 'th'}>${escape(c)}</${n ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table></div>');
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) result.push(`<h${Math.min(heading[1].length+1,4)}>${escape(heading[2])}</h${Math.min(heading[1].length+1,4)}>`);
    else result.push('<p>' + escape(line) + '</p>');
    i++;
  }
  return result.join('');
}
