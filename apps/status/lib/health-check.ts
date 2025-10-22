import type { HealthCheckResult } from "@/types";

const TIMEOUT_MS = 10000;
const DEGRADED_THRESHOLD_MS = 2000;

export async function checkVMOrchestrationService(): Promise<HealthCheckResult> {
  const url = process.env.VM_ORCHESTRATION_URL;

  if (!url) {
    return {
      status: "down",
      responseTime: 0,
      timestamp: new Date(),
      error: "VM_ORCHESTRATION_URL not configured",
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "uvacompute-status-monitor/1.0",
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      if (responseTime > DEGRADED_THRESHOLD_MS) {
        return {
          status: "degraded",
          responseTime,
          timestamp: new Date(),
        };
      }
      return {
        status: "operational",
        responseTime,
        timestamp: new Date(),
      };
    }

    return {
      status: "down",
      responseTime,
      timestamp: new Date(),
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      status: "down",
      responseTime,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
