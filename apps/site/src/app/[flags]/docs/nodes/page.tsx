import { Metadata } from "next";
import { CodeBlock } from "../_components/code-block";

export const metadata: Metadata = {
  title: "node management | uvacompute docs",
  description:
    "learn how to contribute your hardware to the uvacompute network",
};

export default function NodesDocsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">node management</h2>
        <p className="text-gray-600 mb-6">
          contribute your gpu hardware to the uvacompute network. nodes run vms
          and container jobs for users on the platform.
        </p>
      </section>

      <section id="prerequisites">
        <h3 className="text-lg font-semibold mb-4">prerequisites</h3>
        <ul className="list-disc ml-6 space-y-2 text-gray-600">
          <li>a linux machine with nvidia gpu(s)</li>
          <li>
            installed the{" "}
            <a href="/docs" className="text-orange-accent underline">
              uva cli
            </a>
          </li>
          <li>authenticated with uva login</li>
          <li>root/sudo access on the machine</li>
        </ul>
      </section>

      <section
        id="installing-a-node"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">installing a node</h3>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h4 className="text-lg font-semibold text-black">
              prepare your system
            </h4>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              install nvidia drivers and check system requirements:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">sudo uva node prepare</code>
            </CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              this installs nvidia drivers and verifies iommu support
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h4 className="text-lg font-semibold text-black">
              create a registration token
            </h4>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              generate a token for node registration:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">uva node token create</code>
            </CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              tokens are single-use and expire after 24 hours
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">3</span>
            <h4 className="text-lg font-semibold text-black">
              install the node
            </h4>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              install k3s, kubevirt, and register with uvacompute:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">sudo uva node install</code>
            </CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              you&apos;ll be prompted for the registration token from step 2
            </p>
          </div>
        </div>
      </section>

      <section
        id="pausing-a-node"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">pausing a node</h3>
        <p className="text-sm text-gray-600 mb-4">
          pausing a node prevents new workloads from being scheduled while
          allowing existing workloads to complete.
        </p>

        <div>
          <h4 className="font-medium mb-2">via cli</h4>
          <CodeBlock>
            <code className="text-sm text-black">uva node pause</code>
          </CodeBlock>
        </div>

        <div className="mt-4">
          <h4 className="font-medium mb-2">via web dashboard</h4>
          <ol className="list-decimal ml-6 space-y-1 text-sm text-gray-600">
            <li>
              go to{" "}
              <a href="/my-nodes" className="text-orange-accent underline">
                my nodes
              </a>
            </li>
            <li>click on your node to expand it</li>
            <li>click &quot;pause node&quot;</li>
          </ol>
        </div>

        <div className="mt-4 p-4 bg-gray-50 border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>note:</strong> when paused, the node shows as
            &quot;draining&quot; status. existing vms and jobs will continue
            running until they complete.
          </p>
        </div>
      </section>

      <section
        id="resuming-a-node"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">resuming a node</h3>
        <p className="text-sm text-gray-600 mb-4">
          resuming a paused node allows it to accept new workloads again.
        </p>

        <div>
          <h4 className="font-medium mb-2">via cli</h4>
          <CodeBlock>
            <code className="text-sm text-black">uva node resume</code>
          </CodeBlock>
        </div>

        <div className="mt-4">
          <h4 className="font-medium mb-2">via web dashboard</h4>
          <ol className="list-decimal ml-6 space-y-1 text-sm text-gray-600">
            <li>
              go to{" "}
              <a href="/my-nodes" className="text-orange-accent underline">
                my nodes
              </a>
            </li>
            <li>click on your paused node to expand it</li>
            <li>click &quot;resume node&quot;</li>
          </ol>
        </div>
      </section>

      <section
        id="uninstalling-a-node"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">uninstalling a node</h3>
        <p className="text-sm text-gray-600 mb-4">
          completely remove uvacompute from your machine.
        </p>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h4 className="text-lg font-semibold text-black">
              pause and wait for workloads
            </h4>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              pause the node and wait for existing workloads to complete:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">uva node pause</code>
            </CodeBlock>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h4 className="text-lg font-semibold text-black">
              run the uninstall command
            </h4>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              remove k3s, kubevirt, and all uvacompute components:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">
                sudo uva node uninstall
              </code>
            </CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              this removes k3s, kubevirt, ssh tunnel service, and gpu scripts
            </p>
          </div>
        </div>
      </section>

      <section id="status-reference">
        <h3 className="text-lg font-semibold mb-4">node status reference</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">
                  status
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  indicator
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200">online</td>
                <td className="p-3 border-b border-gray-200">
                  <span className="text-green-500">●</span>
                </td>
                <td className="p-3 border-b border-gray-200">
                  accepting and running workloads
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">draining</td>
                <td className="p-3 border-b border-gray-200">
                  <span className="text-yellow-500">◐</span>
                </td>
                <td className="p-3 border-b border-gray-200">
                  paused - existing workloads continue, no new workloads
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">offline</td>
                <td className="p-3 border-b border-gray-200">
                  <span className="text-red-500">○</span>
                </td>
                <td className="p-3 border-b border-gray-200">
                  node is unreachable or not running
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="additional-commands">
        <h3 className="text-lg font-semibold mb-4">additional commands</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your tokens</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva node token list</code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">check node status</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva node status</code>
            </CodeBlock>
          </div>
        </div>
      </section>
    </div>
  );
}
