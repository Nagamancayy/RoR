// Browser-safe public contract. Secret challenger types belong in server modules.
export type ExperimentKind = 'ENCRYPTION_ROR' | 'PRF_ROR';
export type ExperimentStatus = 'ACTIVE' | 'COMPLETED' | 'ABORTED';
export type Guess = 'REAL' | 'RANDOM';
export type InputEncoding = 'utf8' | 'hex' | 'base64';
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface DisplayConfig {
  responseEncoding: 'hex' | 'base64';
  groupBytes: 0 | 2 | 4 | 8;
  uppercase: boolean;
  asciiPreview: boolean;
}
export interface SerializedField {
  name: string;
  encoding: 'hex';
  byteLength: number;
  value: string;
}
export interface SerializedOracleResponse {
  fields: SerializedField[];
  totalByteLength: number;
}
export interface PublicQuery {
  id: string;
  index: number;
  inputEncoding: InputEncoding;
  inputBase64: string;
  inputByteLength: number;
  response: SerializedOracleResponse;
  createdAt: string;
}
export interface PublicExperimentSummary {
  id: string;
  name: string;
  kind: ExperimentKind;
  algorithmId: string;
  status: ExperimentStatus;
  algorithmConfig: Record<string, JsonValue>;
  displayConfig: DisplayConfig;
  queryLimit: number;
  queryCount: number;
  reproducible: boolean;
  revealSeed: boolean;
  configFingerprint: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  abortedAt: string | null;
  world?: Guess;
  guess?: Guess;
  isCorrect?: boolean;
  seed?: string;
}
export interface TranscriptAnalysis {
  queryCount: number;
  totalInputBytes: number;
  totalOutputBytes: number;
  uniqueInputs: number;
  repeatedInputs: number;
  duplicateOutputs: number;
  byteFrequency: number[];
  entropyBitsPerByte: number;
  meanByteValue: number | null;
  mostFrequentByte: number | null;
  leastFrequentObservedByte: number | null;
  printableByteFraction: number;
  repeatedInputsStable: boolean;
}
export interface PublicExperiment extends PublicExperimentSummary {
  queries: PublicQuery[];
  analysis: TranscriptAnalysis;
  transcriptFingerprint: string;
}
export interface StatisticSummary {
  completed: number;
  correct: number;
  incorrect: number;
  successRate: number | null;
  advantage: number | null;
  wilson95: [number, number] | null;
  binomialPValue: number | null;
  averageQueries: number;
  medianQueries: number;
  smallSample: boolean;
}
export interface StatisticGroup extends StatisticSummary {
  label: string;
}
export interface AggregateStatistics extends StatisticSummary {
  byAlgorithm: StatisticGroup[];
  byKind: StatisticGroup[];
  queryBuckets: StatisticGroup[];
  cumulative: { completed: number; successRate: number; completedAt: string }[];
}
export interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'text';
  default: number | string;
  min?: number;
  max?: number;
  help: string;
}
export interface AlgorithmMetadata {
  id: string;
  displayName: string;
  kind: ExperimentKind;
  description: string;
  securityNote: string;
  responseFields: { name: string; description: string }[];
  configFields: ConfigField[];
}
export interface CreateExperimentInput {
  name?: string;
  kind: ExperimentKind;
  algorithmId: string;
  algorithmConfig?: Record<string, JsonValue>;
  queryLimit?: number;
  reproducible?: boolean;
  revealSeed?: boolean;
  seed?: string;
  displayConfig?: Partial<DisplayConfig>;
}
