/**
 * 服务层统一错误类
 *
 * 用于在 service 层抛出结构化的业务错误，
 * 由 action 层（makeAction）统一捕获并转换为 ActionResult。
 */
export class ServiceError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Prisma 错误码 → 语义码（duck typing，不依赖 @prisma/client）
 *
 * @see https://www.prisma.io/docs/orm/reference/error-reference
 */
const PRISMA_ERROR_CODES: Record<string, string> = {
  P2002: "UNIQUE_CONSTRAINT",
  P2025: "NOT_FOUND",
};

function isPrismaError(error: unknown): boolean {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as Record<string, unknown>).code === "string" &&
    (error as { code: string }).code in PRISMA_ERROR_CODES
  );
}

function isErrorLike(error: unknown): boolean {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as Record<string, unknown>).code === "string"
  );
}

/**
 * 将任意错误归一化为 ServiceError
 *
 * 归一化优先级：
 * 1. ServiceError → 原样返回
 * 2. Prisma 已知错误 → 映射为语义码（NOT_FOUND / UNIQUE_CONSTRAINT）
 * 3. Error 实例 → 提取 code + message
 * 4. 带 code + message 的普通对象（如 API 错误响应）→ 提取 code + message
 * 5. 其他 → INTERNAL_ERROR 兜底
 */
export function normalizeError(error: unknown): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }
  if (isPrismaError(error)) {
    const code = PRISMA_ERROR_CODES[(error as { code: string }).code];
    return new ServiceError(code);
  }
  if (error instanceof Error) {
    const obj = error as unknown as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : "INTERNAL_ERROR";
    const details = obj.details;
    return new ServiceError(code, error.message, details);
  }
  if (isErrorLike(error)) {
    const { code, message, details } = error as Record<string, unknown>;
    return new ServiceError(
      String(code),
      typeof message === "string" ? message : String(code),
      details
    );
  }
  return new ServiceError("INTERNAL_ERROR");
}

/**
 * 将任意错误归一化并抛出
 *
 * 在 service 层可选使用，对 Prisma 等底层错误做统一转换。
 * makeAction 内部也会调用 normalizeError 做兜底，因此 service 层不必强制使用此函数。
 */
export function throwServiceError(error: unknown): never {
  throw normalizeError(error);
}

/** 默认导出，供 ESM 下 CJS 互操作使用（default = module.exports） */
export default { ServiceError, normalizeError, throwServiceError };
