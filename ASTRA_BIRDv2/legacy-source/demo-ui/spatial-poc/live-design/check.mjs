import assert from 'node:assert/strict';
import {createLiveSource} from './api.mjs';
import {createController} from './controller.mjs';
// Each byte is a network chunk: Korean/emoji and JSON boundaries may split anywhere.
const original=globalThis.fetch;
globalThis.fetch=async()=>new Response(new ReadableStream({start(c){for(const b of new TextEncoder().encode('{"type":"delta","text":"한국어🙂"}\n{"type":"done"}\n'))c.enqueue(new Uint8Array([b]));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
const events=[];for await(const e of createLiveSource().ask({},new AbortController().signal))events.push(e);
assert.equal(events[0].text,'한국어🙂');assert.equal(events.length,2);globalThis.fetch=original;
let resolveA;const seen=[],source={getWorkspace(id){if(id==='A')return new Promise(r=>resolveA=r);return Promise.resolve({notice:{id:'B'},snapshot_id:'sB',location:null});}};
const ui=new Proxy({renderWorkspace:w=>seen.push(w.notice.id)},{get:(t,k)=>t[k]||(()=>{})});
const controller=createController({source,ui,map:{cancel(){},showLocationUnavailable(){}}});
const a=controller.selectNotice('A');await controller.selectNotice('B');resolveA({notice:{id:'A'},snapshot_id:'sA',location:null});await a;
assert.deepEqual(seen,['B']);controller.dispose();
console.log('PASS: split UTF-8/NDJSON parsing and stale workspace response rejection.');
