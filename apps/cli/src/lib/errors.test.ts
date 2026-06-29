import { describe, it, expect } from "bun:test";
import {
  VMError,
  VMAuthError,
  VMNotFoundError,
  VMServerError,
  VMOperationError,
  VMValidationError,
  VMNetworkError,
  ServiceUnavailableError,
  shouldStopRetrying,
  isTransientError,
  parseErrorResponse,
} from "./errors";

describe("VMError", () => {
  it("stores message, code, and statusCode", () => {
    const err = new VMError("test", "TEST_CODE", 400);
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("VMError");
  });

  it("is instanceof Error", () => {
    const err = new VMError("test", "CODE");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof VMError).toBe(true);
  });
});

describe("VMAuthError", () => {
  it("sets AUTH_ERROR code", () => {
    const err = new VMAuthError("unauthorized", 401);
    expect(err.code).toBe("AUTH_ERROR");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("VMAuthError");
  });

  it("is instanceof VMError", () => {
    expect(new VMAuthError("msg", 403) instanceof VMError).toBe(true);
  });
});

describe("VMNotFoundError", () => {
  it("sets NOT_FOUND code and 404 status", () => {
    const err = new VMNotFoundError("not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("VMNotFoundError");
  });
});

describe("VMServerError", () => {
  it("sets SERVER_ERROR code", () => {
    const err = new VMServerError("internal error", 500);
    expect(err.code).toBe("SERVER_ERROR");
    expect(err.statusCode).toBe(500);
  });
});

describe("VMOperationError", () => {
  it("sets OPERATION_FAILED code with no statusCode", () => {
    const err = new VMOperationError("op failed");
    expect(err.code).toBe("OPERATION_FAILED");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("VMValidationError", () => {
  it("sets VALIDATION_ERROR code", () => {
    const err = new VMValidationError("invalid input");
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("VMNetworkError", () => {
  it("sets NETWORK_ERROR code", () => {
    const err = new VMNetworkError("timeout");
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("ServiceUnavailableError", () => {
  it("returns correct message for down status", () => {
    const err = new ServiceUnavailableError("down");
    expect(err.message).toContain("offline");
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns correct message for degraded status", () => {
    const err = new ServiceUnavailableError("degraded");
    expect(err.message).toContain("experiencing issues");
  });

  it("returns correct message for operational status", () => {
    const err = new ServiceUnavailableError("operational");
    expect(err.message).toContain("transient issue");
  });

  it("returns fallback message for null status", () => {
    const err = new ServiceUnavailableError(null);
    expect(err.message).toContain("Network error");
  });
});

describe("shouldStopRetrying", () => {
  it("returns true for VMAuthError", () => {
    expect(shouldStopRetrying(new VMAuthError("auth", 401))).toBe(true);
  });

  it("returns true for VMOperationError", () => {
    expect(shouldStopRetrying(new VMOperationError("op"))).toBe(true);
  });

  it("returns true for VMValidationError", () => {
    expect(shouldStopRetrying(new VMValidationError("val"))).toBe(true);
  });

  it("returns true for VMNetworkError", () => {
    expect(shouldStopRetrying(new VMNetworkError("net"))).toBe(true);
  });

  it("returns false for VMServerError", () => {
    expect(shouldStopRetrying(new VMServerError("server", 500))).toBe(false);
  });

  it("returns false for VMNotFoundError", () => {
    expect(shouldStopRetrying(new VMNotFoundError("nf"))).toBe(false);
  });

  it("returns false for generic Error", () => {
    expect(shouldStopRetrying(new Error("generic"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(shouldStopRetrying("string error")).toBe(false);
    expect(shouldStopRetrying(null)).toBe(false);
  });
});

describe("isTransientError", () => {
  it("returns true for VMNotFoundError", () => {
    expect(isTransientError(new VMNotFoundError("nf"))).toBe(true);
  });

  it("returns true for VMServerError", () => {
    expect(isTransientError(new VMServerError("server", 502))).toBe(true);
  });

  it("returns false for VMAuthError", () => {
    expect(isTransientError(new VMAuthError("auth", 401))).toBe(false);
  });

  it("returns false for generic Error", () => {
    expect(isTransientError(new Error("generic"))).toBe(false);
  });
});

describe("parseErrorResponse", () => {
  it("returns VMAuthError for 401", async () => {
    const response = new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMAuthError);
    expect(err.statusCode).toBe(401);
  });

  it("returns VMAuthError for 403", async () => {
    const response = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMAuthError);
    expect(err.statusCode).toBe(403);
  });

  it("returns VMNotFoundError for 404", async () => {
    const response = new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMNotFoundError);
  });

  it("returns VMServerError for 500+", async () => {
    const response = new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMServerError);
  });

  it("returns VMError for other status codes", async () => {
    const response = new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMError);
    expect(err.code).toBe("HTTP_ERROR");
    expect(err.statusCode).toBe(400);
  });

  it("prefers msg over error for message", async () => {
    const response = new Response(
      JSON.stringify({ error: "generic", msg: "specific message" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
    const err = await parseErrorResponse(response);
    expect(err.message).toBe("specific message");
  });

  it("handles non-JSON responses gracefully", async () => {
    const response = new Response("not json", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
    const err = await parseErrorResponse(response);
    expect(err).toBeInstanceOf(VMServerError);
    expect(err.message).toBe("Failed to parse error response");
  });
});
