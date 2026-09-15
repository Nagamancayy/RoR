import type { InputEncoding } from '@/lib/public-types';

// Presentation-only conversions. The server independently validates every query.
export function decodeInput(value: string, encoding: InputEncoding): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(value);
  if (encoding === 'hex') {
    if (/[^0-9a-fA-F]/.test(value))
      throw new Error('Hex must contain only 0–9 and A–F, without spaces or a 0x prefix.');
    if (value.length % 2)
      throw new Error('Hex must have an even number of digits: two digits per byte.');
    return Uint8Array.from(value.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('Enter valid, padded Base64 using A–Z, a–z, 0–9, + and /.');
  const binary = atob(value);
  if (btoa(binary) !== value)
    throw new Error('Base64 must use canonical padding and valid trailing bits.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBytes(bytes: Uint8Array, encoding: InputEncoding): string {
  if (encoding === 'utf8') {
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error(
        'These bytes are not valid UTF-8. Keep Hex or Base64 to preserve the exact input.',
      );
    }
  }
  if (encoding === 'hex')
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  return btoa(chunks.join(''));
}

export function ascii(bytes: Uint8Array) {
  return Array.from(bytes, (byte) =>
    byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·',
  ).join('');
}
