"use client";

import { useState } from "react";
import Link from "next/link";
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
  formatStatus,
  getStatusBorderColor,
  getStatusDotColor,
  getSshCommand,
  deleteVm,
  extendVm,
} from "@/lib/vm-utils";
import { MoreVertical, Loader2, Copy, Check, Monitor } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

function VMCard({ vm, isActive }: { vm: VM; isActive: boolean }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [extendHours, setExtendHours] = useState("1");
  const [sshCopied, setSSHCopied] = useState(false);

  async function handleCopySSH(): Promise<void> {
    if (sshCopied) return;

    try {
      await navigator.clipboard.writeText(getSshCommand(vm));
      setSSHCopied(true);
      toast.success("ssh command copied", {
        description: "paste it into your terminal to connect",
      });
      setTimeout(() => setSSHCopied(false), 2000);
    } catch {
      toast.error("copy failed");
    }
  }

  async function handleDelete(): Promise<void> {
    setIsDeleting(true);

    const result = await deleteVm(vm.vmId);

    if (result.success) {
      toast.success("vm deleted", {
        description: `${vm.name || vm.vmId} has been deleted`,
      });
      setShowDeleteDialog(false);
    } else {
      toast.error("deletion failed", {
        description: result.error,
      });
    }

    setIsDeleting(false);
  }

  async function handleExtend(): Promise<void> {
    const hours = Number(extendHours);
    if (Number.isNaN(hours) || hours < 1) {
      toast.error("invalid hours", {
        description: "enter a positive number of hours to extend",
      });
      return;
    }

    setIsExtending(true);

    const result = await extendVm(vm.vmId, hours);

    if (result.success) {
      toast.success("vm extended", {
        description: result.expiresAt
          ? `new expiration: ${formatDate(result.expiresAt)}`
          : "expiration updated",
      });
      setShowExtendDialog(false);
    } else {
      toast.error("extension failed", {
        description: result.error,
      });
    }

    setIsExtending(false);
  }

  return (
    <>
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
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${getStatusDotColor(vm.status)}`}
              />
              <span className="text-xs text-gray-600">
                {formatStatus(vm.status)}
              </span>
            </div>
            {isActive && (
              <div onClick={(e) => e.preventDefault()}>
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
                    {vm.status === "ready" && (
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
                    {vm.status === "ready" && (
                      <DropdownMenuItem
                        onClick={() => setShowExtendDialog(true)}
                        className="cursor-pointer"
                      >
                        extend vm
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
              </div>
            )}
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
          {isActive && (
            <div className="flex justify-between">
              <span className="text-gray-400">
                {vm.status === "ready" ? "expires" : "status"}
              </span>
              <span className="text-black font-medium">
                {vm.status === "ready"
                  ? formatTimeRemaining(vm.expiresAt)
                  : "Provisioning..."}
              </span>
            </div>
          )}
          {!isActive && vm.deletedAt && (
            <div className="flex justify-between">
              <span className="text-gray-400">deleted</span>
              <span className="text-gray-600">{formatDate(vm.deletedAt)}</span>
            </div>
          )}
        </div>
      </Link>

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

      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>extend vm</DialogTitle>
            <DialogDescription>
              add more time to {vm.name || vm.vmId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">hours</p>
              <Input
                type="number"
                min={1}
                value={extendHours}
                onChange={(e) => setExtendHours(e.target.value)}
                aria-invalid={Number(extendHours) < 1}
              />
            </div>
            <div className="flex gap-2">
              {[1, 2, 4, 8].map((hours) => (
                <Button
                  key={hours}
                  variant="outline"
                  size="sm"
                  onClick={() => setExtendHours(String(hours))}
                >
                  +{hours}h
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExtendDialog(false)}
              disabled={isExtending}
            >
              cancel
            </Button>
            <Button onClick={handleExtend} disabled={isExtending}>
              {isExtending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  extending...
                </>
              ) : (
                "extend"
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
      {!activeVMs ? (
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
      ) : activeVMs.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedActiveVMs?.map((vm) => (
              <VMCard
                key={vm._id}
                vm={vm}
                isActive={[
                  "creating",
                  "pending",
                  "booting",
                  "provisioning",
                  "ready",
                ].includes(vm.status)}
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
        <div className="border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Monitor className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-500 mb-2 text-sm">no active vms</p>
          <p className="text-xs text-gray-400 mb-4">
            create a vm using the cli
          </p>
          <div className="bg-gray-50 border border-gray-200 px-3 py-2 inline-block">
            <code className="text-xs text-gray-600">
              uva vm create -h 1 -n my-vm
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
