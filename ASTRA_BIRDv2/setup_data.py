"""Install the exact release dataset without modifying developer source files."""
from pathlib import Path,PurePosixPath
import json,hashlib,zipfile,argparse

ROOT=Path(__file__).resolve().parent
def main():
 manifest=json.loads((ROOT/'data-version.json').read_text(encoding='utf-8'))
 parser=argparse.ArgumentParser();parser.add_argument('archive',nargs='?',default=str(ROOT/'downloads'/manifest['asset']));args=parser.parse_args();archive=Path(args.archive)
 if not archive.exists():
  raise SystemExit('Download the dataset first:\ngh release download '+manifest['release']+' --repo '+manifest['repository']+' --pattern '+manifest['asset']+' --dir downloads\nThen run: python setup_data.py')
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['sha256']:raise SystemExit('Dataset checksum mismatch. Download the version specified in data-version.json.')
 with zipfile.ZipFile(archive) as z:
  for info in z.infolist():
   path=PurePosixPath(info.filename)
   if path.is_absolute() or '..' in path.parts or '\\' in info.filename or ':' in info.filename:raise SystemExit('Unsafe archive path')
   if not (info.filename.startswith('private/') or info.filename.startswith('legacy-source/project-docs/')):raise SystemExit('Unexpected dataset file')
   if path.suffix=='.key':raise SystemExit('Local keys must not be shipped')
   target=ROOT.joinpath(*path.parts)
   if target.exists() and target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()!=hashlib.sha256(z.read(info)).hexdigest():raise SystemExit('Existing dataset differs; preserve it before replacing: '+str(target))
  z.extractall(ROOT)
 (ROOT/'evidence').mkdir(exist_ok=True)
 print('Verified dataset '+manifest['version']+' installed. Start with: python launch.py')
if __name__=='__main__':main()
