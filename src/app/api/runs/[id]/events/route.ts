import { api, routeId, type RouteContext } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { eventsSchema } from '@/lib/runs/contracts';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, context: RouteContext) {
  return api(async () => {
    const after = z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .parse(new URL(request.url).searchParams.get('after') ?? 0);
    return getRunService().events(await routeId(context), after);
  }, eventsSchema);
}
