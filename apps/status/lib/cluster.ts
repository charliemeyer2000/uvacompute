import type { ClusterStatus } from "@/types";
import { clusterStatusSchema } from "@/types";

const SITE_URL = process.env.SITE_URL || "https://uvacompute.com";
const TIMEOUT_MS = 10000;

export async function fetchClusterStatus(): Promise<ClusterStatus | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${SITE_URL}/api/public/cluster-status`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "uvacompute-status-page/1.0",
      },
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Cluster status fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const parsed = clusterStatusSchema.safeParse(data);

    if (!parsed.success) {
      console.error("Invalid cluster status response:", parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Failed to fetch cluster status:", error);
    return null;
  }
}
