import crypto from "crypto";
import { NextRequest } from "next/server";

export function signRequest(
  method: string,
  path: string,
  body: string,
  secret: string,
): { timestamp: string; signature: string } {
  const timestamp = Date.now().toString();
  const payload = `${method}:${path}:${timestamp}:${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return { timestamp, signature };
}

export function createAuthHeaders(
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const secret = process.env.ORCHESTRATION_SHARED_SECRET;
  if (!secret) {
    return {};
  }

  const { timestamp, signature } = signRequest(method, path, body, secret);

  return {
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}

export function verifyRequest(request: NextRequest, body: string): boolean {
  const secret = process.env.ORCHESTRATION_SHARED_SECRET!;

  const signature = request.headers.get("X-Signature");
  const timestamp = request.headers.get("X-Timestamp");

  if (!signature || !timestamp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const requestTimestamp = parseInt(timestamp);

  // 5 minute window
  if (Math.abs(now - requestTimestamp) > 5 * 60) {
    return false;
  }

  const payload = `${timestamp}:${body}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return signature === expectedSignature;
}
