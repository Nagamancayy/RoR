import { api } from '@/lib/api/http';
import { getRunService } from '@/lib/runs/service';
import { adversariesSchema } from '@/lib/runs/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return api(
    () => ({
      aiConfigured: !!process.env.OPENAI_API_KEY?.trim(),
      defaultModel: process.env.OPENAI_ADVERSARY_MODEL?.trim() || '',
      workerReady: getRunService().workerReady(),
      limits: {
        rounds: 100,
        queryBudget: 100,
        maxAgentSteps: 105,
        maxInputBytes: 1024,
        maxContextBytes: 131072,
      },
    }),
    adversariesSchema,
  );
}
