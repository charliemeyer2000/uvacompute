"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Job,
  formatDate,
  formatJobStatus,
  formatDuration,
  isJobCancellable,
} from "@/lib/job-utils";
import {
  getStatusTextColor as getStatusColor,
  getStatusBadgeColor as getStatusBgColor,
  getStatusDotColor,
} from "@/lib/status-colors";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Cpu,
  HardDrive,
  Zap,
  Terminal,
  X,
  Database,
  ExternalLink,
  Globe,
  Github,
} from "lucide-react";
import { toast } from "sonner";
import { LogViewer } from "./_components/log-viewer";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const { data: session } = authClient.useSession();
  const job = useQuery(api.jobs.getByJobId, jobId ? { jobId } : "skip") as
    | Job
    | null
    | undefined;

  const [endpointCopied, setEndpointCopied] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const hasEndpoint = job?.status === "running" && job?.exposeUrl;

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

  const handleCopyEndpoint = async () => {
    if (endpointCopied || !job?.exposeUrl) return;

    try {
      await navigator.clipboard.writeText(job.exposeUrl);
      setEndpointCopied(true);
      toast.success("endpoint url copied", {
        description: "paste it into your browser to access",
      });
      setTimeout(() => setEndpointCopied(false), 2000);
    } catch {
      toast.error("failed to copy");
    }
  };

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
      <div className="flex items-center justify-between flex-wrap gap-y-3">
        <div className="flex items-center gap-3">
          <Link
            href="/jobs"
            className="text-gray-400 hover:text-black transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              {job.source === "github" && (
                <span title="GitHub Actions runner">
                  <Github className="h-5 w-5 text-gray-400 flex-shrink-0" />
                </span>
              )}
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-black truncate">{job.cpus} vCPU</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <HardDrive className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-black truncate">{job.ram} GB</span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <Zap className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-black truncate">
                {job.gpus > 0 ? `${job.gpus}x GPU` : "no GPU"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <Database className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-black truncate">
                {job.disk ? `${job.disk} GB` : "no scratch"}
              </span>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div className="bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            timing
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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

      {/* GitHub Actions metadata */}
      {job.githubMeta && (
        <div className="bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Github className="h-4 w-4 text-gray-400" />
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              github actions
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-gray-500">repo: </span>
              <a
                href={`https://github.com/${job.githubMeta.repoFullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-black hover:text-orange-accent transition-colors font-mono"
              >
                {job.githubMeta.repoFullName}
              </a>
            </div>
            {job.githubMeta.workflowJobUrl && (
              <div>
                <span className="text-gray-500">workflow job: </span>
                <a
                  href={job.githubMeta.workflowJobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black hover:text-orange-accent transition-colors font-mono"
                >
                  #{job.githubMeta.workflowJobId}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Endpoint (if exposed and running) */}
      {hasEndpoint && (
        <div className="bg-white border border-gray-200 border-l-4 border-l-orange-accent p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-orange-accent" />
            <p className="text-xs text-gray-400 uppercase tracking-wide">
              endpoint
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 px-3 py-2 font-mono text-sm text-gray-700 truncate">
              {job.exposeUrl}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyEndpoint}
              className="h-9"
            >
              {endpointCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" asChild className="h-9">
              <a href={job.exposeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          {job.exposePort && (
            <p className="text-xs text-gray-400 mt-2">
              port {job.exposePort} exposed via {job.exposeSubdomain}
              .uvacompute.com
            </p>
          )}
        </div>
      )}

      {/* Logs Section */}
      <LogViewer job={job} />

      <ConfirmationDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title="cancel job"
        description={`are you sure you want to cancel ${job.name || job.jobId}? this action cannot be undone.`}
        confirmLabel="cancel job"
        confirmingLabel="cancelling..."
        cancelLabel="keep running"
        onConfirm={handleCancel}
        isConfirming={isCancelling}
        variant="destructive"
      />
    </div>
  );
}
