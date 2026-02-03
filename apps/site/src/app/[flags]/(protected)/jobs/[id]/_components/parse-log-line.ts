export type LogLevel = "error" | "warn" | "info" | "debug" | "default";

export interface ParsedLogLine {
  lineNumber: number;
  timestamp: string | null;
  level: LogLevel;
  message: string;
  raw: string;
}

const TIMESTAMP_REGEX =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+/;
const BRACKET_TIMESTAMP_REGEX =
  /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*/;

const LEVEL_PATTERNS: { pattern: RegExp; level: LogLevel }[] = [
  { pattern: /\b(?:ERROR|ERR|FATAL|PANIC|CRITICAL)\b/i, level: "error" },
  { pattern: /\b(?:WARN|WARNING)\b/i, level: "warn" },
  { pattern: /\b(?:DEBUG|TRACE|VERBOSE)\b/i, level: "debug" },
  { pattern: /\b(?:INFO|NOTICE)\b/i, level: "info" },
];

function detectLevel(text: string): LogLevel {
  for (const { pattern, level } of LEVEL_PATTERNS) {
    if (pattern.test(text)) return level;
  }
  return "default";
}

function extractTimestamp(text: string): {
  timestamp: string | null;
  rest: string;
} {
  let match = text.match(TIMESTAMP_REGEX);
  if (match) return { timestamp: match[1], rest: text.slice(match[0].length) };

  match = text.match(BRACKET_TIMESTAMP_REGEX);
  if (match) return { timestamp: match[1], rest: text.slice(match[0].length) };

  return { timestamp: null, rest: text };
}

export function parseLogLine(raw: string, lineNumber: number): ParsedLogLine {
  const { timestamp, rest } = extractTimestamp(raw);
  const level = detectLevel(rest);
  return { lineNumber, timestamp, level, message: rest, raw };
}

export function parseAllLogLines(text: string): ParsedLogLine[] {
  if (!text) return [];
  return text.split("\n").map((line, i) => parseLogLine(line, i + 1));
}

export function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  } catch {
    return ts;
  }
}

export function formatFullTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export function relativeTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "less than a minute ago";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export function exportAsCSV(lines: ParsedLogLine[]): string {
  const header = "Line,Timestamp,Level,Message";
  const rows = lines.map(
    (l) =>
      `${l.lineNumber},"${l.timestamp || ""}","${l.level}","${l.raw.replace(/"/g, '""')}"`,
  );
  return [header, ...rows].join("\n");
}

export function exportAsJSON(lines: ParsedLogLine[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      line: l.lineNumber,
      timestamp: l.timestamp,
      level: l.level,
      message: l.message,
      raw: l.raw,
    })),
    null,
    2,
  );
}
