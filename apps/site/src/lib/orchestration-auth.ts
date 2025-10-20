import crypto from "crypto";

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
