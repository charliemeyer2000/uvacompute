"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../convex/_generated/api";
import { redirect } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = useQuery(api.auth.getCurrentUser);

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

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Welcome back{user?.name ? `, ${user.name}` : ""}!
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Sign out
              </button>
            </div>

            <div className="mt-8">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  User Information
                </h2>
                <div className="space-y-3">
                  {user?.name && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">
                        Name:
                      </span>
                      <span className="ml-2 text-sm text-gray-900">
                        {user.name}
                      </span>
                    </div>
                  )}
                  {user?.email && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">
                        Email:
                      </span>
                      <span className="ml-2 text-sm text-gray-900">
                        {user.email}
                      </span>
                    </div>
                  )}
                  {user?._id && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">
                        User ID:
                      </span>
                      <span className="ml-2 text-sm text-gray-900 font-mono">
                        {user._id}
                      </span>
                    </div>
                  )}
                  {user?.image && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">
                        Avatar:
                      </span>
                      <img
                        src={user.image}
                        alt="User avatar"
                        className="ml-2 h-8 w-8 rounded-full inline-block"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Debug info */}
            <div className="mt-8">
              <details className="bg-gray-50 p-4 rounded-lg">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  Debug Information
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">
                      Better Auth Session:
                    </h4>
                    <pre className="mt-1 text-xs text-gray-600 bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(session, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-700">
                      Convex User Data:
                    </h4>
                    <pre className="mt-1 text-xs text-gray-600 bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(user, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
