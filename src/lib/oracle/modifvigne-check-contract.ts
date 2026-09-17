import { z } from 'zod';
export const modifvigneCheckSchema = z.strictObject({
  checkedAt: z.iso.datetime(),
  maxInputBytes: z.literal(128),
  sourceVersion: z.literal('original-v3.4'),
  encryptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  decryptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  cases: z.array(
    z.strictObject({
      label: z.string(),
      inputBytes: z.number().int(),
      outputBytes: z.number().int(),
      bytesMatch: z.boolean(),
      textMatches: z.boolean(),
      tagVerified: z.boolean(),
    }),
  ),
});
export type ModifvigneCheck = z.infer<typeof modifvigneCheckSchema>;
