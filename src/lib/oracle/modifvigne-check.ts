import { z } from 'zod';
import { invokeModifvigne, modifvigneAdapter } from './adapters/modifvigne-v3-4';
import { modifvigneCheckSchema } from './modifvigne-check-contract';

const resultSchema = modifvigneCheckSchema.shape.cases.element.omit({ label: true });
/** Independent public fixtures only. Never accepts a round ID or a Challenger key. */
export function checkModifvigne() {
  const cases = [
    ['Empty text', ''],
    ['ASCII', 'Penelitian algoritma v3.4'],
    ['NUL and line breaks', '\0first\nsecond\r\n'],
    ['Unicode', 'Halo dunia — café 🔬'],
    ['127 bytes', 'a'.repeat(127)],
    ['128 bytes', 'b'.repeat(128)],
    ['64 bytes', 'c'.repeat(64)],
    ['128 UTF-8 bytes', 'é'.repeat(64)],
  ].map(([label, text]) => ({
    label,
    ...resultSchema.parse(
      invokeModifvigne({
        operation: 'check',
        inputBase64: Buffer.from(text).toString('base64'),
        key: 'ResearchFixtureKey0123456789ABCD',
      }),
    ),
  }));
  return modifvigneCheckSchema.parse({
    checkedAt: new Date().toISOString(),
    maxInputBytes: 128,
    sourceVersion: 'original-v3.4',
    encryptionSha256: modifvigneAdapter.configSchema.parse({}).encryptionSha256,
    decryptionSha256: modifvigneAdapter.configSchema.parse({}).decryptionSha256,
    cases,
  });
}
// Keep unknown/extra bridge fields out of the public report.
export const emptyCheckRequest = z.strictObject({});
