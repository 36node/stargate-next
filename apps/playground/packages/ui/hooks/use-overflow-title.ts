"use client";

import { useCallback, useRef } from "react";

/**
 * 仅在文本溢出（出现省略号截断）时才显示原生 title tooltip
 *
 * 通过 ref callback 自动挂载 mouseenter 事件监听，无需在 JSX 上绑定事件属性
 *
 * @example
 * const titleRef = useOverflowTitle(value);
 * return <span ref={titleRef} className="truncate">{value}</span>
 */
export function useOverflowTitle(title: string) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      // 清理上一次的监听器
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (el) {
        const handler = () => {
          el.title = el.scrollWidth > el.clientWidth ? title : "";
        };
        el.addEventListener("mouseenter", handler);
        cleanupRef.current = () =>
          el.removeEventListener("mouseenter", handler);
      }
    },
    [title]
  );

  return ref;
}
