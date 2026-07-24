"use client";

import { Button, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { Tree, type TreeNodeData } from "@repo/ui/components/tree";
import { cn } from "@repo/ui/lib/utils";
import type { Column, Table } from "@tanstack/react-table";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { getColumnDisplayName } from "./utils";

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>;
  className?: string;
};

function isGroup<TData>(column: Column<TData, unknown>) {
  return column.columns && column.columns.length > 0;
}

function isToggleable<TData>(column: Column<TData, unknown>) {
  return (
    column.getCanHide() &&
    (typeof column.accessorFn !== "undefined" || isGroup(column))
  );
}

function isVisible<TData>(column: Column<TData, unknown>) {
  return isToggleable(column) && column.getIsVisible();
}

export function DataTableViewOptions<TData>({
  table,
  className,
}: DataTableViewOptionsProps<TData>) {
  const [open, setOpen] = useState(false);

  // 将表头列转换为树结构
  const treeData = useMemo(() => {
    const buildTree = (columns: Column<TData, unknown>[]): TreeNodeData[] => {
      return columns.filter(isToggleable).map((column) => {
        if (isGroup(column)) {
          // 分组列
          return {
            key: column.id,
            name: getColumnDisplayName(column),
            children: buildTree(column.columns),
          };
        }
        // 叶子列
        return {
          key: column.id,
          name: getColumnDisplayName(column),
        };
      });
    };

    return buildTree(table.getAllColumns());
  }, [table]);

  // 获取当前可见的列 keys（实时更新）
  const visibleKeys = table
    .getAllLeafColumns()
    .filter(isVisible)
    .map((column) => column.id);

  // 处理选择变化
  const handleSelectionChange = (selectedKeys: string[]) => {
    // 获取所有可隐藏的叶子列
    const allLeafColumns = table.getAllLeafColumns().filter(isToggleable);

    // 构建新的 visibility 状态对象
    const newVisibility: Record<string, boolean> = {};
    for (const column of allLeafColumns) {
      newVisibility[column.id] = selectedKeys.includes(column.id);
    }

    // 一次性更新所有列的可见性
    table.setColumnVisibility(newVisibility);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="h-8 w-8" size="icon" title="筛选列" variant="ghost">
          <SlidersHorizontal
            className="size-4 text-foreground/80 hover:text-foreground"
            strokeWidth={1.5}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("w-40 p-0", className)}>
        <div className="border-b p-3">
          <h4 className="font-medium text-sm">显示数据选项</h4>
        </div>
        <div className="scrollbar-custom max-h-[calc(100vh-340px)] overflow-auto p-2">
          <Tree
            data={treeData}
            defaultExpandAll
            multiple
            onSelectionChange={handleSelectionChange}
            selection={visibleKeys}
            showCheckbox
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
