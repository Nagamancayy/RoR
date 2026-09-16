import { api, body } from '@/lib/api/http';
import { checkModifvigne, emptyCheckRequest } from '@/lib/oracle/modifvigne-check';
import { modifvigneCheckSchema } from '@/lib/oracle/modifvigne-check-contract';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return api(async () => {
    emptyCheckRequest.parse(await body(request));
    return checkModifvigne();
  }, modifvigneCheckSchema);
}
