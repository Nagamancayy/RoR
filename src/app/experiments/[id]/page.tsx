import { ExperimentConsole } from '@/components/experiment-console';
import { RunConsole } from '@/components/run-console';
import { getRunService } from '@/lib/runs/service';
export const dynamic = 'force-dynamic';
export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getRunService()
    .database.sqlite.prepare('SELECT id FROM experiment_runs WHERE id=?')
    .get(id);
  return run ? <RunConsole key={id} id={id} /> : <ExperimentConsole key={id} id={id} />;
}
