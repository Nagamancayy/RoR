import { z } from 'zod';
import { api, body } from '@/lib/api/http';
import { experimentSchema, summarySchema } from '@/lib/api/schemas';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return api(() => getService().list(), z.array(summarySchema));
}
export function POST(request: Request) {
  return api(async () => getService().create(await body(request)), experimentSchema, 201);
}
