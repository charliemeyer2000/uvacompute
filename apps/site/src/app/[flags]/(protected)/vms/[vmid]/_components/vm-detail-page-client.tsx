"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePreloadedQuery, Preloaded } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VM,
  formatDate,
  formatTimeRemaining,
  formatStatus,
  getSshCommand,
  deleteVm,
  extendVm,
} from "@/lib/vm-utils";
import { getStatusDotColor, getStatusTextColor } from "@/lib/status-colors";
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Cpu,
  HardDrive,
  MemoryStick,
  Zap,
  Monitor,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const ACTIVE_STATUSES = [
  "creating",
  "pending",
  "booting",
  "provisioning",
  "ready",
];

export default function VMDetailPageClient({
  preloadedVM,
  userId,
}: {
  preloadedVM: Preloaded<typeof api.vms.getByVmId>;
  userId: string;
}) {
  const router = useRouter();

  const vm = usePreloadedQuery(preloadedVM) as VM | null;

  const [sshCopied, setSshCopied] = useState(false);
  const [endpointCopied, setEndpointCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [extendHours, setExtendHours] = useState("1");

  const isActive = vm?.status ? ACTIVE_STATUSES.includes(vm.status) : false;
  const isReady = vm?.status === "ready";
  const hasEndpoint = isReady && vm?.exposeUrl;

  async function handleCopySSH(): Promise<void> {
    if (sshCopied || !vm) return;

    try {
      await navigator.clipboard.writeText(getSshCommand(vm));
      setSshCopied(true);
      toast.success("ssh command copied", {
        description: "paste it into your terminal to connect",
      });
      setTimeout(() => setSshCopied(false), 2000);
    } catch {
      toast.error("failed to copy");
    }
  }

  async function handleCopyEndpoint(): Promise<void> {
    if (endpointCopied || !vm?.exposeUrl) return;

    try {
      await navigator.clipboard.writeText(vm.exposeUrl);
      setEndpointCopied(true);
      toast.success("endpoint url copied", {
        description: "paste it into your browser to access",
      });
      setTimeout(() => setEndpointCopied(false), 2000);
    } catch {
      toast.error("failed to copy");
    }
  }

  async function handleDelete(): Promise<void> {
    if (!vm) return;
    setIsDeleting(true);

    const result = await deleteVm(vm.vmId);

    if (result.success) {
      toast.success("vm deleted", {
        description: `${vm.name || vm.vmId} has been deleted`,
      });
      router.push("/dashboard");
    } else {
      toast.error("deletion failed", {
        description: result.error,
      });
    }

    setIsDeleting(false);
  }

  async function handleExtend(): Promise<void> {
    if (!vm) return;
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

  if (vm === null) {
    return (
      <div className="space-y-6">
        <Link
          href="/vms"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          back to vms
        </Link>

        <div className="border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 flex items-center justify-center mb-4">
            <Monitor className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-black mb-2">
            vm not found
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            the vm you&apos;re looking for doesn&apos;t exist or has been
            deleted.
          </p>
          <Button variant="outline" asChild>
            <Link href="/vms">view all vms</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = userId === vm.userId;

  return (
    <div className="space-y-6">
      <Link
        href="/vms"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        vms / {vm.name || vm.vmId}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-black">
              {vm.name || "unnamed vm"}
            </h1>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${getStatusDotColor(vm.status)}`}
              />
              <span
                className={`text-sm font-medium ${getStatusTextColor(vm.status)}`}
              >
                {formatStatus(vm.status)}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-400 font-mono mt-1">{vm.vmId}</p>
        </div>

        {isOwner && isActive && (
          <div className="flex items-center gap-2">
            {isReady && (
              <Button
                variant="outline"
                onClick={() => setShowExtendDialog(true)}
              >
                extend
              </Button>
            )}
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              onClick={() => setShowDeleteDialog(true)}
            >
              delete vm
            </Button>
          </div>
        )}
      </div>

      <div className="border border-gray-200 bg-white">
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide mb-1">
              <Cpu className="h-3.5 w-3.5" />
              cpu
            </div>
            <p className="text-lg font-medium text-black">{vm.cpus} vCPU</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide mb-1">
              <MemoryStick className="h-3.5 w-3.5" />
              ram
            </div>
            <p className="text-lg font-medium text-black">{vm.ram} GB</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide mb-1">
              <HardDrive className="h-3.5 w-3.5" />
              disk
            </div>
            <p className="text-lg font-medium text-black">{vm.disk} GB</p>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wide mb-1">
              <Zap className="h-3.5 w-3.5" />
              gpu
            </div>
            <p className="text-lg font-medium text-black">
              {vm.gpus > 0 ? `${vm.gpus}x ${vm.gpuType}` : "—"}
            </p>
          </div>
        </div>
      </div>

      {isReady && (
        <div className="border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-black mb-3">
            ssh connection
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 px-4 py-2.5 font-mono text-sm text-gray-700">
              uva vm ssh {vm.name || vm.vmId}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySSH}
              className="h-10"
            >
              {sshCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {hasEndpoint && (
        <div className="border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-black mb-3">endpoint</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-50 border border-gray-200 px-4 py-2.5 font-mono text-sm text-gray-700 truncate">
              {vm.exposeUrl}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyEndpoint}
              className="h-10"
            >
              {endpointCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" asChild className="h-10">
              <a href={vm.exposeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          {vm.exposePort && (
            <p className="text-xs text-gray-400 mt-2">
              port {vm.exposePort} exposed via {vm.exposeSubdomain}
              .uvacompute.com
            </p>
          )}
        </div>
      )}

      <div className="border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-black mb-3">lifecycle</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 mb-1">created</p>
            <p className="text-gray-700 font-mono">
              {formatDate(vm.createdAt)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">
              {isActive ? "expires" : "deleted"}
            </p>
            {isActive ? (
              <p className="text-orange-accent font-medium">
                {formatTimeRemaining(vm.expiresAt)}
              </p>
            ) : vm.deletedAt ? (
              <p className="text-gray-700 font-mono">
                {formatDate(vm.deletedAt)}
              </p>
            ) : (
              <p className="text-gray-400">—</p>
            )}
          </div>
        </div>
      </div>

      {vm.nodeId && (
        <div className="border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-black mb-3">node</h3>
          <p className="text-sm text-gray-700 font-mono">{vm.nodeId}</p>
        </div>
      )}

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
    </div>
  );
}
