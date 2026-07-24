"use client";

import { cn } from "@repo/ui/lib/utils";
import type { ComponentProps } from "react";

import { useOverflowTitle } from "../hooks/use-overflow-title";

/**
 * 文本截断组件，仅在文本溢出（出现省略号）时显示原生 title tooltip
 *
 * 自动添加 `truncate` 样式，调用方只需指定宽度约束即可
 *
 * @example
 * <Truncatable className="max-w-xs">{value}</Truncatable>
 */
export function Truncatable({
  children,
  className,
  ...props
}: ComponentProps<"span">) {
  const text = typeof children === "string" ? children : "";
  const titleRef = useOverflowTitle(text);

  return (
    <span className={cn("block truncate", className)} ref={titleRef} {...props}>
      {children}
    </span>
  );
}
