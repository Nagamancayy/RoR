export const errorStatuses = {
  VALIDATION_ERROR: 400,
  EXPERIMENT_NOT_FOUND: 404,
  EXPERIMENT_NOT_ACTIVE: 409,
  EXPERIMENT_ALREADY_COMPLETED: 409,
  QUERY_LIMIT_REACHED: 409,
  INVALID_INPUT_ENCODING: 400,
  INPUT_TOO_LARGE: 413,
  ADAPTER_NOT_FOUND: 400,
  ADAPTER_KIND_MISMATCH: 400,
  SECRET_STATE_ERROR: 500,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof errorStatuses;

/** Messages must be constant/public: never pass a caught crypto/SQLite error. */
export class DomainError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: number = errorStatuses[code],
  ) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export function publicError(error: unknown) {
  if (error instanceof DomainError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed. Please try again.',
      },
    },
  };
}
