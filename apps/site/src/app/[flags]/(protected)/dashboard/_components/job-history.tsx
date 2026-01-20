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
import { Button } from "@/components/ui/button";
import {
  Job,
  formatDate,
  formatJobStatus,
  getJobStatusColor,
  formatDuration,
} from "@/lib/job-utils";
import { MoreVertical, FileText } from "lucide-react";
import JobLogViewer from "./job-log-viewer";

function JobCard({ job }: { job: Job }) {
  const [showLogViewer, setShowLogViewer] = useState(false);

  return (
    <>
      <div className="bg-white border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
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
          {job.completedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">completed:</span>
              <span className="text-black">{formatDate(job.completedAt)}</span>
            </div>
          )}
          {job.startedAt && job.completedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">duration:</span>
              <span className="text-black">
                {formatDuration(job.startedAt, job.completedAt)}
              </span>
            </div>
          )}
          {job.exitCode !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500">exit code:</span>
              <span
                className={`font-medium ${job.exitCode === 0 ? "text-green-600" : "text-red-600"}`}
              >
                {job.exitCode}
              </span>
            </div>
          )}
          {job.errorMessage && (
            <div className="mt-2">
              <span className="text-gray-500">error:</span>
              <p className="text-red-600 text-xs mt-1 break-words">
                {job.errorMessage}
              </p>
            </div>
          )}
        </div>
      </div>

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

export default function JobHistory() {
  const { data: session } = authClient.useSession();
  const [currentPage, setCurrentPage] = useState(1);

  const inactiveJobs = useQuery(
    api.jobs.listInactiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const totalPages = inactiveJobs
    ? Math.ceil(inactiveJobs.length / ITEMS_PER_PAGE)
    : 0;
  const paginatedInactiveJobs = inactiveJobs
    ? inactiveJobs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      )
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">job history</h2>
        {inactiveJobs ? (
          <span className="text-sm text-gray-500">
            {inactiveJobs.length} {inactiveJobs.length === 1 ? "job" : "jobs"}
          </span>
        ) : (
          <div className="h-5 w-16 bg-gray-200 animate-pulse" />
        )}
      </div>

      {!inactiveJobs ? (
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
      ) : inactiveJobs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[280px]">
            {paginatedInactiveJobs?.map((job) => (
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
          <p className="text-gray-500 text-sm">no job history</p>
        </div>
      )}
    </div>
  );
}
