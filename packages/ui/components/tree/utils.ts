import type { BuildTreeItem, BuildTreeOptions, TreeNodeData } from "./types";

/**
 * 根据选中节点值计算需要展开的节点键集合
 *
 * @param selection 选中节点键或键数组
 * @param treeData 树形数据
 * @returns 需要展开的节点键集合
 */
export function getExpandedKeysForSelection<TData>(
  selection: string | string[],
  treeData: TreeNodeData<TData>[] | undefined
): string[] {
  if (
    !selection ||
    selection.length === 0 ||
    !treeData ||
    treeData.length === 0
  ) {
    return [];
  }

  const expandedKeys = new Set<string>();
  const targetKeys = Array.isArray(selection) ? selection : [selection];

  // 过滤空字符串
  const validKeys = targetKeys.filter((key) => key && key.trim() !== "");
  if (validKeys.length === 0) {
    return [];
  }

  // 递归查找目标节点并记录路径上的所有父节点
  const findAndExpandPath = (
    nodes: TreeNodeData<TData>[],
    targetKey: string
  ): boolean => {
    for (const node of nodes) {
      if (node.key === targetKey) {
        // 找到目标节点，如果有子节点则展开目标节点本身
        if (node.children && node.children.length > 0) {
          expandedKeys.add(node.key);
        }
        return true;
      }

      // 递归查找子节点
      if (node.children && findAndExpandPath(node.children, targetKey)) {
        // 如果在子节点中找到了目标，则展开当前节点（父节点）
        expandedKeys.add(node.key);
        return true;
      }
    }
    return false;
  };

  // 为每个目标键查找并展开路径
  for (const key of validKeys) {
    findAndExpandPath(treeData, key);
  }

  return Array.from(expandedKeys);
}

/**
 * 根据节点键数组获取对应的树节点
 * @param data 树形数据
 * @param keys 节点键数组
 * @returns 匹配的树节点数组
 */
export function getNodesByKeys<T>(
  data: TreeNodeData<T>[],
  keys: string[]
): TreeNodeData<T>[] {
  const result: TreeNodeData<T>[] = [];

  const traverse = (nodes: TreeNodeData<T>[]) => {
    for (const node of nodes) {
      if (keys.includes(node.key)) {
        result.push(node);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(data);
  return result;
}

/**
 * 获取所有节点的键
 * @param nodes 树节点数组
 * @returns 所有节点的键数组
 */
export function getAllKeys<TData>(nodes: TreeNodeData<TData>[]): string[] {
  const keys: string[] = [];
  const traverse = (nodeList: TreeNodeData<TData>[]) => {
    for (const node of nodeList) {
      if (node.children && node.children.length > 0) {
        keys.push(node.key);
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return keys;
}

/**
 * 获取节点的所有叶子节点键
 * @param node 树节点
 * @returns 所有叶子节点的键数组
 */
export function getAllLeafKeys<TData>(node: TreeNodeData<TData>): string[] {
  const keys: string[] = [];

  const traverse = (n: TreeNodeData<TData>) => {
    if (!n.children || n.children.length === 0) {
      // 叶子节点
      keys.push(n.key);
    } else {
      // 有子节点，递归遍历
      n.children.forEach(traverse);
    }
  };

  traverse(node);
  return keys;
}

/**
 * 检查节点的选中状态（全选、半选、未选）
 * @param node 树节点
 * @param selectedKeys 已选中的键集合
 * @returns { checked: boolean, indeterminate: boolean }
 */
export function getNodeCheckState<TData>(
  node: TreeNodeData<TData>,
  selectedKeys: string[]
): { checked: boolean; indeterminate: boolean } {
  if (!node.children || node.children.length === 0) {
    // 叶子节点
    return {
      checked: selectedKeys.includes(node.key),
      indeterminate: false,
    };
  }

  // 获取所有叶子节点
  const leafKeys = getAllLeafKeys(node);
  const selectedLeafCount = leafKeys.filter((key) =>
    selectedKeys.includes(key)
  ).length;

  if (selectedLeafCount === 0) {
    // 未选中
    return { checked: false, indeterminate: false };
  }
  if (selectedLeafCount === leafKeys.length) {
    // 全选
    return { checked: true, indeterminate: false };
  }
  // 半选
  return { checked: false, indeterminate: true };
}

function calcDepth<T>(node: TreeNodeData<T>, depth: number): void {
  node.depth = depth;
  if (node.children) {
    for (const child of node.children) {
      calcDepth(child, depth + 1);
    }
  }
}

function calcTotalCount<T>(node: TreeNodeData<T>, countField: string): number {
  const nodeCount = (node.calAttrs?.[countField] as number) || 0;
  if (node.children) {
    return (
      nodeCount +
      node.children.reduce(
        (sum, child) => sum + calcTotalCount(child, countField),
        0
      )
    );
  }

  return nodeCount;
}

// 递归计算所有节点的 calAttrs 中的指定 countField 总数
function updateTotalCount<T>(node: TreeNodeData<T>, countField: string): void {
  if (!node.calAttrs) {
    node.calAttrs = {};
  }
  node.calAttrs[countField] = calcTotalCount(node, countField);
  if (node.children) {
    for (const child of node.children) {
      updateTotalCount(child, countField);
    }
  }
}

// 创建节点查找表
function createLookup<T>(
  items: BuildTreeItem<T>[]
): Record<string, TreeNodeData<T>> {
  const lookup: Record<string, TreeNodeData<T>> = {};
  for (const item of items) {
    lookup[item.key] = item as TreeNodeData<T>;
  }
  return lookup;
}

// 构建树结构
function buildTreeStructure<T>(
  items: BuildTreeItem<T>[],
  lookup: Record<string, TreeNodeData<T>>
): Record<string, TreeNodeData<T>> {
  const tree: Record<string, TreeNodeData<T>> = {};
  for (const node of items) {
    const parent = node.parent ? lookup[node.parent] : undefined;
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(node as TreeNodeData<T>);
    } else {
      tree[node.key] = node as TreeNodeData<T>;
    }
  }
  return tree;
}

// 应用树选项
function applyTreeOptions<T>(
  tree: Record<string, TreeNodeData<T>>,
  options?: BuildTreeOptions
): void {
  if (options?.buildDepth) {
    for (const rootNode of Object.values(tree)) {
      calcDepth(rootNode, 0);
    }
  }

  if (options?.includeChildrenInCount) {
    for (const rootNode of Object.values(tree)) {
      const countFields = Object.keys(rootNode.calAttrs || {});
      for (const field of countFields) {
        updateTotalCount(rootNode, field);
      }
    }
  }
}

export function buildTree<T>(
  items: BuildTreeItem<T>[],
  options?: BuildTreeOptions
): TreeNodeData<T>[] {
  const lookup = createLookup(items);
  const tree = buildTreeStructure(items, lookup);
  applyTreeOptions(tree, options);
  return Object.values(tree);
}
