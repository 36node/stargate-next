# Tree 组件使用指南

一个功能完整的树形组件，支持展开/折叠、单选/多选、自定义渲染等特性。

## ✨ 特性

- 🌳 **层级结构**: 支持无限级父子节点嵌套
- 🔄 **展开折叠**: 可展开/折叠树节点
- ✅ **选择模式**: 支持单选和多选模式
- 🎨 **自定义渲染**: 可自定义节点内容显示
- 🎯 **受控/非受控组件**: 支持受控和非受控两种使用方式
- 📱 **响应式**: 适配不同屏幕尺寸
- ♿ **无障碍**: 符合 ARIA 标准

## 🚀 基础用法

### 简单树形结构

```tsx
import { Tree } from '@/components/tree';

const treeData = [
  {
    key: '1',
    name: '根节点 1',
    children: [
      { key: '1-1', name: '子节点 1-1' },
      { key: '1-2', name: '子节点 1-2' },
    ],
  },
  { key: '2', name: '根节点 2' },
];

function BasicTree() {
  return <Tree data={treeData} />;
}
```

### 受控模式

```tsx
function ControlledTree() {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['1']);

  return (
    <Tree
      data={treeData}
      multiple
      selection={selectedKeys}
      onSelectionChange={setSelectedKeys}
      expandedKeys={expandedKeys}
      onExpandedChange={setExpandedKeys}
    />
  );
}
```

### 自定义节点渲染

```tsx
function CustomTree() {
  return (
    <Tree
      data={treeData}
      renderNodeItem={({ node, selected, expanded }) => (
        <div className="flex items-center gap-2">
          <span className={selected ? 'font-bold' : ''}>{node.name}</span>
          {node.children && (
            <span className="text-xs text-muted-foreground">({node.children.length})</span>
          )}
        </div>
      )}
    />
  );
}
```

## 📋 API 参考

### TreeProps

| 属性                  | 类型                    | 默认值  | 说明               |
| --------------------- | ----------------------- | ------- | ------------------ |
| `data`                | `TreeNodeData<T>[]`     | `[]`    | 树形数据           |
| `multiple`            | `boolean`               | `false` | 是否支持多选       |
| `selection`           | `string \| string[]`    | -       | 选中的节点（受控） |
| `onSelectionChange`   | `(selection) => void`   | -       | 选择变化回调       |
| `expandedKeys`        | `string[]`              | -       | 展开的节点（受控） |
| `onExpandedChange`    | `(keys) => void`        | -       | 展开状态变化回调   |
| `defaultExpandAll`    | `boolean`               | `false` | 默认展开所有节点   |
| `defaultExpandedKeys` | `string[]`              | `[]`    | 默认展开的节点     |
| `defaultSelection`    | `string \| string[]`    | -       | 默认选中的节点     |
| `showCheckbox`        | `boolean`               | `false` | 显示复选框         |
| `className`           | `string`                | -       | 容器样式类         |
| `nodeClassName`       | `string`                | -       | 节点样式类         |
| `onNodeClick`         | `(node, event) => void` | -       | 节点点击回调       |
| `renderNodeItem`      | `(props) => ReactNode`  | -       | 自定义节点渲染     |

### TreeNodeData

```typescript
type TreeNodeData<T = undefined> = {
  key: string; // 唯一标识
  name: string; // 显示名称
  children?: TreeNodeData<T>[]; // 子节点
} & (T extends undefined ? { origin?: T } : { origin: T }); // 原始数据
```

### RenderNodeItemProps

```typescript
interface RenderNodeItemProps<T = unknown> {
  node: TreeNodeData<T>; // 节点数据
  level: number; // 层级深度
  selected?: boolean; // 是否选中
  expanded?: boolean; // 是否展开
}
```

## 🎯 使用场景

### 1. 文件目录树

```tsx
interface FileNode {
  id: string;
  type: 'file' | 'folder';
  size?: number;
}

const fileTreeData: TreeNodeData<FileNode>[] = [
  {
    key: 'src',
    name: 'src',
    origin: { id: 'src', type: 'folder' },
    children: [
      {
        key: 'components',
        name: 'components',
        origin: { id: 'components', type: 'folder' },
        children: [
          {
            key: 'tree.tsx',
            name: 'tree.tsx',
            origin: { id: 'tree.tsx', type: 'file', size: 1024 },
          },
        ],
      },
    ],
  },
];
```

### 2. 组织架构树

```tsx
interface Department {
  id: string;
  manager: string;
  employeeCount: number;
}

function DepartmentTree() {
  return (
    <Tree
      data={departmentData}
      renderNodeItem={({ node, selected }) => (
        <div className="flex items-center justify-between w-full">
          <span>{node.name}</span>
          <div className="text-sm text-muted-foreground">
            <span>负责人: {node.origin.manager}</span>
            <span className="ml-2">人数: {node.origin.employeeCount}</span>
          </div>
        </div>
      )}
    />
  );
}
```

### 3. 权限选择树

```tsx
function PermissionTree() {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  return (
    <Tree
      data={permissionData}
      multiple
      showCheckbox
      selection={selectedPermissions}
      onSelectionChange={setSelectedPermissions}
      defaultExpandAll
    />
  );
}
```

## 💡 最佳实践

### 1. 数据结构设计

```typescript
// ✅ 推荐：使用泛型保存原始数据
interface User {
  id: string;
  email: string;
  role: string;
}

const userData: TreeNodeData<User>[] = [
  {
    key: 'admin',
    name: '管理员',
    origin: { id: '1', email: 'admin@example.com', role: 'admin' },
  },
];

// ❌ 不推荐：直接扩展 TreeNodeData
interface UserTreeNode extends TreeNodeData {
  email: string;
  role: string;
}
```

### 2. 性能优化

```tsx
// ✅ 使用 useMemo 缓存数据转换
const treeData = useMemo(() => {
  return convertToTreeData(rawData);
}, [rawData]);

// ✅ 使用 useCallback 优化回调函数
const handleSelectionChange = useCallback((selection: string[]) => {
  setSelectedItems(selection);
}, []);
```

### 3. 类型安全

```tsx
// ✅ 明确指定泛型类型
<Tree<User, true>
  data={userData}
  multiple
  selection={selectedUsers}
  onSelectionChange={(selection: string[]) => {
    // TypeScript 会正确推断 selection 类型为 string[]
    setSelectedUsers(selection);
  }}
/>
```

## 🔧 常见问题

### Q: 如何实现懒加载？

A: 通过动态更新 `data` 属性实现：

```tsx
const [treeData, setTreeData] = useState(initialData);

const handleNodeExpand = async (node: TreeNodeData) => {
  if (!node.children) {
    const children = await loadChildren(node.key);
    setTreeData(updateNodeChildren(treeData, node.key, children));
  }
};
```

### Q: 如何自定义展开图标？

A: 使用 `expandIcons` 属性：

```tsx
<Tree
  data={treeData}
  expandIcons={[<ChevronRight className="w-4 h-4" />, <ChevronDown className="w-4 h-4" />]}
/>
```

### Q: 如何实现搜索功能？

A: 过滤数据源或高亮匹配项：

```tsx
const filteredData = useMemo(() => {
  return searchKeyword ? filterTreeData(treeData, searchKeyword) : treeData;
}, [treeData, searchKeyword]);
```
