"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ServiceStatus = "operational" | "degraded" | "down";

interface StatusData {
  current: {
    status: ServiceStatus;
  };
}

const statusConfig = {
  operational: {
    dot: "bg-green-500",
    text: "all systems operational",
  },
  degraded: {
    dot: "bg-yellow-500",
    text: "partial outage",
  },
  down: {
    dot: "bg-red-600",
    text: "service unavailable",
  },
};

export function FooterStatus() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    async function fetchStatus() {
      try {
        const response = await fetch(
          "https://status.uvacompute.com/api/status",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch status");
        }

        const data: StatusData = await response.json();

        if (mounted) {
          setStatus(data.current.status);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch service status:", error);
        if (mounted) {
          setStatus("operational");
          setLoading(false);
        }
      }

      if (mounted) {
        timeoutId = setTimeout(fetchStatus, 30000);
      }
    }

    fetchStatus();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="w-2 h-2 bg-gray-300 rounded-full" />
        <span className="text-muted-foreground">checking status...</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const config = statusConfig[status];

  return (
    <Link
      href="https://status.uvacompute.com"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
    >
      <div className={`w-2 h-2 rounded-full ${config.dot}`} />
      <span>{config.text}</span>
    </Link>
  );
}
