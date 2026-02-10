import { X, ChevronUp, ChevronDown, Copy, Check } from "lucide-react";
import { useState } from "react";
import {
  ParsedLogLine,
  formatFullTimestamp,
  relativeTime,
} from "./parse-log-line";

const LEVEL_BADGE: Record<string, string> = {
  error: "bg-red-100 text-red-700 border-red-200",
  warn: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
  debug: "bg-gray-100 text-gray-500 border-gray-200",
  default: "bg-gray-100 text-gray-600 border-gray-200",
};

interface LogDetailPanelProps {
  line: ParsedLogLine;
  onClose: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function LogDetailPanel({
  line,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
}: LogDetailPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(line.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 sm:hidden"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 sm:static sm:z-auto sm:w-[420px] flex-shrink-0 sm:border-l border-gray-200 bg-white overflow-y-auto animate-in slide-in-from-bottom-4 sm:slide-in-from-right-4 duration-200">
        {/* Panel Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-black truncate">
              Line {line.lineNumber}
            </span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-medium uppercase border ${LEVEL_BADGE[line.level]}`}
            >
              {line.level === "default" ? "log" : line.level}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigate("prev")}
              disabled={!hasPrev}
              className="p-1 text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigate("next")}
              disabled={!hasNext}
              className="p-1 text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-black transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Timestamp Section */}
        {line.timestamp && (
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              timestamp
            </p>
            <p className="text-sm text-black font-mono">
              {formatFullTimestamp(line.timestamp)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {relativeTime(line.timestamp)}
            </p>
          </div>
        )}

        {/* Level Section */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
            level
          </p>
          <span
            className={`inline-block px-2 py-0.5 text-xs font-medium uppercase border ${LEVEL_BADGE[line.level]}`}
          >
            {line.level === "default" ? "log" : line.level}
          </span>
        </div>

        {/* Line Number */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
            line
          </p>
          <p className="text-sm text-black font-mono">{line.lineNumber}</p>
        </div>

        {/* Raw Content */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              output
            </p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-black transition-colors"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-200 p-3 font-mono text-[12px] leading-relaxed text-gray-700 whitespace-pre-wrap break-all max-h-[400px] overflow-auto">
            {line.raw}
          </div>
        </div>
      </div>
    </>
  );
}
