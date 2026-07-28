/**
 * Server Action 统一错误处理工具
 *
 * 通过 `makeAction` 注入 `errorMap`，返回 app 级的 `createAction`。
 *
 * @example
 * ```ts
 * // apps/playground/lib/action.ts
 * import { makeAction } from "@/packages/lib/action";
 *
 * export const createAction = makeAction({
 *   errorMap: {
 *     NOT_FOUND: "记录不存在",
 *     SONG_NOT_FOUND: "歌曲不存在",
 *   },
 * });
 * ```
 */

import errorLib from "@/packages/lib/error";

const { normalizeError } = errorLib;

/** 结构化错误信息 */
export type ActionError = {
  code: string;
  message: string;
  details?: Record<string, string>;
};

/** Action 返回结果（Discriminated Union） */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: ActionError };

export type ActionConfig = {
  /** 错误码 → 本地化消息映射 */
  errorMap?: Record<string, string>;
};

function mapErrorDetails(
  details: unknown,
  errorMap?: Record<string, string>
): Record<string, string> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return;
  }

  const normalized = Object.fromEntries(
    Object.entries(details).flatMap(([field, value]) => {
      if (typeof value !== "string" || value.length === 0) {
        return [];
      }

      return [[field, errorMap?.[value] ?? value]];
    })
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * 创建 app 级 actionCreator
 *
 * 注入 errorMap 后返回 createAction 函数，
 * 内部通过 normalizeError 统一归一化错误（Prisma → 语义码、Error → 提取 code），
 * 再查 errorMap 获取本地化 message。
 */
export function makeAction(config?: ActionConfig) {
  const { errorMap } = config ?? {};

  return <Args extends unknown[], R>(
    fn: (...args: Args) => Promise<R>
  ): ((...args: Args) => Promise<ActionResult<R>>) =>
    async (...args: Args): Promise<ActionResult<R>> => {
      try {
        const data = await fn(...args);
        return { success: true, data };
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") {
          throw e;
        }

        const err = normalizeError(e);
        const details = mapErrorDetails(err.details, errorMap);
        return {
          success: false,
          error: {
            code: err.code,
            message: errorMap?.[err.code] ?? err.message,
            ...(details && { details }),
          },
        };
      }
    };
}
