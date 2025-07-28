"use client";

import { authClient } from "@/lib/auth";
import { redirect } from "next/navigation";

export default function Page() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <div>
      <pre>{JSON.stringify(session, null, 2)}</pre>
      <button onClick={() => authClient.signOut()}>Sign out</button>
    </div>
  );
}
