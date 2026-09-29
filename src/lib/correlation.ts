// Correlation ID (18D §40): one id per workflow, from UI action to command, job, provider and audit.
export const CORRELATION_HEADER = "x-correlation-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCorrelationId(headers: Headers): string {
  const incoming = headers.get(CORRELATION_HEADER);
  return incoming && UUID.test(incoming) ? incoming : crypto.randomUUID();
}
