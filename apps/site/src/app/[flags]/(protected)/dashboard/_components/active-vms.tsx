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
  VM,
  formatDate,
  formatTimeRemaining,
  getStatusColor,
} from "@/lib/vm-utils";
import { MoreVertical, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

function VMCard({ vm, isActive }: { vm: VM; isActive: boolean }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sshCopied, setSSHCopied] = useState(false);

  const handleCopySSH = async () => {
    if (sshCopied) return;

    try {
      const response = await fetch(`/api/vms/${vm.vmId}/connection`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "failed to fetch connection info");
      }

      const connectionInfo = await response.json();
      const sshCommand = `ssh -p ${connectionInfo.sshPort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${connectionInfo.user}@${vm.vmId}@${connectionInfo.sshHost}`;

      await navigator.clipboard.writeText(sshCommand);
      setSSHCopied(true);

      toast.success("ssh command copied", {
        description: "paste it into your terminal or VSCode live share!",
      });

      setTimeout(() => setSSHCopied(false), 2000);
    } catch (error) {
      toast.error("copy failed", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/vms/${vm.vmId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok || data.status !== "deletion_success") {
        throw new Error(data.msg || "failed to delete vm");
      }

      toast.success("vm deleted", {
        description: `${vm.name || vm.vmId} has been deleted`,
      });

      setShowDeleteDialog(false);
    } catch (error) {
      toast.error("deletion failed", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-gray-200 p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-black">
              {vm.name || "unnamed vm"}
            </h3>
            <p className="text-xs text-gray-500 font-mono">{vm.vmId}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs font-medium border ${getStatusColor(vm.status)}`}
            >
              {vm.status}
            </span>
            {isActive && (
              <DropdownMenu>
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
                  {vm.status === "running" && (
                    <DropdownMenuItem
                      onClick={handleCopySSH}
                      className="cursor-pointer"
                    >
                      {sshCopied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          copy ssh command
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="cursor-pointer"
                  >
                    delete vm
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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
          {isActive && (
            <div className="flex justify-between">
              <span className="text-gray-500">expires:</span>
              <span className="text-black font-medium">
                {formatTimeRemaining(vm.expiresAt)}
              </span>
            </div>
          )}
          {!isActive && vm.deletedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">deleted:</span>
              <span className="text-black">{formatDate(vm.deletedAt)}</span>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>delete vm</DialogTitle>
            <DialogDescription>
              are you sure you want to delete {vm.name || vm.vmId}? this action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  deleting...
                </>
              ) : (
                "delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ITEMS_PER_PAGE = 6;

export default function ActiveVMs() {
  const { data: session } = authClient.useSession();
  const [currentPage, setCurrentPage] = useState(1);

  const activeVMs = useQuery(
    api.vms.listActiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  const totalPages = activeVMs
    ? Math.ceil(activeVMs.length / ITEMS_PER_PAGE)
    : 0;
  const paginatedActiveVMs = activeVMs
    ? activeVMs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      )
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-black">active vms</h2>
        {activeVMs ? (
          <span className="text-sm text-gray-500">
            {activeVMs.length} {activeVMs.length === 1 ? "vm" : "vms"}
          </span>
        ) : (
          <div className="h-5 w-16 bg-gray-200 animate-pulse" />
        )}
      </div>

      {!activeVMs ? (
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
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="h-3 w-12 bg-gray-200 animate-pulse mb-1" />
                  <div className="h-4 w-20 bg-gray-200 animate-pulse" />
                </div>
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
                  <div className="h-4 w-24 bg-gray-200 animate-pulse" />
                </div>
              </div>
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="h-3 w-full bg-gray-200 animate-pulse" />
                <div className="h-3 w-full bg-gray-200 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activeVMs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 min-h-[280px]">
            {paginatedActiveVMs?.map((vm) => (
              <VMCard
                key={vm._id}
                vm={vm}
                isActive={vm.status === "running" || vm.status === "updating"}
              />
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
          <p className="text-gray-500 mb-2 text-sm">no active vms</p>
          <p className="text-xs text-gray-400">
            create a vm using the cli:{" "}
            <code className="bg-gray-50 px-2 py-1 border border-gray-200">
              uva vm create -h 1 -n my-vm
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
