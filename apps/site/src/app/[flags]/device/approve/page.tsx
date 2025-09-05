"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export default function DeviceApprovalPage() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("user_code");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const session = await authClient.getSession();
        if (session.data?.user) {
          setUser(session.data.user);
        }
      } catch (error) {
        console.error("Failed to get session:", error);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleApprove = async () => {
    if (!userCode) return;

    setIsProcessing(true);
    try {
      await authClient.device.approve({
        userCode: userCode,
      });
      setResult({ type: "success", message: "Device approved successfully!" });
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (error: any) {
      setResult({
        type: "error",
        message: "Failed to approve device. Please try again.",
      });
      console.error("Device approval error:", error);
    }
    setIsProcessing(false);
  };

  const handleDeny = async () => {
    if (!userCode) return;

    setIsProcessing(true);
    try {
      await authClient.device.deny({
        userCode: userCode,
      });
      setResult({ type: "success", message: "Device access denied." });
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (error: any) {
      setResult({
        type: "error",
        message: "Failed to deny device. Please try again.",
      });
      console.error("Device denial error:", error);
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    // Redirect to login if not authenticated
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-6">
            You must be logged in to approve or deny device authorization
            requests.
          </p>
          <Link
            href={`/login?redirect=/device/approve?user_code=${userCode}`}
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Log In
          </Link>
        </div>
      </main>
    );
  }

  if (!userCode) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Invalid Request</h1>
          <p className="text-gray-600 mb-6">
            No device code provided. Please start the authorization process
            again.
          </p>
          <Link
            href="/device"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Enter Device Code
          </Link>
        </div>
      </main>
    );
  }

  if (result) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
        <div className="text-center max-w-md">
          <div
            className={`mb-4 p-4 rounded-lg ${
              result.type === "success"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {result.message}
          </div>
          {result.type === "success" && (
            <p className="text-gray-600 text-sm">Redirecting...</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">
          Device Authorization Request
        </h1>
        <p className="text-gray-600 mb-8">
          A device is requesting access to your account
        </p>

        <div className="bg-gray-50 p-6 rounded-lg mb-8">
          <p className="text-sm text-gray-600 mb-2">Device Code:</p>
          <p className="text-2xl font-mono font-bold text-gray-900">
            {userCode}
          </p>
          <p className="text-sm text-gray-600 mt-4">
            Logged in as <span className="font-medium">{user.email}</span>
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isProcessing ? "Processing..." : "✓ Approve"}
          </button>

          <button
            onClick={handleDeny}
            disabled={isProcessing}
            className="w-full py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isProcessing ? "Processing..." : "✗ Deny"}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-6">
          Only approve if you recognize this request and trust the device
        </p>
      </div>
    </main>
  );
}
