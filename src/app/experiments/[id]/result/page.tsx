import { ExperimentResult } from '@/components/experiment-result';

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentResult key={id} id={id} />;
}
