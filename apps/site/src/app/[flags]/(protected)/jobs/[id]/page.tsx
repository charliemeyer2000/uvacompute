"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Job,
  formatDate,
  formatJobStatus,
  formatDuration,
  isJobCancellable,
} from "@/lib/job-utils";
import { JobStatus } from "@/lib/job-schemas";
import {
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Clock,
  Cpu,
  HardDrive,
  Zap,
  Terminal,
  X,
  ChevronDown,
  Search,
  Pause,
  Play,
  Database,
} from "lucide-react";
import { toast } from "sonner";

// Jobs that are actively producing logs and can be streamed
const STREAMABLE_STATUSES: JobStatus[] = ["pulling", "running"];

// Jobs that are waiting to start (no logs yet)
const WAITING_STATUSES: JobStatus[] = ["pending", "scheduled"];

// All active (non-terminal) jobs
const ACTIVE_STATUSES: JobStatus[] = [
  ...WAITING_STATUSES,
  ...STREAMABLE_STATUSES,
];

const MAX_RECONNECT_ATTEMPTS = 5;
const ARCHIVE_RETRY_ATTEMPTS = 3;
const ARCHIVE_RETRY_DELAY_MS = 1500;
const HEARTBEAT_TIMEOUT_MS = 60000;
const HEARTBEAT_CHECK_INTERVAL_MS = 30000;

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
    case "pulling":
      return "text-blue-600";
    case "pending":
    case "scheduled":
      return "text-yellow-600";
    case "completed":
      return "text-green-600";
    case "failed":
    case "node_offline":
      return "text-red-600";
    case "cancelled":
      return "text-gray-500";
    default:
      return "text-gray-500";
  }
}

function getStatusBgColor(status: string): string {
  switch (status) {
    case "running":
    case "pulling":
      return "bg-blue-50 border-blue-200 text-blue-700";
    case "pending":
    case "scheduled":
      return "bg-yellow-50 border-yellow-200 text-yellow-700";
    case "completed":
      return "bg-green-50 border-green-200 text-green-700";
    case "failed":
    case "node_offline":
      return "bg-red-50 border-red-200 text-red-700";
    case "cancelled":
      return "bg-gray-50 border-gray-200 text-gray-600";
    default:
      return "bg-gray-50 border-gray-200 text-gray-600";
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case "running":
    case "pulling":
      return "bg-blue-500";
    case "pending":
    case "scheduled":
      return "bg-yellow-500";
    case "completed":
      return "bg-green-500";
    case "failed":
    case "node_offline":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

interface LogLine {
  lineNumber: number;
  content: string;
  timestamp?: Date;
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const { data: session } = authClient.useSession();
  const job = useQuery(api.jobs.getByJobId, jobId ? { jobId } : "skip") as
    | Job
    | null
    | undefined;

  const [logs, setLogs] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastMessageTimeRef = useRef(Date.now());
  const heartbeatCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pausedLogsRef = useRef<string>("");

  const jobStatus = job?.status;
  const isActive = jobStatus ? ACTIVE_STATUSES.includes(jobStatus) : false;
  const isStreamable = jobStatus
    ? STREAMABLE_STATUSES.includes(jobStatus)
    : false;
  const isWaiting = jobStatus ? WAITING_STATUSES.includes(jobStatus) : false;

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isStreamableRef = useRef(isStreamable);
  isStreamableRef.current = isStreamable;

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current && autoScroll) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  // Parse logs into structured lines
  const logLines: LogLine[] = useMemo(() => {
    if (!logs) return [];
    return logs.split("\n").map((content, index) => ({
      lineNumber: index + 1,
      content,
      timestamp: undefined,
    }));
  }, [logs]);

  // Filter logs based on search query
  const filteredLogLines = useMemo(() => {
    if (!searchQuery.trim()) return logLines;
    const query = searchQuery.toLowerCase();
    return logLines.filter((line) =>
      line.content.toLowerCase().includes(query),
    );
  }, [logLines, searchQuery]);

  // Fetch logs with retry logic for archived logs
  const fetchLogsWithRetry = useCallback(
    async (retries = ARCHIVE_RETRY_ATTEMPTS): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        const response = await fetch(`/api/jobs/${jobId}/logs`);
        const source = response.headers.get("X-Log-Source");

        if (response.ok) {
          const text = await response.text();
          if (source === "archived") {
            return text;
          }
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
    if (reconnectAttemptsRef.current === 0) {
      setLogs("");
    }

    lastMessageTimeRef.current = Date.now();

    const eventSource = new EventSource(`/api/jobs/${jobId}/logs/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      reconnectAttemptsRef.current = 0;
      lastMessageTimeRef.current = Date.now();

      if (isPaused) {
        pausedLogsRef.current += event.data + "\n";
      } else {
        setLogs((prev) => prev + event.data + "\n");
        setTimeout(scrollToBottom, 0);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
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
          if (isStreamableRef.current && eventSourceRef.current === null) {
            startStreaming();
          }
        }, delay);
      } else {
        setIsStreaming(false);
        reconnectAttemptsRef.current = 0;
        if (!isActiveRef.current) {
          fetchLogs();
        }
      }
    };

    eventSource.addEventListener("done", () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      reconnectAttemptsRef.current = 0;

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
  }, [jobId, scrollToBottom, fetchLogs, isPaused]);

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

  // Resume paused logs
  const handleResume = useCallback(() => {
    setIsPaused(false);
    if (pausedLogsRef.current) {
      setLogs((prev) => prev + pausedLogsRef.current);
      pausedLogsRef.current = "";
      setTimeout(scrollToBottom, 0);
    }
  }, [scrollToBottom]);

  // Heartbeat detection
  useEffect(() => {
    if (isStreaming && !isPaused) {
      heartbeatCheckIntervalRef.current = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
        if (timeSinceLastMessage > HEARTBEAT_TIMEOUT_MS) {
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
          if (isStreamableRef.current) {
            startStreaming();
          } else {
            setIsStreaming(false);
            if (!isActiveRef.current) {
              fetchLogs();
            }
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
  }, [isStreaming, isPaused, startStreaming, fetchLogs]);

  // Initialize logs based on job status
  useEffect(() => {
    if (!jobId || !job) return;

    reconnectAttemptsRef.current = 0;
    setError(null);

    if (isStreamable) {
      startStreaming();
    } else if (isWaiting) {
      stopStreaming();
    } else {
      stopStreaming();
      fetchLogs();
    }

    return () => {
      stopStreaming();
    };
  }, [
    jobId,
    job,
    isStreamable,
    isWaiting,
    startStreaming,
    stopStreaming,
    fetchLogs,
  ]);

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
    if (isStreamable) {
      stopStreaming();
      startStreaming();
    } else if (!isWaiting) {
      fetchLogs();
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setIsCancelling(true);

    try {
      const response = await fetch(`/api/jobs/${job.jobId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || data.status !== "cancellation_success") {
        throw new Error(data.msg || "failed to cancel job");
      }

      toast.success("job cancelled", {
        description: `${job.name || job.jobId} has been cancelled`,
      });

      setShowCancelDialog(false);
    } catch (error) {
      toast.error("cancellation failed", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle scroll to detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const hasLogs =
    logLines.length > 0 && logLines.some((line) => line.content.trim());

  if (!job) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Check if user owns this job
  if (session?.user?.id && job.userId !== session.user.id) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-gray-500">job not found</p>
        <Button variant="outline" onClick={() => router.push("/jobs")}>
          <ArrowLeft className="h-4 w-4" />
          back to jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb and Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="text-gray-400 hover:text-black transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-black">
                {job.name || "unnamed job"}
              </h1>
              <span
                className={`px-2 py-0.5 text-xs border ${getStatusBgColor(job.status)}`}
              >
                {formatJobStatus(job.status)}
              </span>
            </div>
            <p className="text-sm text-gray-500 font-mono mt-0.5">
              {job.jobId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isJobCancellable(job.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            >
              <X className="h-4 w-4" />
              cancel job
            </Button>
          )}
        </div>
      </div>

      {/* Job Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Image */}
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            image
          </p>
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-orange-accent flex-shrink-0" />
            <p className="text-sm text-black font-mono truncate">{job.image}</p>
          </div>
        </div>

        {/* Resources */}
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            resources
          </p>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-black">{job.cpus} vCPU</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-black">{job.ram} GB</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-black">
                {job.gpus > 0 ? `${job.gpus}x GPU` : "no GPU"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-black">
                {job.disk ? `${job.disk} GB scratch` : "no scratch"}
              </span>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            timing
          </p>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-gray-500">created: </span>
              <span className="text-black">{formatDate(job.createdAt)}</span>
            </div>
            {job.startedAt && (
              <div>
                <span className="text-gray-500">duration: </span>
                <span className="text-black font-medium">
                  {formatDuration(job.startedAt, job.completedAt)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Exit Code / Status */}
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            result
          </p>
          {job.exitCode !== undefined ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">exit code:</span>
              <span
                className={`text-sm font-mono font-medium ${
                  job.exitCode === 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {job.exitCode}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${getStatusDotColor(job.status)}`}
              />
              <span className={`text-sm ${getStatusColor(job.status)}`}>
                {formatJobStatus(job.status)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Command (if present) */}
      {job.command && job.command.length > 0 && (
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            command
          </p>
          <div className="bg-gray-50 border border-gray-200 px-3 py-2">
            <code className="text-sm text-black font-mono">
              {job.command.join(" ")}
            </code>
          </div>
        </div>
      )}

      {/* Error Message (if present) */}
      {job.errorMessage && (
        <div className="bg-red-50 border border-red-200 p-4">
          <p className="text-xs text-red-600 uppercase tracking-wide mb-2">
            error
          </p>
          <p className="text-sm text-red-700">{job.errorMessage}</p>
        </div>
      )}

      {/* Logs Section */}
      <div className="bg-white border border-gray-200">
        {/* Logs Header */}
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-black">logs</span>
            </div>

            {/* Live indicator */}
            {isStreaming && !isPaused && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-accent/10 text-orange-accent text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-accent" />
                </span>
                live
              </span>
            )}

            {isPaused && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs">
                <Pause className="h-3 w-3" />
                paused
              </span>
            )}

            {isWaiting && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs">
                <Clock className="h-3 w-3" />
                {job.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 pl-8 pr-3 text-sm bg-white border border-gray-200 text-black placeholder-gray-400 focus:outline-none focus:border-orange-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Pause/Resume for streaming */}
            {isStreaming && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isPaused ? handleResume() : setIsPaused(true))}
                className="h-8"
              >
                {isPaused ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    resume
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    pause
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8"
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
              className="h-8"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "copied" : "copy"}
            </Button>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => {
                setAutoScroll(!autoScroll);
                if (!autoScroll) {
                  scrollToBottom();
                }
              }}
              className={`h-8 px-3 text-sm border transition-colors flex items-center gap-1.5 ${
                autoScroll
                  ? "bg-orange-accent/10 border-orange-accent/30 text-orange-accent"
                  : "bg-white border-gray-200 text-gray-500 hover:text-black hover:border-gray-300"
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              auto-scroll
            </button>
          </div>
        </div>

        {/* Logs Content */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="h-[500px] overflow-auto font-mono text-[13px] leading-[1.7] bg-gray-50"
        >
          {isLoading && !logs ? (
            <div className="flex items-center justify-center h-full gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="text-gray-500 text-sm">loading logs...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="text-center">
                <p className="text-red-600 text-sm mb-1">failed to load logs</p>
                <p className="text-gray-500 text-xs">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                try again
              </Button>
            </div>
          ) : hasLogs ? (
            <div className="min-w-fit">
              {filteredLogLines.map((line) => (
                <div
                  key={line.lineNumber}
                  className="flex hover:bg-gray-100 transition-colors group"
                >
                  {/* Line number */}
                  <div className="w-14 flex-shrink-0 px-3 py-0.5 text-right text-gray-400 select-none border-r border-gray-200 bg-white group-hover:bg-gray-50 sticky left-0">
                    {line.lineNumber}
                  </div>
                  {/* Log content */}
                  <div className="flex-1 px-4 py-0.5 text-gray-700 whitespace-pre-wrap break-all">
                    {searchQuery && line.content ? (
                      <HighlightedText
                        text={line.content}
                        highlight={searchQuery}
                      />
                    ) : (
                      line.content || " "
                    )}
                  </div>
                </div>
              ))}
              {/* Bottom padding */}
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
                      : "job is scheduled and starting up"}
                  </p>
                </>
              ) : isStreaming ? (
                <>
                  <div className="w-12 h-12 border border-gray-200 bg-white flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">waiting for output...</p>
                  <p className="text-xs text-gray-400">
                    logs will appear here as they are generated
                  </p>
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

        {/* Log count footer */}
        {hasLogs && (
          <div className="border-t border-gray-200 px-4 py-2 bg-white text-xs text-gray-500 flex items-center justify-between">
            <span>
              {searchQuery
                ? `${filteredLogLines.length} of ${logLines.length} lines`
                : `${logLines.length} lines`}
            </span>
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true);
                  scrollToBottom();
                }}
                className="text-orange-accent hover:underline"
              >
                scroll to bottom
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>cancel job</DialogTitle>
            <DialogDescription>
              are you sure you want to cancel {job.name || job.jobId}? this
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={isCancelling}
            >
              keep running
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  cancelling...
                </>
              ) : (
                "cancel job"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component to highlight search matches
function HighlightedText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight.trim()) {
    return <>{text}</>;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(highlight)})`, "gi"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark
            key={index}
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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
