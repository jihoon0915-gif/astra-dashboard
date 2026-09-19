// Adapter: UI owns DOM/graph layout; map owns MapLibre/Three.js camera details.
// UI methods: loading,error,renderWorkspace,clearAnswer,setAnswer,setStage,
// mergeGraph,highlightNodes,showDetection,finish. All text must render safely.
export function createController({source,ui,map}) {
  async function hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
  let selection=0,answerGeneration=0,loadAbort=null,answerAbort=null,workspace=null;
  function cancelAnswer(){answerGeneration++;answerAbort?.abort();answerAbort=null;}
  return {
    async selectNotice(id){
      const generation=++selection;loadAbort?.abort();cancelAnswer();workspace=null;map.cancel();ui.clearAnswer();ui.loading(true);
      const abort=loadAbort=new AbortController();
      try{
        const next=await source.getWorkspace(id,abort.signal);
        if(generation!==selection)return;
        if(next.notice.id!==id||!next.snapshot_id)throw Error('Invalid workspace response');
        workspace=next;ui.renderWorkspace(next);
        if(next.location?.kind==='execution_site'&&next.location.verified)map.focus(next.location);
        else map.showLocationUnavailable(next.location); // never pretend agency address is job site
      }catch(e){if(generation===selection&&!abort.signal.aborted)ui.error('공고를 불러오지 못했습니다. 다시 시도해 주세요.');}
      finally{if(generation===selection)ui.loading(false);}
    },
    async ask(question){
      if(!workspace||!question.trim())return;
      cancelAnswer();const answerId=answerGeneration,selectionId=selection,w=workspace;
      const abort=answerAbort=new AbortController(),requestId=crypto.randomUUID();let text='',seq=-1,done=false;
      ui.clearAnswer();ui.setStage('검색 중');
      try{
        for await(const event of source.ask({client_request_id:requestId,notice_id:w.notice.id,notice_version_id:w.notice.version_id,snapshot_id:w.snapshot_id,company_profile_version_id:w.company_profile?.version_id??null,question},abort.signal)){
          if(selectionId!==selection||answerId!==answerGeneration)return;
          if(event.request_id!==requestId||event.snapshot_id!==w.snapshot_id||event.seq<=seq)throw Error('Invalid stream identity/order');
          seq=event.seq;
          switch(event.type){
            case 'retrieval':ui.mergeGraph(event.graph);ui.setStage('답변 생성 중 · 검증 전');break;
            case 'delta':text+=event.text;ui.setAnswer(text);break;
            case 'citation':ui.highlightNodes(event.node_ids,event.status);break;
            case 'detection':{
              if(await hash(text)!==event.answer_sha256)throw Error('Detection text mismatch');
              if(selectionId!==selection||answerId!==answerGeneration)return;
              const length=Array.from(text).length;
              if(event.spans.some(s=>!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end<=s.start||s.end>length||!Number.isFinite(s.probability)||s.probability<0||s.probability>1))throw Error('Invalid detection span');
              ui.showDetection(event,text);break;
            }
            case 'done':if(event.answer!==text||await hash(text)!==event.answer_sha256)throw Error('Final answer differs from streamed text');if(selectionId!==selection||answerId!==answerGeneration)return;done=true;ui.finish(event);break;
            case 'error':throw Error(event.message);
          }
          if(done)break;
        }
        if(!done&&!abort.signal.aborted)throw Error('Stream ended before completion');
      }catch(e){if(answerId===answerGeneration&&!abort.signal.aborted)ui.error('답변이 완료되지 않았습니다. 일부 출력은 검증되지 않았습니다.');}
    },
    cancel(){cancelAnswer();ui.setStage('중단됨 · 검증 전');},
    dispose(){selection++;loadAbort?.abort();cancelAnswer();map.cancel();}
  };
}
