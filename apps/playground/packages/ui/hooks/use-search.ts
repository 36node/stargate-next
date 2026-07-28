"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { isEmpty } from "@/packages/lib/lang";

import { useUpdateEffect } from "./use-update-effect";

type UseSearchOptions = {
  /** 是否在参数变化时滚动到页面顶部，默认为 false */
  scroll?: boolean;
};

type SetSearch<T> = {
  (params: Partial<T>): void;
  (updater: (old: T) => Partial<T>): void;
};

/**
 * 将 URLSearchParams 转换为普通对象，支持多值参数
 */
function parseSearchParams(searchParams: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  searchParams.forEach((value, key) => {
    if (result[key]) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * 生成查询字符串，过滤空值，支持数组参数
 */
function generateQueryString(data: Record<string, any>): string {
  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (isEmpty(value)) return;

    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (!isEmpty(v)) params.append(key, String(v));
      });
    } else {
      params.append(key, String(value));
    }
  });

  return params.toString();
}

/** isPending 卡死时的超时恢复时间（毫秒） */
const STUCK_TIMEOUT_MS = 15_000;

/** 重复查询去重的时间窗口（毫秒）：窗口内相同条件的查询会被跳过 */
const DEDUP_WINDOW_MS = 5_000;

/**
 * useSearch Hook
 *
 * 用于处理 URL 搜索参数的 React Hook
 *
 * 内置超时安全网：如果 transition 卡死超过 15s，自动恢复 pending 为 false，
 * 避免表格 loading 遮罩永远挡住界面。
 *
 * @example
 * const [search, setSearch, pending, refresh] = useSearch<{ page: number; q: string }>();
 *
 * // 直接设置
 * setSearch({ page: 2 });
 *
 * // 使用 updater 函数
 * setSearch((old) => ({ page: old.page + 1 }));
 *
 * // 手动刷新（复用同一个 startTransition，走同一条 isPending 路径）
 * refresh();
 */
export function useSearch<T extends Record<string, any>>(
  options: UseSearchOptions = {}
): [T, SetSearch<T>, boolean, () => void] {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { scroll = false } = options;
  const searchParams = useSearchParams();

  const [search, setSearchState] = useState<T>(
    () => parseSearchParams(searchParams) as T
  );

  // 超时安全网：如果 isPending 卡死超过阈值，强制恢复 loading 状态
  const [isTimedOut, setIsTimedOut] = useState(false);
  useEffect(() => {
    if (isPending) {
      setIsTimedOut(false);
      const timer = setTimeout(() => {
        setIsTimedOut(true);
        toast.error("请求超时，请检查网络后重试");
      }, STUCK_TIMEOUT_MS);
      return () => clearTimeout(timer);
    }
    setIsTimedOut(false);
  }, [isPending]);

  // 用于标记是否是内部触发的 URL 变化，避免重复执行
  const isInternalUpdate = useRef(false);

  // 监听外部 URL 变化（如浏览器前进/后退）并同步到 state
  // 使用 toString() 确保只有参数真正变化时才触发
  useUpdateEffect(() => {
    // 跳过内部触发的 URL 变化
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const newSearch = parseSearchParams(searchParams) as T;
    if (JSON.stringify(newSearch) !== JSON.stringify(search)) {
      setSearchState(newSearch);
    }
  }, [searchParams.toString()]);

  // 使用 ref 存储最新的 search 状态，用于在 setSearch 中计算新值
  const searchRef = useRef(search);
  searchRef.current = search;

  // 去重：记录上一次查询的序列化 key 和时间戳
  const lastSearchRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  });

  const setSearch = useCallback(
    (paramsOrUpdater: Partial<T> | ((old: T) => Partial<T>)) => {
      const prev = searchRef.current;
      const newParams =
        typeof paramsOrUpdater === "function"
          ? paramsOrUpdater(prev)
          : paramsOrUpdater;

      const merged = { ...prev, ...newParams } as T;

      // 时间窗口去重：相同条件在窗口内不重复触发查询
      const mergedKey = JSON.stringify(merged);
      const now = Date.now();
      if (
        mergedKey === lastSearchRef.current.key &&
        now - lastSearchRef.current.time < DEDUP_WINDOW_MS
      ) {
        return;
      }
      lastSearchRef.current = { key: mergedKey, time: now };

      // 标记为内部更新
      isInternalUpdate.current = true;

      // 更新状态
      setSearchState(merged);

      // 更新路由（在 state updater 外部执行）
      const queryString = generateQueryString(merged);
      startTransition(() => router.push(`?${queryString}`, { scroll }));
    },
    [router, scroll]
  );

  // 手动刷新：复用同一个 startTransition，走同一条 isPending → pending 路径
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return [search, setSearch, isPending && !isTimedOut, refresh];
}
