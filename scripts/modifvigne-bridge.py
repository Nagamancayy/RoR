"""Transport only. The two pinned research sources are executed without edits."""
import base64
import builtins
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parent.parent / 'vendor' / 'modifvigne-v3-4'
HASHES = {
    'gabung_coba_coba_v3_4.py': 'bde33391750173f4c1b5e6825302976f62b7e09c49b2e594fa46411e43e42470',
    'dekrip_v3_4.py': '731bb01192d83e631a704df610fa56620dedb0d8ea62471703b55fbf2ea6b56b',
}


class SourceUnavailable(Exception):
    pass


def sources():
    try:
        for name, digest in HASHES.items():
            if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
                raise SourceUnavailable()
    except OSError:
        raise SourceUnavailable() from None


def encrypt(message, key):
    module = runpy.run_path(str(ROOT / 'gabung_coba_coba_v3_4.py'))
    return module['encrypt_v3_4'](message, key)


def decrypt(payload, key):
    # The original decryption has no callable entry point. Run its entire CLI body,
    # supplying exactly its two input() answers and collecting its final variables.
    # No extraction/reimplementation of its cipher, padding or verification logic.
    answers = iter([payload.hex(), key])
    original_input = builtins.input
    try:
        builtins.input = lambda prompt='': next(answers)
        with contextlib.redirect_stdout(io.StringIO()):
            result = runpy.run_path(str(ROOT / 'dekrip_v3_4.py'), run_name='__main__')
        return result
    finally:
        builtins.input = original_input


def main(request):
    sources()
    if request['operation'] == 'health':
        return {'ready': True}
    message_bytes = base64.b64decode(request['inputBase64'], validate=True)
    if len(message_bytes) > 127:
        raise ValueError('input limit')
    message = message_bytes.decode('utf-8')
    key = request['key']
    if not isinstance(key, str) or not key or len(key) > 256:
        raise ValueError('invalid key')
    payload = encrypt(message, key)
    if request['operation'] == 'encrypt':
        return {'payloadHex': payload.hex()}
    if request['operation'] != 'check':
        raise ValueError('unknown operation')
    decoded = decrypt(payload, key)
    # Latin-1 preserves every byte; compare bytes separately from the CLI's text.
    return {
        'inputBytes': len(message_bytes),
        'outputBytes': len(payload),
        'bytesMatch': decoded['pesanakhir'].encode('latin-1') == message_bytes,
        'textMatches': decoded['pesanakhir'] == message,
        'tagVerified': decoded['verified'],
    }


if __name__ == '__main__':
    try:
        print(json.dumps(main(json.load(sys.stdin))))
    except SourceUnavailable:
        print(json.dumps({'error': 'MODIFVIGNE_SOURCE_UNAVAILABLE'}))
        sys.exit(1)
    except (Exception, SystemExit):
        # Never emit source exceptions, plaintext, key, CLI output or tracebacks.
        print(json.dumps({'error': 'MODIFVIGNE_EXECUTION_FAILED'}))
        sys.exit(1)
