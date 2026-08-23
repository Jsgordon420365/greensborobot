/**
 * Structured logging for Nagimals.
 *
 * Every significant operation goes through `log`, never a bare console call,
 * so that entries carry a timestamp, a severity, an operation name and only
 * non-sensitive identifiers. Camera frames, tokens, private keys and full push
 * subscription secrets must never be passed in.
 */

export type Severity = 'debug' | 'info' | 'warn' | 'error';

export type Operation =
  | 'app.init'
  | 'app.mode'
  | 'auth.signin'
  | 'auth.signout'
  | 'auth.session'
  | 'household.load'
  | 'household.create'
  | 'household.seed'
  | 'rules.evaluate'
  | 'ar.capability'
  | 'ar.session.start'
  | 'ar.session.end'
  | 'ar.placement'
  | 'push.subscribe'
  | 'push.unsubscribe'
  | 'push.preview'
  | 'action.record'
  | 'realtime.change'
  | 'realtime.subscribe'
  | 'storage.read'
  | 'storage.write'
  | 'time.simulate'
  | 'sw.register'
  | 'error';

export interface LogEntry {
  timestamp: string;
  severity: Severity;
  operation: Operation;
  message: string;
  context: Record<string, unknown>;
}

const RING_SIZE = 200;
const ring: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

/** Keys that must never be written to a log line, at any depth. */
const REDACTED_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'anonkey',
  'servicerolekey',
  'password',
  'auth',
  'p256dh',
  'privatekey',
  'vapidprivatekey',
  'endpoint',
  'email',
  'frame',
  'imagedata',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redact(raw, depth + 1);
  }
  return out;
}

const CONSOLE_METHOD: Record<Severity, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

let minimumSeverity: Severity = 'debug';
const ORDER: Record<Severity, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function setMinimumSeverity(severity: Severity): void {
  minimumSeverity = severity;
}

export function log(
  severity: Severity,
  operation: Operation,
  message: string,
  context: Record<string, unknown> = {},
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    severity,
    operation,
    message,
    context: redact(context) as Record<string, unknown>,
  };

  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();

  if (ORDER[severity] >= ORDER[minimumSeverity]) {
    console[CONSOLE_METHOD[severity]](
      `[${entry.timestamp}] ${severity.toUpperCase()} ${operation}: ${message}`,
      entry.context,
    );
  }

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // A misbehaving listener must never break the operation being logged.
    }
  }
  return entry;
}

export const logger = {
  debug: (op: Operation, msg: string, ctx?: Record<string, unknown>) =>
    log('debug', op, msg, ctx),
  info: (op: Operation, msg: string, ctx?: Record<string, unknown>) =>
    log('info', op, msg, ctx),
  warn: (op: Operation, msg: string, ctx?: Record<string, unknown>) =>
    log('warn', op, msg, ctx),
  error: (op: Operation, msg: string, ctx?: Record<string, unknown>) =>
    log('error', op, msg, ctx),
};

/** The most recent entries, newest last. Used by the in-app log viewer. */
export function recentLogs(): readonly LogEntry[] {
  return ring;
}

export function subscribeToLogs(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Normalize an unknown thrown value into something safe to log. */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}
