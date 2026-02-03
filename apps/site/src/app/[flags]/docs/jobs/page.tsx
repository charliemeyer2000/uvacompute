import { Metadata } from "next";

export const metadata: Metadata = {
  title: "container jobs | uvacompute docs",
  description: "learn how to run container jobs on uvacompute",
};

export default function JobsDocsPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">container jobs</h2>
        <p className="text-gray-600 mb-6">
          run any docker container on uvacompute with a single command. jobs are
          perfect for batch processing, ml training, data pipelines, and any
          workload that can run in a container.
        </p>
      </section>

      <section id="prerequisites">
        <h3 className="text-lg font-semibold mb-4">prerequisites</h3>
        <p className="text-gray-600 mb-4">
          before running jobs, make sure you have:
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

      <section className="border border-gray-200 p-6 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">1</span>
            <h3 className="text-lg font-semibold text-black">
              run your first job
            </h3>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              execute a command in any docker image:
            </p>
            <div className="bg-gray-50 border border-gray-200 p-4 space-y-2">
              <code className="text-sm text-black block">
                uva jobs run alpine echo &quot;hello world&quot;
              </code>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-semibold text-black">2</span>
            <h3 className="text-lg font-semibold text-black">
              use any docker image
            </h3>
          </div>
          <div className="pl-9">
            <p className="text-sm text-gray-600 mb-3">
              run python, node, or any container image from docker hub:
            </p>
            <div className="bg-gray-50 border border-gray-200 p-4 space-y-2">
              <code className="text-sm text-black block">
                uva jobs run python:3.11 python -c &quot;print(1+1)&quot;
              </code>
              <code className="text-sm text-gray-500 block">
                uva jobs run node:20 node -e
                &quot;console.log(&apos;hello&apos;)&quot;
              </code>
            </div>
          </div>
        </div>
      </section>

      <section id="examples">
        <h3 className="text-lg font-semibold mb-4">examples</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">run a python script</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs run python:3.11 python -c &quot;import torch;
                print(torch.cuda.is_available())&quot;
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">run with gpu support</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs run --gpu pytorch/pytorch:latest python train.py
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">run a bash script</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs run ubuntu:22.04 bash -c &quot;apt update &amp;&amp;
                apt install -y curl&quot;
              </code>
            </div>
          </div>
        </div>
      </section>

      <section id="managing-jobs">
        <h3 className="text-lg font-semibold mb-4">managing jobs</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your jobs</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva jobs list</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">view job logs</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs logs &lt;job-id&gt;
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">cancel a running job</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs cancel &lt;job-id&gt;
              </code>
            </div>
          </div>
        </div>
      </section>

      <section id="github-actions-runner">
        <h3 className="text-lg font-semibold mb-4">
          github actions self-hosted runner
        </h3>
        <p className="text-gray-600 mb-4">
          use uvacompute as a self-hosted github actions runner. this spins up
          an ephemeral runner that picks up one job from your repo&apos;s
          workflow queue, executes it, then exits.
        </p>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">prerequisites</h4>
            <ul className="list-disc ml-6 space-y-1 text-sm text-gray-600">
              <li>
                <a
                  href="https://cli.github.com"
                  className="text-orange-accent underline"
                >
                  gh cli
                </a>{" "}
                installed and authenticated
              </li>
              <li>uva cli installed and authenticated</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-2">quick start</h4>
            <p className="text-sm text-gray-600 mb-2">
              download and run the helper script:
            </p>
            <div className="bg-gray-50 border border-gray-200 p-4 space-y-2">
              <code className="text-sm text-black block">
                curl -fsSL
                https://raw.githubusercontent.com/charliemeyer2000/uvacompute/main/apps/site/public/gh-runner.sh
                -o gh-runner.sh &amp;&amp; chmod +x gh-runner.sh
              </code>
              <code className="text-sm text-black block mt-2">
                ./gh-runner.sh --repo your-org/your-repo
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">with gpu and custom resources</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                ./gh-runner.sh --repo your-org/your-repo --gpu 1 --cpus 4 --ram
                16
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">org-level runner</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                ./gh-runner.sh --org your-org
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">workflow configuration</h4>
            <p className="text-sm text-gray-600 mb-2">
              in your github actions workflow, use the{" "}
              <code className="bg-gray-100 px-1">self-hosted</code> and{" "}
              <code className="bg-gray-100 px-1">uvacompute</code> labels:
            </p>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <pre className="text-sm text-black whitespace-pre">{`jobs:
  build:
    runs-on: [self-hosted, uvacompute]
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running on uvacompute!"`}</pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">script options</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 border-b border-gray-200">
                      flag
                    </th>
                    <th className="text-left p-3 border-b border-gray-200">
                      description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--repo</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      github repo (e.g. myorg/myrepo)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--org</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      github org for org-level runner
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--cpus</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      number of CPUs (default: 4)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--ram</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      RAM in GB (default: 16)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--gpu</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      number of GPUs (default: 0)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>--labels</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      extra runner labels, comma-separated (default: uvacompute)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm text-gray-600">
              <strong>note:</strong> runners are ephemeral — each runner picks
              up one workflow job then exits. to handle multiple queued jobs,
              run the script multiple times.
            </p>
          </div>
        </div>
      </section>

      <section id="job-options">
        <h3 className="text-lg font-semibold mb-4">job options</h3>
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
                <td className="p-3 border-b border-gray-200">
                  name for the job
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--name my-job</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-g, --gpu</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  request a GPU for the job
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--gpu</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-c, --cpu</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  number of CPUs (default: 1)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--cpu 4</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-r, --ram</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  RAM in GB (default: 4)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--ram 16</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-d, --disk</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  scratch disk in GB (mounted at /scratch)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--disk 50</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>-e, --env</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  environment variable (can use multiple times)
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--env KEY=value</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>--expose</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  expose port via HTTPS endpoint
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--expose 8000</code>
                </td>
              </tr>
              <tr>
                <td className="p-3 border-b border-gray-200">
                  <code>--no-follow</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  don&apos;t stream logs after job starts
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--no-follow</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
