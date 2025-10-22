"use client";

import { useEffect, useState } from "react";
import { StatusCheck } from "@/lib/redis";
import { format, formatDistanceToNow } from "date-fns";

interface Incident {
  start: Date;
  end: Date;
  duration: number;
  checks: StatusCheck[];
}

export function IncidentHistory() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIncidents() {
      try {
        const response = await fetch("/api/status/history?days=90");
        const result = await response.json();

        const allChecks: StatusCheck[] = [];
        for (const day of result.aggregated) {
          allChecks.push({
            status: day.uptimePercentage >= 99 ? "operational" : "down",
            responseTime: day.avgResponseTime,
            timestamp: new Date(day.date).getTime(),
          });
        }

        const foundIncidents: Incident[] = [];
        let currentIncident: StatusCheck[] | null = null;

        for (const check of allChecks) {
          if (check.status !== "operational") {
            if (!currentIncident) {
              currentIncident = [check];
            } else {
              currentIncident.push(check);
            }
          } else if (currentIncident) {
            const start = new Date(currentIncident[0].timestamp);
            const end = new Date(
              currentIncident[currentIncident.length - 1].timestamp,
            );
            foundIncidents.push({
              start,
              end,
              duration: end.getTime() - start.getTime(),
              checks: currentIncident,
            });
            currentIncident = null;
          }
        }

        if (currentIncident) {
          const start = new Date(currentIncident[0].timestamp);
          const end = new Date(
            currentIncident[currentIncident.length - 1].timestamp,
          );
          foundIncidents.push({
            start,
            end,
            duration: end.getTime() - start.getTime(),
            checks: currentIncident,
          });
        }

        setIncidents(foundIncidents.reverse());
      } catch (error) {
        console.error("Failed to fetch incidents:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchIncidents();
  }, []);

  if (loading) {
    return (
      <div className="border border-black p-6">
        <div className="text-lg font-medium mb-4">incident history</div>
        <div className="text-muted-foreground">loading...</div>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="border border-black p-6">
        <div className="text-lg font-medium mb-4">incident history</div>
        <div className="text-muted-foreground">
          no incidents in the last 90 days
        </div>
      </div>
    );
  }

  return (
    <div className="border border-black p-6">
      <div className="text-lg font-medium mb-4">incident history</div>
      <div className="space-y-4">
        {incidents.map((incident, idx) => (
          <div key={idx} className="border border-black p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="font-medium">
                {format(incident.start, "MMMM d, yyyy")}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDistanceToNow(incident.start, { addSuffix: true })}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              duration: ~{Math.round(incident.duration / (1000 * 60 * 60))}{" "}
              hours
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
