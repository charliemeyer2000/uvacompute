import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = process.env.GITHUB_REPO || "charliemeyer2000/uvacompute";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;

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

  try {
    // List releases and find the latest CLI release (tagged cli-v*)
    const releasesResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!releasesResponse.ok) {
      throw new Error("Failed to fetch releases");
    }

    const releases = await releasesResponse.json();
    const release = releases.find((r: any) => r.tag_name.startsWith("cli-v"));

    if (!release) {
      return NextResponse.json(
        { error: "No CLI release found" },
        { status: 404 },
      );
    }

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
