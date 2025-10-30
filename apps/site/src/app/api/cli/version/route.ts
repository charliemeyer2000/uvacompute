import { NextRequest, NextResponse } from "next/server";

const GITHUB_REPO = "charliemeyer2000/uvacompute";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(request: NextRequest) {
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

    const tagName = release.tag_name;
    const version = tagName.replace(/^cli-v/, "");

    return NextResponse.json(
      {
        version,
        tag_name: tagName,
        published_at: release.published_at,
        download_url: release.html_url,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching CLI version:", error);
    return NextResponse.json(
      { error: "Failed to fetch CLI version" },
      { status: 500 },
    );
  }
}
