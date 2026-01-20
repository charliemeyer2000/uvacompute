"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Job,
  formatDate,
  formatJobStatus,
  getJobStatusColor,
  formatDuration,
  isJobCancellable,
} from "@/lib/job-utils";
import { MoreVertical, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import JobLogViewer from "./job-log-viewer";

function JobCard({ job }: { job: Job }) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancel = async () => {
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

  return (
    <>
      <div className="bg-white border border-gray-200 p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-black">
              {job.name || "unnamed job"}
            </h3>
            <p className="text-xs text-gray-500 font-mono">{job.jobId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs font-medium border ${getJobStatusColor(job.status)}`}
            >
              {formatJobStatus(job.status)}
            </span>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 cursor-pointer"
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowLogViewer(true)}
                  className="cursor-pointer"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  view logs
                </DropdownMenuItem>
                {isJobCancellable(job.status) && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setShowCancelDialog(true)}
                    className="cursor-pointer"
                  >
                    cancel job
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs text-gray-500">image</p>
          <p className="font-medium text-black text-sm font-mono truncate">
            {job.image}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-xs">
          <div>
            <p className="text-gray-500">cpus</p>
            <p className="font-medium text-black">{job.cpus} vCPU</p>
          </div>
          <div>
            <p className="text-gray-500">ram</p>
            <p className="font-medium text-black">{job.ram} GB</p>
          </div>
          <div>
            <p className="text-gray-500">gpus</p>
            <p className="font-medium text-black">
              {job.gpus > 0 ? `${job.gpus}` : "none"}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">created:</span>
            <span className="text-black">{formatDate(job.createdAt)}</span>
          </div>
          {job.startedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">running for:</span>
              <span className="text-black font-medium">
                {formatDuration(job.startedAt)}
              </span>
            </div>
          )}
        </div>
      </div>

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

      <JobLogViewer
        jobId={job.jobId}
        jobName={job.name}
        jobStatus={job.status}
        open={showLogViewer}
        onOpenChange={setShowLogViewer}
      />
    </>
  );
}

const ITEMS_PER_PAGE = 6;

export default function ActiveJobs() {
  const { data: session } = authClient.useSession();
  const [currentPage, setCurrentPage] = useState(1);

  const activeJobs = useQuery(
    api.jobs.listActiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const totalPages = activeJobs
    ? Math.ceil(activeJobs.length / ITEMS_PER_PAGE)
    : 0;
  const paginatedActiveJobs = activeJobs
    ? activeJobs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      )
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">active jobs</h2>
        {activeJobs ? (
          <span className="text-sm text-gray-500">
            {activeJobs.length} {activeJobs.length === 1 ? "job" : "jobs"}
          </span>
        ) : (
          <div className="h-5 w-16 bg-gray-200 animate-pulse" />
        )}
      </div>

      {!activeJobs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[280px]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="h-6 w-32 bg-gray-200 animate-pulse mb-2" />
                  <div className="h-4 w-48 bg-gray-200 animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-gray-200 animate-pulse" />
              </div>
              <div className="mb-4">
                <div className="h-3 w-12 bg-gray-200 animate-pulse mb-1" />
                <div className="h-5 w-40 bg-gray-200 animate-pulse" />
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="h-3 w-12 bg-gray-200 animate-pulse mb-1" />
                  <div className="h-4 w-16 bg-gray-200 animate-pulse" />
                </div>
                <div>
                  <div className="h-3 w-12 bg-gray-200 animate-pulse mb-1" />
                  <div className="h-4 w-16 bg-gray-200 animate-pulse" />
                </div>
                <div>
                  <div className="h-3 w-12 bg-gray-200 animate-pulse mb-1" />
                  <div className="h-4 w-16 bg-gray-200 animate-pulse" />
                </div>
              </div>
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="h-3 w-full bg-gray-200 animate-pulse" />
                <div className="h-3 w-full bg-gray-200 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activeJobs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[280px]">
            {paginatedActiveJobs?.map((job) => (
              <JobCard key={job._id} job={job as Job} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination className="mt-6">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage > 1) setCurrentPage(currentPage - 1);
                    }}
                    className={
                      currentPage === 1 ? "pointer-events-none opacity-50" : ""
                    }
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(page);
                            }}
                            isActive={page === currentPage}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    } else if (
                      page === currentPage - 2 ||
                      page === currentPage + 2
                    ) {
                      return (
                        <PaginationItem key={page}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    return null;
                  },
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentPage < totalPages)
                        setCurrentPage(currentPage + 1);
                    }}
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      ) : (
        <div className="border border-gray-200 p-8 text-center min-h-[280px] flex flex-col items-center justify-center">
          <p className="text-gray-500 mb-2 text-sm">no active jobs</p>
          <p className="text-xs text-gray-400">
            run a container job using the cli:{" "}
            <code className="bg-gray-50 px-2 py-1 border border-gray-200">
              uva run alpine echo hello
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
