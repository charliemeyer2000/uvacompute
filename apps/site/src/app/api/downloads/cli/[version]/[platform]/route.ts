import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = process.env.GITHUB_REPO || "charliemeyer2000/uvacompute";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string; platform: string }> },
) {
  const { version, platform } = await params;

  const fileMap: Record<string, string> = {
    "uvacompute-linux": "uvacompute-linux",
    "uvacompute-macos": "uvacompute-macos",
    "uvacompute-windows.exe": "uvacompute-windows.exe",
    "uva.1": "uva.1",
  };

  const fileName = fileMap[platform];
  if (!fileName) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 404 });
  }

  const tag = version.startsWith("cli-v") ? version : `cli-v${version}`;

  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!releaseResponse.ok) {
      return NextResponse.json(
        { error: `Release ${tag} not found` },
        { status: 404 },
      );
    }

    const release = await releaseResponse.json();

    const asset = release.assets.find((a: any) => a.name === fileName);
    if (!asset) {
      return NextResponse.json(
        { error: `File not found for ${platform}` },
        { status: 404 },
      );
    }

    const fileResponse = await fetch(asset.url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/octet-stream",
      },
    });

    if (!fileResponse.ok) {
      throw new Error("Failed to download file");
    }

    const fileData = await fileResponse.arrayBuffer();

    const contentType =
      fileName === "uva.1" ? "text/plain" : "application/octet-stream";

    return new NextResponse(fileData, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": fileData.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 },
    );
  }
}
