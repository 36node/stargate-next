import { BadRequestException } from "@nestjs/common";
import type {
  RequestContext,
  StargateErrorCode,
} from "@repo/stargate-service/contracts";
import type { Request } from "express";

const PAGE_LIMIT_DEFAULT = 10;
const PAGE_LIMIT_MAX = 100;

type BodyErrorCode =
  | "BATCH_INVALID"
  | "BODY_INVALID"
  | "PASSWORD_INVALID"
  | "PATCH_INVALID";

function badRequest(code: StargateErrorCode, message: string): never {
  throw new BadRequestException({ code, message });
}

export function requestContext(request: Request): RequestContext {
  const forwardedFor = request.headers["x-forwarded-for"];
  return {
    ip:
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : request.ip,
    requestId:
      typeof request.headers["x-request-id"] === "string"
        ? request.headers["x-request-id"]
        : undefined,
    userAgent:
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : undefined,
  };
}

export function tenantHeader(request: Request): string | undefined {
  return request.header("x-tenant-id");
}

export function singleQueryValue(value: unknown): string | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    badRequest("PAGE_INVALID", "query parameter must occur at most once");
  }
  return value;
}

export function parsePage(
  offsetValue?: unknown,
  limitValue?: unknown
): { limit: number; offset: number } {
  const offsetRaw = singleQueryValue(offsetValue) ?? "0";
  const limitRaw = singleQueryValue(limitValue) ?? String(PAGE_LIMIT_DEFAULT);
  const offset = Number(offsetRaw);
  const limit = Number(limitRaw);
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > PAGE_LIMIT_MAX
  ) {
    badRequest(
      "PAGE_INVALID",
      "page[offset] must be non-negative and page[limit] must be 1..100"
    );
  }
  return { limit, offset };
}

export function plainObjectBody(
  body: unknown,
  code: BodyErrorCode
): Record<string, unknown> {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    badRequest(code, "request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function allowedKeysOnly(
  body: Record<string, unknown>,
  keys: string[],
  code: BodyErrorCode
): void {
  const allowed = new Set(keys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    badRequest(code, "request body contains unsupported fields");
  }
}

export function optionalString(
  value: unknown,
  code: BodyErrorCode
): string | undefined {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string") {
    badRequest(code, "field must be a string");
  }
  return value;
}

export function optionalNullableString(
  value: unknown,
  code: BodyErrorCode
): string | null | undefined {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    badRequest(code, "field must be a string or null");
  }
  return value;
}
