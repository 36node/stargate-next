/**
 * 防抖工具函数
 */

/**
 * 防抖函数返回类型
 */
export type DebouncedFunction<Args extends unknown[]> = {
  (...args: Args): void;
  /** 取消待执行的防抖函数 */
  cancel: () => void;
  /** 立即执行待执行的防抖函数 */
  flush: () => void;
};

type DebounceOptions = {
  /** 是否在延迟开始前调用，默认为 false */
  leading?: boolean;
  /** 是否在延迟结束后调用，默认为 true */
  trailing?: boolean;
};

/**
 * 创建一个防抖函数，在指定的延迟时间内只执行最后一次调用
 *
 * @param fn - 要防抖的函数
 * @param wait - 延迟时间（毫秒），默认为 300ms
 * @param options - 配置选项
 * @param options.leading - 是否在延迟开始前调用，默认为 false
 * @param options.trailing - 是否在延迟结束后调用，默认为 true
 * @returns 防抖后的函数，包含 cancel 和 flush 方法
 *
 * @example
 * // 基本用法
 * const debouncedFn = debounce(() => console.log('called'), 300);
 * debouncedFn(); // 300ms 后执行
 * debouncedFn(); // 重置计时器，再等 300ms
 *
 * @example
 * // 取消执行
 * const debouncedFn = debounce(() => console.log('called'), 300);
 * debouncedFn();
 * debouncedFn.cancel(); // 取消执行
 *
 * @example
 * // 立即执行模式
 * const debouncedFn = debounce(() => console.log('called'), 300, { leading: true });
 * debouncedFn(); // 立即执行
 * debouncedFn(); // 300ms 后执行
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  wait = 300,
  options: DebounceOptions = {}
): DebouncedFunction<Args> {
  const { leading = false, trailing = true } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;
  let lastCallTime: number | undefined;
  let isLeadingInvoked = false;

  function invokeFunc(args: Args) {
    lastArgs = null;
    fn(...args);
  }

  function shouldInvoke(time: number): boolean {
    if (lastCallTime === undefined) {
      return true;
    }
    const timeSinceLastCall = time - lastCallTime;
    return timeSinceLastCall >= wait;
  }

  function trailingEdge() {
    timeoutId = null;
    if (trailing && lastArgs) {
      invokeFunc(lastArgs);
    }
    isLeadingInvoked = false;
  }

  function cancel() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    lastArgs = null;
    lastCallTime = undefined;
    timeoutId = null;
    isLeadingInvoked = false;
  }

  function flush() {
    if (timeoutId !== null && lastArgs) {
      clearTimeout(timeoutId);
      invokeFunc(lastArgs);
      timeoutId = null;
      isLeadingInvoked = false;
    }
  }

  function debounced(...args: Args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking && leading && !isLeadingInvoked) {
      isLeadingInvoked = true;
      invokeFunc(args);
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(trailingEdge, wait);
  }

  debounced.cancel = cancel;
  debounced.flush = flush;

  return debounced;
}
