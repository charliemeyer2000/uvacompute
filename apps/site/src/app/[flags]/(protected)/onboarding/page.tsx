import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OnboardingPage() {
  return (
    <main className="max-w-4xl mx-auto px-8 py-8 min-h-screen font-mono">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-4xl font-normal leading-tight hover:text-gray-700"
        >
          uvacompute
        </Link>
      </div>

      <div className="space-y-8">
        <h1 className="text-2xl font-semibold mb-2">onboarding</h1>

        <div className="border border-gray-200 p-6 space-y-8">
          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">1</span>
              <h2 className="text-lg font-semibold text-black">
                install the cli
              </h2>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              run this command in your terminal:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                curl -fsSL https://uvacompute.com/install.sh | sh
              </code>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">2</span>
              <h2 className="text-lg font-semibold text-black">
                authenticate your cli
              </h2>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              link your cli to your account:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva login</code>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">3</span>
              <h2 className="text-lg font-semibold text-black">
                setup ssh keys
              </h2>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              add your public key for secure access:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva ssh-key add ~/.ssh/id_rsa.pub
              </code>
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">4</span>
              <h2 className="text-lg font-semibold text-black">create a vm</h2>
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
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-semibold text-black">5</span>
              <h2 className="text-lg font-semibold text-black">
                connect to your vm
              </h2>
            </div>
            <p className="text-sm text-gray-600 ml-8 mb-3">
              ssh into your running vm:
            </p>
            <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm ssh my-vm</code>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Button asChild>
            <Link href="/dashboard">go to dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
