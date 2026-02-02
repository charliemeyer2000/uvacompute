import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Every 5 minutes: mark expired VMs as stopping
crons.interval(
  "cleanup expired VMs",
  { minutes: 5 },
  internal.vms.cleanupExpired,
);

// Every 5 minutes: force-stop stale stopping VMs and force-cancel stale cancelling jobs
crons.interval(
  "cleanup stale VM transitions",
  { minutes: 5 },
  internal.vms.cleanupStaleTransitions,
);

crons.interval(
  "cleanup stale job transitions",
  { minutes: 5 },
  internal.jobs.cleanupStaleJobs,
);

export default crons;
