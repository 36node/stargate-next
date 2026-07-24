"use client";

import type { Table } from "@tanstack/react-table";
import { useMemo } from "react";
import type { z } from "zod";

import { setTableFilters } from "./utils";

/**
 * useTableFilters Hook
 *
 * 从 table 的 columnFilters 中派生出有类型的 filters 对象，并提供 setFilters 方法
 *
 * @param table TanStack Table 实例
 * @param _schema 完整的搜索 schema（仅用于类型推断，运行时不使用）
 * @returns { filters, setFilters }
 */
export function useTableFilters<TSchema extends z.ZodType, TData = unknown>(
  table: Table<TData>,
  _schema: TSchema
) {
  type Filters = Omit<z.infer<TSchema>, "page" | "size" | "sort">;

  const columnFilters = table.getState().columnFilters;

  const filters = useMemo(
    () =>
      Object.fromEntries(columnFilters.map((f) => [f.id, f.value])) as Filters,
    [columnFilters]
  );

  const setFilters = (newFilters: Partial<Filters>) => {
    setTableFilters(table, newFilters as Record<string, unknown>);
  };

  return { filters, setFilters };
}
