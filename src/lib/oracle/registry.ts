import type { AlgorithmMetadata } from '../public-types';
import { DomainError } from '../errors';
import { aes256GcmAdapter } from './adapters/aes-256-gcm';
import { hmacSha256PrfAdapter } from './adapters/hmac-sha256-prf';
import { registerAdapter, type RegisteredAdapter } from './types';

const registry = new Map<string, RegisteredAdapter>([
  [aes256GcmAdapter.metadata.id, registerAdapter(aes256GcmAdapter)],
  [hmacSha256PrfAdapter.metadata.id, registerAdapter(hmacSha256PrfAdapter)],
]);

export function getAdapter(id: string): RegisteredAdapter {
  const adapter = registry.get(id);
  if (!adapter)
    throw new DomainError('ADAPTER_NOT_FOUND', 'The selected algorithm is not registered.');
  return adapter;
}

export function listAlgorithms(): AlgorithmMetadata[] {
  return [...registry.values()].map((adapter) => structuredClone(adapter.metadata));
}
