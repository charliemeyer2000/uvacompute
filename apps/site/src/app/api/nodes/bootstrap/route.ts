import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { z } from "zod";

const DO_VPS_HOST = "***REDACTED_IP***";
const DEFAULT_TUNNEL_USER = "root";
const DEFAULT_KUBECONFIG_PATH = "/etc/rancher/k3s/k3s.yaml";
const K3S_API_URL = `https://${DO_VPS_HOST}:6443`;

const BootstrapRequestSchema = z.object({
  token: z.string().min(1),
  sshPublicKey: z.string().min(1),
  nodeId: z.string().min(1),
  name: z.string().optional(),
  cpus: z.number().optional(),
  ram: z.number().optional(),
  gpus: z.number().optional(),
  gpuType: z.string().optional(),
  supportsVMs: z.boolean().optional(),
  supportsJobs: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = BootstrapRequestSchema.parse(body);

    // Validate the token
    const tokenValidation = await fetchQuery(api.nodeTokens.validateToken, {
      token: data.token,
    });

    if (!tokenValidation.valid) {
      return NextResponse.json(
        { error: tokenValidation.error || "Invalid token" },
        { status: 401 },
      );
    }

    // Consume the token
    const { assignedPort } = await fetchMutation(api.nodeTokens.consumeToken, {
      token: data.token,
      nodeId: data.nodeId,
    });

    // Register the node with owner from token creator
    await fetchMutation(api.nodes.register, {
      nodeId: data.nodeId,
      name: data.name,
      tunnelPort: assignedPort,
      tunnelHost: DO_VPS_HOST,
      tunnelUser: DEFAULT_TUNNEL_USER,
      kubeconfigPath: DEFAULT_KUBECONFIG_PATH,
      sshPublicKey: data.sshPublicKey,
      ownerId: tokenValidation.createdBy,
      cpus: data.cpus,
      ram: data.ram,
      gpus: data.gpus,
      gpuType: data.gpuType,
      supportsVMs: data.supportsVMs,
      supportsJobs: data.supportsJobs,
    });

    // Get k3s agent token from environment
    const k3sAgentToken = process.env.K3S_AGENT_TOKEN;
    if (!k3sAgentToken) {
      console.error("K3S_AGENT_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error: k3s token not configured" },
        { status: 500 },
      );
    }

    // Get vmproxy public key - this allows the hub to SSH to nodes for VM access
    const vmproxyPublicKey = process.env.VMPROXY_PUBLIC_KEY;
    if (!vmproxyPublicKey) {
      console.error("VMPROXY_PUBLIC_KEY environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error: vmproxy key not configured" },
        { status: 500 },
      );
    }

    // Get hub kubeconfig (base64 encoded) - nodes need this to talk to k8s API
    const hubKubeconfig = process.env.HUB_KUBECONFIG_B64;
    if (!hubKubeconfig) {
      console.error("HUB_KUBECONFIG_B64 environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error: kubeconfig not configured" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        tunnelHost: DO_VPS_HOST,
        tunnelPort: assignedPort,
        tunnelUser: DEFAULT_TUNNEL_USER,
        kubeconfigPath: DEFAULT_KUBECONFIG_PATH,
        k3sUrl: K3S_API_URL,
        k3sToken: k3sAgentToken,
        vmproxyPublicKey: vmproxyPublicKey,
        hubKubeconfig: hubKubeconfig,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Bootstrap error:", error);

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error.message || "Bootstrap failed" },
      { status: 500 },
    );
  }
}
