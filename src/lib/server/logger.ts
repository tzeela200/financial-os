import "server-only";

// Structured logging (18D §39): no documents, tokens, full account numbers or financial payloads in logs.
const SENSITIVE_KEY = /(iban|token|password|secret|account_number|card|_minor$|authorization|cookie|api_key)/i;

export function redact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (SENSITIVE_KEY.test(key)) return [key, "[REDACTED]"];
      if (v && typeof v === "object" && !Array.isArray(v)) return [key, redact(v as Record<string, unknown>)];
      return [key, v];
    }),
  );
}

export type LogKind = "request_log" | "job_log" | "integration_log" | "security_log";

export function log(kind: LogKind, correlationId: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ kind, correlation_id: correlationId, at: new Date().toISOString(), ...redact(fields) }));
}
