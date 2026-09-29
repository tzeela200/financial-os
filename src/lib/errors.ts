// Error contract (23D §66, 18D §13): the frontend receives a typed error, never a bare "something went wrong".
export const ERROR_TYPES = ["validation", "business_rule", "conflict", "provider", "processing", "authorization", "system"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export class AppError extends Error {
  constructor(
    public readonly type: ErrorType,
    public readonly code: string,
    message: string,
    public readonly correlationId: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return { type: this.type, code: this.code, message: this.message, correlation_id: this.correlationId };
  }
}
