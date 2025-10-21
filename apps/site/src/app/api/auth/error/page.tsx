import Link from "next/link";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  unable_to_create_user: {
    title: "unable to create user",
    description:
      "an account with this email already exists or there was an error creating your account",
  },
  email_not_verified: {
    title: "email not verified",
    description: "please verify your email before signing in",
  },
  invalid_credentials: {
    title: "invalid credentials",
    description: "the email or password you entered is incorrect",
  },
  session_expired: {
    title: "session expired",
    description: "your session has expired, please sign in again",
  },
  default: {
    title: "authentication error",
    description: "an error occurred during authentication",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error || "default";
  const errorInfo = ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.default;

  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono bg-white">
      <div className="w-full max-w-md">
        <div className="border border-black p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">{errorInfo.title}</h1>
            <p className="text-gray-800 mb-6">{errorInfo.description}</p>
            {errorCode && errorCode !== "default" && (
              <p className="text-sm text-gray-500 mb-6">
                error code: {errorCode}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href="/login">back to login</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">go to home</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
