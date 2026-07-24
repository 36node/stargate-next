import type { Column, Table } from "@tanstack/react-table";

import type { DataTableHeader } from "./types";

export const getColumnDisplayName = <TData>(
  column: Column<TData, unknown>
): string => {
  if (column.columnDef.meta?.displayName) {
    return column.columnDef.meta.displayName;
  }

  const header = column.columnDef.header;
  if (typeof header === "string") {
    return header;
  }

  return column.id;
};

export type GetTableHeaderOptions = {
  /** 是否为导入生成列（导入时不过滤隐藏列，但会过滤 unimportable 列） */
  forImport?: boolean;
};

/**
 * 将 column id 转换为原始的 accessor key
 * TanStack Table 会将 'body.at' 转换为 'body_at'，需要反转
 */
function columnIdToAccessorKey(columnId: string): string {
  return columnId
    .replace(/_(\d+)_/g, "[$1].") // 中间的 _数字_ → [数字].
    .replace(/_(\d+)$/g, "[$1]") // 末尾的 _数字 → [数字]
    .replace(/_/g, "."); // 其他的 _ → .
}

/**
 * 检查列是否有数据访问器
 */
function hasAccessor(columnDef: Record<string, unknown>): boolean {
  return "accessorKey" in columnDef || "accessorFn" in columnDef;
}

/**
 * 获取列的 accessor key
 */
function getAccessorKey<TData>(column: Column<TData, unknown>): string {
  const columnDef = column.columnDef;

  if ("accessorKey" in columnDef && columnDef.accessorKey) {
    return columnDef.accessorKey as string;
  }

  if ("accessorFn" in columnDef) {
    return columnIdToAccessorKey(column.id);
  }

  return column.id;
}

/**
 * 检查列是否应该包含在导入中
 */
function shouldIncludeForImport<TData>(
  column: Column<TData, unknown>
): boolean {
  const columnDef = column.columnDef;

  // 过滤掉标记为 unimportable 的列
  if (columnDef.meta?.unimportable) {
    return false;
  }

  // 排除没有数据访问器的 display 列
  return hasAccessor(columnDef as unknown as Record<string, unknown>);
}

/**
 * 将列转换为 DataTableHeader
 */
function columnToHeader<TData>(
  column: Column<TData, unknown>
): DataTableHeader {
  const columnDef = column.columnDef;

  return {
    title: getColumnDisplayName(column),
    key: getAccessorKey(column),
    colSpan: 1,
    depth: 0,
    isPlaceholder: false,
    width: columnDef.meta?.width,
  };
}

/**
 * 获取导入用的表头配置
 */
function getImportHeaders<TData>(table: Table<TData>): DataTableHeader[][] {
  const columns = table
    .getAllLeafColumns()
    .filter(shouldIncludeForImport)
    .map(columnToHeader);

  return [columns];
}

/**
 * 检查 header 是否应该包含在导出中
 */
function shouldIncludeForExport<TData>(header: {
  column: Column<TData, unknown>;
  isPlaceholder: boolean;
}): boolean {
  const columnDef = header.column.columnDef;

  // 导出时：过滤隐藏列
  if (!header.column.getIsVisible()) {
    return false;
  }

  // 占位符列需要保留（用于复合表头对齐）
  if (header.isPlaceholder) {
    return true;
  }

  // 分组列（group columns）需要保留
  if ("columns" in columnDef && columnDef.columns) {
    return true;
  }

  // 过滤掉标记为 unexportable 的列
  if (columnDef.meta?.unexportable) {
    return false;
  }

  // 排除没有数据访问器的 display 列
  return hasAccessor(columnDef as unknown as Record<string, unknown>);
}

/**
 * 获取 header 的 key
 */
function getHeaderKey<TData>(header: {
  column: Column<TData, unknown>;
  isPlaceholder: boolean;
}): string | undefined {
  const columnDef = header.column.columnDef;

  // 占位符列没有 key
  if (header.isPlaceholder) {
    return;
  }

  // 分组列不需要 key
  if ("columns" in columnDef && columnDef.columns) {
    return;
  }

  return getAccessorKey(header.column);
}

/**
 * 将 header 转换为 DataTableHeader
 */
function headerToDataTableHeader<TData>(header: {
  column: Column<TData, unknown>;
  colSpan: number;
  depth: number;
  isPlaceholder: boolean;
}): DataTableHeader {
  const columnDef = header.column.columnDef;

  return {
    title: getColumnDisplayName(header.column),
    key: getHeaderKey(header),
    colSpan: header.colSpan,
    depth: header.depth,
    isPlaceholder: header.isPlaceholder,
    width: columnDef.meta?.width,
  };
}

/**
 * 获取导出用的表头配置
 */
function getExportHeaders<TData>(table: Table<TData>): DataTableHeader[][] {
  return table
    .getHeaderGroups()
    .map((headerGroup) =>
      headerGroup.headers
        .filter(shouldIncludeForExport)
        .map(headerToDataTableHeader)
    );
}

/**
 * 从 TanStack Table 获取表头配置
 *
 * @param table - TanStack Table 实例
 * @param options - 配置选项
 * @returns 表头配置（二维数组，支持多层表头）
 *
 * @example
 * ```typescript
 * // 导出时：过滤隐藏列
 * const header = getTableHeader(table);
 *
 * // 导入时：不过滤隐藏列，但过滤 unimportable 列
 * const header = getTableHeader(table, { forImport: true });
 * ```
 */
export function getTableHeader<TData>(
  table: Table<TData>,
  options: GetTableHeaderOptions = {}
): DataTableHeader[][] {
  const { forImport = false } = options;

  if (forImport) {
    return getImportHeaders(table);
  }

  return getExportHeaders(table);
}

/**
 * 从 table 的 columnFilters 中获取指定 id 的 filter 值
 */

// biome-ignore lint/suspicious/noExplicitAny: any is used to avoid type errors
export function getTableFilter<T = unknown, TData = any>(
  table: Table<TData>,
  id: string
): T | undefined {
  const columnFilters = table.getState().columnFilters;
  return columnFilters.find((f) => f.id === id)?.value as T | undefined;
}

/**
 * 批量设置 table 的 columnFilters
 * 传入 null 或 undefined 会移除对应的 filter
 */
export function setTableFilters<TData>(
  table: Table<TData>,
  filters: Record<string, unknown>
) {
  const columnFilters = table.getState().columnFilters;
  const idsToUpdate = Object.keys(filters);
  const originFilters = columnFilters.filter(
    (f) => !idsToUpdate.includes(f.id)
  );
  const filtersToAdd = Object.entries(filters).map(([id, value]) => ({
    id,
    value,
  }));

  table.setColumnFilters([...originFilters, ...filtersToAdd]);
}
