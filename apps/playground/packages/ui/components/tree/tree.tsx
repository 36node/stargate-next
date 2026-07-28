"use client";

import { Check, ChevronDown, ChevronRight } from "lucide-react";
import React, { useCallback, useImperativeHandle, useMemo } from "react";

import { isEmpty } from "@/packages/lib/lang";
import { useControl } from "@/packages/ui/hooks/use-control";
import { cn } from "@/packages/ui/lib/utils";
import type { RenderNodeItemProps, TreeNodeData } from "./types";
import {
  getAllKeys,
  getAllLeafKeys,
  getExpandedKeysForSelection,
  getNodeCheckState,
} from "./utils";

// Tree 组件 ref 类型
export type TreeRef = {
  setExpandedKeys: (keys: string[]) => void;
  getExpandedKeys: () => string[];
  expand: (key: string) => void;
  collapse: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  resetExpand: () => void;
};

// Tree 组件的 props 类型
export type TreeProps<TData = unknown, TMultiple extends boolean = false> = {
  className?: string;
  nodeClassName?: string;
  expandIcons?: React.ReactNode[];
  data: TreeNodeData<TData>[];
  multiple?: TMultiple;
  selection?: TMultiple extends true ? string[] : string | null;
  onSelectionChange?: (
    selection: TMultiple extends true ? string[] : string | null
  ) => void;
  expandedKeys?: string[];
  onExpandedChange?: (expandedKeys: string[]) => void;
  showCheckbox?: boolean;
  showSelectedIcon?: boolean;
  defaultExpandAll?: boolean;
  defaultExpandedKeys?: string[];
  defaultSelection?: TMultiple extends true ? string[] : string;
  onNodeClick?: (node: TreeNodeData<TData>, event: React.MouseEvent) => void;
  renderNodeItem?: (props: RenderNodeItemProps<TData>) => React.ReactNode;
  emptyText?: string;
  /** 判断节点是否可选，返回 false 时点击节点将展开/收起而非选中 */
  isNodeSelectable?: (node: TreeNodeData<TData>) => boolean;
};

// 辅助函数：判断节点是否有子节点
function checkHasChildren<TData>(node: TreeNodeData<TData>): boolean {
  return (
    node.isLeaf === false ||
    (node.isLeaf === undefined && !!node.children && node.children.length > 0)
  );
}

// 辅助函数：获取展开/收起图标
function getExpandIcon(
  isExpanded: boolean,
  expandIcons?: React.ReactNode[]
): React.ReactNode {
  if (isExpanded) {
    return expandIcons?.[0] ?? <ChevronDown className="size-4" />;
  }
  return expandIcons?.[1] ?? <ChevronRight className="size-4" />;
}

// 辅助函数：将 selection 转换为数组
function toSelectionArray(
  selection: string[] | string | null | undefined
): string[] {
  if (Array.isArray(selection)) {
    return selection;
  }
  return selection ? [selection] : [];
}

// 辅助函数：计算节点选中状态
function computeNodeSelection<TData>(
  node: TreeNodeData<TData>,
  selectionArray: string[],
  multiple: boolean | undefined,
  hasChildren: boolean
): { isSelected: boolean; isIndeterminate: boolean } {
  if (multiple && hasChildren) {
    const { checked, indeterminate } = getNodeCheckState(node, selectionArray);
    return { isSelected: checked, isIndeterminate: indeterminate };
  }
  return {
    isSelected: selectionArray.includes(node.key),
    isIndeterminate: false,
  };
}

// 树节点组件
function TreeNode<TData = unknown, TMultiple extends boolean = false>({
  className,
  expandIcons,
  node,
  level,
  selection,
  expandedKeys,
  multiple,
  showCheckbox,
  showSelectedIcon = false,
  onToggleExpand,
  onToggleSelect,
  onNodeClick,
  renderNodeItem,
  isNodeSelectable,
}: {
  className?: string;
  expandIcons?: React.ReactNode[];
  node: TreeNodeData<TData>;
  level: number;
  selection?: TMultiple extends true ? string[] : string | null;
  expandedKeys: string[];
  multiple?: TMultiple;
  showCheckbox: boolean;
  showSelectedIcon?: boolean;
  onToggleExpand: (key: string) => void;
  onToggleSelect: (key: string) => void;
  onNodeClick?: (node: TreeNodeData<TData>, event: React.MouseEvent) => void;
  renderNodeItem?: (props: RenderNodeItemProps<TData>) => React.ReactNode;
  isNodeSelectable?: (node: TreeNodeData<TData>) => boolean;
}) {
  const hasChildren = checkHasChildren(node);
  const isExpanded = expandedKeys.includes(node.key);
  const selectionArray = toSelectionArray(selection);
  const { isSelected, isIndeterminate } = computeNodeSelection(
    node,
    selectionArray,
    multiple,
    hasChildren
  );
  const childrenExpandIcon = getExpandIcon(isExpanded, expandIcons);
  const indentPx = level * 24 + 8; // 每级缩进 24 px

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(node.key);
    },
    [onToggleExpand, node.key]
  );

  const handleToggleSelect = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      const selectable = isNodeSelectable?.(node) ?? true;
      if (!selectable) {
        return;
      }
      onToggleSelect(node.key);
    },
    [onToggleSelect, node, isNodeSelectable]
  );

  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      onNodeClick?.(node, e);
      // 如果节点不可选且有子节点，则切换展开状态
      const selectable = isNodeSelectable?.(node) ?? true;
      if (!selectable && hasChildren) {
        onToggleExpand(node.key);
        return;
      }
      if (!showCheckbox) {
        handleToggleSelect(e);
      }
    },
    [
      onNodeClick,
      node,
      showCheckbox,
      handleToggleSelect,
      isNodeSelectable,
      hasChildren,
      onToggleExpand,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const selectable = isNodeSelectable?.(node) ?? true;
        if (e.key === "Enter" && hasChildren) {
          handleToggleExpand(e as unknown as React.MouseEvent);
        } else if (selectable) {
          // 只有可选节点才能通过键盘选中
          handleToggleSelect();
        } else if (hasChildren) {
          // 不可选节点有子节点时，展开/收起
          handleToggleExpand(e as unknown as React.MouseEvent);
        }
      }
    },
    [
      hasChildren,
      handleToggleExpand,
      handleToggleSelect,
      isNodeSelectable,
      node,
    ]
  );

  return (
    <>
      <div
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 text-sm outline-hidden",
          "hover:bg-accent hover:text-accent-foreground",
          "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
          '[&_svg:not([class*="size-"])]:size-4 [&_svg:not([class*="text-"])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
          className
        )}
        data-selected={isSelected}
        onClick={handleNodeClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        style={{ paddingLeft: `${indentPx}px` }}
        tabIndex={0}
      >
        {/* 展开/收起按钮 */}
        {hasChildren ? (
          <button
            aria-label={isExpanded ? "收起" : "展开"}
            className="flex h-4 w-4 items-center justify-center rounded hover:bg-muted-foreground/20"
            onClick={handleToggleExpand}
            type="button"
          >
            {childrenExpandIcon}
          </button>
        ) : null}

        {/* 复选框 */}
        {showCheckbox && (
          <div className="flex h-4 w-4 items-center justify-center">
            <button
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-[4px] border border-input shadow-xs",
                isSelected && "border-primary bg-primary",
                isIndeterminate && !isSelected && "border-primary bg-primary/20"
              )}
              onClick={(e) => {
                e.stopPropagation();
                const selectable = isNodeSelectable?.(node) ?? true;
                if (selectable) {
                  handleToggleSelect();
                }
              }}
              type="button"
            >
              {isSelected && (
                <Check className="h-3 w-3 text-primary-foreground" />
              )}
              {isIndeterminate && !isSelected && (
                <div className="h-0.5 w-2 rounded bg-primary" />
              )}
            </button>
          </div>
        )}

        {/* 节点内容 */}
        <div className="flex min-w-0 flex-1 select-none items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {renderNodeItem ? (
              renderNodeItem({
                node,
                level,
                selected: isSelected,
                expanded: isExpanded,
              })
            ) : (
              <div className="truncate text-sm" title={node.name}>
                {node.name}
              </div>
            )}
          </div>

          {/* 选中图标区域 - 当 showSelectedIcon 为 true 时始终预留位置 */}
          {showSelectedIcon && !showCheckbox && (
            <div className="flex h-4 w-4 items-center justify-center">
              {isSelected && <Check className="h-4 w-4" />}
            </div>
          )}
        </div>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode<TData, TMultiple>
              className={className}
              expandedKeys={expandedKeys}
              expandIcons={expandIcons}
              isNodeSelectable={isNodeSelectable}
              key={child.key}
              level={level + 1}
              multiple={multiple}
              node={child}
              onNodeClick={onNodeClick}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              renderNodeItem={renderNodeItem}
              selection={selection}
              showCheckbox={showCheckbox}
              showSelectedIcon={showSelectedIcon}
            />
          ))}
        </div>
      )}
    </>
  );
}

function getInitExpandedKeys<TData = unknown>(
  defaultExpandedKeys: string[] | undefined,
  defaultExpandAll: boolean | undefined,
  selection: string[] | string | null | undefined,
  data: TreeNodeData<TData>[]
) {
  if (defaultExpandedKeys) {
    return defaultExpandedKeys;
  }
  if (defaultExpandAll) {
    return getAllKeys(data);
  }
  if (selection && !isEmpty(selection)) {
    return getExpandedKeysForSelection(selection, data);
  }
  // 如果根节点数量较少，默认展开第一个有子节点的根节点
  if (data.length < 4) {
    // 找到第一个有子节点的根节点，并且子节点不会特别多
    const firstExpandedNode = data.find(
      (node) =>
        node.children && node.children.length > 0 && node.children.length < 10
    );
    if (firstExpandedNode) {
      return [firstExpandedNode.key];
    }
  }
  return [];
}

// 主 Tree 组件
export function Tree<TData = unknown, TMultiple extends boolean = false>({
  nodeClassName,
  expandIcons,
  data,
  multiple,
  selection,
  onSelectionChange,
  expandedKeys: controlledExpandedKeys,
  onExpandedChange,
  showCheckbox,
  showSelectedIcon = false,
  defaultExpandAll = false,
  defaultExpandedKeys,
  defaultSelection,
  className,
  onNodeClick,
  renderNodeItem,
  emptyText = "暂无数据",
  isNodeSelectable,
  ref,
}: TreeProps<TData, TMultiple> & { ref?: React.Ref<TreeRef> }) {
  const initExpandedRef = React.useRef<string[] | undefined>(undefined);
  // 展开状态管理
  const [expandedKeys, setExpandedKeys] = useControl<string[]>(
    () =>
      getInitExpandedKeys(
        defaultExpandedKeys,
        defaultExpandAll,
        selection,
        data
      ),
    controlledExpandedKeys,
    onExpandedChange
  );

  // 记录首次的 expandedKeys
  if (initExpandedRef.current === undefined) {
    initExpandedRef.current = expandedKeys;
  }

  // 选中值类型
  type SelectionType = TMultiple extends true ? string[] : string | null;

  // 选择状态管理
  const [currentSelection, setCurrentSelection] = useControl<SelectionType>(
    () => {
      if (defaultSelection !== undefined) {
        return defaultSelection as SelectionType;
      }
      return (multiple ? [] : null) as SelectionType;
    },
    selection,
    onSelectionChange as ((value: SelectionType) => void) | undefined
  );

  // 确定是否显示复选框
  const shouldShowCheckbox = useMemo(
    () => !!(showCheckbox || multiple),
    [showCheckbox, multiple]
  );

  // 暴露给外部的方法
  useImperativeHandle(
    ref,
    () => ({
      setExpandedKeys: (keys: string[]) => {
        setExpandedKeys(keys);
      },
      getExpandedKeys: () => expandedKeys || [],
      expand: (key: string) => {
        if (!expandedKeys?.includes(key)) {
          setExpandedKeys([...(expandedKeys || []), key]);
        }
      },
      collapse: (key: string) => {
        if (expandedKeys?.includes(key)) {
          setExpandedKeys((expandedKeys || []).filter((k) => k !== key));
        }
      },
      expandAll: () => {
        setExpandedKeys(getAllKeys(data));
      },
      collapseAll: () => {
        setExpandedKeys([]);
      },
      resetExpand: () => {
        setExpandedKeys(initExpandedRef.current || []);
      },
    }),
    [expandedKeys, setExpandedKeys, data]
  );

  // 处理展开状态变化
  const handleToggleExpand = useCallback(
    (key: string) => {
      const currentExpandedKeys = expandedKeys || [];
      const newExpandedKeys = currentExpandedKeys.includes(key)
        ? currentExpandedKeys.filter((k) => k !== key)
        : [...currentExpandedKeys, key];

      setExpandedKeys(newExpandedKeys);
    },
    [expandedKeys, setExpandedKeys]
  );

  // 查找节点的辅助函数
  const findNodeByKey = useCallback(
    (
      nodes: TreeNodeData<TData>[],
      targetKey: string
    ): TreeNodeData<TData> | null => {
      for (const node of nodes) {
        if (node.key === targetKey) {
          return node;
        }
        if (node.children) {
          const found = findNodeByKey(node.children, targetKey);
          if (found) {
            return found;
          }
        }
      }
      return null;
    },
    []
  );

  // 处理多选模式下的选择
  const handleMultipleSelect = useCallback(
    (key: string, currentArray: string[]) => {
      const node = findNodeByKey(data, key);
      if (!node) {
        return;
      }

      // 如果有子节点，切换所有叶子节点的选中状态
      if (node.children && node.children.length > 0) {
        const leafKeys = getAllLeafKeys(node);
        const allSelected = leafKeys.every((k) => currentArray.includes(k));

        if (allSelected) {
          // 全部选中 -> 全部取消
          const newSelection = currentArray.filter(
            (k) => !leafKeys.includes(k)
          );
          setCurrentSelection(newSelection as SelectionType);
        } else {
          // 部分或未选中 -> 全部选中
          const newSelection = Array.from(
            new Set([...currentArray, ...leafKeys])
          );
          setCurrentSelection(newSelection as SelectionType);
        }
      } else {
        // 叶子节点，直接切换
        const newSelection = currentArray.includes(key)
          ? currentArray.filter((k) => k !== key)
          : [...currentArray, key];
        setCurrentSelection(newSelection as SelectionType);
      }
    },
    [data, findNodeByKey, setCurrentSelection]
  );

  // 处理选择状态变化
  const handleToggleSelect = useCallback(
    (key: string) => {
      if (multiple) {
        const currentArray = (
          Array.isArray(currentSelection) ? currentSelection : []
        ) as string[];
        handleMultipleSelect(key, currentArray);
      } else {
        const newSelection = currentSelection === key ? null : key;
        setCurrentSelection(newSelection as SelectionType);
      }
    },
    [multiple, currentSelection, setCurrentSelection, handleMultipleSelect]
  );

  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="py-6 text-center text-muted-foreground text-sm">
          {emptyText}
        </div>
      </div>
    );
  }

  return (
    <div aria-multiselectable={multiple} className={className} role="tree">
      {data.map((node) => (
        <TreeNode<TData, TMultiple>
          className={nodeClassName}
          expandedKeys={expandedKeys || []}
          expandIcons={expandIcons}
          isNodeSelectable={isNodeSelectable}
          key={node.key}
          level={0}
          multiple={multiple as TMultiple}
          node={node}
          onNodeClick={onNodeClick}
          onToggleExpand={handleToggleExpand}
          onToggleSelect={handleToggleSelect}
          renderNodeItem={renderNodeItem}
          selection={
            currentSelection as TMultiple extends true
              ? string[]
              : string | null
          }
          showCheckbox={shouldShowCheckbox}
          showSelectedIcon={showSelectedIcon}
        />
      ))}
    </div>
  );
}

// 导出别名
export { TreeNode as DefaultTreeNode };
export default Tree;
