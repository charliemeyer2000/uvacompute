"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function DeviceAuthorizationPage() {
  const [userCode, setUserCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill code if provided in URL
  const prefilledCode = searchParams.get("user_code");
  if (prefilledCode && !userCode) {
    setUserCode(prefilledCode);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Format the code: remove dashes and convert to uppercase
      const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();

      // Check if the code is valid using GET /device endpoint
      const response = await fetch(
        `/api/auth/device?user_code=${formattedCode}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data) {
          // Redirect to approval page
          router.push(`/device/approve?user_code=${formattedCode}`);
        } else {
          throw new Error("Invalid code");
        }
      } else {
        throw new Error("Invalid code");
      }
    } catch (err: any) {
      setError("Invalid or expired code");
      console.error("Device verification error:", err);
    }
    setIsLoading(false);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-white p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">
          Device Authorization
        </h1>
        <p className="text-gray-600 text-center mb-8">
          Enter the code displayed on your device
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="userCode"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Device Code
            </label>
            <input
              id="userCode"
              type="text"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              placeholder="Enter device code (e.g., ABCD1234)"
              maxLength={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-lg font-mono uppercase"
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !userCode.trim()}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isLoading ? "Verifying..." : "Continue"}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          This code was provided by your device or application
        </p>
      </div>
    </main>
  );
}
