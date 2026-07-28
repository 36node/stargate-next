"use client";

import type { Table } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { type ComponentPropsWithoutRef, useMemo } from "react";

import { isEmpty, isNil } from "@/packages/lib/lang";
import { FilterButton } from "../filter";
import { getColumnDisplayName } from "./utils";

export type DataTableMoreButtonProps<T = unknown> =
  ComponentPropsWithoutRef<"button"> & {
    table: Table<T>;
    excludes?: string[]; // 要排除更多操作的列字段名数组
    fieldMap?: Record<string, string>; // 过滤字段对应的显示名称映射，和 columns 定义一致的话，不需要提供
  };

type ColumnFilter = {
  id: string;
  value: unknown;
};

function noValue(filter: ColumnFilter): boolean {
  if (Array.isArray(filter.value) && isEmpty(filter.value)) {
    return true;
  }
  return isNil(filter.value);
}

export function DataTableMoreButton<T = unknown>({
  table,
  excludes = [],
  className,
  fieldMap,
  ref,
  ...props
}: DataTableMoreButtonProps<T> & {
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const columnFilters = table.getState().columnFilters;
  const moreFilterLabels = useMemo(
    () =>
      columnFilters
        .filter(
          (filter) =>
            !excludes.includes(filter.id) && noValue(filter as ColumnFilter)
        )
        .map((filter) => {
          if (fieldMap && filter.id in fieldMap) {
            return fieldMap[filter.id];
          }
          const column = table.getColumn(filter.id);
          return column ? getColumnDisplayName(column) : filter.id;
        }),
    [table, columnFilters, excludes, fieldMap]
  );

  return (
    <FilterButton
      className={className}
      icon={<MoreHorizontal />}
      ref={ref}
      selectedLabels={moreFilterLabels}
      title="更多"
      {...props}
    />
  );
}
