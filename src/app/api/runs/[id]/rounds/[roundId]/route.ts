import { api } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { roundDetailSchema } from '@/lib/runs/contracts';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(
  _request: Request,
  context: { params: Promise<{ id: string; roundId: string }> },
) {
  return api(async () => {
    const p = await context.params;
    return getRunService().detail(z.uuid().parse(p.id), z.uuid().parse(p.roundId));
  }, roundDetailSchema);
}
