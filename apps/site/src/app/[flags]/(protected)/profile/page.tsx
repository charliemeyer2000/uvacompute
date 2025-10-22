"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const user = useQuery(api.auth.getCurrentUser, session?.user ? {} : "skip");

  if (!user) {
    return (
      <div className="border-t border-gray-200 pt-8 space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="border border-gray-200 p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-4">profile</h1>
        <p className="text-sm text-gray-600">your account information</p>
      </div>

      <div className="border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">user id</h2>
          <p className="text-sm font-mono">{user._id}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            full name
          </h2>
          <p className="text-sm">{user.name}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">email</h2>
          <p className="text-sm">{user.email}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            email verified
          </h2>
          <p className="text-sm">
            {user.emailVerified ? "✓ verified" : "✗ not verified"}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            account created
          </h2>
          <p className="text-sm">{new Date(user.createdAt).toLocaleString()}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">
            last updated
          </h2>
          <p className="text-sm">{new Date(user.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
