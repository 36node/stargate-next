import type { StargateErrorCategory, StargateErrorCode } from "./contracts";

export class StargateServiceError extends Error {
  readonly code: StargateErrorCode;
  readonly category: StargateErrorCategory;

  constructor(
    code: StargateErrorCode,
    message: string,
    category: StargateErrorCategory
  ) {
    super(message);
    this.code = code;
    this.category = category;
    this.name = "StargateServiceError";
  }
}

export function serviceError(
  code: StargateErrorCode,
  message: string,
  category: StargateErrorCategory
): StargateServiceError {
  return new StargateServiceError(code, message, category);
}
