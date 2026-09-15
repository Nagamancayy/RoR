import { api } from '@/lib/api/http';
import { statisticsSchema } from '@/lib/api/schemas';
import { getService } from '@/lib/experiments/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return api(() => getService().statistics(), statisticsSchema);
}
