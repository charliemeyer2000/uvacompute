import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { z } from "zod";

const DO_VPS_HOST = "24.199.85.26";
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

    // Register the node
    await fetchMutation(api.nodes.register, {
      nodeId: data.nodeId,
      name: data.name,
      tunnelPort: assignedPort,
      tunnelHost: DO_VPS_HOST,
      tunnelUser: DEFAULT_TUNNEL_USER,
      kubeconfigPath: DEFAULT_KUBECONFIG_PATH,
      sshPublicKey: data.sshPublicKey,
      cpus: data.cpus,
      ram: data.ram,
      gpus: data.gpus,
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

    return NextResponse.json(
      {
        success: true,
        tunnelHost: DO_VPS_HOST,
        tunnelPort: assignedPort,
        tunnelUser: DEFAULT_TUNNEL_USER,
        kubeconfigPath: DEFAULT_KUBECONFIG_PATH,
        k3sUrl: K3S_API_URL,
        k3sToken: k3sAgentToken,
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
