"use client";

import { Button } from "@repo/ui/components/shadcn/button";
import { cn } from "@repo/ui/lib/utils";
import type { Table } from "@tanstack/react-table";
import { RotateCwIcon } from "lucide-react";
import { useCallback } from "react";

type DataTableRefreshProps<TData = unknown> = {
  className?: string;
  /** table 实例，通过 meta.refresh 触发刷新 */
  table: Table<TData>;
};

/**
 * 通用数据表格刷新按钮
 *
 * 通过 table.options.meta.refresh() 触发刷新，复用 useSearch 的
 * startTransition，与分页/排序/筛选走同一条 isPending → pending 路径，
 * 自动触发表格 loading 遮罩。
 *
 * 按钮状态与 table.options.meta.pending 同步：
 * - 点击后旋转动画持续到数据返回（pending 变为 false），与表格遮罩一致
 * - pending 期间按钮 disabled，天然防止重复点击
 * - useSearch 内置 15s 超时安全网，从根本上消除按钮卡死的可能性
 */
export function DataTableRefresh<TData = unknown>({
  className,
  table,
}: DataTableRefreshProps<TData>) {
  const pending = !!table.options.meta?.pending;

  const handleClick = useCallback(() => {
    if (pending) {
      return;
    }
    table.options.meta?.refresh?.();
  }, [table, pending]);

  return (
    <Button
      className={className ?? "h-8 w-8"}
      disabled={pending}
      onClick={handleClick}
      size="icon"
      title="刷新"
      variant="ghost"
    >
      <RotateCwIcon
        className={cn(
          "size-4 text-foreground/80 hover:text-foreground",
          pending && "animate-spin"
        )}
        strokeWidth={1.5}
      />
    </Button>
  );
}
