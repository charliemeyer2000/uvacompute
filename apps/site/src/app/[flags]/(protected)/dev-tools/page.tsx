"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function DevToolsPage() {
  const { data: session } = authClient.useSession();
  const sessionToken = session?.session?.token;
  const hasDevAccess = useQuery(
    api.devAccess.hasDevAccess,
    sessionToken ? { token: sessionToken } : "skip",
  );
  const seedVMs = useMutation(api.seed.seedVMs);
  const clearAllVMs = useMutation(api.seed.clearAllVMs);
  const clearInactiveVMs = useMutation(api.seed.clearInactiveVMs);
  const earlyAccessRequests = useQuery(
    api.earlyAccess.listEarlyAccessRequests,
    sessionToken ? { token: sessionToken } : "skip",
  );
  const pendingTokens = useQuery(
    api.earlyAccess.listPendingTokens,
    sessionToken ? { token: sessionToken } : "skip",
  );
  const grantAccess = useMutation(api.earlyAccess.grantAccess);
  const revokeAccess = useMutation(api.earlyAccess.revokeAccess);
  const approveTokenByEmail = useMutation(
    api.earlyAccessTokens.approveTokenByEmail,
  );
  const denyTokenByEmail = useMutation(api.earlyAccessTokens.denyTokenByEmail);

  const [activeCount, setActiveCount] = useState(10);
  const [inactiveCount, setInactiveCount] = useState(20);
  const [loading, setLoading] = useState(false);

  const handleSeed = async () => {
    if (!session?.user?.id) return;

    setLoading(true);

    try {
      const result = await seedVMs({
        userId: session.user.id,
        activeCount,
        inactiveCount,
      });

      toast.success("database seeded", {
        description: `created ${result.created} VMs (${result.active} active, ${result.inactive} inactive)`,
      });
    } catch (error) {
      toast.error("seeding failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!session?.user?.id) return;

    setLoading(true);

    try {
      const result = await clearAllVMs({
        userId: session.user.id,
      });

      toast.success("all vms cleared", {
        description: `deleted ${result.deleted} VMs`,
      });
    } catch (error) {
      toast.error("clearing failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearInactive = async () => {
    if (!session?.user?.id) return;

    setLoading(true);

    try {
      const result = await clearInactiveVMs({
        userId: session.user.id,
      });

      toast.success("inactive vms cleared", {
        description: `deleted ${result.deleted} inactive VMs`,
      });
    } catch (error) {
      toast.error("clearing failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGrantAccess = async (userId: string, email: string) => {
    if (!sessionToken) return;
    try {
      await grantAccess({ userId, token: sessionToken });
      toast.success("access granted", {
        description: `${email} now has early access`,
      });
    } catch (error) {
      toast.error("failed to grant access", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  const handleRevokeAccess = async (userId: string, email: string) => {
    if (!sessionToken) return;
    try {
      await revokeAccess({ userId, token: sessionToken });
      toast.success("access revoked", {
        description: `${email} no longer has early access`,
      });
    } catch (error) {
      toast.error("failed to revoke access", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  const handleApproveToken = async (email: string) => {
    try {
      await approveTokenByEmail({ email });
      toast.success("token approved", {
        description: `${email} will get access when they sign up`,
      });
    } catch (error) {
      toast.error("failed to approve token", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  const handleDenyToken = async (email: string) => {
    try {
      await denyTokenByEmail({ email });
      toast.success("token denied", {
        description: `${email} request has been denied`,
      });
    } catch (error) {
      toast.error("failed to deny token", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  if (!session?.user?.id) {
    return (
      <div className="border border-gray-200 p-8 text-center">
        <p className="text-gray-500">please log in to use dev tools</p>
      </div>
    );
  }

  if (hasDevAccess === undefined) {
    return (
      <div className="border border-gray-200 p-8 text-center">
        <p className="text-gray-500">checking access...</p>
      </div>
    );
  }

  if (hasDevAccess === false) {
    return (
      <div className="border border-red-200 bg-red-50 p-8 text-center">
        <h1 className="text-xl font-semibold text-red-900 mb-2">
          access denied
        </h1>
        <p className="text-sm text-red-700">
          you don't have permission to access dev tools, sucka.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-black mb-2">dev tools</h1>
        <p className="text-sm text-gray-500">
          seed your database with mock data to test UI components
        </p>
      </div>

      <div className="border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-black mb-4">seed data</h2>

          <div className="space-y-4 mb-4">
            <div>
              <label
                htmlFor="activeCount"
                className="block text-sm font-medium mb-1"
              >
                active vms count
              </label>
              <Input
                id="activeCount"
                type="number"
                min="0"
                max="100"
                value={activeCount}
                onChange={(e) => setActiveCount(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-gray-500 mt-1">
                for testing pagination (shows 6 per page)
              </p>
            </div>

            <div>
              <label
                htmlFor="inactiveCount"
                className="block text-sm font-medium mb-1"
              >
                inactive vms count
              </label>
              <Input
                id="inactiveCount"
                type="number"
                min="0"
                max="1000"
                value={inactiveCount}
                onChange={(e) =>
                  setInactiveCount(parseInt(e.target.value) || 0)
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                for testing pagination (shows 6 per page)
              </p>
            </div>
          </div>

          <Button onClick={handleSeed} disabled={loading} className="w-full">
            {loading ? "seeding..." : "seed database"}
          </Button>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-black mb-4">clear data</h2>

          <div className="space-y-2">
            <Button
              onClick={handleClearInactive}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              clear inactive vms only
            </Button>

            <Button
              onClick={handleClearAll}
              disabled={loading}
              variant="outline"
              className="w-full border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-700"
            >
              clear all vms
            </Button>
          </div>
        </div>
      </div>

      <div className="border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="text-sm font-semibold text-yellow-900 mb-2">
          usage tips
        </h3>
        <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
          <li>active vms pagination appears when you have more than 6 vms</li>
          <li>vm history pagination appears when you have more than 6 vms</li>
          <li>
            try 10 active and 20 inactive to see pagination in both sections
          </li>
          <li>mock data includes various vm configurations and statuses</li>
        </ul>
      </div>

      <div className="border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-black mb-2">
            early access management
          </h2>
          <p className="text-sm text-gray-500">
            manage user access to the platform
          </p>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-base font-semibold text-black mb-2">
            pending requests (not signed up)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            users who requested access but haven't created an account yet
          </p>

          {pendingTokens === undefined ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">loading...</p>
            </div>
          ) : pendingTokens.length === 0 ? (
            <div className="text-center py-8 border border-gray-200">
              <p className="text-sm text-gray-500">no pending requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTokens.map((token) => (
                <div
                  key={token._id}
                  className="border border-gray-200 p-4 flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{token.email}</p>
                      {token.approved ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 border border-green-200">
                          pre-approved
                        </span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 border border-yellow-200">
                          awaiting decision
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{token.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      requested {new Date(token.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {token.approved ? (
                      <Button
                        onClick={() => handleDenyToken(token.email)}
                        variant="outline"
                        className="border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-700"
                        size="sm"
                      >
                        deny
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => handleApproveToken(token.email)}
                          variant="outline"
                          size="sm"
                        >
                          approve
                        </Button>
                        <Button
                          onClick={() => handleDenyToken(token.email)}
                          variant="outline"
                          className="border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-700"
                          size="sm"
                        >
                          deny
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-base font-semibold text-black mb-2">
            registered users
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            users who have created accounts
          </p>

          {earlyAccessRequests === undefined ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">loading...</p>
            </div>
          ) : earlyAccessRequests.length === 0 ? (
            <div className="text-center py-8 border border-gray-200">
              <p className="text-sm text-gray-500">no users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {earlyAccessRequests.map(
                (user: {
                  _id: string;
                  name: string;
                  email: string;
                  hasEarlyAccess: boolean;
                  emailVerified: boolean;
                  createdAt: number;
                  hasApprovedToken: boolean;
                }) => (
                  <div
                    key={user._id}
                    className="border border-gray-200 p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{user.name}</p>
                        {user.hasEarlyAccess && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 border border-green-200">
                            approved
                          </span>
                        )}
                        {!user.hasEarlyAccess && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 border border-yellow-200">
                            pending
                          </span>
                        )}
                        {!user.emailVerified && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 border border-gray-200">
                            unverified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">
                        signed up{" "}
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {user.hasEarlyAccess ? (
                        <Button
                          onClick={() =>
                            handleRevokeAccess(user._id, user.email)
                          }
                          variant="outline"
                          className="border-red-600 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-700"
                          size="sm"
                        >
                          revoke
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            handleGrantAccess(user._id, user.email)
                          }
                          variant="outline"
                          size="sm"
                        >
                          approve
                        </Button>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
