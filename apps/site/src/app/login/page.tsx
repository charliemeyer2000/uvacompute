"use client";
import { authClient } from "@/lib/auth";
import { useState } from "react";

export default function Page() {
  const [data, setData] = useState<any>(null);

  const signIn = async (provider: "github" | "google") => {
    const { data, error } = await authClient.signIn.social({
      provider: provider,
      newUserCallbackURL: "/onboarding",
      callbackURL: "/dashboard",
      errorCallbackURL: "/login/error",
    });

    if (error) {
      console.error(error);
    }

    setData(data);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      This is the login page
      <button onClick={() => signIn("github")}>Sign in with GitHub</button>
      <button onClick={() => signIn("google")}>Sign in with Google</button>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
