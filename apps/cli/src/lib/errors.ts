import { z } from "zod";

export const ApiErrorResponseSchema = z.object({
  error: z.string().optional(),
  msg: z.string().optional(),
  status: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export class VMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VMAuthError extends VMError {
  constructor(message: string, statusCode: number) {
    super(message, "AUTH_ERROR", statusCode);
  }
}

export class VMNotFoundError extends VMError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}

export class VMServerError extends VMError {
  constructor(message: string, statusCode: number) {
    super(message, "SERVER_ERROR", statusCode);
  }
}

export class VMOperationError extends VMError {
  constructor(message: string) {
    super(message, "OPERATION_FAILED");
  }
}

export class VMValidationError extends VMError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class VMNetworkError extends VMError {
  constructor(message: string) {
    super(message, "NETWORK_ERROR");
  }
}

export function shouldStopRetrying(error: unknown): boolean {
  if (error instanceof VMAuthError) return true;
  if (error instanceof VMOperationError) return true;
  if (error instanceof VMValidationError) return true;
  if (error instanceof VMNetworkError) return true;

  return false;
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof VMNotFoundError) return true;
  if (error instanceof VMServerError) return true;

  return false;
}

export async function parseErrorResponse(response: Response): Promise<VMError> {
  let errorData: ApiErrorResponse;

  try {
    const rawData = await response.json();
    errorData = ApiErrorResponseSchema.parse(rawData);
  } catch {
    errorData = {
      error: "Unknown error",
      msg: "Failed to parse error response",
    };
  }

  const message = errorData.msg || errorData.error || "Unknown error";
  const statusCode = response.status;

  if (statusCode === 401 || statusCode === 403) {
    return new VMAuthError(message, statusCode);
  }

  if (statusCode === 404) {
    return new VMNotFoundError(message);
  }

  if (statusCode >= 500) {
    return new VMServerError(message, statusCode);
  }

  return new VMError(message, "HTTP_ERROR", statusCode);
}
