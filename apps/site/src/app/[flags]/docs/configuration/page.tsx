import { Metadata } from "next";
import { CodeBlock } from "../_components/code-block";

export const metadata: Metadata = {
  title: "configuration | uvacompute docs",
  description:
    "learn about configuration file locations for the uvacompute cli, nodes, and platform",
};

export default function ConfigurationDocsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">configuration</h2>
        <p className="text-gray-600 mb-6">
          uvacompute stores configuration and data in standardized locations
          following the filesystem hierarchy standard (fhs).
        </p>
      </section>

      <section
        id="cli-configuration"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">
          cli configuration (~/.uvacompute/)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          user authentication and local settings. this directory is created when
          you run <code className="bg-gray-100 px-1">uva login</code>.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">file</th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  config
                </td>
                <td className="p-3 border-b border-gray-200">
                  auth token and version info (json)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  node/config.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  local node management config
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  node/install-state.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  installation tracking
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  node/prepare-state.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  pre-install state (gpu, iommu checks)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="node-system-configuration"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">
          node system configuration (/etc/uvacompute/)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          node registration and runtime settings. these files are created during
          node installation and require root access.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">file</th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  node-config.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  hub connection details (tunnel host, port, k3s url)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  node-labels.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  kubernetes resource labels (cpus, ram, gpu type)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  storage-config.yaml
                </td>
                <td className="p-3 border-b border-gray-200">
                  vm storage allocation settings
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  orchestration-secret
                </td>
                <td className="p-3 border-b border-gray-200">
                  api authentication for gpu mode scripts
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>note:</strong> these files contain sensitive information.
            the orchestration-secret file has mode 600 (owner read/write only).
          </p>
        </div>
      </section>

      <section
        id="node-data-storage"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">
          node data storage (/var/lib/uvacompute/)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          persistent vm and job data. this is where vm disk images and working
          directories are stored.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">path</th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  storage/
                </td>
                <td className="p-3 border-b border-gray-200">
                  vm disk images, job working directories
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200">
          <p className="text-sm text-gray-600">
            <strong>storage allocation:</strong> during node installation, you
            specify how much disk space to allocate. this directory will use up
            to that amount for vm disks and job data.
          </p>
        </div>
      </section>

      <section
        id="ssh-keys"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">ssh keys (~/.ssh/)</h3>
        <p className="text-sm text-gray-600 mb-4">
          ssh keys used for secure communication between nodes and the hub.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">file</th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  id_ed25519_uvacompute
                </td>
                <td className="p-3 border-b border-gray-200">
                  node tunnel communication key (private)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  id_ed25519_uvacompute.pub
                </td>
                <td className="p-3 border-b border-gray-200">
                  node tunnel communication key (public)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="gpu-mode-scripts"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">gpu mode management</h3>
        <p className="text-sm text-gray-600 mb-4">
          switch between nvidia (container) and vfio (vm passthrough) gpu modes
          on nodes with nvidia gpus.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">
                  command
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uva node gpu-mode status
                </td>
                <td className="p-3 border-b border-gray-200">
                  show current gpu mode
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uva node gpu-mode nvidia
                </td>
                <td className="p-3 border-b border-gray-200">
                  switch to nvidia mode (for container workloads)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uva node gpu-mode vfio
                </td>
                <td className="p-3 border-b border-gray-200">
                  switch to vfio mode (for vm gpu passthrough)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="font-medium mb-2">example usage</h4>
          <CodeBlock className="space-y-2">
            <code className="text-sm text-black block">
              uva node gpu-mode status
            </code>
            <code className="text-sm text-black block">
              uva node gpu-mode nvidia
            </code>
            <code className="text-sm text-black block">
              uva node gpu-mode vfio
            </code>
          </CodeBlock>
        </div>
      </section>

      <section
        id="node-services"
        className="border border-gray-200 p-4 sm:p-6 space-y-6"
      >
        <h3 className="text-lg font-semibold mb-2">node services</h3>
        <p className="text-sm text-gray-600 mb-4">
          systemd services installed on gpu nodes during setup.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">
                  service
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  description
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uvacompute-tunnel
                </td>
                <td className="p-3 border-b border-gray-200">
                  ssh tunnel to hub for cluster communication
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uvacompute-gpu-guardian
                </td>
                <td className="p-3 border-b border-gray-200">
                  detects host gpu usage and blocks job scheduling (nvidia mode
                  only)
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  uvacompute-gpu-reconcile
                </td>
                <td className="p-3 border-b border-gray-200">
                  restores gpu mode after reboot
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="directory-summary">
        <h3 className="text-lg font-semibold mb-4">directory summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 border-b border-gray-200">
                  purpose
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  location
                </th>
                <th className="text-left p-3 border-b border-gray-200">
                  rationale
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-gray-200">system config</td>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  /etc/uvacompute/
                </td>
                <td className="p-3 border-b border-gray-200">
                  fhs: host-specific system configuration
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">variable data</td>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  /var/lib/uvacompute/
                </td>
                <td className="p-3 border-b border-gray-200">
                  fhs: persistent application data
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">user config</td>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  ~/.uvacompute/
                </td>
                <td className="p-3 border-b border-gray-200">
                  xdg: user-level configuration
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">scripts</td>
                <td className="p-3 border-b border-gray-200 font-mono text-xs">
                  /usr/local/bin/
                </td>
                <td className="p-3 border-b border-gray-200">
                  fhs: locally installed executables
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
