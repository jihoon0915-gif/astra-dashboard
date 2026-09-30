// Reveal text nodes without rebuilding markup, citation buttons or highlight spans.
export function typewrite(element,{signal,onStep=()=>{},interval=16}={}) {
  if(!element || signal?.aborted) return Promise.resolve();
  const segmenter=new Intl.Segmenter('ko',{granularity:'grapheme'});
  const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()) {
    const node=walker.currentNode, text=node.data;
    nodes.push({node,text,letters:Array.from(segmenter.segment(text),s=>s.segment)});
  }
  return new Promise(resolve=>{
    let frame, index=0, offset=0, shown=0, started;
    const total=nodes.reduce((sum,n)=>sum+n.letters.length,0);
    const previousInert=element.inert;
    element.inert=true;
    element.setAttribute('aria-busy','true');
    nodes.forEach(n=>{n.node.data='';});
    function finish() {
      cancelAnimationFrame(frame);
      nodes.forEach(n=>{n.node.data=n.text;});
      element.inert=previousInert;
      element.removeAttribute('aria-busy');
      signal?.removeEventListener('abort',finish);
      resolve();
    }
    function tick(now) {
      started ??= now;
      const target=Math.min(total,1+Math.floor((now-started)/interval));
      while(shown<target && index<nodes.length) {
        const entry=nodes[index];
        if(offset>=entry.letters.length) {index++;offset=0;continue;}
        entry.node.data+=entry.letters[offset++];shown++;
      }
      onStep();
      if(shown>=total) finish();
      else frame=requestAnimationFrame(tick);
    }
    signal?.addEventListener('abort',finish,{once:true});
    frame=requestAnimationFrame(tick);
  });
}
