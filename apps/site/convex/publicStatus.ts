import { query } from "./_generated/server";

export const getClusterStatus = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("nodes").collect();
    const vms = await ctx.db.query("vms").collect();
    const jobs = await ctx.db.query("jobs").collect();

    const onlineNodes = nodes.filter((n) => n.status === "online");
    const offlineNodes = nodes.filter((n) => n.status === "offline");
    const drainingNodes = nodes.filter((n) => n.status === "draining");

    const activeVms = vms.filter(
      (vm) =>
        vm.status !== "stopped" &&
        vm.status !== "failed" &&
        vm.status !== "offline",
    );
    const activeJobs = jobs.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );

    const totalVCPUs = onlineNodes.reduce((sum, n) => sum + (n.cpus || 0), 0);
    const totalRAM = onlineNodes.reduce((sum, n) => sum + (n.ram || 0), 0);
    const totalGPUs = onlineNodes.reduce((sum, n) => sum + (n.gpus || 0), 0);

    const usedVCPUs = activeVms.reduce((sum, vm) => sum + vm.cpus, 0);
    const usedRAM = activeVms.reduce((sum, vm) => sum + vm.ram, 0);
    const usedGPUs = activeVms.reduce((sum, vm) => sum + vm.gpus, 0);

    const gpuByType: Record<string, { total: number; available: number }> = {};
    for (const node of onlineNodes) {
      const gpuType = node.gpuType || "unknown";
      const nodeGpus = node.gpus || 0;
      if (nodeGpus > 0) {
        if (!gpuByType[gpuType]) {
          gpuByType[gpuType] = { total: 0, available: 0 };
        }
        gpuByType[gpuType].total += nodeGpus;
      }
    }

    const vmsUsingGpuByNode: Record<string, number> = {};
    for (const vm of activeVms) {
      if (vm.nodeId && vm.gpus > 0) {
        vmsUsingGpuByNode[vm.nodeId] =
          (vmsUsingGpuByNode[vm.nodeId] || 0) + vm.gpus;
      }
    }

    for (const node of onlineNodes) {
      const gpuType = node.gpuType || "unknown";
      const nodeGpus = node.gpus || 0;
      const usedOnNode = vmsUsingGpuByNode[node.nodeId] || 0;
      if (nodeGpus > 0 && gpuByType[gpuType]) {
        gpuByType[gpuType].available += Math.max(0, nodeGpus - usedOnNode);
      }
    }

    let overall: "operational" | "degraded" | "down" = "operational";
    if (nodes.length === 0) {
      overall = "down";
    } else if (onlineNodes.length === 0) {
      overall = "down";
    } else if (offlineNodes.length > 0 || drainingNodes.length > 0) {
      overall = "degraded";
    }

    const nodeStatuses = nodes.map((node) => ({
      name: node.name || node.nodeId,
      status: node.status,
      vcpus: node.cpus || 0,
      ram: node.ram || 0,
      gpus: node.gpus || 0,
      gpuType: node.gpuType || "none",
      supportsVMs: node.supportsVMs ?? true,
      supportsJobs: node.supportsJobs ?? true,
      lastHeartbeat: node.lastHeartbeat,
    }));

    return {
      timestamp: Date.now(),
      overall,
      resources: {
        nodes: {
          total: nodes.length,
          online: onlineNodes.length,
          offline: offlineNodes.length,
          draining: drainingNodes.length,
        },
        vcpus: {
          total: totalVCPUs,
          available: Math.max(0, totalVCPUs - usedVCPUs),
        },
        ram: {
          total: totalRAM,
          available: Math.max(0, totalRAM - usedRAM),
        },
        gpus: {
          total: totalGPUs,
          available: Math.max(0, totalGPUs - usedGPUs),
          byType: gpuByType,
        },
      },
      nodes: nodeStatuses,
    };
  },
});
