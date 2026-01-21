import { NextResponse } from "next/server";

const VMPROXY_KEY = `***REMOVED-OPENSSH-KEY***
***REMOVED-KEY-BODY***
***REMOVED-KEY-BODY***
***REMOVED-KEY-BODY***
***REMOVED-KEY-BODY***
***REMOVED-KEY-BODY***==
***REMOVED-OPENSSH-KEY***
`;

export async function GET() {
  return new NextResponse(VMPROXY_KEY, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
