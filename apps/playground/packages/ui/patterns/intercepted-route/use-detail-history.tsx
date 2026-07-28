"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STORAGE_KEY = "intercepted_route_history_stack";

type HistoryEntry = {
  pathname: string;
  search: string;
};

type PushOptions = {
  /**
   * 用于同级 Tab 切换的路径前缀
   * 如果当前 pathname 以此前缀开头，且栈顶记录也以此前缀开头，则替换而不是新增
   * 这样在 Tab 切换时不会产生多条历史记录，返回时可以直接跳过 Tab 切换历史
   */
  levelPathPrefix?: string;
};

/**
 * useDetailHistory - 管理详情页的历史记录（支持多层堆叠）
 *
 * 使用栈结构保存历史记录，支持 A → B → C 的堆叠场景
 * 返回时依次回到上一层：C → B → A
 *
 * 特殊处理同级 Tab 切换：
 * - 如果 pathname 相同（仅 search params 不同），会替换栈顶而不是新增
 * - 如果指定了 levelPathPrefix，且当前和栈顶都匹配该前缀，也会替换而不是新增
 * - 这样在同一页面内切换 Tab 时，返回可以直接跳过中间的 Tab 状态
 *
 * @example
 * ```tsx
 * // 在链接组件中保存当前页面
 * const history = useDetailHistory();
 * <Link onClick={() => history.push()}>查看详情</Link>
 *
 * // 在 Tab 切换时，使用 levelPathPrefix 避免产生多条历史
 * <Link onClick={() => history.push({ levelPathPrefix: '/user/' })}>订单 Tab</Link>
 *
 * // 在返回按钮中回到上一层
 * const history = useDetailHistory();
 * <button onClick={() => router.push(history.pop('/default'))}>返回</button>
 * ```
 */
export function useDetailHistory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * 获取当前历史栈
   */
  const getStack = useCallback((): HistoryEntry[] => {
    try {
      const stackJson = sessionStorage.getItem(STORAGE_KEY);
      return stackJson ? JSON.parse(stackJson) : [];
    } catch {
      return [];
    }
  }, []);

  /**
   * 保存历史栈
   */
  const setStack = useCallback((stack: HistoryEntry[]) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    } catch (error) {
      console.error("Failed to save history stack:", error);
    }
  }, []);

  /**
   * 将当前页面压入历史栈
   *
   * @param options.levelPathPrefix - 同级路径前缀，用于判断是否为同级 Tab 切换
   */
  const push = useCallback(
    (options?: PushOptions) => {
      try {
        const stack = getStack();
        const current: HistoryEntry = {
          pathname,
          search: searchParams.toString(),
        };

        const lastEntry = stack.at(-1);

        // 避免重复压入完全相同的页面
        if (
          lastEntry?.pathname === current.pathname &&
          lastEntry?.search === current.search
        ) {
          return;
        }

        // 检查是否应该替换栈顶而不是新增（同级 Tab 切换场景）
        const shouldReplace =
          lastEntry &&
          // 场景1: pathname 相同，仅 search params 不同（Tab 使用 query params）
          (lastEntry.pathname === current.pathname ||
            // 场景2: 指定了 levelPathPrefix，且当前和栈顶都匹配该前缀
            (options?.levelPathPrefix &&
              current.pathname.startsWith(options.levelPathPrefix) &&
              lastEntry.pathname.startsWith(options.levelPathPrefix)));

        if (shouldReplace) {
          // 替换栈顶记录
          stack[stack.length - 1] = current;
        } else {
          // 新增记录
          stack.push(current);
        }

        setStack(stack);
      } catch (error) {
        console.error("Failed to push to history:", error);
      }
    },
    [pathname, searchParams, getStack, setStack]
  );

  /**
   * 从历史栈弹出并返回上一个页面
   *
   * @param defaultPath - 如果栈为空时使用的默认路径
   * @returns 要跳转的完整 URL
   */
  const pop = useCallback(
    (defaultPath: string): string => {
      try {
        const stack = getStack();

        if (stack.length > 0) {
          const entry = stack.pop();
          setStack(stack);
          if (entry) {
            return entry.pathname + (entry.search ? `?${entry.search}` : "");
          }
        }

        return defaultPath;
      } catch (error) {
        console.error("Failed to pop from history:", error);
        return defaultPath;
      }
    },
    [getStack, setStack]
  );

  /**
   * 清空历史栈
   */
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear history:", error);
    }
  }, []);

  /**
   * 检查历史栈是否有记录
   */
  const hasHistory = useCallback(
    (): boolean => getStack().length > 0,
    [getStack]
  );

  /**
   * 获取历史栈长度
   */
  const getDepth = useCallback((): number => getStack().length, [getStack]);

  // 兼容旧 API
  const saveBase = push;
  const backToBase = pop;
  const hasBase = hasHistory;

  return {
    // 新 API（栈操作）
    push,
    pop,
    clear,
    hasHistory,
    getDepth,
    // 兼容旧 API
    saveBase,
    backToBase,
    hasBase,
  };
}
