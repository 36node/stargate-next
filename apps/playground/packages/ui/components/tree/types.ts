type CalAttrs = Record<string, number | string>;

export type TreeNodeData<T = undefined> = {
  key: string;
  name: string;
  children?: TreeNodeData<T>[];
  depth?: number; // 所在的层级
  calAttrs?: CalAttrs;
  isLeaf?: boolean; // 是否为叶子节点（在建树时确定，不受搜索过滤影响）
} & (T extends undefined ? { origin?: T } : { origin: T });

// 自定义渲染节点的属性类型
export type RenderNodeItemProps<T = unknown> = {
  node: TreeNodeData<T>;
  level: number;
  selected?: boolean;
  expanded?: boolean;
};

export type BuildTreeOptions = {
  buildDepth?: boolean;
  includeChildrenInCount?: boolean; // 新增选项，是否包含子部门人数
};

export type BuildTreeItem<T = undefined> = {
  parent?: string;
  key: string;
  name: string;
  calAttrs?: CalAttrs;
} & (T extends undefined ? { origin?: T } : { origin: T });
