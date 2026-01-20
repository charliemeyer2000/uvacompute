"use client";

import { authClient } from "@/lib/auth-client";

interface OnboardingContentProps {
  showOnlyVMs?: boolean;
  showOnlyJobs?: boolean;
}

export default function OnboardingContent({
  showOnlyVMs = false,
  showOnlyJobs = false,
}: OnboardingContentProps) {
  const { data: session } = authClient.useSession();
  const userEmail = session?.user?.email || "your_email@example.com";

  const showAll = !showOnlyVMs && !showOnlyJobs;
  const showVMs = showAll || showOnlyVMs;
  const showJobs = showAll || showOnlyJobs;

  let stepNumber = 0;

  return (
    <div className="border border-gray-200 p-6 space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl font-semibold text-black">
            {++stepNumber}
          </span>
          <h3 className="text-lg font-semibold text-black">install the cli</h3>
        </div>
        <p className="text-sm text-gray-600 ml-8 mb-3">
          run this command in your terminal:
        </p>
        <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
          <code className="text-sm text-black">
            curl -fsSL https://uvacompute.com/install.sh | bash
          </code>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl font-semibold text-black">
            {++stepNumber}
          </span>
          <h3 className="text-lg font-semibold text-black">
            authenticate your cli
          </h3>
        </div>
        <p className="text-sm text-gray-600 ml-8 mb-3">
          link your cli to your account:
        </p>
        <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
          <code className="text-sm text-black">uva login</code>
        </div>
      </div>

      {showVMs && (
        <>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">
                {++stepNumber}
              </span>
              <h3 className="text-lg font-semibold text-black">
                setup ssh keys
              </h3>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              add your public key for secure access:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva ssh-key add ~/.ssh/id_ed25519.pub
              </code>
            </div>
            <p className="text-xs text-gray-500 ml-8 mt-2">
              don&apos;t have an ssh key?{" "}
              <code className="bg-gray-100 px-1 py-0.5 border border-gray-200">
                ssh-keygen -t ed25519 -C &quot;{userEmail}&quot;
              </code>
            </p>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">
                {++stepNumber}
              </span>
              <h3 className="text-lg font-semibold text-black">create a vm</h3>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              provision your first virtual machine:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva vm create -h 1 -n my-vm
              </code>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">
                {++stepNumber}
              </span>
              <h3 className="text-lg font-semibold text-black">
                connect to your vm
              </h3>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              ssh into your running vm:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm ssh my-vm</code>
            </div>
          </div>
        </>
      )}

      {showJobs && (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">
              {++stepNumber}
            </span>
            <h3 className="text-lg font-semibold text-black">
              run a container job
            </h3>
          </div>
          <p className="text-sm text-gray-600 ml-8 mb-3">
            execute commands in any docker image:
          </p>
          <div className="ml-8 bg-gray-50 border border-gray-200 p-4 space-y-2">
            <code className="text-sm text-black block">
              uva run alpine echo &quot;hello world&quot;
            </code>
            <code className="text-sm text-gray-500 block">
              uva run python:3.11 python -c &quot;print(1+1)&quot;
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
