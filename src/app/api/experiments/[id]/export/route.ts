import { z } from 'zod';
import { api, download, routeId, type RouteContext } from '@/lib/api/http';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, context: RouteContext) {
  return api(async () => {
    const id = await routeId(context);
    const format = z
      .enum(['json', 'csv'])
      .parse(new URL(request.url).searchParams.get('format') ?? 'json');
    return download(getService().export(id, format), id, format);
  });
}
