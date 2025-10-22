import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "charliemeyer2000/uvacompute";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

  const binaryMap: Record<string, string> = {
    "uvacompute-linux": "uvacompute-linux",
    "uvacompute-macos": "uvacompute-macos",
    "uvacompute-windows.exe": "uvacompute-windows.exe",
  };

  const binaryName = binaryMap[platform];
  if (!binaryName) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 404 });
  }

  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!releaseResponse.ok) {
      throw new Error("Failed to fetch release info");
    }

    const release = await releaseResponse.json();

    const asset = release.assets.find((a: any) => a.name === binaryName);
    if (!asset) {
      return NextResponse.json(
        { error: `Binary not found for ${platform}` },
        { status: 404 },
      );
    }

    const binaryResponse = await fetch(asset.url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/octet-stream",
      },
    });

    if (!binaryResponse.ok) {
      throw new Error("Failed to download binary");
    }

    const binaryData = await binaryResponse.arrayBuffer();

    return new NextResponse(binaryData, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${binaryName}"`,
        "Content-Length": binaryData.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error serving binary:", error);
    return NextResponse.json(
      { error: "Failed to serve binary" },
      { status: 500 },
    );
  }
}
