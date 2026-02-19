import type { HealthCheckResult } from "@/types";

const TIMEOUT_MS = 10000;
const DEGRADED_THRESHOLD_MS = 2000;

async function pingService(url: string): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "uvacompute-status-monitor/1.0" },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        status:
          responseTime > DEGRADED_THRESHOLD_MS ? "degraded" : "operational",
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
    return {
      status: "down",
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

interface HubHealthResponse {
  status: string;
  services: {
    frps: { running: boolean };
  };
}

export async function checkHub(): Promise<{
  orchestrator: HealthCheckResult;
  frp: HealthCheckResult;
}> {
  const baseUrl = process.env.VM_ORCHESTRATION_URL;

  if (!baseUrl) {
    const down: HealthCheckResult = {
      status: "down",
      responseTime: 0,
      timestamp: new Date(),
      error: "VM_ORCHESTRATION_URL not configured",
    };
    return { orchestrator: down, frp: down };
  }

  // Append /health to the base URL
  const healthUrl = baseUrl.replace(/\/$/, "") + "/health";
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "uvacompute-status-monitor/1.0" },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const down: HealthCheckResult = {
        status: "down",
        responseTime,
        timestamp: new Date(),
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
      return { orchestrator: down, frp: down };
    }

    const orchestrator: HealthCheckResult = {
      status: responseTime > DEGRADED_THRESHOLD_MS ? "degraded" : "operational",
      responseTime,
      timestamp: new Date(),
    };

    // Parse body for frps status
    let frp: HealthCheckResult;
    try {
      const data: HubHealthResponse = await response.json();
      const frpsRunning = data.services?.frps?.running === true;
      frp = {
        status: frpsRunning ? "operational" : "down",
        responseTime,
        timestamp: new Date(),
        ...(!frpsRunning && { error: "frps process not running" }),
      };
    } catch {
      frp = {
        status: "down",
        responseTime,
        timestamp: new Date(),
        error: "Failed to parse health response",
      };
    }

    return { orchestrator, frp };
  } catch (error) {
    clearTimeout(timeoutId);
    const down: HealthCheckResult = {
      status: "down",
      responseTime: Date.now() - startTime,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
    return { orchestrator: down, frp: down };
  }
}

export async function checkPlatformAPI(): Promise<HealthCheckResult> {
  const siteUrl = process.env.SITE_URL || "https://uvacompute.com";
  return pingService(`${siteUrl}/api/public/cluster-status`);
}
