import { api, body, routeId, type RouteContext } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { runSchema } from '@/lib/runs/contracts';
import { z } from 'zod';
export const runtime = 'nodejs';
export function POST(request: Request, context: RouteContext) {
  return api(async () => {
    z.strictObject({}).parse(await body(request));
    return getRunService().stop(await routeId(context));
  }, runSchema);
}
