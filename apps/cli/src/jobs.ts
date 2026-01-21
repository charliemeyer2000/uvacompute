import type { Command } from "commander";
import ora, { type Ora } from "ora";
import { getBaseUrl, loadToken, checkServiceStatus } from "./lib/utils";
import {
  theme,
  jobStatusColors,
  formatSectionHeader,
  formatDetail,
  formatCommand,
} from "./lib/theme";
import {
  JobCreationResponseSchema,
  JobCancellationResponseSchema,
  JobStatusResponseSchema,
  JobListResponseSchema,
  JOB_STATUS_GROUPS,
  type JobStatus,
} from "./lib/schemas";
import { ServiceUnavailableError } from "./lib/errors";

const BASE_URL = getBaseUrl();

function getJobStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    pending: "Job pending...",
    scheduled: "Job scheduled...",
    pulling: "Pulling container image...",
    running: "Job running",
    completed: "Job completed",
    failed: "Job failed",
    cancelled: "Job cancelled",
  };
  return messages[status] || `Status: ${status}`;
}

async function pollJobStatus(
  jobId: string,
  token: string,
  spinner: Ora,
): Promise<{ status: JobStatus; exitCode?: number; errorMessage?: string }> {
  const maxAttempts = 300;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const statusResponse = await fetch(`${BASE_URL}/api/jobs/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (statusResponse.ok) {
        const statusData = JobStatusResponseSchema.parse(
          await statusResponse.json(),
        );

        spinner.text = getJobStatusMessage(statusData.status);

        if (statusData.status === "running") {
          return { status: statusData.status };
        } else if (statusData.status === "completed") {
          return {
            status: statusData.status,
            exitCode: statusData.exitCode,
          };
        } else if (statusData.status === "failed") {
          return {
            status: statusData.status,
            exitCode: statusData.exitCode,
            errorMessage: statusData.errorMessage,
          };
        } else if (statusData.status === "cancelled") {
          return { status: statusData.status };
        }
      }
    } catch (error: unknown) {
      // Continue polling on transient errors
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error("Timeout waiting for job to start");
}

async function runJob(
  image: string,
  cmdArgs: string[],
  options: {
    gpu?: boolean;
    cpu?: string;
    ram?: string;
    disk?: string;
    env?: string[];
    name?: string;
    follow?: boolean;
  },
): Promise<void> {
  let spinner: Ora | null = null;

  try {
    const token = loadToken();
    if (!token) {
      console.log(
        theme.warning("Not authenticated. Please run 'uva login' first."),
      );
      process.exit(1);
    }

    spinner = ora("Creating job...").start();

    const requestBody: Record<string, unknown> = {
      image,
    };

    if (cmdArgs.length > 0) {
      requestBody.command = cmdArgs;
    }

    if (options.name) {
      requestBody.name = options.name;
    }

    if (options.cpu) {
      const cpus = parseInt(options.cpu, 10);
      if (isNaN(cpus)) {
        spinner.fail("Invalid CPU value. Must be a number.");
        process.exit(1);
      }
      requestBody.cpus = cpus;
    }

    if (options.ram) {
      const ram = parseInt(options.ram, 10);
      if (isNaN(ram)) {
        spinner.fail("Invalid RAM value. Must be a number.");
        process.exit(1);
      }
      requestBody.ram = ram;
    }

    if (options.gpu) {
      requestBody.gpus = 1;
    }

    if (options.disk) {
      const disk = parseInt(options.disk, 10);
      if (isNaN(disk)) {
        spinner.fail("Invalid disk value. Must be a number.");
        process.exit(1);
      }
      requestBody.disk = disk;
    }

    if (options.env && options.env.length > 0) {
      const envMap: Record<string, string> = {};
      for (const e of options.env) {
        const eqIndex = e.indexOf("=");
        if (eqIndex === -1) {
          spinner.fail(
            `Invalid environment variable format: ${e}. Use KEY=VALUE`,
          );
          process.exit(1);
        }
        const key = e.substring(0, eqIndex);
        const value = e.substring(eqIndex + 1);
        envMap[key] = value;
      }
      requestBody.env = envMap;
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as unknown;

    if (!response.ok) {
      const data = rawData as { msg?: string; error?: string };
      spinner.fail(
        `Failed to create job: ${data.msg || data.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = JobCreationResponseSchema.parse(rawData);

    if (data.status === "success" && data.jobId) {
      spinner.text = getJobStatusMessage("pending");

      const result = await pollJobStatus(data.jobId, token, spinner);

      if (result.status === "running") {
        spinner.succeed(theme.success("Job is running!"));
      } else if (result.status === "completed") {
        const exitMsg =
          result.exitCode !== undefined
            ? ` (exit code: ${result.exitCode})`
            : "";
        spinner.succeed(theme.success(`Job completed${exitMsg}`));
      } else if (result.status === "failed") {
        const exitMsg =
          result.exitCode !== undefined
            ? ` (exit code: ${result.exitCode})`
            : "";
        spinner.fail(theme.error(`Job failed${exitMsg}`));
        if (result.errorMessage) {
          console.log(theme.muted(`  Error: ${result.errorMessage}`));
        }
      }

      console.log(formatSectionHeader("Job Details"));
      console.log(formatDetail("Job ID", data.jobId));
      if (options.name) console.log(formatDetail("Name", options.name));
      console.log(formatDetail("Image", image));
      if (cmdArgs.length > 0) {
        console.log(formatDetail("Command", cmdArgs.join(" ")));
      }
      console.log();

      const shouldFollow = options.follow !== false;

      if (
        shouldFollow &&
        (result.status === "running" ||
          result.status === "pending" ||
          result.status === "scheduled" ||
          result.status === "pulling")
      ) {
        console.log(theme.muted("[streaming logs - press Ctrl+C to detach]"));
        console.log();

        try {
          await streamLogs(data.jobId, token);
          console.log();

          const finalStatus = await getJobStatus(data.jobId, token);
          if (finalStatus) {
            if (finalStatus.status === "completed") {
              console.log(theme.success("[job completed]"));
            } else if (finalStatus.status === "failed") {
              console.log(theme.error("[job failed]"));
            } else {
              console.log(
                theme.muted(
                  `[stream ended - job status: ${finalStatus.status}]`,
                ),
              );
            }
          }
        } catch {
          console.log(theme.muted("[stream ended]"));
        }
      } else if (!shouldFollow) {
        console.log(theme.muted("To view logs:"));
        console.log(formatCommand(`uva logs ${data.jobId}`));
      } else {
        const finalLogs = await fetchLogsOnce(data.jobId, token);
        if (finalLogs) {
          console.log(theme.muted("[job output]"));
          console.log(finalLogs);
        }
      }
      console.log();
    } else {
      spinner.fail(`Job creation failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (spinner) {
      spinner.fail(`Error: ${message}`);
    } else {
      console.log(theme.warning(`Error: ${message}`));
    }
    process.exit(1);
  }
}

async function listJobs(options: {
  all?: boolean;
  status?: string;
}): Promise<void> {
  const spinner = ora("Fetching jobs...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/jobs`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as unknown;

    if (!response.ok) {
      const data = rawData as { error?: string };
      spinner.fail(`Failed to fetch jobs: ${data.error || "Unknown error"}`);
      process.exit(1);
    }

    const data = JobListResponseSchema.parse(rawData);

    let filteredJobs = data.jobs;

    if (options.status) {
      filteredJobs = filteredJobs.filter(
        (job) => job.status === options.status,
      );
    } else if (!options.all) {
      filteredJobs = filteredJobs.filter((job) =>
        JOB_STATUS_GROUPS.ACTIVE.includes(
          job.status as (typeof JOB_STATUS_GROUPS.ACTIVE)[number],
        ),
      );
    }

    spinner.succeed(theme.success("Jobs retrieved!"));

    if (filteredJobs.length === 0) {
      if (options.all) {
        console.log(theme.warning("\nNo jobs found."));
        console.log(
          theme.muted("Create one with: uva run <image> [command]\n"),
        );
      } else {
        console.log(theme.warning("\nNo active jobs found."));
        console.log(theme.muted("Use 'uva jobs --all' to see all jobs\n"));
      }
      return;
    }

    if (options.all) {
      console.log(formatSectionHeader("All Jobs"));
    } else if (options.status) {
      console.log(formatSectionHeader(`Jobs (${options.status})`));
    } else {
      console.log(formatSectionHeader("Active Jobs"));
    }
    console.log();

    for (const job of filteredJobs) {
      const statusColor =
        jobStatusColors[job.status as keyof typeof jobStatusColors] ||
        theme.muted;

      const nameDisplay = job.name
        ? theme.emphasis(job.name)
        : theme.muted("(unnamed)");

      console.log(`${nameDisplay} ${statusColor(`[${job.status}]`)}`);
      console.log(theme.muted(`  Job ID: ${job.jobId}`));
      console.log(theme.muted(`  Image: ${job.image}`));
      console.log(
        theme.muted(
          `  Resources: ${job.cpus} vCPU | ${job.ram}GB RAM${job.gpus > 0 ? ` | ${job.gpus} GPU` : ""}${job.disk ? ` | ${job.disk}GB scratch` : ""}`,
        ),
      );
      console.log(
        theme.muted(`  Created: ${new Date(job.createdAt).toLocaleString()}`),
      );
      if (job.exitCode !== undefined) {
        console.log(theme.muted(`  Exit Code: ${job.exitCode}`));
      }
      if (job.completedAt) {
        console.log(
          theme.muted(
            `  Completed: ${new Date(job.completedAt).toLocaleString()}`,
          ),
        );
      }
      console.log();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

async function getJobStatus(
  jobId: string,
  token: string,
): Promise<{ status: string; isActive: boolean } | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/jobs/${jobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = JobStatusResponseSchema.parse(await response.json());
    const activeStatuses = ["pending", "scheduled", "pulling", "running"];
    return {
      status: data.status,
      isActive: activeStatuses.includes(data.status),
    };
  } catch {
    return null;
  }
}

async function fetchLogsOnce(
  jobId: string,
  token: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/jobs/${jobId}/logs`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

async function streamLogs(jobId: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/api/jobs/${jobId}/logs/stream`;

    fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          reject(new Error(errorText || "Failed to stream logs"));
          return;
        }

        if (!response.body) {
          reject(new Error("No stream body available"));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processChunk = async (): Promise<void> => {
          try {
            const { done, value } = await reader.read();

            if (done) {
              resolve();
              return;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                process.stdout.write(data + "\n");
              } else if (line.startsWith("event: done")) {
                resolve();
                return;
              } else if (line.startsWith("event: error")) {
                // Next line will have the error data
              }
            }

            await processChunk();
          } catch (error) {
            reject(error);
          }
        };

        processChunk();
      })
      .catch(reject);
  });
}

async function getJobLogs(
  jobId: string,
  options: { tail?: string; follow?: boolean },
): Promise<void> {
  const spinner = ora("Fetching logs...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const shouldFollow = options.follow !== false;

    if (shouldFollow) {
      const jobStatus = await getJobStatus(jobId, token);

      if (jobStatus?.isActive) {
        spinner.text = "Streaming logs...";
        spinner.stop();
        console.log(theme.muted(`[streaming logs for job ${jobId}]`));
        console.log();

        try {
          await streamLogs(jobId, token);
          console.log();
          console.log(theme.muted("[stream ended]"));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Stream error";
          console.error(theme.error(`\nStream error: ${message}`));
          process.exit(1);
        }
        return;
      }
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/jobs/${jobId}/logs`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    if (!response.ok) {
      const errorText = await response.text();
      spinner.fail(`Failed to fetch logs: ${errorText || "Unknown error"}`);
      process.exit(1);
    }

    spinner.stop();

    const logs = await response.text();

    if (options.tail) {
      const tailLines = parseInt(options.tail, 10);
      if (!isNaN(tailLines) && tailLines > 0) {
        const lines = logs.split("\n");
        const tailedLines = lines.slice(-tailLines);
        console.log(tailedLines.join("\n"));
        return;
      }
    }

    console.log(logs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

async function cancelJob(jobId: string): Promise<void> {
  const spinner = ora(`Cancelling job ${jobId}...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as unknown;

    if (!response.ok) {
      const data = rawData as { msg?: string; error?: string };
      spinner.fail(
        `Failed to cancel job: ${data.msg || data.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = JobCancellationResponseSchema.parse(rawData);

    if (data.status === "cancellation_success") {
      spinner.succeed(theme.success(`Job ${jobId} cancelled successfully!`));
    } else {
      spinner.fail(`Job cancellation failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

export function registerJobCommands(program: Command) {
  program
    .command("run")
    .description("Run a container job")
    .argument("<image>", "Container image to run")
    .argument("[command...]", "Command to run in the container")
    .option("-g, --gpu", "Request a GPU for the job")
    .option("-c, --cpu <cpus>", "Number of CPUs (default: 1)")
    .option("-r, --ram <ram>", "RAM in GB (default: 4)")
    .option(
      "-d, --disk <disk>",
      "Scratch disk in GB (default: 0, mounted at /scratch)",
    )
    .option(
      "-e, --env <KEY=VALUE>",
      "Environment variable (can be used multiple times)",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option("-n, --name <name>", "Job name (optional)")
    .option("--no-follow", "Don't stream logs after job starts")
    .action(
      (
        image: string,
        cmdArgs: string[],
        options: {
          gpu?: boolean;
          cpu?: string;
          ram?: string;
          disk?: string;
          env?: string[];
          name?: string;
          follow?: boolean;
        },
      ) => {
        runJob(image, cmdArgs, options);
      },
    );

  program
    .command("jobs")
    .description("List jobs")
    .option("-a, --all", "Show all jobs (including completed)")
    .option("-s, --status <status>", "Filter by status")
    .action(listJobs);

  program
    .command("logs")
    .description("Get job logs")
    .argument("<jobId>", "Job ID")
    .option("-t, --tail <lines>", "Show only the last N lines")
    .option("--no-follow", "Don't follow log output (default behavior)")
    .action(getJobLogs);

  program
    .command("cancel")
    .description("Cancel a running job")
    .argument("<jobId>", "Job ID to cancel")
    .action(cancelJob);
}
