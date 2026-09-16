import { RunConsole } from '@/components/run-console';
export default async function RoundPage({
  params,
}: {
  params: Promise<{ id: string; roundId: string }>;
}) {
  const { id, roundId } = await params;
  return <RunConsole key={id} id={id} initialRound={roundId} />;
}
