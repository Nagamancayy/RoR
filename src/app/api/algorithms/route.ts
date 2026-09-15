import { api } from '@/lib/api/http';
import { algorithmsSchema } from '@/lib/api/schemas';
import { listAlgorithms } from '@/lib/oracle/registry';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return api(listAlgorithms, algorithmsSchema);
}
