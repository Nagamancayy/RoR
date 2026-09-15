import { api, body, routeId, type RouteContext } from '@/lib/api/http';
import { experimentSchema } from '@/lib/api/schemas';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export function POST(request: Request, context: RouteContext) {
  return api(
    async () => getService().query(await routeId(context), await body(request)),
    experimentSchema,
  );
}
