// Fetch-based NDJSON stream supports POST bodies and cancellation.
export function createLiveSource(base='/api/v1') {
  async function checked(url,options){const r=await fetch(url,{credentials:'same-origin',...options});if(!r.ok)throw Error(`HTTP ${r.status}`);return r;}
  return {
    async listNotices(query,signal){return (await checked(`${base}/notices?${new URLSearchParams(query)}`,{signal})).json();},
    async getWorkspace(id,signal){return (await checked(`${base}/notices/${encodeURIComponent(id)}/workspace`,{signal})).json();},
    async *ask(body,signal){
      const r=await checked(`${base}/answers/stream`,{method:'POST',signal,headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'},body:JSON.stringify(body)});
      if(!r.headers.get('Content-Type')?.includes('application/x-ndjson'))throw Error('Unexpected stream format');
      if(!r.body)throw Error('No response body');
      const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';
      try{while(true){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});let newline;
        while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);if(line)yield JSON.parse(line);}
        if(pending.length>2_000_000)throw Error('Oversized stream record');
        if(done){if(pending.trim())yield JSON.parse(pending);break;}
      }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
  };
}
