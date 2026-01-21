import { NextResponse } from "next/server";

const VMPROXY_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDSdQzkZqeBPt2jYI6bvYVAIG6SgK5nE7bzJU2sfFruhwAAAJjUr3PK1K9z
ygAAAAtzc2gtZWQyNTUxOQAAACDSdQzkZqeBPt2jYI6bvYVAIG6SgK5nE7bzJU2sfFruhw
AAAEDEOzqp5yLhgf1tNZUNbm2pNMB1C4o++9o/BQNp0RtWP9J1DORmp4E+3aNgjpu9hUAg
bpKArmcTtvMlTax8Wu6HAAAADnZtcHJveHktYWNjZXNzAQIDBAUGBw==
-----END OPENSSH PRIVATE KEY-----
`;

export async function GET() {
  return new NextResponse(VMPROXY_KEY, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
