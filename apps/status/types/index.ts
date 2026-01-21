import { z } from "zod";

export const serviceStatusSchema = z.enum(["operational", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const nodeStatusValueSchema = z.enum(["online", "offline", "draining"]);
export type NodeStatusValue = z.infer<typeof nodeStatusValueSchema>;

export const nodeStatusSchema = z.object({
  name: z.string(),
  status: nodeStatusValueSchema,
  vcpus: z.number(),
  ram: z.number(),
  gpus: z.number(),
  gpuType: z.string(),
  supportsVMs: z.boolean(),
  supportsJobs: z.boolean(),
  lastHeartbeat: z.number(),
});
export type NodeStatus = z.infer<typeof nodeStatusSchema>;

export const gpuTypeBreakdownSchema = z.object({
  total: z.number(),
  available: z.number(),
});
export type GPUTypeBreakdown = z.infer<typeof gpuTypeBreakdownSchema>;

export const clusterResourcesSchema = z.object({
  nodes: z.object({
    total: z.number(),
    online: z.number(),
    offline: z.number(),
    draining: z.number(),
  }),
  vcpus: z.object({
    total: z.number(),
    available: z.number(),
  }),
  ram: z.object({
    total: z.number(),
    available: z.number(),
  }),
  gpus: z.object({
    total: z.number(),
    available: z.number(),
    byType: z.record(z.string(), gpuTypeBreakdownSchema),
  }),
});
export type ClusterResources = z.infer<typeof clusterResourcesSchema>;

export const clusterStatusSchema = z.object({
  timestamp: z.number(),
  overall: serviceStatusSchema,
  resources: clusterResourcesSchema,
  nodes: z.array(nodeStatusSchema),
});
export type ClusterStatus = z.infer<typeof clusterStatusSchema>;

export const statusCheckSchema = z.object({
  status: serviceStatusSchema,
  responseTime: z.number(),
  timestamp: z.number(),
  error: z.string().optional(),
});
export type StatusCheck = z.infer<typeof statusCheckSchema>;

export const healthCheckResultSchema = z.object({
  status: serviceStatusSchema,
  responseTime: z.number(),
  timestamp: z.instanceof(Date),
  error: z.string().optional(),
});
export type HealthCheckResult = z.infer<typeof healthCheckResultSchema>;

export const dayAggregateSchema = z.object({
  date: z.string(),
  operational: z.number(),
  degraded: z.number(),
  down: z.number(),
  total: z.number(),
  uptimePercentage: z.number(),
  avgResponseTime: z.number(),
  expectedChecks: z.number(),
});
export type DayAggregate = z.infer<typeof dayAggregateSchema>;

export const statusDataSchema = z.object({
  current: statusCheckSchema,
  history: z.array(statusCheckSchema),
  uptime: z.number(),
});
export type StatusData = z.infer<typeof statusDataSchema>;

export const historicalDataSchema = z.object({
  days: z.number(),
  aggregated: z.array(dayAggregateSchema),
  totalChecks: z.number(),
});
export type HistoricalData = z.infer<typeof historicalDataSchema>;
