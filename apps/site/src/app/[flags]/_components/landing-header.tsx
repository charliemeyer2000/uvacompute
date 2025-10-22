"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function LandingHeader() {
  const { data: session, isPending } = authClient.useSession();
  const isSignedIn = !isPending && session?.user;

  return (
    <div className="flex justify-between items-center mb-8">
      <h1 className="text-4xl font-normal leading-tight">uvacompute</h1>
      {isSignedIn ? (
        <Link href="/dashboard" className="text-orange-accent underline">
          dashboard
        </Link>
      ) : (
        <Link href="/login" className="text-orange-accent underline">
          sign in
        </Link>
      )}
    </div>
  );
}
