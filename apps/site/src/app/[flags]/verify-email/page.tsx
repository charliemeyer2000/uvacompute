"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const { data: session, isPending } = authClient.useSession();

  const [isVerifying, setIsVerifying] = useState(!!token);
  const [verificationStatus, setVerificationStatus] = useState<
    "success" | "error" | null
  >(null);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!isPending && session?.user.emailVerified) {
      toast.success("email verified successfully!");
      router.push("/dashboard");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    }
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    setIsVerifying(true);

    try {
      await authClient.verifyEmail({
        query: {
          token: verificationToken,
        },
      });

      setVerificationStatus("success");
      toast.success("email verified successfully!");

      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      setVerificationStatus("error");
      toast.error("verification failed", {
        description:
          error instanceof Error ? error.message : "invalid or expired token",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("no email address provided");
      return;
    }

    setIsResending(true);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: "/verify-email",
      });

      toast.success("verification email sent!", {
        description: "check your inbox for the verification link",
      });
    } catch (error) {
      toast.error("failed to send verification email", {
        description:
          error instanceof Error ? error.message : "please try again",
      });
    } finally {
      setIsResending(false);
    }
  };

  if (isVerifying) {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-normal mb-8 leading-tight">
            uvacompute
          </h1>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-2 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
              <div className="h-2 bg-gray-200 rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-base text-gray-600">verifying your email...</p>
          </div>
        </div>
      </main>
    );
  }

  if (verificationStatus === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-normal mb-8 leading-tight">
            uvacompute
          </h1>
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-black">
                email verified!
              </h2>
              <p className="text-sm text-gray-600">
                your email has been successfully verified.
              </p>
            </div>
            <p className="text-sm text-gray-600">redirecting to dashboard...</p>
          </div>
        </div>
      </main>
    );
  }

  if (verificationStatus === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center px-8 font-mono">
        <div className="max-w-md w-full">
          <h1 className="text-4xl font-normal mb-8 leading-tight">
            uvacompute
          </h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-black">
                verification failed
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                the verification link is invalid or has expired.
              </p>
            </div>

            {email && (
              <div className="space-y-4">
                <Button
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="w-full"
                >
                  {isResending ? "sending..." : "resend verification email"}
                </Button>
              </div>
            )}

            <div className="pt-4 text-sm">
              <Link href="/login" className="text-orange-accent underline">
                back to login
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push("/login");
      toast.success("signed out successfully");
    } catch (error) {
      toast.error("sign out failed", {
        description:
          error instanceof Error ? error.message : "an error occurred",
      });
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-md w-full">
        <h1 className="text-4xl font-normal mb-8 leading-tight">uvacompute</h1>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-2 text-black">
              check your email
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              we've sent a verification link to{" "}
              {email ? <strong>{email}</strong> : "your email address"}.
            </p>
            <p className="text-sm text-gray-600">
              click the link in the email to verify your account and start using
              uvacompute.
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4">
            <p className="text-xs text-gray-600">
              didn't receive the email? check your spam folder or request a new
              verification link below.
            </p>
          </div>

          {email && (
            <Button
              onClick={handleResendVerification}
              disabled={isResending}
              variant="outline"
              className="w-full"
            >
              {isResending ? "sending..." : "resend verification email"}
            </Button>
          )}

          <div className="pt-4 space-y-2">
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full"
            >
              sign out
            </Button>

            <p className="text-xs text-center text-gray-500">
              need to use a different email address? sign out and create a new
              account.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
