"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { CheckCircle, User } from "lucide-react";

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const user = useQuery(api.auth.getCurrentUser, session?.user ? {} : "skip");

  // Get initials for avatar
  const getInitials = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (!user) {
    return (
      <div className="space-y-6">
        {/* Page Header Skeleton */}
        <div>
          <div className="h-8 w-32 bg-gray-100 animate-pulse mb-2" />
          <div className="h-4 w-56 bg-gray-100 animate-pulse" />
        </div>

        {/* Profile Card Skeleton */}
        <div className="bg-white border border-gray-200 p-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 bg-gray-100 animate-pulse" />
            <div className="flex-1">
              <div className="h-6 w-40 bg-gray-100 animate-pulse mb-2" />
              <div className="h-4 w-56 bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Info Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 p-5">
            <div className="h-4 w-24 bg-gray-100 animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-gray-100 animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 p-5">
            <div className="h-4 w-24 bg-gray-100 animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-gray-100 animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-black">profile</h1>
        <p className="text-sm text-gray-500 mt-1">your account information</p>
      </div>

      {/* Profile Header Card */}
      <div className="bg-white border border-gray-200 p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 bg-orange-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl font-semibold">
              {getInitials(user.name)}
            </span>
          </div>

          {/* Name and Email */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-black truncate">
              {user.name || "unnamed user"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500 truncate">
                {user.email}
              </span>
              {user.emailVerified && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="w-3.5 h-3.5" />
                  verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Section */}
        <div className="bg-white border border-gray-200 p-5">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-4">
            account
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">user id</span>
              <span className="text-black font-mono text-xs truncate max-w-[200px]">
                {user._id}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">email verified</span>
              <span
                className={
                  user.emailVerified ? "text-green-600" : "text-gray-400"
                }
              >
                {user.emailVerified ? "yes" : "no"}
              </span>
            </div>
          </div>
        </div>

        {/* Activity Section */}
        <div className="bg-white border border-gray-200 p-5">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-4">
            activity
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">account created</span>
              <span className="text-black">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">last updated</span>
              <span className="text-black">
                {new Date(user.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
