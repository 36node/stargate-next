"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/packages/ui/components/input";
import { useDebounce } from "@/packages/ui/hooks/use-debounce";
import { cn } from "@/packages/ui/lib/utils";
import type { TreeProps, TreeRef } from "./tree";
import { Tree } from "./tree";
import type { TreeNodeData } from "./types";

// 默认过滤函数
const defaultFilterTreeNode = <T,>(
  node: TreeNodeData<T>,
  searchValue: string
): boolean => {
  if (!searchValue) {
    return true;
  }
  const nodeMatches = node.name
    .toLowerCase()
    .includes(searchValue.toLowerCase());

  // 如果当前节点匹配，返回 true
  if (nodeMatches) {
    return true;
  }

  // 如果子节点中有匹配的，也返回 true
  if (node.children) {
    return node.children.some((child) =>
      defaultFilterTreeNode(child, searchValue)
    );
  }

  return false;
};

// 过滤树数据
const filterTreeData = <T,>(
  data: TreeNodeData<T>[],
  search: string,
  filterFn: (node: TreeNodeData<T>, searchValue: string) => boolean
): TreeNodeData<T>[] => {
  if (!search) {
    return data;
  }

  return data.reduce<TreeNodeData<T>[]>((acc, node) => {
    if (filterFn(node, search)) {
      const filteredChildren = node.children
        ? filterTreeData(node.children, search, filterFn)
        : undefined;

      acc.push({
        ...node,
        children: filteredChildren,
      });
    }
    return acc;
  }, []);
};

export type TreeCommandProps<
  TData = unknown,
  TMultiple extends boolean = false,
> = Omit<TreeProps<TData, TMultiple>, "data"> & {
  // TreeCommand 特有的属性
  data: TreeNodeData<TData>[];
  searchPlaceholder?: string;
  className?: string;

  // 过滤相关
  filterTreeNode?: (node: TreeNodeData<TData>, searchValue: string) => boolean;
  onSearch?: (value: string) => void;
};

export function TreeCommand<
  TData = unknown,
  TMultiple extends boolean = false,
>({
  // TreeCommand 属性
  searchPlaceholder = "搜索...",
  className,
  filterTreeNode = defaultFilterTreeNode,
  onSearch,

  // Tree 属性
  data,
  ...treeProps
}: TreeCommandProps<TData, TMultiple>) {
  const [searchValue, setSearchValue] = useState<string | undefined>(undefined);
  const [filteredData, setFilteredData] = useState(data);
  const treeRef = useRef<TreeRef>(null);
  const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useDebounce(
    () => {
      if (searchValue === undefined) {
        return;
      }

      const newData = filterTreeData(data, searchValue, filterTreeNode);
      setFilteredData(newData);
      onSearch?.(searchValue);

      // 清除之前的展开定时器
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
        expandTimeoutRef.current = null;
      }

      // 延迟执行展开/收起操作
      expandTimeoutRef.current = setTimeout(() => {
        if (treeRef.current) {
          if (searchValue.trim()) {
            treeRef.current.expandAll();
          } else {
            treeRef.current.resetExpand();
          }
        }
        expandTimeoutRef.current = null; // 清除引用
      }, 30);
    },
    200,
    [searchValue]
  );

  // 组件卸载时清除定时器
  useEffect(
    () => () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    },
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
  };

  const emptyText =
    searchValue && data.length > 0 ? "未找到匹配项" : "暂无数据";

  return (
    <div className={cn("w-full", className)}>
      {/* 搜索框 */}
      <div
        className="flex h-9 items-center gap-2 border-b"
        data-slot="command-input-wrapper"
      >
        <Input
          className="border-0 pl-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onChange={handleInputChange}
          placeholder={searchPlaceholder}
          prefix={<Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
          value={searchValue}
        />
      </div>

      {/* 树形列表 */}
      <div className="max-h-64 overflow-y-auto p-1">
        <Tree
          {...treeProps}
          data={filteredData}
          emptyText={emptyText}
          ref={treeRef}
          showSelectedIcon
        />
      </div>
    </div>
  );
}
