import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/lib/auth-client";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import crypto from "crypto";

function parseSSHPublicKey(publicKeyContent: string): {
  fingerprint: string;
  keyType: string;
} {
  const trimmed = publicKeyContent.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error("Invalid SSH public key format");
  }

  const keyType = parts[0];
  const keyData = parts[1];

  if (
    ![
      "ssh-rsa",
      "ssh-ed25519",
      "ecdsa-sha2-nistp256",
      "ecdsa-sha2-nistp384",
      "ecdsa-sha2-nistp521",
    ].includes(keyType)
  ) {
    throw new Error(`Unsupported key type: ${keyType}`);
  }

  const keyBuffer = Buffer.from(keyData, "base64");
  const hash = crypto.createHash("sha256").update(keyBuffer).digest("base64");
  const fingerprint = `SHA256:${hash.replace(/=+$/, "")}`;

  return { fingerprint, keyType };
}

export async function GET(request: NextRequest) {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const keys = await fetchQuery(api.sshKeys.list, {
      userId: session.user.id,
    });

    return NextResponse.json({ keys }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching SSH keys:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch SSH keys" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session) {
    return NextResponse.json(
      { error: error?.message || "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { publicKey, name } = body;

    if (!publicKey || typeof publicKey !== "string") {
      return NextResponse.json(
        { error: "Public key is required" },
        { status: 400 },
      );
    }

    const keyName = name || "Unnamed Key";

    const { fingerprint, keyType } = parseSSHPublicKey(publicKey);

    const keyId = await fetchMutation(api.sshKeys.add, {
      userId: session.user.id,
      name: keyName,
      publicKey: publicKey.trim(),
      fingerprint,
    });

    return NextResponse.json(
      {
        success: true,
        keyId,
        fingerprint,
        keyType,
        name: keyName,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error adding SSH key:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add SSH key" },
      { status: 400 },
    );
  }
}
