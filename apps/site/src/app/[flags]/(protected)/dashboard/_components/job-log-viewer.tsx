"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { JobStatus } from "@/lib/job-schemas";

interface JobLogViewerProps {
  jobId: string;
  jobName?: string;
  jobStatus: JobStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACTIVE_STATUSES: JobStatus[] = [
  "pending",
  "scheduled",
  "pulling",
  "running",
];

const MAX_RECONNECT_ATTEMPTS = 5;
const ARCHIVE_RETRY_ATTEMPTS = 3;
const ARCHIVE_RETRY_DELAY_MS = 1500;
const HEARTBEAT_TIMEOUT_MS = 60000;
const HEARTBEAT_CHECK_INTERVAL_MS = 30000;

export default function JobLogViewer({
  jobId,
  jobName,
  jobStatus,
  open,
  onOpenChange,
}: JobLogViewerProps) {
  const [logs, setLogs] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageTimeRef = useRef(Date.now());
  const heartbeatCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(ACTIVE_STATUSES.includes(jobStatus));

  const isActive = ACTIVE_STATUSES.includes(jobStatus);

  // Keep ref in sync for use in callbacks
  isActiveRef.current = isActive;

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // Fetch logs with retry logic for archived logs
  // When a job completes, archives may not be immediately available
  const fetchLogsWithRetry = useCallback(
    async (retries = ARCHIVE_RETRY_ATTEMPTS): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(`/api/jobs/${jobId}/logs`);
        const source = response.headers.get("X-Log-Source");

        if (response.ok) {
          const text = await response.text();
          // If we got archived logs, return immediately
          if (source === "archived") {
            return text;
          }
          // If live logs and this isn't our last attempt, wait and retry for archives
          if (i < retries - 1) {
            await new Promise((r) =>
              setTimeout(r, ARCHIVE_RETRY_DELAY_MS * (i + 1)),
            );
            continue;
          }
          // Last attempt, return whatever we got
          return text;
        }

        // On error, wait and retry
        if (i < retries - 1) {
          await new Promise((r) =>
            setTimeout(r, ARCHIVE_RETRY_DELAY_MS * (i + 1)),
          );
        }
      }

      // Final fallback attempt
      const finalResponse = await fetch(`/api/jobs/${jobId}/logs`);
      if (!finalResponse.ok) {
        throw new Error("failed to fetch logs");
      }
      return finalResponse.text();
    },
    [jobId],
  );

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const logsText = await fetchLogsWithRetry();
      setLogs(logsText || "");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to fetch logs";
      setError(message);
      setLogs("");
    } finally {
      setIsLoading(false);
    }
  }, [fetchLogsWithRetry]);

  const startStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsStreaming(true);
    setError(null);
    // Only clear logs on first connect, not reconnects
    if (reconnectAttemptsRef.current === 0) {
      setLogs("");
    }

    lastMessageTimeRef.current = Date.now();

    const eventSource = new EventSource(`/api/jobs/${jobId}/logs/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      // Reset reconnect attempts on successful message
      reconnectAttemptsRef.current = 0;
      lastMessageTimeRef.current = Date.now();
      setLogs((prev) => prev + event.data + "\n");
      setTimeout(scrollToBottom, 0);
    };

    eventSource.onerror = () => {
      eventSource.close();

      // Try to reconnect if still active and under max attempts
      if (
        isActiveRef.current &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000,
        );
        reconnectAttemptsRef.current++;

        setTimeout(() => {
          if (isActiveRef.current && eventSourceRef.current === null) {
            startStreaming();
          }
        }, delay);
      } else {
        // Max attempts reached or job no longer active, fall back to fetch
        setIsStreaming(false);
        reconnectAttemptsRef.current = 0;
        fetchLogs();
      }
    };

    eventSource.addEventListener("done", () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      reconnectAttemptsRef.current = 0;

      // Job completed - fetch archived logs after a delay to allow archive upload
      setTimeout(() => {
        fetchLogs();
      }, ARCHIVE_RETRY_DELAY_MS);
    });

    eventSource.addEventListener("error", (event) => {
      const errorEvent = event as MessageEvent;
      setError(errorEvent.data || "Stream error");
      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      reconnectAttemptsRef.current = 0;
    });
  }, [jobId, scrollToBottom, fetchLogs]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (heartbeatCheckIntervalRef.current) {
      clearInterval(heartbeatCheckIntervalRef.current);
      heartbeatCheckIntervalRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setIsStreaming(false);
  }, []);

  // Heartbeat detection - detect zombie connections
  useEffect(() => {
    if (isStreaming) {
      heartbeatCheckIntervalRef.current = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
        if (timeSinceLastMessage > HEARTBEAT_TIMEOUT_MS) {
          // No data for too long, connection likely dead - reconnect
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (isActiveRef.current) {
            startStreaming();
          } else {
            setIsStreaming(false);
            fetchLogs();
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
  }, [isStreaming, startStreaming, fetchLogs]);

  useEffect(() => {
    if (open) {
      reconnectAttemptsRef.current = 0;
      if (isActive) {
        startStreaming();
      } else {
        fetchLogs();
      }
    } else {
      stopStreaming();
      setLogs("");
      setError(null);
    }

    return () => {
      stopStreaming();
    };
  }, [open, isActive, startStreaming, stopStreaming, fetchLogs]);

  const handleCopy = async () => {
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

  const handleRefresh = () => {
    if (isActive) {
      stopStreaming();
      startStreaming();
    } else {
      fetchLogs();
    }
  };

  const logLines = logs ? logs.split("\n") : [];
  const hasLogs = logLines.length > 0 && logLines.some((line) => line.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl p-0 gap-0 overflow-hidden bg-white border border-gray-200"
      >
        <DialogTitle className="sr-only">
          job logs for {jobName || "unnamed job"}
        </DialogTitle>

        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Job info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-black truncate">
                  {jobName || "unnamed job"}
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  {jobId.slice(0, 12)}...
                </p>
              </div>

              {isStreaming && (
                <span className="flex items-center gap-1.5 text-xs text-orange-accent flex-shrink-0 ml-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-accent opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-accent" />
                  </span>
                  live
                </span>
              )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="h-7 px-2.5 text-xs gap-1.5"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!logs || isLoading}
                className="h-7 px-2.5 text-xs gap-1.5"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "copied" : "copy"}
              </Button>

              <button
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Log Content */}
        <div className="bg-white">
          {isLoading && !logs ? (
            <div className="flex items-center justify-center h-[50vh] gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="text-gray-500 text-sm">loading logs...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
              <div className="text-center">
                <p className="text-red-600 text-sm mb-1">failed to load logs</p>
                <p className="text-gray-500 text-xs">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="text-xs"
              >
                try again
              </Button>
            </div>
          ) : (
            <div
              ref={logContainerRef}
              className="h-[50vh] overflow-auto font-mono"
            >
              {hasLogs ? (
                <div className="py-1">
                  {logLines.map((line, index) => (
                    <div
                      key={index}
                      className="flex hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-12 flex-shrink-0 px-3 py-0.5 text-right text-gray-500 select-none text-xs bg-gray-50 border-r border-gray-200">
                        {index + 1}
                      </div>
                      <div className="flex-1 px-4 py-0.5 text-black whitespace-pre-wrap break-all text-xs leading-5">
                        {line || " "}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <FileText className="w-8 h-8" />
                  <p className="text-sm">
                    {isStreaming
                      ? "waiting for output..."
                      : "no logs available"}
                  </p>
                  {isStreaming && (
                    <p className="text-xs text-gray-400">
                      logs will appear here as they are generated
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
