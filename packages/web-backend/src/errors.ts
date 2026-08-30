import type { ApiErrorCode } from "./types.js";

export class BackendError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BackendError";
  }
}
