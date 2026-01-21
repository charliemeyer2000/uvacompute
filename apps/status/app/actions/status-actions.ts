"use server";

import {
  getCurrentStatus,
  getRecentChecks,
  getHistoricalData,
} from "@/lib/redis";
import { fetchClusterStatus } from "@/lib/cluster";
import type {
  StatusData,
  DayAggregate,
  HistoricalData,
  StatusCheck,
  ClusterStatus,
} from "@/types";

export async function getStatus(): Promise<StatusData> {
  const current = await getCurrentStatus();
  const history = await getRecentChecks(24);

  if (!current) {
    return {
      current: {
        status: "down",
        responseTime: 0,
        timestamp: Date.now(),
        error: "No data available",
      },
      history: [],
      uptime: 0,
    };
  }

  const operationalChecks = history.filter(
    (check) => check.status === "operational",
  ).length;
  const uptime =
    history.length > 0 ? (operationalChecks / history.length) * 100 : 0;

  return {
    current,
    history,
    uptime: Math.round(uptime * 100) / 100,
  };
}

export async function getStatusHistory(
  days: number = 7,
): Promise<HistoricalData> {
  const maxDays = Math.min(Math.max(days, 1), 30);
  const checks = await getHistoricalData(maxDays);

  const dayMap = new Map<string, StatusCheck[]>();

  for (const check of checks) {
    const date = new Date(check.timestamp);
    const dateKey = date.toISOString().split("T")[0];

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(check);
  }

  const aggregated: DayAggregate[] = [];
  const CHECKS_PER_MINUTE = 1;
  const MINUTES_PER_DAY = 24 * 60;
  const EXPECTED_CHECKS_PER_DAY = CHECKS_PER_MINUTE * MINUTES_PER_DAY;

  for (const [date, dayChecks] of dayMap.entries()) {
    const operational = dayChecks.filter(
      (c) => c.status === "operational",
    ).length;
    const degraded = dayChecks.filter((c) => c.status === "degraded").length;
    const down = dayChecks.filter((c) => c.status === "down").length;
    const total = dayChecks.length;

    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    const now = new Date();
    const isToday = date === now.toISOString().split("T")[0];

    let expectedChecks = EXPECTED_CHECKS_PER_DAY;
    if (isToday) {
      const minutesElapsed = Math.floor(
        (now.getTime() - dayStart.getTime()) / (1000 * 60),
      );
      expectedChecks = Math.min(minutesElapsed, EXPECTED_CHECKS_PER_DAY);
    } else if (now > dayEnd) {
      expectedChecks = EXPECTED_CHECKS_PER_DAY;
    }

    const uptimePercentage =
      expectedChecks > 0 ? (operational / expectedChecks) * 100 : 0;
    const avgResponseTime =
      total > 0
        ? dayChecks.reduce((sum, c) => sum + c.responseTime, 0) / total
        : 0;

    aggregated.push({
      date,
      operational,
      degraded,
      down,
      total,
      uptimePercentage: Math.round(uptimePercentage * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      expectedChecks,
    });
  }

  return {
    days: maxDays,
    aggregated: aggregated.sort((a, b) => a.date.localeCompare(b.date)),
    totalChecks: checks.length,
  };
}

export async function getClusterStatus(): Promise<ClusterStatus | null> {
  return await fetchClusterStatus();
}
