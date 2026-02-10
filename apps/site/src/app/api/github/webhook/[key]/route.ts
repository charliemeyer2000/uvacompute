import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAuthHeaders } from "@/lib/orchestration-auth";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";

const VM_ORCHESTRATION_SERVICE_URL =
  process.env.VM_ORCHESTRATION_SERVICE_URL || "http://localhost:8080";

const RUNNER_VERSION = "2.331.0";

function verifyGitHubWebhook(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function parseResourcesFromLabels(labels: string[]): {
  cpus: number;
  ram: number;
  disk: number;
  gpus: number;
} {
  let cpus = 4,
    ram = 8,
    disk = 32,
    gpus = 0;

  for (const label of labels) {
    if (label === "uvacompute-gpu" || label === "gpu") {
      gpus = 1;
    } else if (label.startsWith("uvacompute-")) {
      const cpuMatch = label.match(/(\d+)cpu/);
      const ramMatch = label.match(/(\d+)gb/);
      const diskMatch = label.match(/(\d+)disk/);
      if (cpuMatch) cpus = parseInt(cpuMatch[1]);
      if (ramMatch) ram = parseInt(ramMatch[1]);
      if (diskMatch) disk = parseInt(diskMatch[1]);
    }
  }

  return { cpus, ram, disk, gpus };
}

function buildBootstrapScript(): string {
  return [
    "set -ex",
    "export DEBIAN_FRONTEND=noninteractive",
    "apt-get update -qq && apt-get install -y -qq curl tar libicu-dev >/dev/null 2>&1",
    "useradd -m runner",
    "mkdir -p /home/runner/actions-runner",
    "cd /home/runner/actions-runner",
    "ARCH=$(uname -m)",
    'case "$ARCH" in',
    "  x86_64|amd64) RUNNER_ARCH=x64 ;;",
    "  aarch64|arm64) RUNNER_ARCH=arm64 ;;",
    "esac",
    `RUNNER_VERSION=${RUNNER_VERSION}`,
    'curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"',
    "tar xzf runner.tar.gz && rm -f runner.tar.gz",
    "chown -R runner:runner /home/runner/actions-runner",
    // Write JIT config to file to avoid shell expansion issues with large base64 strings
    'echo "$JIT_CONFIG" > /home/runner/actions-runner/.jitconfig',
    "chown runner:runner /home/runner/actions-runner/.jitconfig",
    'su runner -c "cd /home/runner/actions-runner && ./run.sh --jitconfig $(cat .jitconfig)"',
  ].join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: keyPrefix } = await params;

  // Look up API key by prefix
  const apiKey = await fetchQuery(api.apiKeys.validateByPrefix, { keyPrefix });
  if (!apiKey) {
    console.error(`[github-webhook] Invalid API key prefix: ${keyPrefix}`);
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.text();

  // Verify webhook signature using per-key secret
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubWebhook(body, signature, apiKey.webhookSecret)) {
    console.error("[github-webhook] Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Record API key usage
  try {
    await fetchMutation(api.apiKeys.recordUsage, { keyId: apiKey._id });
  } catch {
    // Non-fatal
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ ok: true, msg: "pong" });
  }
  if (event !== "workflow_job") {
    return NextResponse.json({ ok: true, msg: "ignored event" });
  }

  const payload = JSON.parse(body);

  if (payload.action !== "queued") {
    return NextResponse.json({
      ok: true,
      msg: `ignored action: ${payload.action}`,
    });
  }

  const labels: string[] = payload.workflow_job?.labels || [];
  const hasUvaLabel = labels.some(
    (l) => l === "uvacompute" || l.startsWith("uvacompute-"),
  );

  if (!hasUvaLabel) {
    return NextResponse.json({ ok: true, msg: "not a uvacompute job" });
  }

  const repoFullName = payload.repository.full_name;
  const workflowJobId = payload.workflow_job.id;
  const resources = parseResourcesFromLabels(labels);

  console.log(
    `[github-webhook] Provisioning runner for ${repoFullName} job ${workflowJobId} (user: ${apiKey.userId})`,
    { labels, resources },
  );

  // Generate JIT runner config via GitHub API
  const githubToken = process.env.GITHUB_RUNNER_PAT;
  if (!githubToken) {
    console.error("GITHUB_RUNNER_PAT not configured");
    return NextResponse.json(
      { error: "Runner PAT not configured" },
      { status: 500 },
    );
  }

  const jitResponse = await fetch(
    `https://api.github.com/repos/${repoFullName}/actions/runners/generate-jitconfig`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        name: `uva-jit-${workflowJobId}`,
        runner_group_id: 1,
        labels: labels,
      }),
    },
  );

  if (!jitResponse.ok) {
    const errText = await jitResponse.text();
    console.error(
      `[github-webhook] JIT config failed: ${jitResponse.status}`,
      errText,
    );
    return NextResponse.json(
      { error: "Failed to generate JIT config", details: errText },
      { status: 500 },
    );
  }

  const jitData = await jitResponse.json();
  const jitConfig: string = jitData.encoded_jit_config;

  // Create UVA job with the runner
  const jobId = crypto.randomUUID();
  const jobName = `gh-runner-${workflowJobId}`;

  const jobRequest = {
    jobId,
    userId: apiKey.userId,
    image: "ubuntu:22.04",
    name: jobName,
    cpus: resources.cpus,
    ram: resources.ram,
    disk: resources.disk,
    gpus: resources.gpus,
    env: { JIT_CONFIG: jitConfig },
    command: ["/bin/bash", "-c", buildBootstrapScript()],
  };

  const requestBody = JSON.stringify(jobRequest);
  const authHeaders = createAuthHeaders("POST", "/jobs", requestBody);

  const orchResponse = await fetch(`${VM_ORCHESTRATION_SERVICE_URL}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: requestBody,
  });

  if (!orchResponse.ok) {
    const errText = await orchResponse.text();
    console.error(
      `[github-webhook] Job creation failed: ${orchResponse.status}`,
      errText,
    );
    return NextResponse.json(
      { error: "Failed to create runner job", details: errText },
      { status: 500 },
    );
  }

  const orchData = await orchResponse.json();

  // Save to Convex for dashboard visibility under the real user
  if (orchData.status === "success" && orchData.jobId) {
    try {
      await fetchMutation(api.jobs.create, {
        userId: apiKey.userId,
        jobId: orchData.jobId,
        name: jobName,
        image: "ubuntu:22.04",
        cpus: resources.cpus,
        ram: resources.ram,
        gpus: resources.gpus,
        disk: resources.disk,
      });
    } catch (e) {
      console.error("[github-webhook] Failed to save to Convex:", e);
    }
  }

  console.log(
    `[github-webhook] Runner provisioned: ${jobName} for ${repoFullName} (user: ${apiKey.userId})`,
    { jobId: orchData.jobId, resources },
  );

  return NextResponse.json({
    ok: true,
    jobId: orchData.jobId,
    runner: `uva-jit-${workflowJobId}`,
    resources,
  });
}
