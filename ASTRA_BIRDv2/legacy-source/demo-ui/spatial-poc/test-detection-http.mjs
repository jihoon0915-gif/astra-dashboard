import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {eventGuard} from './dist/rag-http.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex'),answer='😀문장';
const root={schema_version:'l1-http-1',request_id:'request-1234',bid:'R26BK01000001-000',snapshot_id:'snap',mode:'model',detection:'not_run'};
const start={...root,type:'retrieval',seq:1,contexts:[]},delta={...root,type:'delta',seq:2,text:answer},detect={...root,type:'detecting',seq:3,detection:'running',answer,answer_sha256:hash(answer),complete:false};
const result={status:'completed',spans:[{start:0,end:1,quote:'😀',probability:.8}],unchecked_ranges:[]};
const done={...root,type:'done',seq:4,detection:'completed',detection_result:result,answer,answer_sha256:hash(answer),complete:true,generated:true,abstained:false};
const options={requestId:root.request_id,bid:root.bid,snapshot:'snap',mode:'model',documents:[]};
async function prepared(){const g=eventGuard(options);for(const e of [start,delta,detect])await g.accept(e);return g;}
let g=await prepared();await g.accept(done);g.finish();
for(const patch of [{start:1},{end:5},{quote:'x'},{probability:2}]){g=await prepared();await assert.rejects(g.accept({...done,detection_result:{...result,spans:[{...result.spans[0],...patch}]}}));}
g=eventGuard(options);await g.accept(start);await g.accept(delta);await assert.rejects(g.accept({...done,seq:3}));
g=await prepared();await g.accept({...done,detection:'not_run',detection_result:{status:'not_run',spans:[],unchecked_ranges:[[0,3]]}});g.finish();
g=await prepared();await g.accept({...root,type:'error',seq:4,code:'CANCELLED',message:'취소',retryable:true,complete:false});g.finish();
console.log('PASS 8 detection protocol cases; mock events only; real detector not run');
