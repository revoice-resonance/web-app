/**
 * Lightweight in-memory ring buffer that mirrors console.log/warn/error
 * so the user can export recent client-side logs for support.
 *
 * Installed once from main.tsx. Keeps the most recent N entries.
 */

export interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];

function safeStringify(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function record(level: LogEntry['level'], args: unknown[]) {
  const message = args.map(safeStringify).join(' ');
  buffer.push({ ts: new Date().toISOString(), level, message });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

let installed = false;

export function installLogRecorder() {
  if (installed) return;
  installed = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => { record('log', args); orig.log(...args); };
  console.info = (...args) => { record('info', args); orig.info(...args); };
  console.warn = (...args) => { record('warn', args); orig.warn(...args); };
  console.error = (...args) => { record('error', args); orig.error(...args); };

  window.addEventListener('error', (e) => {
    record('error', [`[window.error] ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    record('error', [`[unhandledrejection]`, e.reason]);
  });
}

export function getLogEntries(): LogEntry[] {
  return [...buffer];
}

export function clearLogEntries() {
  buffer.length = 0;
}

export function formatLogsAsText(): string {
  const header = [
    `# Resonance Client Logs`,
    `# Generated: ${new Date().toISOString()}`,
    `# UA: ${navigator.userAgent}`,
    `# URL: ${location.href}`,
    `# Entries: ${buffer.length}`,
    ``,
  ].join('\n');
  const body = buffer
    .map((e) => `[${e.ts}] [${e.level.toUpperCase()}] ${e.message}`)
    .join('\n');
  return header + body + '\n';
}
