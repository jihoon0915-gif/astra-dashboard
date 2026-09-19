"""Explicit offline inference smoke; never an accuracy benchmark."""
import argparse,json,sys,threading,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from detector_bridge import Detector

def main():
 p=argparse.ArgumentParser();p.add_argument('--checkpoint',action='append',required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 rows=[]
 for folder in a.checkpoint:
  start=time.monotonic();det=Detector(folder)
  answer='이 사업의 예산은 9억원이며 제출 마감은 7월 30일입니다.'
  result=det.run('사업 예산은 부가세 포함 7천만원이다. 제출 마감은 5월 15일이다.','예산과 제출 마감은?',answer,threading.Event(),timeout=240)
  valid=all(answer[s['start']:s['end']]==s['quote'] for s in result['spans'])
  row=dict(checkpoint=Path(folder).name,elapsed_seconds=round(time.monotonic()-start,2),answer=answer,result=result,offset_valid=valid,purpose='synthetic_connection_fixture_not_accuracy')
  rows.append(row);a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
  print(row['checkpoint'],result['status'],len(result['spans']),row['elapsed_seconds'],flush=True)
 if any(r['result']['status'] not in ['completed','partial'] or not r['offset_valid'] for r in rows):raise SystemExit(1)
if __name__=='__main__':main()
