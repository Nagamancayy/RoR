import { z } from 'zod';
import { api, body } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { runSchema } from '@/lib/runs/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return api(() => getRunService().list(), z.array(runSchema));
}
export function POST(request: Request) {
  return api(async () => getRunService().create(await body(request)), runSchema, 202);
}
