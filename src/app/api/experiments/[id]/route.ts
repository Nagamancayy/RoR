import { api, routeId, validateOrigin, type RouteContext } from '@/lib/api/http';
import { experimentSchema } from '@/lib/api/schemas';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: RouteContext) {
  return api(async () => getService().get(await routeId(context)), experimentSchema);
}
export function DELETE(request: Request, context: RouteContext) {
  return api(async () => {
    validateOrigin(request);
    getService().delete(await routeId(context));
    return { deleted: true };
  });
}
