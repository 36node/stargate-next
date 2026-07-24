"use client";

import { useSearch } from "@repo/ui/hooks/use-search";
import type {
  ColumnFiltersState,
  PaginationState,
  RowData,
  SortingState,
  Table,
  TableMeta,
} from "@tanstack/react-table";
import { useCallback, useMemo, useRef } from "react";

import {
  type SearchSchema,
  searchToTableQuery,
  type TableQuery,
  tableQueryToSearch,
} from "./helper";
import type { Query } from "./types";

export type UseDataTableSearchReturn = {
  // 状态
  sorting?: SortingState;
  pagination?: PaginationState;
  columnFilters?: ColumnFiltersState;

  // 更新函数
  onSortingChange:
    | ((updater: SortingState | ((old: SortingState) => SortingState)) => void)
    | undefined;
  onPaginationChange:
    | ((
        updater: PaginationState | ((old: PaginationState) => PaginationState)
      ) => void)
    | undefined;
  onColumnFiltersChange: (
    updater:
      | ColumnFiltersState
      | ((old: ColumnFiltersState) => ColumnFiltersState)
  ) => void;

  // 统计
  getFacetedUniqueValues?: <TData extends RowData>() => (
    table: Table<TData>,
    columnId: string
  ) => () => Map<unknown, number>;

  // Manual 模式参数
  manualPagination: boolean;
  manualFiltering: true;
  manualSorting: boolean;

  // 是否处于过渡状态
  pending: boolean;

  // 手动刷新（复用 useSearch 的 startTransition，走同一条 isPending 路径）
  refresh: () => void;

  // meta
  meta?: TableMeta<unknown>;
};

export type UseDataTableSearchOptions = {
  schema?: SearchSchema;
  facets?: { [columnId: string]: Map<unknown, number> };
  manualPagination?: boolean;
  manualSorting?: boolean;
};

/**
 * useDataTableSearch Hook
 *
 * 用于处理 DataTable 的排序、分页、过滤参数，并自动同步到 URL
 *
 * @param options 配置选项
 * @returns 返回 sorting、pagination、columnFilters 的状态和更新函数
 */
export function useDataTableSearch(
  options: UseDataTableSearchOptions
): UseDataTableSearchReturn {
  const {
    schema,
    facets,
    manualPagination = true,
    manualSorting = true,
  } = options;

  // useSearch 返回元组 [search, setSearch, pending, refresh]
  const [search, setSearch, pending, refresh] = useSearch<Query>({
    scroll: false,
  });

  // 使用 ref 存储最新的 setSearch
  const setSearchRef = useRef(setSearch);
  setSearchRef.current = setSearch;

  // 使用 utils 中的方法将 search 转换为 TableQuery 格式
  const tableQuery: TableQuery = useMemo(
    () => searchToTableQuery(search, schema),
    [search, schema]
  );

  // 排序变化处理
  const onSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === "function"
          ? updater(tableQuery.sorting || [])
          : updater;

      // 使用 utils 方法转换为 search 对象并更新 URL
      const newSearch = tableQueryToSearch({ sorting: newSorting });
      setSearchRef.current((old: Query) => ({
        ...old,
        sort: newSearch.sort,
      }));
    },
    [tableQuery]
  );

  // 分页变化处理
  const onPaginationChange = useCallback(
    (
      updater: PaginationState | ((old: PaginationState) => PaginationState)
    ) => {
      const newPagination =
        typeof updater === "function"
          ? updater(tableQuery.pagination ?? { pageIndex: 0, pageSize: 10 })
          : updater;

      // 使用 utils 方法转换为 search 对象并更新 URL
      const newSearch = tableQueryToSearch({ pagination: newPagination });
      setSearchRef.current((old: Query) => ({
        ...old,
        page: newSearch.page,
        size: newSearch.size,
      }));
    },
    [tableQuery]
  );

  // 过滤变化处理
  const onColumnFiltersChange = useCallback(
    (
      updater:
        | ColumnFiltersState
        | ((old: ColumnFiltersState) => ColumnFiltersState)
    ) => {
      const newFilters =
        typeof updater === "function"
          ? updater(tableQuery.columnFilters || [])
          : updater;

      // 构建新的 TableQuery（过滤变化时重置到第一页）
      const newTableQuery: TableQuery = {
        columnFilters: newFilters,
        pagination: tableQuery.pagination
          ? { ...tableQuery.pagination, pageIndex: 0 }
          : undefined,
      };

      // 使用 utils 方法转换为 search 对象并更新 URL
      const newSearch = tableQueryToSearch(newTableQuery);

      // 使用 updater 函数更新搜索参数
      setSearchRef.current((old: Query) => {
        // 获取旧的过滤字段 key（排除基础字段 page, size, sort）
        const oldFilterKeys = Object.keys(old).filter(
          (key) => !["page", "size", "sort"].includes(key)
        );

        // 构造清空对象（将所有旧的过滤字段设置为 undefined）
        const clearFilterObj = Object.fromEntries(
          oldFilterKeys.map((key) => [key, undefined])
        ) as Partial<Query>;

        // 先清空所有过滤字段，然后应用新的搜索参数
        return {
          ...old,
          ...clearFilterObj,
          ...newSearch,
        };
      });
    },
    [tableQuery]
  );

  const facetsRef = useRef(facets);
  facetsRef.current = facets;

  const getFacetedUniqueValues = useCallback(
    () =>
      <TData extends RowData>(_table: Table<TData>, columnId: string) =>
      () =>
        facetsRef.current?.[columnId] || new Map(),
    []
  );

  return {
    ...tableQuery,
    onSortingChange: manualSorting ? onSortingChange : undefined,
    onPaginationChange: manualPagination ? onPaginationChange : undefined,
    onColumnFiltersChange,
    manualPagination,
    manualFiltering: true,
    manualSorting,
    pending,
    refresh,
    getFacetedUniqueValues: manualPagination
      ? getFacetedUniqueValues
      : undefined,
  };
}
