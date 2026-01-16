import Redis from "ioredis";
import type { ServiceStatus, StatusCheck } from "@/types";

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

  const key = `status:check:${timestamp}`;
  await client.setex(key, THIRTY_DAYS_SECONDS, JSON.stringify(check));
  await client.zadd("status:checks:timeline", timestamp, key);
  await client.zremrangebyscore(
    "status:checks:timeline",
    0,
    Date.now() - THIRTY_DAYS_SECONDS * 1000,
  );
}

export async function getRecentChecks(
  hours: number = 24,
): Promise<StatusCheck[]> {
  const client = getRedisClient();
  const now = Date.now();
  const since = now - hours * 60 * 60 * 1000;

  const keys = await client.zrangebyscore("status:checks:timeline", since, now);

  if (keys.length === 0) {
    return [];
  }

  const values = await client.mget(...keys);
  return values
    .filter((val): val is string => val !== null)
    .map((val) => JSON.parse(val));
}

export async function getCurrentStatus(): Promise<StatusCheck | null> {
  const client = getRedisClient();
  const keys = await client.zrevrange("status:checks:timeline", 0, 0);

  if (keys.length === 0) {
    return null;
  }

  const value = await client.get(keys[0]);
  return value ? JSON.parse(value) : null;
}

export async function getHistoricalData(
  days: number = 7,
): Promise<StatusCheck[]> {
  const maxDays = Math.min(days, 30);
  return getRecentChecks(maxDays * 24);
}
