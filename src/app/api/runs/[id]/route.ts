import { api, routeId, validateOrigin, type RouteContext } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { runSchema } from '@/lib/runs/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: RouteContext) {
  return api(async () => getRunService().get(await routeId(context)), runSchema);
}
export function DELETE(request: Request, context: RouteContext) {
  return api(async () => {
    validateOrigin(request);
    getRunService().delete(await routeId(context));
    return { deleted: true };
  });
}
