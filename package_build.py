"""Create a local handoff archive without keys, personal records or .git."""
from pathlib import Path
import hashlib, json, zipfile

ROOT=Path(__file__).resolve().parent
def digest_file(path):
 with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def build(destination,include_models=False):
 destination=Path(destination)
 if destination.exists():raise SystemExit('Refusing to overwrite an existing handoff archive')
 files=[]
 for p in ROOT.rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(ROOT)
  if any(x in rel.parts for x in ['.git','private','__pycache__']):continue
  if rel.parts[0]=='runtime':
   if not include_models or len(rel.parts)<3 or rel.parts[1] not in ['bge-detector','ollama-models']:continue
   if rel.parts[1]=='ollama-models' and rel.parts[2] not in ['blobs','manifests']:continue
  if p.suffix in ['.pyc','.key','.sqlite'] or rel.as_posix()=='evidence/replay-mapping.json':continue
  if rel.parts[0] not in ['public','docs','evidence','downloads','legacy-source','user-db','runtime'] and len(rel.parts)>1:continue
  if p.name=='PACKAGE_MANIFEST.json' or p.suffix=='.log':continue
  if p.name.startswith('.') and p.name not in ['.gitignore','.gitattributes']:continue
  files.append((p,rel))
 with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as z:
  for p,rel in files:z.write(p,'ASTRA-Weevolve/'+rel.as_posix(),compress_type=zipfile.ZIP_STORED if p.stat().st_size>100_000_000 else zipfile.ZIP_DEFLATED)
  manifest={rel.as_posix():digest_file(p) for p,rel in files}
  z.writestr('ASTRA-Weevolve/PACKAGE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
 digest=digest_file(destination)
 destination.with_suffix(destination.suffix+'.sha256').write_text(digest+'  '+destination.name+'\n',encoding='utf-8')
 print(json.dumps({'archive':str(destination),'files':len(files)+1,'sha256':digest,'bytes':destination.stat().st_size},ensure_ascii=False))

if __name__=='__main__':
 import sys
 build(sys.argv[1],include_models='--include-models' in sys.argv)
