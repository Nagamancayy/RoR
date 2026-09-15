import { DomainError } from '../errors';

export type Encoding = 'utf8' | 'hex' | 'base64';
export const MAX_INPUT_BYTES = 1024 * 1024;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Strict canonical encodings avoid Node's silently forgiving hex/base64 decoder. */
export function decodeInput(data: string, encoding: Encoding, limit = MAX_INPUT_BYTES): Buffer {
  let bytes: Buffer;
  if (encoding === 'utf8') {
    if (Buffer.byteLength(data, 'utf8') > limit) throw tooLarge();
    bytes = Buffer.from(data, 'utf8');
  } else if (encoding === 'hex') {
    if (!/^[\da-fA-F]*$/.test(data) || data.length % 2 !== 0) {
      throw new DomainError(
        'INVALID_INPUT_ENCODING',
        'Hex must contain an even number of hexadecimal digits, without spaces or a 0x prefix.',
      );
    }
    if (data.length / 2 > limit) throw tooLarge();
    bytes = Buffer.from(data, 'hex');
  } else if (encoding === 'base64') {
    if (!BASE64.test(data)) {
      throw new DomainError(
        'INVALID_INPUT_ENCODING',
        'Use valid standard Base64 with correct = padding and no whitespace.',
      );
    }
    const length = (data.length / 4) * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (length > limit) throw tooLarge();
    bytes = Buffer.from(data, 'base64');
    if (bytes.toString('base64') !== data) {
      throw new DomainError('INVALID_INPUT_ENCODING', 'Base64 must use canonical padding bits.');
    }
  } else {
    throw new DomainError('INVALID_INPUT_ENCODING', 'Choose UTF-8, hex, or Base64 encoding.');
  }
  return bytes;
}

function tooLarge() {
  return new DomainError('INPUT_TOO_LARGE', 'Decoded input exceeds the 1 MiB limit.');
}
