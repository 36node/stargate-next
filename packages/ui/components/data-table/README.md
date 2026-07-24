# DataTable 使用指南

## 手动分页模式 (Manual Pagination)

当使用 `manualPagination` 时，DataTable 需要知道服务器端的总记录数来正确计算页数和分页信息。

### 基本用法

```tsx
import { DataTable, useDataTableSearch } from 'src/components';

interface Props {
  data: Item[];
  total: number; // 服务器端总记录数
}

export function MyTable({ data, total }: Props) {
  const tableSearch = useDataTableSearch({
    filterSchema: myFilterSchema,
  });

  return (
    <DataTable
      data={data}
      columns={columns}
      toolbarComponent={MyTableToolbar}
      rowCount={total} // 传递总记录数
      {...tableSearch} // 包含 manualPagination: true
    />
  );
}
```

### 完整示例 (以车辆表格为例)

#### 1. 页面组件 (page.tsx)

```tsx
export default async function Page(props: PageProps) {
  const rawSearchParams = await props.searchParams;
  const query = searchToApiQuery(rawSearchParams, vehicleFilterSchema);

  // 从服务器获取数据和总数
  const { rows: vehicles, total } = await listVehicles(query);

  return (
    <div className="px-6 h-full flex-1 overflow-auto">
      <PageHeader title="车辆信息" />
      <VehicleTable vehicles={vehicles} total={total} />
    </div>
  );
}
```

#### 2. 表格组件 (table/index.tsx)

```tsx
import { DataTable, useDataTableSearch } from 'src/components';

type VehicleTableProps = {
  vehicles: Vehicle[];
  total: number; // 重要：必须传递总数
};

export function VehicleTable({ vehicles, total }: VehicleTableProps) {
  const tableSearch = useDataTableSearch({
    filterSchema: vehicleFilterSchema,
  });

  return (
    <DataTable
      data={vehicles}
      columns={columns}
      toolbarComponent={DataTableToolbar}
      rowCount={total} // 传递给 DataTable
      {...tableSearch} // 包含 manualPagination: true
    />
  );
}
```

## 重要说明

1. **rowCount 属性**: 在 `manualPagination` 模式下，必须传递 `rowCount` 属性，否则分页器无法正确显示总页数和当前页信息。

2. **useDataTableSearch**: 这个 hook 自动设置 `manualPagination: true`，适用于需要服务器端分页的场景。

3. **总数来源**: `rowCount` 应该是服务器返回的真实总记录数，不是当前页的数据长度。

4. **分页逻辑**: 页码变化会通过 URL 参数传递到服务器，服务器根据分页参数返回对应页的数据。

## 非手动分页模式

如果你的数据较少，可以使用客户端分页：

```tsx
<DataTable
  data={allData}
  columns={columns}
  toolbarComponent={MyTableToolbar}
  // 不传递 manualPagination，默认为 false
  // 不需要传递 rowCount
/>
```

在这种模式下，分页完全在客户端处理，不需要 `rowCount` 属性。

## 导入和导出功能

DataTable 提供了内置的导入和导出功能，通过 `useDataTableImport` 和 `useDataTableExport` Hooks 来实现。

### 完整示例

#### 1. Toolbar 组件 (data-table-toolbar.tsx)

```tsx
'use client';

import { Table } from '@tanstack/react-table';
import dayjs from 'dayjs';
import { FileInput, FileOutput } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  DataTableImporter,
  DataTableViewOptions,
  useDataTableExport,
  useDataTableImport,
} from 'src/components/data-table';

import { Exporter } 'src/components';

import { Button } from 'src/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from 'src/components/ui/tooltip';

import { VehicleInTable } from './types';

interface DataTableToolbarProps {
  table: Table<VehicleInTable>;
}

export function DataTableToolbar({ table }: DataTableToolbarProps) {
  const router = useRouter();

  // 使用导入 hook
  const importer = useDataTableImport({
    table,
    onSuccess: () => router.refresh(), // 导入成功后刷新页面
  });

  // 使用导出 hook
  const exporter = useDataTableExport({
    table,
  });

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-2">{/* 搜索和筛选器等其他组件 */}</div>

      <div className="inline-flex items-center gap-1">
        <DataTableViewOptions table={table} />

        <div className="flex items-center gap-1">
          {/* 导入按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="size-6 p-0"
                onClick={() => importer.onOpenChange(true)}
              >
                <FileInput className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>导入</p>
            </TooltipContent>
          </Tooltip>

          {/* 导出按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="size-6 p-0"
                onClick={() => exporter.onOpenChange(true)}
              >
                <FileOutput className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>导出</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 导入对话框 */}
      <DataTableImporter title="导入车辆信息" {...importer} />

      {/* 导出对话框 */}
      <Exporter {...exporter} filename={`车辆档案-${dayjs().format('YYYY-MM-DD')}`} />
    </div>
  );
}
```

#### 2. 表格组件 (data-table.tsx)

```tsx
'use client';

import dynamic from 'next/dynamic';

import { DataTable, useDataTableSearch } from 'src/components';

import { columns } from './columns';
import { tableFilterSchema } from './schema';
import { DataTableToolbar } from './toolbar';
import { VehicleInTable } from './types';

type VehicleTableProps = {
  vehicles: VehicleInTable[];
  total: number;
  facets: { [columnId: string]: Map<any, number> };
};

export function VehicleTable({ vehicles, total, facets }: VehicleTableProps) {
  const tableSearch = useDataTableSearch({
    filterSchema: tableFilterSchema,
    facets,
  });

  return (
    <DataTable
      data={vehicles}
      columns={columns}
      toolbarComponent={DataTableToolbar}
      className="bg-white"
      rowCount={total}
      defaultSorting={[{ id: 'updateAt', desc: true }]}
      {...tableSearch}
    />
  );
}
```

#### 3. 配置列定义 (columns.tsx)

在列定义中，可以通过 meta 属性配置导入导出行为：

```tsx
import { ColumnDef } from '@tanstack/react-table';

export const columns: ColumnDef<VehicleInTable>[] = [
  {
    accessorKey: 'no',
    header: '车辆自编号',
    // 默认可导入导出
  },
  {
    accessorKey: 'plateNumber',
    header: '车牌号',
    meta: {
      // 自定义导出时的列标题
      exportHeader: '车牌号码',
    },
  },
  {
    accessorKey: 'id',
    header: 'ID',
    meta: {
      // 不允许导入此列
      unimportable: true,
    },
  },
  {
    accessorKey: 'actions',
    header: '操作',
    meta: {
      // 不允许导出此列
      unexportable: true,
    },
  },
];
```

#### 4. 后端 API 实现

##### 导出 API (route.ts)

```tsx
import { NextRequest } from 'next/server';

import { exportToExcelStream } from 'src/lib/xlsx';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { header, query } = body;

  // 根据 query 参数查询数据
  const { rows } = await listVehicles(query);

  // 使用流式导出
  return exportToExcelStream({
    data: rows,
    header,
    sheetName: '车辆信息',
  });
}
```

##### 导入 API (route.ts)

```tsx
import { NextRequest } from 'next/server';

import { importFromExcelStream } from 'src/lib/xlsx';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const headerStr = formData.get('header') as string;
  const header = JSON.parse(headerStr);

  // 如果没有文件，返回模板
  if (!file) {
    return exportToExcelStream({
      data: [],
      header,
      sheetName: '车辆信息模板',
    });
  }

  // 导入数据
  return importFromExcelStream({
    file,
    header,
    onBatch: async (batch) => {
      // 批量处理数据（例如保存到数据库）
      await createVehicles(batch);
    },
  });
}
```

### Hook API

#### useDataTableImport

```typescript
const importer = useDataTableImport({
  table, // 必需：表格实例
  apiEndpoint, // 可选：API 端点，默认为当前路径 + /import
  onSuccess, // 可选：导入成功回调
});

// 返回值
importer.open; // 对话框打开状态
importer.onOpenChange; // 对话框状态变化回调
importer.loading; // 是否正在导入
importer.result; // 导入结果（进度、消息、错误等）
importer.handleImport; // 执行导入
importer.handleDownloadTemplate; // 下载模板
importer.cancelImport; // 取消导入
importer.reset; // 重置状态
```

#### useDataTableExport

```typescript
const exporter = useDataTableExport({
  table, // 必需：表格实例
  apiEndpoint, // 可选：API 端点，默认为当前路径 + /export
});

// 返回值
exporter.open; // 对话框打开状态
exporter.onOpenChange; // 对话框状态变化回调
exporter.loading; // 是否正在导出
exporter.progress; // 导出进度 0-100
exporter.error; // 错误信息
exporter.totalRows; // 总行数
exporter.handleExport; // 执行导出
```

### 特性说明

1. **自动获取表头**：从列定义自动提取表头信息，支持自定义导出列名
2. **过滤和排序**：导出时自动应用表格的过滤和排序条件
3. **流式处理**：支持大文件的流式导入导出，避免内存溢出
4. **进度反馈**：实时显示导入导出进度
5. **模板下载**：支持下载导入模板
6. **批量处理**：导入时支持批量处理数据
7. **错误处理**：完善的错误提示和处理

### 列 Meta 配置

```typescript
meta: {
  exportHeader: string; // 导出时的列标题
  unexportable: boolean; // 是否禁止导出
  unimportable: boolean; // 是否禁止导入
}
```

```

```
