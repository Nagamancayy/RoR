import { api, routeId, download, type RouteContext } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, context: RouteContext) {
  return api(async () => {
    const id = await routeId(context);
    const format = z
      .enum(['json', 'csv'])
      .parse(new URL(request.url).searchParams.get('format') ?? 'json');
    return download(getRunService().export(id, format), id, format);
  });
}
