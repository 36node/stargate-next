/** 内部工具函数 */

import { get, isEmpty, set } from "@repo/lib/lang";
import type { ColumnFiltersState, Table } from "@tanstack/react-table";
import { z } from "zod";

import type { Query } from "./types";

// API 查询类型，包含过滤器字段
export type ApiQuery<T = Record<string, never>> = T & {
  _limit: number;
  _offset: number;
  _sort?: string;
};

// useDataTableSearch 使用的表格查询类型
export type TableQuery = {
  pagination?: {
    pageIndex: number;
    pageSize: number;
  };
  columnFilters?: Array<{
    id: string;
    value: unknown;
  }>;
  sorting?: Array<{
    id: string;
    desc: boolean;
  }>;
};

/** 基础搜索 Schema，包含分页和排序字段 */
export const baseSearchSchema = z.object({
  page: z.coerce.number().optional(),
  size: z.coerce.number().optional(),
  sort: z.union([z.string(), z.array(z.string())]).optional(),
});

type BaseSearchOutput = z.output<typeof baseSearchSchema>;

/** searchToTableQuery 接受的 schema 类型 */
export type SearchSchema = z.ZodType<
  BaseSearchOutput & Record<string, unknown>
>;

/**
 * 搜索对象转换为表格查询格式
 * 将搜索对象转换为 useDataTableSearch 格式，包含 pagination, columnFilters, sorting
 * @param search 包含表格状态和过滤器的搜索对象
 * @param schema 包含基础字段（page/size/sort）和过滤器字段的完整 Zod schema
 * @returns 适用于 useDataTableSearch 的查询对象
 */
export function searchToTableQuery(
  search: Record<string, unknown>,
  schema?: z.ZodType<BaseSearchOutput & Record<string, unknown>>
): TableQuery {
  const { page, size, sort, ...filter } = schema
    ? schema.parse(search)
    : { ...search, ...baseSearchSchema.parse(search) };

  // 构建分页信息
  const pagination =
    page !== undefined && size !== undefined
      ? {
          pageIndex: page,
          pageSize: size,
        }
      : undefined;

  // 从过滤器对象构建列过滤器
  const columnFilters = filter
    ? Object.entries(filter)
        .filter(([, value]) => value !== undefined)
        .map(([id, value]) => ({ id, value }))
    : undefined;

  // 从排序字符串或数组构建排序信息
  const sorting = sort
    ? ((Array.isArray(sort) ? sort : [sort]) as string[]).map(
        (sortItem: string) => {
          const desc = sortItem.startsWith("-");
          const id = desc ? sortItem.slice(1) : sortItem;
          return { id, desc };
        }
      )
    : undefined;

  return {
    pagination,
    columnFilters,
    sorting,
  };
}

/**
 * 表格查询转换为搜索对象
 * 将 TableQuery 格式转换回搜索对象格式
 * @param tableQuery 包含 pagination, columnFilters, sorting 的表格查询对象
 * @returns 适用于 URL 参数的搜索对象
 */
export function tableQueryToSearch(tableQuery: TableQuery): Query {
  const search: Record<string, unknown> = {};

  // 将分页信息转换回 page/size
  if (tableQuery.pagination) {
    search.page = tableQuery.pagination.pageIndex;
    search.size = tableQuery.pagination.pageSize;
  }

  // 将排序信息转换回排序字符串/数组
  if (tableQuery.sorting && tableQuery.sorting.length > 0) {
    const sortArray = tableQuery.sorting.map((sort) => {
      const prefix = sort.desc ? "-" : "";
      return `${prefix}${sort.id}`;
    });
    search.sort = sortArray.length === 1 ? sortArray[0] : sortArray;
  }

  // 将列过滤器转换回过滤器字段
  if (tableQuery.columnFilters && tableQuery.columnFilters.length > 0) {
    for (const filter of tableQuery.columnFilters) {
      search[filter.id] = filter.value;
    }
  }

  return search;
}

/**
 * 将表格过滤器转换为表单值
 * @param filters 列过滤器状态
 * @returns 表单值对象
 */
export function tableFilterToForm(
  filters: ColumnFiltersState
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  // 使用 set 方法支持嵌套属性
  for (const filter of filters) {
    set(values, filter.id, filter.value);
  }

  return values;
}

/**
 * 将表单值转换为表格过滤器
 * @param table 表格实例
 * @param data 表单数据
 * @returns 列过滤器数组
 */
export function formToTableFilter<T = unknown>(
  table: Table<T>,
  data: Record<string, unknown>
): Array<{ id: string; value: unknown }> {
  const newColumnFilters: Array<{ id: string; value: unknown }> = [];

  // 遍历所有列
  for (const column of table.getAllLeafColumns()) {
    const columnId = column.id;
    // 使用 get 获取值，支持嵌套属性如 'device.manufacturer'
    const value = get(data, columnId);

    // 检查值是否有效
    if (typeof value === "boolean" || !isEmpty(value)) {
      newColumnFilters.push({
        id: columnId,
        value,
      });
    }
  }
  return newColumnFilters;
}

/**
 * 分页算法，生成智能的页码数组
 * @param currentPage 当前页码 (0-based)
 * @param totalPages 总页数
 * @param siblingCount 当前页两侧显示的页数，默认为 2
 * @returns 页码数组，包含数字和 'ellipsis' 字符串 (0-based)
 */
export function generatePaginationRange(
  currentPage: number,
  totalPages: number,
  siblingCount = 2
): (number | "ellipsis")[] {
  // 如果总页数小于等于 7（1 + 2*siblingCount + 2 + 2 ellipsis），显示所有页码
  if (totalPages <= 2 * siblingCount + 5) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  // 计算左右边界
  const leftSibling = Math.max(currentPage - siblingCount, 0);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages - 1);

  // 是否显示左侧省略号
  const shouldShowLeftEllipsis = leftSibling > 1;
  // 是否显示右侧省略号
  const shouldShowRightEllipsis = rightSibling < totalPages - 2;

  const result: (number | "ellipsis")[] = [];

  // 始终显示第一页
  result.push(0);

  // 左侧省略号
  if (shouldShowLeftEllipsis) {
    result.push("ellipsis");
  }

  // 当前页周围的页码
  for (let i = leftSibling; i <= rightSibling; i++) {
    // 避免重复添加第一页和最后一页
    if (i !== 0 && i !== totalPages - 1) {
      result.push(i);
    }
  }

  // 右侧省略号
  if (shouldShowRightEllipsis) {
    result.push("ellipsis");
  }

  // 始终显示最后一页（如果总页数大于1）
  if (totalPages > 1) {
    result.push(totalPages - 1);
  }

  return result;
}
