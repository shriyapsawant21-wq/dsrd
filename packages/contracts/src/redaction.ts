const SENSITIVE_ASSIGNMENT = /\b(password|passwd|token|secret|api[_-]?key)\s*=\s*([^\s&]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/gi;

/** Remove credential material from diagnostics, logs, and public metadata. */
export function redactSecrets(value: string): string {
  let redacted = value.replace(/(https?:\/\/)([^/@\s]+):([^/@\s]+)@/gi, "$1[REDACTED]@[REDACTED]");
  redacted = redacted.replace(SENSITIVE_ASSIGNMENT, "$1=[REDACTED]");
  return redacted.replace(BEARER_TOKEN, "Bearer [REDACTED]");
}
