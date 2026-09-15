import { z } from 'zod';
import { api, body, routeId, type RouteContext } from '@/lib/api/http';
import { experimentSchema } from '@/lib/api/schemas';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export function POST(request: Request, context: RouteContext) {
  return api(async () => {
    z.strictObject({}).parse(await body(request));
    return getService().abort(await routeId(context));
  }, experimentSchema);
}
