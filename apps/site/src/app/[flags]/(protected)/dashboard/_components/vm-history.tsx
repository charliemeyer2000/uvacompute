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

interface VM {
  _id: string;
  _creationTime: number;
  userId: string;
  vmId: string;
  name?: string;
  cpus: number;
  ram: number;
  disk: number;
  gpus: number;
  gpuType: string;
  status:
    | "creating"
    | "running"
    | "failed"
    | "deleting"
    | "deleted"
    | "expired";
  hours: number;
  createdAt: number;
  expiresAt: number;
  deletedAt?: number;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function getStatusColor(status: VM["status"]) {
  switch (status) {
    case "running":
      return "bg-green-100 text-green-800 border-green-200";
    case "creating":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    case "deleting":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "deleted":
    case "expired":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function VMCard({ vm }: { vm: VM }) {
  return (
    <div className="bg-white border border-gray-200 p-6 hover:border-black transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-base font-semibold text-black">
            {vm.name || "unnamed vm"}
          </h3>
          <p className="text-xs text-gray-500 font-mono">{vm.vmId}</p>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium border ${getStatusColor(vm.status)}`}
        >
          {vm.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
        <div>
          <p className="text-gray-500">cpus</p>
          <p className="font-medium text-black">{vm.cpus} vCPU</p>
        </div>
        <div>
          <p className="text-gray-500">ram</p>
          <p className="font-medium text-black">{vm.ram} GB</p>
        </div>
        <div>
          <p className="text-gray-500">disk</p>
          <p className="font-medium text-black">{vm.disk} GB</p>
        </div>
        <div>
          <p className="text-gray-500">gpus</p>
          <p className="font-medium text-black">
            {vm.gpus > 0 ? `${vm.gpus}x ${vm.gpuType}` : "none"}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">created:</span>
          <span className="text-black">{formatDate(vm.createdAt)}</span>
        </div>
        {vm.deletedAt && (
          <div className="flex justify-between">
            <span className="text-gray-500">deleted:</span>
            <span className="text-black">{formatDate(vm.deletedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const ITEMS_PER_PAGE = 6;

export default function VMHistory() {
  const { data: session } = authClient.useSession();
  const [currentPage, setCurrentPage] = useState(1);

  const inactiveVMs = useQuery(
    api.vms.listInactiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  if (!session?.user?.id) {
    return null;
  }

  if (inactiveVMs === undefined) {
    return null;
  }

  const totalPages = inactiveVMs
    ? Math.ceil(inactiveVMs.length / ITEMS_PER_PAGE)
    : 0;
  const paginatedInactiveVMs = inactiveVMs?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">vm history</h2>
        {inactiveVMs && (
          <span className="text-sm text-gray-500">
            {inactiveVMs.length} {inactiveVMs.length === 1 ? "vm" : "vms"}
          </span>
        )}
      </div>

      {inactiveVMs && inactiveVMs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedInactiveVMs?.map((vm) => (
              <VMCard key={vm._id} vm={vm} />
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
        <div className="border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">no vm history</p>
        </div>
      )}
    </div>
  );
}
