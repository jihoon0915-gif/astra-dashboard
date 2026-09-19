import assert from 'node:assert/strict';
import {VERSION,decodeLines,eventGuard} from './dist/rag-http.mjs';
const sha=async t=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))).toString('hex');
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS '+name);}
const options={requestId:'request-123',bid:'R26BK01000001-000',snapshot:'snapshot',mode:'test',documents:[{document_id:'doc',bid_key:'R26BK01000001-000',security_level:'L1'}]};
const base={schema_version:VERSION,request_id:options.requestId,bid:options.bid,snapshot_id:options.snapshot,mode:'test',detection:'not_run'};
const text='테스트 😀';
const c={chunk_id:'doc-CH-00000',document_id:'doc',document_version:'v1',filename:'test.txt',text,text_start:0,text_end:Array.from(text).length,security_level:'L1',bid_key:options.bid,citation:1,scope:'test_input',text_sha256:await sha(text),page:null,offset_unit:'Unicode code point; 0-based; end exclusive'};
const retrieval={...base,type:'retrieval',seq:1,contexts:[c]};
const answer='테스트 응답 · 실제 모델 생성 아님\n가나다 😀';
const delta={...base,type:'delta',seq:2,text:answer};
const done={...base,type:'done',seq:3,answer,answer_sha256:await sha(answer),complete:true,abstained:false,generated:false};
async function consume(bytes,size){const chunks=[];for(let i=0;i<bytes.length;i+=size)chunks.push(bytes.slice(i,i+size));const reader=new ReadableStream({start(controller){for(const c of chunks)controller.enqueue(c);controller.close();}}).getReader();const out=[];for await(const e of decodeLines(reader))out.push(e);return out;}
await test('UTF-8 byte splits and coalesced records',async()=>{
 const bytes=new TextEncoder().encode([retrieval,delta,done].map(e=>JSON.stringify(e)+'\n').join(''));
 for(const size of [1,7,bytes.length])assert.deepEqual(await consume(bytes,size),[retrieval,delta,done]);
});
await test('invalid JSON, oversized line, unterminated stream',async()=>{
 for(const t of ['bad\n','{"type":','x'.repeat(250001)+'\n'])await assert.rejects(consume(new TextEncoder().encode(t),512));
});
await test('happy path canonical answer and sources',async()=>{const g=eventGuard(options);for(const e of [retrieval,delta,done])await g.accept(e);g.finish();});
await test('request, notice, mode, snapshot, sequence and detection spoof',async()=>{
 for(const patch of [{request_id:'other'},{bid:'other'},{snapshot_id:'other'},{seq:2},{mode:'model'},{detection:'no_hallucination'},{schema_version:'wrong'}])
 await assert.rejects(eventGuard(options).accept({...retrieval,...patch}));
});
await test('unauthorized/evaluation evidence, invalid hashes and offsets',async()=>{
 for(const patch of [{security_level:'L3'},{bid_key:'other'},{document_id:'other'},{tenant_id:'C01'},{expected_answer:'secret'},{text:'tampered'},{text_end:999},{scope:'prompt_context'},{citation:3},{page:7}]){
  await assert.rejects(eventGuard(options).accept({...retrieval,contexts:[{...c,...patch}]}));
 }
});
await test('done hash/string mismatch and incomplete connection',async()=>{
 for(const patch of [{answer:'different'},{answer_sha256:'bad'},{generated:true},{complete:false}]){
  const g=eventGuard(options);await g.accept(retrieval);await g.accept(delta);await assert.rejects(g.accept({...done,...patch}));
 }
 const g=eventGuard(options);await g.accept(retrieval);assert.throws(()=>g.finish());
});
await test('terminal errors, late packets, unknown events',async()=>{
 const g=eventGuard(options);await g.accept({...base,seq:1,type:'error',code:'TEST',message:'test',retryable:true,complete:false});g.finish();
 await assert.rejects(g.accept(retrieval));
 await assert.rejects(eventGuard(options).accept({...base,seq:1,type:'oops'}));
});
console.log(JSON.stringify({tests,passed:tests,actual_model_called:false}));
