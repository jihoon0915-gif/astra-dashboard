"""Start the workspace-owned offline Ollama service when needed."""
import json,os,shutil,subprocess,time,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def ensure_ollama():
    def running():
        try:
            with urllib.request.urlopen('http://127.0.0.1:11435/api/tags',timeout=2) as r:
                return any(m['name']=='astra-qwen3:8b' for m in json.load(r).get('models',[]))
        except Exception:return False
    if running():return
    executable=shutil.which('ollama')
    if not executable:
        print('Qwen3: Ollama is not installed. Saved examples remain available.',flush=True);return
    if not (ROOT/'runtime/ollama-models/manifests').exists():
        print('Qwen3: local model is missing. See MODEL_SETUP.md.',flush=True);return
    env=dict(os.environ,OLLAMA_HOST='127.0.0.1:11435',OLLAMA_MODELS=str(ROOT/'runtime/ollama-models'),
             OLLAMA_NO_CLOUD='true',OLLAMA_NUM_PARALLEL='1',OLLAMA_MAX_LOADED_MODELS='1')
    with (ROOT/'runtime/ollama-service.log').open('ab') as log:
        subprocess.Popen([executable,'serve'],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,
                         creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    for _ in range(30):
        if running():return
        time.sleep(.5)
    print('Qwen3: service is not ready; check runtime/ollama-service.log.',flush=True)
