// Proposed v1 API contract. Spatial depth and access level are unrelated.
export type NodeKind = 'notice'|'agency'|'document'|'clause'|'qualification'|'task'|'equipment'|'company_record';
export interface SourceRef {
  document_version_id: string;
  chunk_id: string;
  page: number | null; // 1-based; null if not recoverable
  section: string | null;
  quote: string;
  text_start: number; // Unicode code point, end exclusive
  text_end: number;
}
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  source_refs: SourceRef[];
  extraction: 'metadata'|'rule'|'model'|'human';
  review_status: 'verified'|'unreviewed';
}
export interface GraphEdge {
  id: string; source: string; target: string;
  relation: 'ISSUED_BY'|'HAS_DOCUMENT'|'HAS_CLAUSE'|'DEFINES'|'REQUIRES'|'SUPPORTED_BY'|'APPLIES_TO';
  source_refs: SourceRef[];
}
export interface Graph {nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; next_cursor: string|null;}
export interface NoticeSummary {id:string;version_id:string;title:string;agency_name:string;category:string;}
export interface Workspace {
  schema_version: '1';
  snapshot_id: string; // immutable published ingestion snapshot
  notice: NoticeSummary & {budget_krw:number|null; deadline:string|null; status:string};
  location: null | {lng:number;lat:number;kind:'execution_site'|'agency_address'|'regional_anchor';
    source_document_version_id:string|null;confidence:number;verified:boolean};
  graph: Graph;
  company_profile: {version_id:string;available:boolean}|null;
}
export interface AskRequest {
  client_request_id:string;
  notice_id:string;
  notice_version_id:string;
  snapshot_id:string;
  company_profile_version_id:string|null;
  question:string;
}
export type StreamEvent = {
  request_id:string; seq:number; snapshot_id:string;
} & (
  {type:'retrieval'; graph:Graph; chunk_ids:string[]} |
  {type:'delta'; text:string} |
  {type:'citation'; node_ids:string[]; refs:SourceRef[]; status:'candidate'|'verified'} |
  {type:'detection'; answer_sha256:string; model_version:string; threshold:number;
    spans:{start:number;end:number;probability:number;kind:'unsupported';source_refs:SourceRef[]}[]} |
  {type:'done'; answer:string; answer_sha256:string; validation:'complete'|'unavailable'; abstained:boolean} |
  {type:'error'; code:string; message:string; retryable:boolean}
);
export interface DataSource {
  listNotices(query:Record<string,string>,signal:AbortSignal):Promise<{items:NoticeSummary[];next_cursor:string|null}>;
  getWorkspace(id:string,signal:AbortSignal):Promise<Workspace>;
  ask(body:AskRequest,signal:AbortSignal):AsyncIterable<StreamEvent>;
}
