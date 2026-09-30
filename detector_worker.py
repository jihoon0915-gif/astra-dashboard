"""Isolated inference process: releases detector memory after each answer."""
import json, os, sys, time
from pathlib import Path
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'runtime/bge-detector'))

if __name__=='__main__':
    import torch
    from detector_runtime import BgeM3HallucinationDetector
    torch.set_num_threads(4)
    data=json.loads(sys.stdin.buffer.read().decode('utf-8'))
    started=time.perf_counter()
    detector=BgeM3HallucinationDetector(ROOT/'runtime/bge-detector/model',device='cpu',threshold=.5,max_length=512,aggregation='min')
    result=detector.detect(**data)
    result['elapsed_seconds']=round(time.perf_counter()-started,2)
    sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode('utf-8'))
