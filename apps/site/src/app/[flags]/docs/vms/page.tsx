import { Metadata } from "next";
import { CodeBlock } from "../_components/code-block";

export const metadata: Metadata = {
  title: "virtual machines | uvacompute docs",
  description: "learn how to create and manage virtual machines on uvacompute",
};

export default function VMsDocsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">virtual machines</h2>
        <p className="text-gray-600 mb-6">
          uvacompute vms provide instant access to gpu-powered virtual machines
          with up to rtx 5090s, 2tb nvme ssd, 32 vcpus, and 128gb ram. get an
          ssh shell in under 10 seconds.
        </p>
      </section>

      <section id="prerequisites">
        <h3 className="text-lg font-semibold mb-4">prerequisites</h3>
        <p className="text-gray-600 mb-4">
          before creating a vm, make sure you have:
        </p>
        <ul className="list-disc ml-6 space-y-2 text-gray-600">
          <li>
            installed the{" "}
            <a href="/docs" className="text-orange-accent underline">
              uva cli
            </a>
          </li>
          <li>authenticated with uva login</li>
        </ul>
      </section>

      <section
        id="create-a-vm"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h3 className="text-lg font-semibold text-black">create a vm</h3>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              provision a new virtual machine:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">
                uva vm create -h 1 -n my-vm
              </code>
            </CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              -h specifies the number of hours, -n sets the vm name
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h3 className="text-lg font-semibold text-black">
              connect to your vm
            </h3>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              ssh into your running vm:
            </p>
            <CodeBlock>
              <code className="text-sm text-black">uva vm ssh my-vm</code>
            </CodeBlock>
          </div>
        </div>
      </section>

      <section id="managing-vms">
        <h3 className="text-lg font-semibold mb-4">managing vms</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your vms</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva vm list</code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">check vm status</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva vm status my-vm</code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">delete a vm</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva vm delete my-vm</code>
            </CodeBlock>
          </div>
        </div>
      </section>

      <section id="vm-options">
        <h3 className="text-lg font-semibold mb-4">vm options</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">flag</th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  example
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-h, --hours</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  duration in hours (required)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-h 2</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-n, --name</code>
                </td>
                <td className="p-3 border-b border-gray-200">vm name</td>
                <td className="p-3 border-b border-gray-200">
                  <code>-n my-vm</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-c, --cpus</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  number of CPUs (default: 1)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-c 4</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-r, --ram</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  RAM in GB (default: 8)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-r 16</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-d, --disk</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  disk size in GB (default: 64)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-d 128</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-g, --gpus</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  number of GPUs (default: 0)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-g 1</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-t, --gpu-type</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  GPU type (default: 5090)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-t 5090</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-e, --expose</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  expose port via HTTPS endpoint
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-e 8000</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
