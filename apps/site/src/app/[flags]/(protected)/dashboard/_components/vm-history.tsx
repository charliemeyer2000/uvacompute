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
import { VM, formatDate, formatStatus } from "@/lib/vm-utils";
import { getStatusBorderColor, getStatusDotColor } from "@/lib/status-colors";
import { Archive } from "lucide-react";
import { motion } from "motion/react";

function VMCard({ vm }: { vm: VM }) {
  return (
    <Link
      href={`/vms/${vm.vmId}`}
      className={`block bg-white border border-gray-200 border-l-4 ${getStatusBorderColor(vm.status)} p-5 hover:border-gray-300 transition-colors`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-black truncate">
            {vm.name || "unnamed vm"}
          </h3>
          <p className="text-xs text-gray-400 font-mono truncate mt-0.5">
            {vm.vmId}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <span
            className={`w-2 h-2 rounded-full ${getStatusDotColor(vm.status)}`}
          />
          <span className="text-xs text-gray-600">
            {formatStatus(vm.status)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            cpu
          </p>
          <p className="font-medium text-black">{vm.cpus} vCPU</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            ram
          </p>
          <p className="font-medium text-black">{vm.ram} GB</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            disk
          </p>
          <p className="font-medium text-black">{vm.disk} GB</p>
        </div>
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">
            gpu
          </p>
          <p className="font-medium text-black">
            {vm.gpus > 0 ? `${vm.gpus}x` : "—"}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">created</span>
          <span className="text-gray-600">{formatDate(vm.createdAt)}</span>
        </div>
        {vm.deletedAt && (
          <div className="flex justify-between">
            <span className="text-gray-400">deleted</span>
            <span className="text-gray-600">{formatDate(vm.deletedAt)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

const ITEMS_PER_PAGE = 6;

export default function VMHistory({ userId }: { userId: string }) {
  const [currentPage, setCurrentPage] = useState(1);

  const inactiveVMs = useQuery(api.vms.listInactiveByUser, { userId });

  const totalPages = inactiveVMs
    ? Math.ceil(inactiveVMs.length / ITEMS_PER_PAGE)
    : 0;
  const paginatedInactiveVMs = inactiveVMs
    ? inactiveVMs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      )
    : [];

  return (
    <div>
      {!inactiveVMs ? (
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
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[1, 2, 3, 4].map((j) => (
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
      ) : inactiveVMs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedInactiveVMs?.map((vm, i) => (
              <motion.div
                key={vm._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
              >
                <VMCard vm={vm} />
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
          <p className="text-gray-500 text-sm">no vm history</p>
          <p className="text-xs text-gray-400 mt-1">
            deleted and expired vms will appear here
          </p>
        </div>
      )}
    </div>
  );
}
