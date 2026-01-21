import { Metadata } from "next";

export const metadata: Metadata = {
  title: "getting started | uvacompute docs",
  description: "learn how to get started with uvacompute",
};

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">getting started</h2>
        <p className="text-gray-600 mb-6">
          uvacompute provides instant access to gpu-powered virtual machines and
          container jobs. follow these steps to get up and running.
        </p>
      </section>

      <section className="border border-gray-200 p-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h3 className="text-lg font-semibold text-black">
              install the cli
            </h3>
          </div>
          <p className="text-sm text-gray-600 ml-8 mb-3">
            run this command in your terminal to install the uva cli:
          </p>
          <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
            <code className="text-sm text-black">
              curl -fsSL https://uvacompute.com/install.sh | bash
            </code>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h3 className="text-lg font-semibold text-black">
              create an account
            </h3>
          </div>
          <p className="text-sm text-gray-600 ml-8 mb-3">
            sign up for uvacompute if you haven&apos;t already:
          </p>
          <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
            <code className="text-sm text-black">
              visit{" "}
              <a href="/signup" className="text-orange-accent underline">
                uvacompute.com/signup
              </a>
            </code>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">3</span>
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
          <p className="text-xs text-gray-500 ml-8 mt-2">
            this will open a browser window for authentication
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">what&apos;s next?</h2>
        <ul className="space-y-2 text-gray-600">
          <li>
            <a href="/docs/vms" className="text-orange-accent underline">
              virtual machines
            </a>{" "}
            - create and manage gpu-powered vms
          </li>
          <li>
            <a href="/docs/jobs" className="text-orange-accent underline">
              container jobs
            </a>{" "}
            - run docker containers on demand
          </li>
          <li>
            <a href="/docs/nodes" className="text-orange-accent underline">
              node management
            </a>{" "}
            - contribute your hardware to the network
          </li>
        </ul>
      </section>
    </div>
  );
}
