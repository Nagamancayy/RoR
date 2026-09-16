import { ExperimentResult } from '@/components/experiment-result';
import { RunConsole } from '@/components/run-console';
import { getRunService } from '@/lib/runs/service';
export const dynamic = 'force-dynamic';
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return getRunService()
    .database.sqlite.prepare('SELECT id FROM experiment_runs WHERE id=?')
    .get(id) ? (
    <RunConsole key={id} id={id} />
  ) : (
    <ExperimentResult key={id} id={id} />
  );
}
