"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  X,
  RefreshCw,
  Loader2,
  Clock,
  Terminal,
  ChevronDown as ChevronDownIcon,
  Download,
  Pause,
  Play,
  Check,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Job } from "@/lib/job-utils";
import { JobStatus } from "@/lib/job-schemas";
import {
  ParsedLogLine,
  parseAllLogLines,
  formatTimestamp,
  exportAsCSV,
  exportAsJSON,
} from "./parse-log-line";
import { LogDetailPanel } from "./log-detail-panel";

const STREAMABLE_STATUSES: JobStatus[] = ["running"];
const WAITING_STATUSES: JobStatus[] = ["pending", "scheduled", "pulling"];
const ACTIVE_STATUSES: JobStatus[] = [
  ...WAITING_STATUSES,
  ...STREAMABLE_STATUSES,
];

const MAX_RECONNECT_ATTEMPTS = 5;
const ARCHIVE_RETRY_ATTEMPTS = 3;
const ARCHIVE_RETRY_DELAY_MS = 1500;
const HEARTBEAT_TIMEOUT_MS = 60000;
const HEARTBEAT_CHECK_INTERVAL_MS = 30000;

const LEVEL_ROW_STYLES: Record<string, string> = {
  error: "bg-red-50/60 hover:bg-red-50 border-l-2 border-l-red-400",
  warn: "bg-amber-50/40 hover:bg-amber-50 border-l-2 border-l-amber-400",
  info: "hover:bg-gray-50 border-l-2 border-l-transparent",
  debug: "hover:bg-gray-50 border-l-2 border-l-transparent opacity-60",
  default: "hover:bg-gray-50 border-l-2 border-l-transparent",
};

const LEVEL_BADGE_STYLES: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-600",
  debug: "bg-gray-100 text-gray-400",
  default: "bg-gray-100 text-gray-500",
};

const LEVEL_TEXT_STYLES: Record<string, string> = {
  error: "text-red-700",
  warn: "text-amber-700",
  info: "text-gray-700",
  debug: "text-gray-400",
  default: "text-gray-700",
};

interface LogViewerProps {
  job: Job;
}

export function LogViewer({ job }: LogViewerProps) {
  const [logs, setLogs] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(
    null,
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [copied, setCopied] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageTimeRef = useRef(Date.now());
  const heartbeatCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pausedLogsRef = useRef("");
  const isPausedRef = useRef(isPaused);
  const autoScrollRef = useRef(autoScroll);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const jobStatus = job.status;
  const isActive = ACTIVE_STATUSES.includes(jobStatus);
  const isStreamable = STREAMABLE_STATUSES.includes(jobStatus);
  const isWaiting = WAITING_STATUSES.includes(jobStatus);

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isStreamableRef = useRef(isStreamable);
  isStreamableRef.current = isStreamable;

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // Parse logs
  const parsedLines = useMemo(() => parseAllLogLines(logs), [logs]);

  // Filter
  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return parsedLines;
    const q = searchQuery.toLowerCase();
    return parsedLines.filter(
      (l) => l.raw.toLowerCase().includes(q) || l.level.includes(q),
    );
  }, [parsedLines, searchQuery]);

  // Close export menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  // --- Fetching / Streaming logic (same as original) ---

  const fetchLogsWithRetry = useCallback(
    async (retries = ARCHIVE_RETRY_ATTEMPTS): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(`/api/jobs/${job.jobId}/logs`);
        const source = response.headers.get("X-Log-Source");
        if (response.ok) {
          const text = await response.text();
          if (source === "archived") return text;
          if (i < retries - 1) {
            await new Promise((r) =>
              setTimeout(r, ARCHIVE_RETRY_DELAY_MS * (i + 1)),
            );
            continue;
          }
          return text;
        }
        if (i < retries - 1) {
          await new Promise((r) =>
            setTimeout(r, ARCHIVE_RETRY_DELAY_MS * (i + 1)),
          );
        }
      }
      const finalResponse = await fetch(`/api/jobs/${job.jobId}/logs`);
      if (!finalResponse.ok) throw new Error("failed to fetch logs");
      return finalResponse.text();
    },
    [job.jobId],
  );

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const text = await fetchLogsWithRetry();
      setLogs(text || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to fetch logs");
      setLogs("");
    } finally {
      setIsLoading(false);
    }
  }, [fetchLogsWithRetry]);

  const startStreaming = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setIsStreaming(true);
    setError(null);
    if (reconnectAttemptsRef.current === 0) setLogs("");
    lastMessageTimeRef.current = Date.now();

    const es = new EventSource(`/api/jobs/${job.jobId}/logs/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      reconnectAttemptsRef.current = 0;
      lastMessageTimeRef.current = Date.now();
      if (isPausedRef.current) {
        pausedLogsRef.current += event.data + "\n";
      } else {
        setLogs((prev) => prev + event.data + "\n");
        if (autoScrollRef.current && logContainerRef.current) {
          setTimeout(() => {
            logContainerRef.current?.scrollTo({
              top: logContainerRef.current.scrollHeight,
            });
          }, 0);
        }
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      if (
        isStreamableRef.current &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000,
        );
        reconnectAttemptsRef.current++;
        setTimeout(() => {
          if (isStreamableRef.current && !eventSourceRef.current)
            startStreaming();
        }, delay);
      } else {
        setIsStreaming(false);
        reconnectAttemptsRef.current = 0;
        if (!isActiveRef.current) fetchLogs();
      }
    };

    es.addEventListener("done", () => {
      es.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      reconnectAttemptsRef.current = 0;
      setTimeout(() => fetchLogs(), ARCHIVE_RETRY_DELAY_MS);
    });

    es.addEventListener("error", (event) => {
      setError((event as MessageEvent).data || "Stream error");
      es.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      reconnectAttemptsRef.current = 0;
    });
  }, [job.jobId, fetchLogs]);

  const stopStreaming = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (heartbeatCheckIntervalRef.current) {
      clearInterval(heartbeatCheckIntervalRef.current);
      heartbeatCheckIntervalRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setIsStreaming(false);
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    if (pausedLogsRef.current) {
      setLogs((prev) => prev + pausedLogsRef.current);
      pausedLogsRef.current = "";
      if (autoScrollRef.current && logContainerRef.current) {
        setTimeout(() => {
          logContainerRef.current?.scrollTo({
            top: logContainerRef.current.scrollHeight,
          });
        }, 0);
      }
    }
  }, []);

  const startStreamingRef = useRef(startStreaming);
  useEffect(() => {
    startStreamingRef.current = startStreaming;
  }, [startStreaming]);
  const fetchLogsRef = useRef(fetchLogs);
  useEffect(() => {
    fetchLogsRef.current = fetchLogs;
  }, [fetchLogs]);

  // Heartbeat
  useEffect(() => {
    if (isStreaming) {
      heartbeatCheckIntervalRef.current = setInterval(() => {
        if (isPausedRef.current) return;
        if (Date.now() - lastMessageTimeRef.current > HEARTBEAT_TIMEOUT_MS) {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          if (isStreamableRef.current) {
            startStreamingRef.current();
          } else {
            setIsStreaming(false);
            if (!isActiveRef.current) fetchLogsRef.current();
          }
        }
      }, HEARTBEAT_CHECK_INTERVAL_MS);
    }
    return () => {
      if (heartbeatCheckIntervalRef.current) {
        clearInterval(heartbeatCheckIntervalRef.current);
        heartbeatCheckIntervalRef.current = null;
      }
    };
  }, [isStreaming]);

  // Init logs
  useEffect(() => {
    if (!job.jobId) return;
    reconnectAttemptsRef.current = 0;
    setError(null);
    if (isStreamable && isLive) {
      startStreaming();
    } else if (isWaiting) {
      stopStreaming();
    } else {
      stopStreaming();
      fetchLogs();
    }
    return () => stopStreaming();
  }, [
    job.jobId,
    job.status,
    isStreamable,
    isWaiting,
    isLive,
    startStreaming,
    stopStreaming,
    fetchLogs,
  ]);

  // Live toggle
  const handleLiveToggle = () => {
    if (isLive) {
      stopStreaming();
      setIsLive(false);
      if (logs) {
        // keep current logs
      } else {
        fetchLogs();
      }
    } else {
      setIsLive(true);
      if (isStreamable) {
        startStreaming();
      }
    }
  };

  const handleRefresh = () => {
    if (isStreamable && isLive) {
      stopStreaming();
      startStreaming();
    } else {
      fetchLogs();
    }
  };

  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  const handleCopyAll = async () => {
    if (copied || !logs) return;
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      toast.success("logs copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("failed to copy logs");
    }
  };

  const handleExport = (format: "csv" | "json") => {
    const data =
      format === "csv"
        ? exportAsCSV(filteredLines)
        : exportAsJSON(filteredLines);
    const blob = new Blob([data], {
      type: format === "csv" ? "text/csv" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${job.jobId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    toast.success(`exported as ${format.toUpperCase()}`);
  };

  const handleRowClick = (index: number) => {
    setSelectedLineIndex(selectedLineIndex === index ? null : index);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    if (selectedLineIndex === null) return;
    const newIndex =
      direction === "prev" ? selectedLineIndex - 1 : selectedLineIndex + 1;
    if (newIndex >= 0 && newIndex < filteredLines.length) {
      setSelectedLineIndex(newIndex);
    }
  };

  const hasLogs =
    parsedLines.length > 0 && parsedLines.some((l) => l.raw.trim());
  const selectedLine =
    selectedLineIndex !== null ? filteredLines[selectedLineIndex] : null;

  return (
    <div className="bg-white border border-gray-200 flex flex-col">
      {/* Toolbar */}
      <div className="border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-10 pr-9 text-sm bg-gray-50 border border-gray-200 text-black placeholder-gray-400 font-mono focus:outline-none focus:border-orange-accent focus:bg-white transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Live Toggle */}
        {isStreamable && (
          <button
            onClick={handleLiveToggle}
            className={`h-9 px-3 text-sm border font-medium flex items-center gap-2 transition-colors ${
              isLive && isStreaming
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-white border-gray-200 text-gray-500 hover:text-black hover:border-gray-300"
            }`}
          >
            {isLive && isStreaming && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            {isLive ? "live" : "paused"}
          </button>
        )}

        {/* Pause/Resume */}
        {isStreaming && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => (isPaused ? handleResume() : setIsPaused(true))}
            className="h-9"
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="h-9"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Copy All */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyAll}
          disabled={!logs}
          className="h-9"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Export */}
        <div className="relative" ref={exportMenuRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={!hasLogs}
            className="h-9"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 shadow-lg z-50">
              <button
                onClick={() => handleExport("csv")}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-black"
              >
                export as CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 text-black border-t border-gray-100"
              >
                export as JSON
              </button>
            </div>
          )}
        </div>

        {/* Auto-scroll */}
        <button
          onClick={() => {
            const v = !autoScroll;
            setAutoScroll(v);
            autoScrollRef.current = v;
            if (v)
              logContainerRef.current?.scrollTo({
                top: logContainerRef.current.scrollHeight,
              });
          }}
          className={`h-9 px-2.5 border transition-colors ${
            autoScroll
              ? "bg-orange-accent/10 border-orange-accent/30 text-orange-accent"
              : "bg-white border-gray-200 text-gray-400 hover:text-black hover:border-gray-300"
          }`}
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Table Header */}
      {hasLogs && (
        <div className="border-b border-gray-200 px-4 py-1.5 flex items-center gap-4 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50/50">
          <span className="w-16 text-right">#</span>
          <span className="w-24">time</span>
          <span className="w-14">level</span>
          <span className="flex-1">message</span>
        </div>
      )}

      {/* Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Log Rows */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="flex-1 h-[500px] overflow-auto font-mono text-[13px] leading-[1.6]"
        >
          {isLoading && !logs ? (
            <div className="flex items-center justify-center h-full gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="text-gray-500 text-sm">loading logs...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <p className="text-red-600 text-sm">failed to load logs</p>
              <p className="text-gray-500 text-xs">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                try again
              </Button>
            </div>
          ) : hasLogs ? (
            <div>
              {filteredLines.map((line, index) => (
                <div
                  key={line.lineNumber}
                  onClick={() => handleRowClick(index)}
                  className={`flex items-start gap-4 px-4 py-[3px] cursor-pointer transition-colors ${
                    LEVEL_ROW_STYLES[line.level]
                  } ${selectedLineIndex === index ? "!bg-orange-accent/8 border-l-orange-accent" : ""}`}
                >
                  <span className="w-16 text-right text-gray-300 select-none flex-shrink-0 tabular-nums">
                    {line.lineNumber}
                  </span>
                  <span className="w-24 text-gray-400 flex-shrink-0 text-[12px]">
                    {line.timestamp ? formatTimestamp(line.timestamp) : "—"}
                  </span>
                  <span className="w-14 flex-shrink-0">
                    {line.level !== "default" && (
                      <span
                        className={`inline-block px-1.5 py-px text-[10px] font-medium uppercase ${LEVEL_BADGE_STYLES[line.level]}`}
                      >
                        {line.level === "error"
                          ? "ERR"
                          : line.level === "warn"
                            ? "WRN"
                            : line.level === "debug"
                              ? "DBG"
                              : "INF"}
                      </span>
                    )}
                  </span>
                  <span
                    className={`flex-1 whitespace-pre-wrap break-all ${LEVEL_TEXT_STYLES[line.level]} ${
                      selectedLineIndex === index ? "text-black" : ""
                    }`}
                  >
                    {searchQuery ? (
                      <HighlightedText
                        text={line.message || line.raw}
                        highlight={searchQuery}
                      />
                    ) : (
                      line.message || line.raw || " "
                    )}
                  </span>
                </div>
              ))}
              <div className="h-4" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              {isWaiting ? (
                <>
                  <div className="w-12 h-12 border border-gray-200 bg-white flex items-center justify-center">
                    <Clock className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">
                    waiting for job to start
                  </p>
                  <p className="text-xs text-gray-400">
                    {job.status === "pending"
                      ? "job is queued and will start soon"
                      : job.status === "pulling"
                        ? "pulling container image"
                        : "job is scheduled and starting up"}
                  </p>
                </>
              ) : isStreaming ? (
                <>
                  <div className="w-12 h-12 border border-gray-200 bg-white flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">waiting for output...</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 border border-gray-200 bg-white flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">no logs available</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedLine && (
          <LogDetailPanel
            line={selectedLine}
            onClose={() => setSelectedLineIndex(null)}
            onNavigate={handleNavigate}
            hasPrev={selectedLineIndex! > 0}
            hasNext={selectedLineIndex! < filteredLines.length - 1}
          />
        )}
      </div>

      {/* Footer */}
      {hasLogs && (
        <div className="border-t border-gray-200 px-4 py-2 bg-white text-xs text-gray-500 flex items-center justify-between">
          <span>
            {searchQuery
              ? `${filteredLines.length} of ${parsedLines.length} lines`
              : `${parsedLines.length} lines`}
          </span>
          <div className="flex items-center gap-3">
            {isStreaming && !isPaused && (
              <span className="flex items-center gap-1.5 text-green-600">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                streaming
              </span>
            )}
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  autoScrollRef.current = true;
                  logContainerRef.current?.scrollTo({
                    top: logContainerRef.current.scrollHeight,
                  });
                }}
                className="text-orange-accent hover:underline"
              >
                scroll to bottom
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HighlightedText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight.trim()) return <>{text}</>;
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark
            key={i}
            className="bg-orange-accent/20 text-orange-accent px-0.5"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
