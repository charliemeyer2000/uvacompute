import Redis from "ioredis";
import type { ServiceId, ServiceStatus, StatusCheck } from "@/types";

let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL environment variable is not set");
    }
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
    });
  }
  return redis;
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function recordStatusCheck(
  serviceId: ServiceId,
  status: ServiceStatus,
  responseTime: number,
  timestamp: number,
  error?: string,
): Promise<void> {
  const client = getRedisClient();
  const check: StatusCheck = {
    status,
    responseTime,
    timestamp,
    ...(error && { error }),
  };

  const key = `status:${serviceId}:check:${timestamp}`;
  const timelineKey = `status:${serviceId}:timeline`;
  await client.setex(key, THIRTY_DAYS_SECONDS, JSON.stringify(check));
  await client.zadd(timelineKey, timestamp, key);
  await client.zremrangebyscore(
    timelineKey,
    0,
    Date.now() - THIRTY_DAYS_SECONDS * 1000,
  );
}

export async function getRecentChecks(
  serviceId: ServiceId,
  hours: number = 24,
): Promise<StatusCheck[]> {
  const client = getRedisClient();
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const timelineKey = `status:${serviceId}:timeline`;
  const keys = await client.zrangebyscore(timelineKey, since, now);

  if (keys.length === 0) {
    return [];
  }

  const values = await client.mget(...keys);
  return values
    .filter((val): val is string => val !== null)
    .map((val) => JSON.parse(val));
}

export async function getCurrentStatus(
  serviceId: ServiceId,
): Promise<StatusCheck | null> {
  const client = getRedisClient();
  const timelineKey = `status:${serviceId}:timeline`;
  const keys = await client.zrevrange(timelineKey, 0, 0);

  if (keys.length === 0) {
    return null;
  }

  const value = await client.get(keys[0]);
  return value ? JSON.parse(value) : null;
}

export async function getHistoricalData(
  serviceId: ServiceId,
  days: number = 7,
): Promise<StatusCheck[]> {
  const maxDays = Math.min(days, 30);
  return getRecentChecks(serviceId, maxDays * 24);
}
