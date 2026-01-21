import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const nodes = await fetchQuery(api.nodes.listAll, {});
    const vms = await fetchQuery(api.vms.listAll, {});
    const jobs = await fetchQuery(api.jobs.listAll, {});

    const onlineNodes = nodes.filter((n: any) => n.status === "online");

    // Calculate total cluster resources from online nodes
    const totalCpus = onlineNodes.reduce(
      (sum: number, n: any) => sum + (n.cpus || 0),
      0,
    );
    const totalRam = onlineNodes.reduce(
      (sum: number, n: any) => sum + (n.ram || 0),
      0,
    );
    const totalGpus = onlineNodes.reduce(
      (sum: number, n: any) => sum + (n.gpus || 0),
      0,
    );

    // Calculate used resources from active workloads
    const activeVms = vms.filter(
      (vm: any) =>
        vm.status !== "stopped" &&
        vm.status !== "failed" &&
        vm.status !== "offline",
    );
    const activeJobs = jobs.filter(
      (job: any) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );

    const usedCpus =
      activeVms.reduce((sum: number, vm: any) => sum + (vm.cpus || 0), 0) +
      activeJobs.reduce((sum: number, job: any) => sum + (job.cpus || 0), 0);
    const usedRam =
      activeVms.reduce((sum: number, vm: any) => sum + (vm.ram || 0), 0) +
      activeJobs.reduce((sum: number, job: any) => sum + (job.ram || 0), 0);
    const usedGpus =
      activeVms.reduce((sum: number, vm: any) => sum + (vm.gpus || 0), 0) +
      activeJobs.reduce((sum: number, job: any) => sum + (job.gpus || 0), 0);

    return NextResponse.json(
      {
        nodes: {
          total: nodes.length,
          online: onlineNodes.length,
          offline: nodes.filter((n: any) => n.status === "offline").length,
          draining: nodes.filter((n: any) => n.status === "draining").length,
        },
        cpus: {
          total: totalCpus,
          used: usedCpus,
          available: totalCpus - usedCpus,
        },
        ram: {
          total: totalRam,
          used: usedRam,
          available: totalRam - usedRam,
        },
        gpus: {
          total: totalGpus,
          used: usedGpus,
          available: totalGpus - usedGpus,
        },
        workloads: {
          activeVms: activeVms.length,
          activeJobs: activeJobs.length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching resources:", error);
    return NextResponse.json(
      { error: "Failed to fetch resources" },
      { status: 500 },
    );
  }
}
