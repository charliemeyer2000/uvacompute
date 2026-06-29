import { describe, it, expect } from "bun:test";
import {
  VMCreationRequestSchema,
  VMStatusEnum,
  VM_STATUS_GROUPS,
  isVMStatusInGroup,
  JobStatusEnum,
  JOB_STATUS_GROUPS,
  isJobStatusInGroup,
  JobCreationRequestSchema,
  NodeStatusEnum,
  NODE_STATUS_GROUPS,
  isNodeStatusInGroup,
  DeviceCodeResponseSchema,
  TokenSuccessResponseSchema,
  TokenErrorResponseSchema,
  UserSchema,
  SSHKeySchema,
  ApiKeySchema,
  VMExtendRequestSchema,
} from "./schemas";

describe("VMCreationRequestSchema", () => {
  it("accepts minimal valid input", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts full valid input", () => {
    const result = VMCreationRequestSchema.safeParse({
      hours: 4,
      name: "my-vm",
      cpus: 4,
      ram: 8,
      disk: 50,
      gpus: 1,
      "gpu-type": "5090",
      expose: 8080,
    });
    expect(result.success).toBe(true);
  });

  it("rejects hours less than 1", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects non-power-of-2 cpus", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1, cpus: 3 });
    expect(result.success).toBe(false);
  });

  it("accepts power-of-2 cpus", () => {
    for (const cpus of [1, 2, 4, 8, 16]) {
      const result = VMCreationRequestSchema.safeParse({ hours: 1, cpus });
      expect(result.success).toBe(true);
    }
  });

  it("rejects non-power-of-2 ram", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1, ram: 6 });
    expect(result.success).toBe(false);
  });

  it("rejects disk below 10", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1, disk: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects disk above 500", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1, disk: 501 });
    expect(result.success).toBe(false);
  });

  it("rejects gpus above 1", () => {
    const result = VMCreationRequestSchema.safeParse({ hours: 1, gpus: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid gpu-type", () => {
    const result = VMCreationRequestSchema.safeParse({
      hours: 1,
      "gpu-type": "3090",
    });
    expect(result.success).toBe(false);
  });

  it("rejects expose port out of range", () => {
    const result = VMCreationRequestSchema.safeParse({
      hours: 1,
      expose: 70000,
    });
    expect(result.success).toBe(false);
  });
});

describe("VMExtendRequestSchema", () => {
  it("accepts valid hours", () => {
    expect(VMExtendRequestSchema.safeParse({ hours: 2 }).success).toBe(true);
  });

  it("rejects hours < 1", () => {
    expect(VMExtendRequestSchema.safeParse({ hours: 0 }).success).toBe(false);
  });
});

describe("VMStatusEnum", () => {
  it("parses all valid statuses", () => {
    const statuses = [
      "not_found",
      "creating",
      "pending",
      "booting",
      "provisioning",
      "ready",
      "stopping",
      "stopped",
      "failed",
      "offline",
    ];
    for (const s of statuses) {
      expect(VMStatusEnum.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(VMStatusEnum.safeParse("running").success).toBe(false);
  });
});

describe("isVMStatusInGroup", () => {
  it("identifies ready VMs in READY group", () => {
    expect(isVMStatusInGroup("ready", VM_STATUS_GROUPS.READY)).toBe(true);
  });

  it("excludes non-ready VMs from READY group", () => {
    expect(isVMStatusInGroup("pending", VM_STATUS_GROUPS.READY)).toBe(false);
  });

  it("includes all active statuses in ACTIVE group", () => {
    for (const s of VM_STATUS_GROUPS.ACTIVE) {
      expect(isVMStatusInGroup(s, VM_STATUS_GROUPS.ACTIVE)).toBe(true);
    }
  });

  it("excludes stopped/failed from ACTIVE group", () => {
    expect(isVMStatusInGroup("stopped", VM_STATUS_GROUPS.ACTIVE)).toBe(false);
    expect(isVMStatusInGroup("failed", VM_STATUS_GROUPS.ACTIVE)).toBe(false);
  });

  it("includes all deletable statuses in DELETABLE group", () => {
    for (const s of VM_STATUS_GROUPS.DELETABLE) {
      expect(isVMStatusInGroup(s, VM_STATUS_GROUPS.DELETABLE)).toBe(true);
    }
  });

  it("only ready is extendable", () => {
    expect(isVMStatusInGroup("ready", VM_STATUS_GROUPS.EXTENDABLE)).toBe(true);
    expect(isVMStatusInGroup("pending", VM_STATUS_GROUPS.EXTENDABLE)).toBe(
      false,
    );
  });
});

describe("JobStatusEnum", () => {
  it("parses all valid job statuses", () => {
    const statuses = [
      "pending",
      "scheduled",
      "pulling",
      "running",
      "completed",
      "failed",
      "cancelled",
      "cancelling",
      "node_offline",
    ];
    for (const s of statuses) {
      expect(JobStatusEnum.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid job status", () => {
    expect(JobStatusEnum.safeParse("ready").success).toBe(false);
  });
});

describe("isJobStatusInGroup", () => {
  it("identifies active job statuses", () => {
    for (const s of JOB_STATUS_GROUPS.ACTIVE) {
      expect(isJobStatusInGroup(s, JOB_STATUS_GROUPS.ACTIVE)).toBe(true);
    }
  });

  it("identifies terminal job statuses", () => {
    for (const s of JOB_STATUS_GROUPS.TERMINAL) {
      expect(isJobStatusInGroup(s, JOB_STATUS_GROUPS.TERMINAL)).toBe(true);
    }
  });

  it("excludes terminal from active", () => {
    for (const s of JOB_STATUS_GROUPS.TERMINAL) {
      expect(isJobStatusInGroup(s, JOB_STATUS_GROUPS.ACTIVE)).toBe(false);
    }
  });

  it("identifies cancellable job statuses", () => {
    for (const s of JOB_STATUS_GROUPS.CANCELLABLE) {
      expect(isJobStatusInGroup(s, JOB_STATUS_GROUPS.CANCELLABLE)).toBe(true);
    }
  });

  it("excludes completed from cancellable", () => {
    expect(isJobStatusInGroup("completed", JOB_STATUS_GROUPS.CANCELLABLE)).toBe(
      false,
    );
  });
});

describe("JobCreationRequestSchema", () => {
  it("accepts valid minimal job", () => {
    const result = JobCreationRequestSchema.safeParse({
      image: "ubuntu:24.04",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full job spec", () => {
    const result = JobCreationRequestSchema.safeParse({
      image: "nvidia/cuda:12.0-base",
      command: ["python", "train.py"],
      env: { CUDA_VISIBLE_DEVICES: "0" },
      name: "training-job",
      cpus: 4,
      ram: 16,
      gpus: 1,
      disk: 50,
      expose: 8080,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty image", () => {
    const result = JobCreationRequestSchema.safeParse({ image: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing image", () => {
    const result = JobCreationRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("NodeStatusEnum and groups", () => {
  it("parses all node statuses", () => {
    for (const s of ["online", "offline", "draining"]) {
      expect(NodeStatusEnum.safeParse(s).success).toBe(true);
    }
  });

  it("identifies pausable nodes", () => {
    expect(isNodeStatusInGroup("online", NODE_STATUS_GROUPS.PAUSABLE)).toBe(
      true,
    );
    expect(isNodeStatusInGroup("offline", NODE_STATUS_GROUPS.PAUSABLE)).toBe(
      true,
    );
    expect(isNodeStatusInGroup("draining", NODE_STATUS_GROUPS.PAUSABLE)).toBe(
      false,
    );
  });

  it("identifies resumable nodes", () => {
    expect(isNodeStatusInGroup("draining", NODE_STATUS_GROUPS.RESUMABLE)).toBe(
      true,
    );
    expect(isNodeStatusInGroup("online", NODE_STATUS_GROUPS.RESUMABLE)).toBe(
      false,
    );
  });
});

describe("DeviceCodeResponseSchema", () => {
  it("parses valid device code response", () => {
    const result = DeviceCodeResponseSchema.safeParse({
      device_code: "abc123",
      user_code: "ABCD-1234",
      verification_uri: "https://example.com/verify",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing device_code", () => {
    const result = DeviceCodeResponseSchema.safeParse({
      user_code: "ABCD",
      verification_uri: "https://example.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("TokenSuccessResponseSchema / TokenErrorResponseSchema", () => {
  it("parses a success token response", () => {
    const result = TokenSuccessResponseSchema.safeParse({
      access_token: "token123",
    });
    expect(result.success).toBe(true);
  });

  it("parses a token error response", () => {
    const result = TokenErrorResponseSchema.safeParse({
      error: "authorization_pending",
      error_description: "still waiting",
    });
    expect(result.success).toBe(true);
  });
});

describe("UserSchema", () => {
  it("parses valid user", () => {
    const result = UserSchema.safeParse({
      id: "user123",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = UserSchema.safeParse({
      id: "user123",
      name: "Test",
      email: "not-an-email",
      emailVerified: false,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe("SSHKeySchema", () => {
  it("parses valid SSH key", () => {
    const result = SSHKeySchema.safeParse({
      _id: "key1",
      _creationTime: Date.now(),
      userId: "user1",
      name: "my-key",
      publicKey: "ssh-ed25519 AAAA...",
      fingerprint: "SHA256:abc",
      isPrimary: true,
      createdAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });
});

describe("ApiKeySchema", () => {
  it("parses valid API key", () => {
    const result = ApiKeySchema.safeParse({
      _id: "ak1",
      keyPrefix: "uva_",
      name: "test-key",
      createdAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("defaults hasGithubToken to false", () => {
    const result = ApiKeySchema.parse({
      _id: "ak1",
      keyPrefix: "uva_",
      name: "test-key",
      createdAt: Date.now(),
    });
    expect(result.hasGithubToken).toBe(false);
  });
});
