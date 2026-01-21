import { Metadata } from "next";

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
          with up to rtx 5090s, 2tb nvme ssd, 16 vcpus, and 64gb ram. get an ssh
          shell in under 10 seconds.
        </p>
      </section>

      <section>
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
          <li>added an ssh key (see below)</li>
        </ul>
      </section>

      <section className="border border-gray-200 p-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h3 className="text-lg font-semibold text-black">setup ssh keys</h3>
          </div>
          <p className="text-sm text-gray-600 ml-8 mb-3">
            add your public key for secure vm access:
          </p>
          <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
            <code className="text-sm text-black">
              uva ssh-key add ~/.ssh/id_ed25519.pub
            </code>
          </div>
          <p className="text-xs text-gray-500 ml-8 mt-2">
            don&apos;t have an ssh key? generate one with:{" "}
            <code className="bg-gray-100 px-1 py-0.5 border border-gray-200">
              ssh-keygen -t ed25519 -C &quot;your_email@example.com&quot;
            </code>
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h3 className="text-lg font-semibold text-black">create a vm</h3>
          </div>
          <p className="text-sm text-gray-600 ml-8 mb-3">
            provision a new virtual machine:
          </p>
          <div className="ml-8 bg-gray-50 border border-gray-200 p-4">
            <code className="text-sm text-black">
              uva vm create -h 1 -n my-vm
            </code>
          </div>
          <p className="text-xs text-gray-500 ml-8 mt-2">
            -h specifies the number of hours, -n sets the vm name
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">3</span>
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
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4">managing vms</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your vms</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm list</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">get vm details</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm get my-vm</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">stop a vm</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm stop my-vm</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">delete a vm</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva vm delete my-vm</code>
            </div>
          </div>
        </div>
      </section>

      <section>
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
                  <code>-n, --name</code>
                </td>
                <td className="p-3 border-b border-gray-200">vm name</td>
                <td className="p-3 border-b border-gray-200">
                  <code>-n my-vm</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-h, --hours</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  duration in hours
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>-h 2</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
