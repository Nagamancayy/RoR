import { describe, expect, it } from 'vitest';
import { ascii, decodeInput, encodeBytes } from '../../src/components/bytes';

describe('browser presentation preserves oracle bytes', () => {
  it.each(['', 'hello', '\u0000\u0000', 'こんにちは🔬', '\ufeffhi'])(
    'round trips UTF-8 including BOM %j',
    (text) => {
      const bytes = decodeInput(text, 'utf8');
      expect(encodeBytes(bytes, 'utf8')).toBe(text);
      expect(decodeInput(encodeBytes(bytes, 'hex'), 'hex')).toEqual(bytes);
      expect(decodeInput(encodeBytes(bytes, 'base64'), 'base64')).toEqual(bytes);
    },
  );
  it('rejects invalid UTF-8 instead of silently replacing bytes', () => {
    expect(() => encodeBytes(Uint8Array.of(0xff, 0x80), 'utf8')).toThrow('not valid UTF-8');
  });
  it.each(['f', 'zz', '0x00', '00 01'])('rejects malformed hex %s', (value) =>
    expect(() => decodeInput(value, 'hex')).toThrow(),
  );
  it.each(['aGk', 'aGk===', 'aGk=\n', 'Zh==', '%%%%'])('rejects malformed base64 %s', (value) =>
    expect(() => decodeInput(value, 'base64')).toThrow(),
  );
  it('formats ASCII only for printable bytes', () =>
    expect(ascii(Uint8Array.of(0, 31, 32, 65, 126, 127, 255))).toBe('·· A~··'));
  it('supports a full 1 MiB byte array without spread stack overflow', () => {
    const bytes = new Uint8Array(1024 * 1024).fill(251);
    expect(decodeInput(encodeBytes(bytes, 'base64'), 'base64')).toEqual(bytes);
  });
});
