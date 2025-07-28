"use client";

import { authClient } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default function Page() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading...</div>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  // Assuming session.user has { name, id, image }
  const user = session?.user;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-lg shadow-md p-8 flex flex-col items-center gap-4">
        {user?.image && (
          <Image
            src={user.image}
            alt={user.name ? `${user.name}'s profile` : "Profile picture"}
            className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
            width={96}
            height={96}
          />
        )}
        <div className="text-xl font-semibold">{user?.name || "No Name"}</div>
        <div className="text-gray-500 text-sm">ID: {user?.id || "N/A"}</div>
        <button
          onClick={() => authClient.signOut()}
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
