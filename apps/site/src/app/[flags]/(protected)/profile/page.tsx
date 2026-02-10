"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  CheckCircle,
  Plus,
  Copy,
  Check,
  X,
  Key,
  Github,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const user = useQuery(api.auth.getCurrentUser, session?.user ? {} : "skip");
  const apiKeys = useQuery(
    api.apiKeys.listForUser,
    session?.user ? {} : "skip",
  );
  const revokeKey = useMutation(api.apiKeys.revokeForUser);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newGithubToken, setNewGithubToken] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    keyPrefix: string;
    webhookSecret: string;
    githubTokenStatus?: {
      valid: boolean;
      username: string;
      tokenType: string;
    };
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [editingTokenKeyId, setEditingTokenKeyId] = useState<string | null>(
    null,
  );
  const [editGithubToken, setEditGithubToken] = useState("");
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [tokenUpdateResult, setTokenUpdateResult] = useState<{
    keyId: string;
    username: string;
    tokenType: string;
  } | null>(null);

  const getInitials = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleCreateKey = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName || "Unnamed Key",
          ...(newGithubToken.trim()
            ? { githubToken: newGithubToken.trim() }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create API key");
      }
      const data = await res.json();
      setCreatedKey(data);
      setShowCreateForm(false);
      setNewKeyName("");
      setNewGithubToken("");
      toast.success("api key created");
    } catch (error) {
      toast.error("failed to create api key", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateToken = async (keyId: string) => {
    setIsUpdatingToken(true);
    try {
      const res = await fetch(`/api/api-keys/${keyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: editGithubToken.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update GitHub token");
      }
      const data = await res.json();
      setEditingTokenKeyId(null);
      setEditGithubToken("");
      setTokenUpdateResult({
        keyId,
        username: data.githubTokenStatus.username,
        tokenType: data.githubTokenStatus.tokenType,
      });
      setTimeout(() => setTokenUpdateResult(null), 5000);
      toast.success("github token updated");
    } catch (error) {
      toast.error("failed to update github token", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      setIsUpdatingToken(false);
    }
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await revokeKey({ keyId: keyId as Id<"apiKeys"> });
      setConfirmingRevoke(null);
      toast.success("api key revoked");
    } catch (error) {
      toast.error("failed to revoke api key", {
        description: error instanceof Error ? error.message : "unknown error",
      });
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-32 bg-gray-100 animate-pulse mb-2" />
          <div className="h-4 w-56 bg-gray-100 animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-gray-100 animate-pulse" />
            <div className="flex-1">
              <div className="h-6 w-40 bg-gray-100 animate-pulse mb-2" />
              <div className="h-4 w-56 bg-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 p-4 sm:p-5">
            <div className="h-4 w-24 bg-gray-100 animate-pulse mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-gray-100 animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 p-4 sm:p-5">
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
      <div className="bg-white border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-orange-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl font-semibold">
              {getInitials(user.name)}
            </span>
          </div>
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
        <div className="bg-white border border-gray-200 p-4 sm:p-5">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide mb-4">
            account
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">user id</span>
              <span className="text-black font-mono text-xs truncate max-w-[140px] sm:max-w-[200px]">
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

        <div className="bg-white border border-gray-200 p-4 sm:p-5">
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

      {/* API Keys Section */}
      <div className="bg-white border border-gray-200 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs text-gray-400 uppercase tracking-wide">
            api keys
          </h3>
          {!showCreateForm && !createdKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              create key
            </Button>
          )}
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="border border-gray-200 p-4 mb-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="key name (e.g. github runners)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) handleCreateKey();
                    if (e.key === "Escape") {
                      setShowCreateForm(false);
                      setNewKeyName("");
                      setNewGithubToken("");
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewKeyName("");
                    setNewGithubToken("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  github token{" "}
                  <span className="text-gray-400">
                    (optional — required for github actions runners)
                  </span>
                </label>
                <Input
                  type="password"
                  placeholder="ghp_... or github_pat_..."
                  value={newGithubToken}
                  onChange={(e) => setNewGithubToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateKey();
                    if (e.key === "Escape") {
                      setShowCreateForm(false);
                      setNewKeyName("");
                      setNewGithubToken("");
                    }
                  }}
                />
              </div>
              <Button onClick={handleCreateKey} disabled={isCreating} size="sm">
                {isCreating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    creating...
                  </>
                ) : (
                  "create"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Newly Created Key Display */}
        {createdKey && (
          <div className="border border-orange-accent bg-orange-50 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-accent">
                save these values — shown once only
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCreatedKey(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 block mb-1">
                  api key
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 flex-1 break-all">
                    {createdKey.key}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleCopy(createdKey.key, "key")}
                  >
                    {copiedField === "key" ? (
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 block mb-1">
                  webhook secret
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 flex-1 break-all">
                    {createdKey.webhookSecret}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      handleCopy(createdKey.webhookSecret, "secret")
                    }
                  >
                    {copiedField === "secret" ? (
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 block mb-1">
                  github webhook url
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 flex-1 break-all">
                    https://uvacompute.com/api/github/webhook/
                    {createdKey.keyPrefix}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      handleCopy(
                        `https://uvacompute.com/api/github/webhook/${createdKey.keyPrefix}`,
                        "url",
                      )
                    }
                  >
                    {copiedField === "url" ? (
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              {createdKey.githubTokenStatus && (
                <div className="flex items-center gap-2 pt-1">
                  <Github className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs text-green-600">
                    token verified — {createdKey.githubTokenStatus.username} (
                    {createdKey.githubTokenStatus.tokenType})
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key List */}
        {apiKeys === undefined ? (
          <div className="space-y-3">
            <div className="h-10 bg-gray-100 animate-pulse" />
            <div className="h-10 bg-gray-100 animate-pulse" />
          </div>
        ) : apiKeys.length === 0 && !createdKey ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            <Key className="w-5 h-5 mx-auto mb-2 text-gray-300" />
            no api keys. create one to use github actions runners.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {apiKeys.map((key) => (
              <div key={key._id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-black font-medium truncate">
                        {key.name}
                      </span>
                      <span className="text-xs font-mono text-gray-400">
                        {key.keyPrefix}****
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">
                        created{" "}
                        {new Date(key.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {key.lastUsedAt && (
                        <span className="text-xs text-gray-400">
                          last used{" "}
                          {new Date(key.lastUsedAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                      )}
                      {key.hasGithubToken ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <Github className="w-3 h-3" />
                          token set
                        </span>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-accent transition-colors"
                          onClick={() => {
                            setEditingTokenKeyId(key._id);
                            setEditGithubToken("");
                          }}
                        >
                          <Github className="w-3 h-3" />
                          add github token
                        </button>
                      )}
                      {tokenUpdateResult?.keyId === key._id && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <Check className="w-3 h-3" />
                          verified — {tokenUpdateResult.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {key.hasGithubToken && editingTokenKeyId !== key._id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-black"
                        onClick={() => {
                          setEditingTokenKeyId(key._id);
                          setEditGithubToken("");
                        }}
                      >
                        update token
                      </Button>
                    )}
                    {confirmingRevoke === key._id ? (
                      <>
                        <span className="text-xs text-red-600 mr-1">
                          revoke?
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRevoke(key._id)}
                        >
                          yes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingRevoke(null)}
                        >
                          no
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-600"
                        onClick={() => setConfirmingRevoke(key._id)}
                      >
                        revoke
                      </Button>
                    )}
                  </div>
                </div>
                {editingTokenKeyId === key._id && (
                  <div className="mt-2 flex gap-2 items-center">
                    <Input
                      type="password"
                      placeholder="ghp_... or github_pat_..."
                      value={editGithubToken}
                      onChange={(e) => setEditGithubToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editGithubToken.trim())
                          handleUpdateToken(key._id);
                        if (e.key === "Escape") {
                          setEditingTokenKeyId(null);
                          setEditGithubToken("");
                        }
                      }}
                      autoFocus
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      disabled={!editGithubToken.trim() || isUpdatingToken}
                      onClick={() => handleUpdateToken(key._id)}
                    >
                      {isUpdatingToken ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "save"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditingTokenKeyId(null);
                        setEditGithubToken("");
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
