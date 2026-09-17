export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Restricted Markdown: paragraphs, list-looking lines, headings, bold. Never HTML, links or images.
// Every text token uses code-point positions in the untouched canonical string.
export function renderAnswer(text,contexts=[],spans=[],highlight=false){
 const chars=Array.from(text);
 function range(a,b){let html='';for(let i=a;i<b;i++){const ss=highlight?spans.filter(s=>s.start<=i&&i<s.end):[];
 const c=escapeHTML(chars[i]);html+=ss.length?'<mark data-start="'+ss[0].start+'" data-end="'+ss[0].end+'" title="'+escapeHTML(ss.map(s=>s.label+': '+s.reason).join(' / '))+'">'+c+'</mark>':c;}return html;}
 function inline(a,b){let html='';for(let i=a;i<b;){
  const rest=chars.slice(i,b).join(''),citation=/^\[(\d+)\]/.exec(rest);
  if(citation){const n=Number(citation[1]),end=i+citation[0].length;
   html+=contexts.some(c=>c.citation===n)?'<button class="citation" data-citation="'+n+'" aria-label="인용 '+n+' 근거 보기">'+range(i,end)+'</button>':'<span class="invalid-citation" title="입력 근거에 없는 인용번호">'+range(i,end)+'</span>';i=end;continue;}
  if(chars[i]==='*'&&chars[i+1]==='*'){let end=i+2;while(end<b&&!(chars[end]==='*'&&chars[end+1]==='*'))end++;
   // Keep formatting markers when an annotated span touches them, preserving visible review coverage.
   if(end<b&&!spans.some(s=>highlight&&((s.start<i+2&&s.end>i)||(s.start<end+2&&s.end>end)))){html+='<strong>'+inline(i+2,end)+'</strong>';i=end+2;continue;}}
  html+=range(i,i+1);i++;
 }return html;}
 let out='',start=0;for(let i=0;i<=chars.length;i++){if(i===chars.length||chars[i]==='\n'){
 const line=chars.slice(start,i).join('');out+='<div class="'+(/^\s*([-*]|\d+\.)\s/.test(line)?'answer-list':'answer-line')+'">'+(inline(start,i)||'<br>')+'</div>';start=i+1;}}return out;
}
