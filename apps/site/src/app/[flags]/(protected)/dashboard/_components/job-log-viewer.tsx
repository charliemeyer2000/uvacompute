"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, RefreshCw, Loader2, Radio } from "lucide-react";
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

  const isActive = ACTIVE_STATUSES.includes(jobStatus);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/logs`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "failed to fetch logs");
      }

      const logsText = await response.text();
      setLogs(logsText || "(no logs available)");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to fetch logs";
      setError(message);
      setLogs("");
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  const startStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsStreaming(true);
    setError(null);
    setLogs("");

    const eventSource = new EventSource(`/api/jobs/${jobId}/logs/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      setLogs((prev) => prev + event.data + "\n");
      setTimeout(scrollToBottom, 0);
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsStreaming(false);
      fetchLogs();
    };

    eventSource.addEventListener("done", () => {
      eventSource.close();
      setIsStreaming(false);
    });

    eventSource.addEventListener("error", (event) => {
      const errorEvent = event as MessageEvent;
      setError(errorEvent.data || "Stream error");
      eventSource.close();
      setIsStreaming(false);
    });
  }, [jobId, scrollToBottom, fetchLogs]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (open) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <span>logs: {jobName || jobId}</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs text-blue-600 font-normal">
                  <Radio className="h-3 w-3 animate-pulse" />
                  live
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="h-8"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">refresh</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!logs || isLoading}
                className="h-8"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="ml-2">{copied ? "copied!" : "copy"}</span>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 mt-4">
          {isLoading && !logs ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">loading logs...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="text-red-600 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                try again
              </Button>
            </div>
          ) : (
            <div
              ref={logContainerRef}
              className="h-[50vh] overflow-auto border border-gray-200 bg-gray-50"
            >
              <pre className="p-4 text-xs font-mono text-black whitespace-pre-wrap break-words">
                {logs ||
                  (isStreaming ? "waiting for logs..." : "(no logs available)")}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
