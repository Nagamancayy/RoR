import type { z } from 'zod';
import type { AlgorithmMetadata, SerializedOracleResponse } from '../public-types';
import type { JsonObject } from '../crypto/canonical';
import type { SecureRng } from '../crypto/random';

/** This type describes secret challenger state, never an active public DTO. */
export type OracleWorld = 'REAL' | 'RANDOM';
export type ByteFields = Record<string, Buffer>;

export interface RandomFunctionStore {
  get(input: Buffer): Buffer | undefined;
  set(input: Buffer, output: Buffer): void;
}

export interface Evaluation<Config, State> {
  input: Buffer;
  config: Config;
  secretState: State;
  rng: SecureRng;
  queryIndex: number;
  randomFunctionStore: RandomFunctionStore;
}

export interface OracleAdapter<Config extends JsonObject, State extends JsonObject> {
  metadata: AlgorithmMetadata;
  configSchema: z.ZodType<Config>;
  secretStateSchema: z.ZodType<State>;
  createSecretState(config: Config, rng: SecureRng): State;
  evaluateReal(args: Evaluation<Config, State>): ByteFields;
  evaluateRandom(args: Evaluation<Config, State>): ByteFields;
  describePublicResponse(response: ByteFields): SerializedOracleResponse;
  publicConfig(config: Config): JsonObject;
}

/** Type erasure is kept at registration, never at the public serialization boundary. */
export interface RegisteredAdapter {
  metadata: AlgorithmMetadata;
  validateConfig(value: unknown): JsonObject;
  createSecretState(config: JsonObject, rng: SecureRng): JsonObject;
  evaluate(world: OracleWorld, args: Evaluation<JsonObject, JsonObject>): SerializedOracleResponse;
}

export function registerAdapter<C extends JsonObject, S extends JsonObject>(
  adapter: OracleAdapter<C, S>,
): RegisteredAdapter {
  return {
    metadata: adapter.metadata,
    validateConfig: (value) => adapter.publicConfig(adapter.configSchema.parse(value)),
    createSecretState: (config, rng) =>
      adapter.createSecretState(adapter.configSchema.parse(config), rng),
    evaluate(world, args) {
      const typed = {
        ...args,
        config: adapter.configSchema.parse(args.config),
        secretState: adapter.secretStateSchema.parse(args.secretState),
      };
      const response =
        world === 'REAL' ? adapter.evaluateReal(typed) : adapter.evaluateRandom(typed);
      // Persist stateful adapters' validated updates in the same query transaction.
      Object.assign(args.secretState, typed.secretState);
      return adapter.describePublicResponse(response);
    },
  };
}

export function serializeByteFields(fields: ByteFields): SerializedOracleResponse {
  return {
    fields: Object.entries(fields).map(([name, bytes]) => ({
      name,
      encoding: 'hex',
      byteLength: bytes.length,
      value: bytes.toString('hex'),
    })),
    totalByteLength: Object.values(fields).reduce((sum, bytes) => sum + bytes.length, 0),
  };
}
