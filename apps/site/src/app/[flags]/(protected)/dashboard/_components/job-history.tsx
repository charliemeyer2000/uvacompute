"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
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
  formatDuration,
} from "@/lib/job-utils";
import { getStatusBorderColor, getStatusDotColor } from "@/lib/status-colors";
import { MoreVertical, ExternalLink, Archive } from "lucide-react";
import { motion } from "motion/react";

function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.jobId}`}
      className={`block bg-white border border-gray-200 border-l-4 ${getStatusBorderColor(job.status)} p-5 hover:border-gray-300 hover:shadow-sm transition-all group`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-black truncate group-hover:text-orange-accent transition-colors">
            {job.name || "unnamed job"}
          </h3>
          <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
            {job.jobId}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${getStatusDotColor(job.status)}`}
            />
            <span className="text-xs text-gray-600">
              {formatJobStatus(job.status)}
            </span>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 cursor-pointer"
                onClick={(e) => e.preventDefault()}
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href={`/jobs/${job.jobId}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  view details
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-gray-400 uppercase tracking-wide text-[10px]">
          image
        </p>
        <p className="font-medium text-black text-xs font-mono truncate">
          {job.image}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            cpu
          </p>
          <p className="font-medium text-black">{job.cpus} vCPU</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            ram
          </p>
          <p className="font-medium text-black">{job.ram} GB</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            gpu
          </p>
          <p className="font-medium text-black">
            {job.gpus > 0 ? `${job.gpus}x` : "—"}
          </p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            scratch
          </p>
          <p className="font-medium text-black">
            {job.disk ? `${job.disk} GB` : "—"}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">created</span>
          <span className="text-gray-600">{formatDate(job.createdAt)}</span>
        </div>
        {job.completedAt && (
          <div className="flex justify-between">
            <span className="text-gray-400">completed</span>
            <span className="text-gray-600">{formatDate(job.completedAt)}</span>
          </div>
        )}
        {job.startedAt && job.completedAt && (
          <div className="flex justify-between">
            <span className="text-gray-400">duration</span>
            <span className="text-black font-medium">
              {formatDuration(job.startedAt, job.completedAt)}
            </span>
          </div>
        )}
        {job.exitCode !== undefined && (
          <div className="flex justify-between">
            <span className="text-gray-400">exit code</span>
            <span
              className={`font-medium ${job.exitCode === 0 ? "text-green-600" : "text-red-600"}`}
            >
              {job.exitCode}
            </span>
          </div>
        )}
        {job.errorMessage && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-gray-400 text-[10px] uppercase tracking-wide mb-1">
              error
            </p>
            <p className="text-red-600 text-xs break-words line-clamp-2">
              {job.errorMessage}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}

const ITEMS_PER_PAGE = 6;

export default function JobHistory({ userId }: { userId: string }) {
  const [currentPage, setCurrentPage] = useState(1);

  const inactiveJobs = useQuery(api.jobs.listInactiveByUser, { userId });

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
      {!inactiveJobs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 border-l-4 border-l-gray-200 p-5"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="h-5 w-32 bg-gray-100 animate-pulse mb-1" />
                  <div className="h-3 w-40 bg-gray-100 animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-gray-100 animate-pulse" />
              </div>
              <div className="mb-3">
                <div className="h-2 w-10 bg-gray-100 animate-pulse mb-1" />
                <div className="h-4 w-36 bg-gray-100 animate-pulse" />
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[1, 2, 3].map((j) => (
                  <div key={j}>
                    <div className="h-2 w-8 bg-gray-100 animate-pulse mb-1" />
                    <div className="h-4 w-12 bg-gray-100 animate-pulse" />
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                <div className="h-3 w-full bg-gray-100 animate-pulse" />
                <div className="h-3 w-3/4 bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : inactiveJobs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedInactiveJobs?.map((job, i) => (
              <motion.div
                key={job._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
              >
                <JobCard job={job as Job} />
              </motion.div>
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
        <div className="border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Archive className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm">no job history</p>
          <p className="text-xs text-gray-400 mt-1">
            completed and failed jobs will appear here
          </p>
        </div>
      )}
    </div>
  );
}
