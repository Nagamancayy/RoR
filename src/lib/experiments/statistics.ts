import type {
  AggregateStatistics,
  PublicExperimentSummary,
  PublicQuery,
  SerializedOracleResponse,
  StatisticGroup,
  StatisticSummary,
  TranscriptAnalysis,
} from '../public-types';

/** Printable ASCII excludes control bytes, DEL, and non-ASCII bytes. */
const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;
const WILSON_Z_95 = 1.959963984540054;

function outputIdentity(response: SerializedOracleResponse): string {
  // Preserve field boundaries: [ab, cd] must not equal [abcd, empty].
  return JSON.stringify(
    response.fields.map((field) => [field.name, field.byteLength, field.value.toLowerCase()]),
  );
}

/** Uses only whitelisted public transcript data; safe to call in the browser. */
export function analyzeTranscript(queries: PublicQuery[]): TranscriptAnalysis {
  const byteFrequency = Array<number>(256).fill(0);
  const inputs = new Map<string, string>();
  const outputs = new Set<string>();
  let totalInputBytes = 0;
  let totalOutputBytes = 0;
  let byteSum = 0;
  let printableBytes = 0;
  let repeatedInputsStable = true;

  for (const query of queries) {
    totalInputBytes += query.inputByteLength;
    const output = outputIdentity(query.response);
    // inputBase64 is the canonical encoding of decoded bytes, independent of
    // whether the query was entered as text, hex, or base64.
    const firstOutput = inputs.get(query.inputBase64);
    if (firstOutput === undefined) inputs.set(query.inputBase64, output);
    else if (firstOutput !== output) repeatedInputsStable = false;
    outputs.add(output);

    for (const field of query.response.fields) {
      // Adapters serialize raw bytes as validated hex. Do not count characters
      // of the hex presentation or parse text previews as oracle bytes.
      for (let offset = 0; offset < field.value.length; offset += 2) {
        const byte = Number.parseInt(field.value.slice(offset, offset + 2), 16);
        byteFrequency[byte] += 1;
        totalOutputBytes += 1;
        byteSum += byte;
        if (byte >= PRINTABLE_MIN && byte <= PRINTABLE_MAX) printableBytes += 1;
      }
    }
  }

  let entropyBitsPerByte = 0;
  let mostFrequentByte: number | null = null;
  let leastFrequentObservedByte: number | null = null;
  for (let byte = 0; byte < byteFrequency.length; byte += 1) {
    const count = byteFrequency[byte];
    if (count === 0) continue;
    const probability = count / totalOutputBytes;
    entropyBitsPerByte -= probability * Math.log2(probability);
    if (mostFrequentByte === null || count > byteFrequency[mostFrequentByte]) {
      mostFrequentByte = byte;
    }
    if (leastFrequentObservedByte === null || count < byteFrequency[leastFrequentObservedByte]) {
      leastFrequentObservedByte = byte;
    }
  }

  return {
    queryCount: queries.length,
    totalInputBytes,
    totalOutputBytes,
    uniqueInputs: inputs.size,
    repeatedInputs: queries.length - inputs.size,
    duplicateOutputs: queries.length - outputs.size,
    byteFrequency,
    entropyBitsPerByte,
    meanByteValue: totalOutputBytes === 0 ? null : byteSum / totalOutputBytes,
    mostFrequentByte,
    leastFrequentObservedByte,
    printableByteFraction: totalOutputBytes === 0 ? 0 : printableBytes / totalOutputBytes,
    repeatedInputsStable,
  };
}

function validateCounts(correct: number, completed: number): void {
  if (
    !Number.isSafeInteger(completed) ||
    completed < 0 ||
    !Number.isSafeInteger(correct) ||
    correct < 0 ||
    correct > completed
  ) {
    throw new RangeError('Counts must be nonnegative integers with correct <= completed.');
  }
}

/** Wilson score interval for a binomial probability, with 95% coverage. */
export function wilsonInterval(correct: number, completed: number): [number, number] | null {
  validateCounts(correct, completed);
  if (completed === 0) return null;
  const probability = correct / completed;
  const zSquared = WILSON_Z_95 ** 2;
  const denominator = 1 + zSquared / completed;
  const center = (probability + zSquared / (2 * completed)) / denominator;
  const radius =
    (WILSON_Z_95 *
      Math.sqrt((probability * (1 - probability)) / completed + zSquared / (4 * completed ** 2))) /
    denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}

/**
 * Exact two-sided binomial test against p = 1/2, evaluated in floating point.
 * Symmetry gives 2 * P(X <= min(C, N-C)). Start at the mode with relative mass
 * one and normalize after recurrence, avoiding the 2^-N underflow that breaks
 * naive implementations for large N, including almost-balanced samples.
 */
export function exactBinomialPValue(correct: number, completed: number): number | null {
  validateCounts(correct, completed);
  if (completed === 0) return null;
  const tail = Math.min(correct, completed - correct);
  const mode = Math.floor(completed / 2);
  if (tail === mode) return 1;

  let relativeMass = 1;
  let lowerMass = 0;
  let tailMass = 0;
  for (let count = mode; count > 0; count -= 1) {
    relativeMass *= count / (completed - count + 1);
    if (relativeMass === 0) break;
    lowerMass += relativeMass;
    if (count - 1 <= tail) tailMass += relativeMass;
  }
  // For odd N there are two equally likely modes; even N has one.
  const totalMass = completed % 2 === 0 ? 1 + 2 * lowerMass : 2 * (1 + lowerMass);
  return Math.min(1, (2 * tailMass) / totalMass);
}

function summarize(completedExperiments: PublicExperimentSummary[]): StatisticSummary {
  const completed = completedExperiments.length;
  const correct = completedExperiments.filter((experiment) => experiment.isCorrect === true).length;
  const queryCounts = completedExperiments
    .map((experiment) => experiment.queryCount)
    .sort((a, b) => a - b);
  const middle = Math.floor(completed / 2);
  const successRate = completed === 0 ? null : correct / completed;
  return {
    completed,
    correct,
    incorrect: completed - correct,
    successRate,
    advantage: successRate === null ? null : Math.abs(2 * successRate - 1),
    wilson95: wilsonInterval(correct, completed),
    binomialPValue: exactBinomialPValue(correct, completed),
    averageQueries:
      completed === 0 ? 0 : queryCounts.reduce((sum, count) => sum + count, 0) / completed,
    medianQueries:
      completed === 0
        ? 0
        : completed % 2 === 1
          ? queryCounts[middle]
          : (queryCounts[middle - 1] + queryCounts[middle]) / 2,
    smallSample: completed < 20,
  };
}

function groupBy(
  experiments: PublicExperimentSummary[],
  getLabel: (experiment: PublicExperimentSummary) => string,
): StatisticGroup[] {
  const groups = new Map<string, PublicExperimentSummary[]>();
  for (const experiment of experiments) {
    const label = getLabel(experiment);
    const group = groups.get(label) ?? [];
    group.push(experiment);
    groups.set(label, group);
  }
  return [...groups.keys()].sort().map((label) => ({ label, ...summarize(groups.get(label)!) }));
}

/** Completed sessions alone contribute to accuracy, groups, and timelines. */
export function aggregateStatistics(experiments: PublicExperimentSummary[]): AggregateStatistics {
  const completed = experiments.filter((experiment) => experiment.status === 'COMPLETED');
  const bucketRanges = [
    { label: '0', min: 0, max: 0 },
    { label: '1–4', min: 1, max: 4 },
    { label: '5–16', min: 5, max: 16 },
    { label: '17–32', min: 17, max: 32 },
    { label: '33–128', min: 33, max: 128 },
    { label: '129+', min: 129, max: Number.POSITIVE_INFINITY },
  ];
  const chronological = [...completed].sort((a, b) => {
    const first = a.completedAt ?? a.createdAt;
    const second = b.completedAt ?? b.createdAt;
    return first < second ? -1 : first > second ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  let cumulativeCorrect = 0;
  return {
    ...summarize(completed),
    byAlgorithm: groupBy(completed, (experiment) => experiment.algorithmId),
    byKind: groupBy(completed, (experiment) => experiment.kind),
    queryBuckets: bucketRanges.map(({ label, min, max }) => ({
      label,
      ...summarize(
        completed.filter(
          (experiment) => experiment.queryCount >= min && experiment.queryCount <= max,
        ),
      ),
    })),
    cumulative: chronological.map((experiment, index) => {
      if (experiment.isCorrect === true) cumulativeCorrect += 1;
      return {
        completed: index + 1,
        successRate: cumulativeCorrect / (index + 1),
        completedAt: experiment.completedAt ?? experiment.createdAt,
      };
    }),
  };
}
