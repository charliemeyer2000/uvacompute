import { z } from "zod";

export const serviceStatusSchema = z.enum(["operational", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

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
