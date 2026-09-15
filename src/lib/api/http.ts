import { z } from 'zod';
import { DomainError } from '@/lib/errors';

const privateHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};
export async function api(
  action: () => unknown | Promise<unknown>,
  schema?: z.ZodType,
  status = 200,
): Promise<Response> {
  try {
    const value = await action();
    if (value instanceof Response) return value;
    // Validate the outgoing whitelist too; schema failures are internal errors, never input errors.
    const parsed = schema ? schema.safeParse(value) : null;
    if (parsed && !parsed.success)
      return failure('INTERNAL_ERROR', 'The server could not serialize a public response.', 500);
    return Response.json(parsed ? parsed.data : value, { status, headers: privateHeaders });
  } catch (error) {
    if (error instanceof DomainError) return failure(error.code, error.message, error.status);
    if (error instanceof z.ZodError)
      return failure('VALIDATION_ERROR', 'Please check the submitted fields and try again.', 400);
    return failure(
      'INTERNAL_ERROR',
      'The operation could not be completed. Please try again.',
      500,
    );
  }
}
export function failure(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: privateHeaders });
}
export function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next.js may normalize request.url to localhost. Host retains the browser-facing
  // authority, and browsers cannot forge it when sending a cross-origin request.
  const publicUrl = new URL(request.url);
  const host = request.headers.get('host');
  if (host) publicUrl.host = host;
  if (
    (origin && origin !== publicUrl.origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new DomainError('VALIDATION_ERROR', 'Cross-origin requests are not allowed.', 403);
  }
}
export async function body(request: Request): Promise<unknown> {
  validateOrigin(request);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new DomainError('VALIDATION_ERROR', 'Send an application/json request.', 415);
  const maxBytes = 8 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new DomainError('INPUT_TOO_LARGE', 'The request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError('VALIDATION_ERROR', 'A JSON body is required.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new DomainError('INPUT_TOO_LARGE', 'The request is too large.', 413);
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new DomainError('VALIDATION_ERROR', 'The request must contain valid JSON.', 400);
    }
  } finally {
    reader.releaseLock();
  }
}
export type RouteContext = { params: Promise<{ id: string }> };
export async function routeId(context: RouteContext) {
  return z.uuid().parse((await context.params).id);
}
export function download(content: string, id: string, format: 'json' | 'csv') {
  return new Response(content, {
    headers: {
      ...privateHeaders,
      'Content-Type':
        format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ror-${id}.${format}"`,
    },
  });
}
