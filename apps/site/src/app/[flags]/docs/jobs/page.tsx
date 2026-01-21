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

      <section>
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
                uva run alpine echo &quot;hello world&quot;
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
                uva run python:3.11 python -c &quot;print(1+1)&quot;
              </code>
              <code className="text-sm text-gray-500 block">
                uva run node:20 node -e
                &quot;console.log(&apos;hello&apos;)&quot;
              </code>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4">examples</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">run a python script</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva run python:3.11 python -c &quot;import torch;
                print(torch.cuda.is_available())&quot;
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">run with gpu support</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva run pytorch/pytorch:latest python train.py
              </code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">run a bash script</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva run ubuntu:22.04 bash -c &quot;apt update &amp;&amp; apt
                install -y curl&quot;
              </code>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold mb-4">managing jobs</h3>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">list your jobs</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">uva jobs list</code>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">get job details</h4>
            <div className="bg-gray-50 border border-gray-200 p-4">
              <code className="text-sm text-black">
                uva jobs get &lt;job-id&gt;
              </code>
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

      <section>
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
                  <code>--name</code>
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
                  <code>--env</code>
                </td>
                <td className="p-3 border-b border-gray-200">
                  environment variables
                </td>
                <td className="p-3 border-b border-gray-200">
                  <code>--env KEY=value</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
