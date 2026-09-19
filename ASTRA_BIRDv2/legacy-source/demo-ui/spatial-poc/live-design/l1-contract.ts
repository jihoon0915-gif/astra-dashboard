// Implemented contract l1-http-1. Earlier contracts.ts /api/v1 remains a design proposal.
export type Mode = 'test' | 'model' | 'disconnected';
export interface AskL1 {
  schema_version: 'l1-http-1';
  request_id: string; // single-use client UUID; retries require a new UUID
  snapshot_id: string;
  bid: string; // exact notice number and revision
  question: string; // 1..2000 Unicode code points
  test_behavior?: 'normal' | 'slow' | 'error' | 'empty' | 'timeout'; // test server only
}
export interface L1Reference {
  chunk_id:string; document_id:string; document_version:string; filename:string;
  bid_key:string; security_level:'L1'; citation:number;
  text:string; text_start:number; text_end:number; text_sha256:string;
  scope:'test_input'|'generation_input'; page:null; offset_unit:string;
}
interface Envelope {
  schema_version:'l1-http-1'; request_id:string; snapshot_id:string; bid:string;
  seq:number; mode:Mode; detection:'not_run';
}
export type L1Event = Envelope & (
  {type:'retrieval';contexts:L1Reference[]} |
  {type:'delta';text:string} |
  {type:'done';answer:string;answer_sha256:string;abstained:boolean;generated:boolean;complete:true} |
  {type:'error';code:string;message:string;retryable:boolean;complete:false}
);
// GET /api/l1/status; POST /api/l1/answers/stream; POST /api/l1/cancel.
// POST JSON + X-Astra-Token from same-origin status; no role/company credentials.
// NDJSON UTF-8, newline-terminated; exactly one terminal event; detection is NOT performed.
