import { useEffect, useRef } from 'react';

/**
 * useDebounce hook - 延迟执行回调函数
 * @param callback 要执行的回调函数
 * @param delay 延迟时间（毫秒）
 * @param deps 依赖数组
 */
export function useDebounce(
  callback: () => void,
  delay: number,
  deps: unknown[]
): void {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 更新 callback ref
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 设置新的定时器
    timeoutRef.current = setTimeout(() => {
      callbackRef.current();
    }, delay);

    // 清理函数
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
