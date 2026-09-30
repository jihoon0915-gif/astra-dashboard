"""Verify and join the six release assets into the original model-inclusive ZIP."""
import argparse
import hashlib
import json
from pathlib import Path


def filename(value):
    if not isinstance(value, str) or value in ('', '.', '..') or any(c in value for c in '/\\:'):
        raise ValueError('Invalid filename in package manifest')
    return value


def restore(directory):
    directory = Path(directory)
    manifest = json.loads((directory / 'BlueJay_package_manifest.json').read_text(encoding='utf-8'))
    destination = directory / filename(manifest['archive'])
    parts = [(directory / filename(part['name']), part) for part in manifest['parts']]
    if not parts or sum(part['bytes'] for _, part in parts) != manifest['bytes']:
        raise ValueError('Invalid package size in manifest')
    if destination.exists():
        with destination.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest == manifest['sha256']:
            print(f'Already restored and verified: {destination}')
            return destination
        raise FileExistsError(f'Refusing to overwrite: {destination}')
    for path, part in parts:
        if not path.is_file() or path.stat().st_size != part['bytes']:
            raise ValueError(f'Missing or incomplete part: {path.name}')
    temporary = destination.with_name(destination.name + '.partial')
    whole = hashlib.sha256()
    created = False
    try:
        with temporary.open('xb') as output:
            created = True
            for index, (path, part) in enumerate(parts, 1):
                digest = hashlib.sha256()
                with path.open('rb') as stream:
                    while block := stream.read(8 * 1024 * 1024):
                        output.write(block)
                        digest.update(block)
                        whole.update(block)
                if digest.hexdigest() != part['sha256']:
                    raise ValueError(f'Checksum mismatch: {path.name}')
                print(f'Verified part {index}/{len(parts)}: {path.name}', flush=True)
        if whole.hexdigest() != manifest['sha256'] or temporary.stat().st_size != manifest['bytes']:
            raise ValueError('Complete ZIP checksum or size mismatch')
        if destination.exists():
            raise FileExistsError(f'Refusing to overwrite: {destination}')
        temporary.rename(destination)
        print(f'Restored and verified: {destination}')
        return destination
    finally:
        if created and temporary.exists():
            temporary.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', default='.', help='Folder containing all release parts and the manifest')
    try:
        restore(parser.parse_args().directory)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'{error}\n')
