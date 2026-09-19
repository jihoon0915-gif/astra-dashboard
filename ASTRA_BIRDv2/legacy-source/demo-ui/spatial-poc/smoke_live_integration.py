"""Opt-in local live smoke: real generation, retrieval and detector; no gold input."""
import argparse,json,time,urllib.request,uuid
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8769);p.add_argument('--out',type=Path,required=True);a=p.parse_args();url=f'http://127.0.0.1:{a.port}'
 with urllib.request.urlopen(url+'/api/l1/status',timeout=20) as r:status=json.load(r)
 body=dict(schema_version='l1-http-1',request_id='smoke-'+uuid.uuid4().hex,snapshot_id=status['snapshot_id'],bid='R26BK01550466-000',question='AI-OCR 솔루션의 라이선스 조건을 근거에서 찾아 한 문장으로 답하세요.')
 req=urllib.request.Request(url+'/api/l1/answers/stream',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Astra-Token':status['csrf_token'],'Origin':url})
 start=time.monotonic();events=[]
 with urllib.request.urlopen(req,timeout=600) as r:
  for line in r:
   if line.strip():events.append(json.loads(line))
 done=events[-1];answer=done.get('answer','');detection=done.get('detection_result',{})
 report=dict(purpose='live_connection_not_accuracy',elapsed_seconds=round(time.monotonic()-start,2),bid=body['bid'],question=body['question'],model=status['model_alias'],events=[x['type'] for x in events],answer=answer,complete=done.get('complete'),detection=detection,context_ids=[c['chunk_id'] for e in events if e['type']=='retrieval' for c in e['contexts']],offset_valid=all(answer[s['start']:s['end']]==s['quote'] for s in detection.get('spans',[])))
 a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(done['type'],detection.get('status'),report['elapsed_seconds'],flush=True)
 if done['type']!='done' or detection.get('status') not in ['completed','partial'] or not report['offset_valid']:raise SystemExit(1)
if __name__=='__main__':main()
