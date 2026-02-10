import { Metadata } from "next";
import { CodeBlock } from "../_components/code-block";

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

      <section className="border border-gray-200 p-4 sm:p-6 space-y-6">
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
            <CodeBlock className="space-y-2">
              <code className="text-sm text-black block">
                uva jobs run alpine echo &quot;hello world&quot;
              </code>
            </CodeBlock>
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
            <CodeBlock className="space-y-2">
              <code className="text-sm text-black block">
                uva jobs run python:3.11 python -c &quot;print(1+1)&quot;
              </code>
              <code className="text-sm text-gray-500 block">
                uva jobs run node:20 node -e
                &quot;console.log(&apos;hello&apos;)&quot;
              </code>
            </CodeBlock>
          </div>
        </div>
      </section>

      <section id="examples">
        <h3 className="text-lg font-semibold mb-4">examples</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">run a python script</h4>
            <CodeBlock>
              <code className="text-sm text-black">
                uva jobs run python:3.11 python -c &quot;import torch;
                print(torch.cuda.is_available())&quot;
              </code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">run with gpu support</h4>
            <CodeBlock>
              <code className="text-sm text-black">
                uva jobs run --gpu pytorch/pytorch:latest python train.py
              </code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">run a bash script</h4>
            <CodeBlock>
              <code className="text-sm text-black">
                uva jobs run ubuntu:22.04 bash -c &quot;apt update &amp;&amp;
                apt install -y curl&quot;
              </code>
            </CodeBlock>
          </div>
        </div>
      </section>

      <section id="managing-jobs">
        <h3 className="text-lg font-semibold mb-4">managing jobs</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your jobs</h4>
            <CodeBlock>
              <code className="text-sm text-black">uva jobs list</code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">view job logs</h4>
            <CodeBlock>
              <code className="text-sm text-black">
                uva jobs logs &lt;job-id&gt;
              </code>
            </CodeBlock>
          </div>

          <div>
            <h4 className="font-medium mb-2">cancel a running job</h4>
            <CodeBlock>
              <code className="text-sm text-black">
                uva jobs cancel &lt;job-id&gt;
              </code>
            </CodeBlock>
          </div>
        </div>
      </section>

      <section id="github-actions-runner">
        <h3 className="text-lg font-semibold mb-4">github actions runners</h3>
        <p className="text-gray-600 mb-4">
          use uvacompute as a self-hosted github actions runner. add{" "}
          <code className="bg-gray-100 px-1">uvacompute</code> to your
          workflow&apos;s <code className="bg-gray-100 px-1">runs-on</code>{" "}
          labels and uvacompute automatically provisions an ephemeral runner for
          each job via webhook.
        </p>

        <div className="space-y-6">
          <div className="border border-gray-200 p-4 sm:p-6 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-semibold text-black">1</span>
                <h4 className="text-lg font-semibold text-black">
                  create an api key
                </h4>
              </div>
              <div className="pl-9">
                <p className="text-sm text-gray-600 mb-3">
                  generate an api key from the cli or the{" "}
                  <a href="/profile" className="text-orange-accent underline">
                    profile page
                  </a>
                  . save the key, webhook secret, and webhook url — they are
                  shown once.
                </p>
                <CodeBlock>
                  <code className="text-sm text-black">
                    uva api-key create &quot;GitHub Runners&quot;
                  </code>
                </CodeBlock>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-semibold text-black">2</span>
                <h4 className="text-lg font-semibold text-black">
                  add a github webhook
                </h4>
              </div>
              <div className="pl-9">
                <p className="text-sm text-gray-600 mb-3">
                  go to your repo&apos;s{" "}
                  <strong>settings &rarr; webhooks &rarr; add webhook</strong>{" "}
                  and configure:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-200">
                    <tbody>
                      <tr>
                        <td className="p-3 border-b border-gray-200 font-medium w-36">
                          payload url
                        </td>
                        <td className="p-3 border-b border-gray-200">
                          <code className="text-xs">
                            https://uvacompute.com/api/github/webhook/&lt;your-key-prefix&gt;
                          </code>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 border-b border-gray-200 font-medium">
                          content type
                        </td>
                        <td className="p-3 border-b border-gray-200">
                          <code className="text-xs">application/json</code>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 border-b border-gray-200 font-medium">
                          secret
                        </td>
                        <td className="p-3 border-b border-gray-200">
                          your webhook secret from step 1
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium">events</td>
                        <td className="p-3">
                          select <strong>workflow jobs</strong> only
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-semibold text-black">3</span>
                <h4 className="text-lg font-semibold text-black">
                  use in your workflow
                </h4>
              </div>
              <div className="pl-9">
                <p className="text-sm text-gray-600 mb-3">
                  add the <code className="bg-gray-100 px-1">uvacompute</code>{" "}
                  label to <code className="bg-gray-100 px-1">runs-on</code>.
                  when the job is queued, a runner is automatically provisioned:
                </p>
                <CodeBlock>
                  <pre className="text-sm text-black whitespace-pre">{`jobs:
  build:
    runs-on: [self-hosted, uvacompute]
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running on uvacompute!"`}</pre>
                </CodeBlock>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">resource labels</h4>
            <p className="text-sm text-gray-600 mb-3">
              customize runner resources by adding labels to{" "}
              <code className="bg-gray-100 px-1">runs-on</code>. labels starting
              with <code className="bg-gray-100 px-1">uvacompute-</code> are
              parsed for cpu, ram, disk, and gpu settings.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 border-b border-gray-200">
                      label
                    </th>
                    <th className="text-left p-3 border-b border-gray-200">
                      effect
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>uvacompute</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      default runner (4 cpu, 8gb ram, 32gb disk)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>uvacompute-gpu</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">adds 1 gpu</td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>uvacompute-8cpu</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      set to 8 cpus
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>uvacompute-16gb</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      set to 16gb ram
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-gray-200">
                      <code>uvacompute-64disk</code>
                    </td>
                    <td className="p-3 border-b border-gray-200">
                      set to 64gb disk
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">examples</h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  gpu runner with extra ram:
                </p>
                <CodeBlock>
                  <pre className="text-sm text-black whitespace-pre">{`runs-on: [self-hosted, uvacompute, uvacompute-gpu, uvacompute-32gb]`}</pre>
                </CodeBlock>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  high-cpu build runner:
                </p>
                <CodeBlock>
                  <pre className="text-sm text-black whitespace-pre">{`runs-on: [self-hosted, uvacompute, uvacompute-8cpu, uvacompute-16gb]`}</pre>
                </CodeBlock>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">managing api keys</h4>
            <CodeBlock className="space-y-2">
              <code className="text-sm text-black block">
                uva api-key create &quot;my runners&quot;
              </code>
              <code className="text-sm text-gray-500 block">
                uva api-key list
              </code>
              <code className="text-sm text-gray-500 block">
                uva api-key revoke &lt;key-id&gt;
              </code>
            </CodeBlock>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-4 space-y-2">
            <p className="text-sm text-gray-600">
              <strong>note:</strong> runners are ephemeral — each runner picks
              up one workflow job then exits. for workflows with multiple jobs,
              each job automatically gets its own runner.
            </p>
            <p className="text-sm text-gray-600">
              <strong>tip:</strong> runner containers start from a bare{" "}
              <code className="bg-gray-100 px-1">ubuntu:22.04</code> image. use{" "}
              <code className="bg-gray-100 px-1">sudo apt-get install</code> to
              install system dependencies your workflow needs.
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
