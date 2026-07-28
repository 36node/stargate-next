"use client";

import type { Table } from "@tanstack/react-table";
import { XIcon } from "lucide-react";
import { type ComponentPropsWithoutRef, useMemo } from "react";

import { Button } from "@/packages/ui/components/shadcn/button";
import { cn } from "@/packages/ui/lib/utils";

export type DataTableResetButtonProps<T = unknown> =
  ComponentPropsWithoutRef<"button"> & {
    table: Table<T>;
    excludes?: string[]; // 要排除重置的列字段名数组
    onReset?: () => void;
  };

export function DataTableResetButton<T = unknown>({
  table,
  excludes = [],
  className,
  children,
  onReset,
  onClick,
  ref,
  ...props
}: DataTableResetButtonProps<T> & {
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const columnFilters = table.getState().columnFilters;
  const globalFilter = table.getState().globalFilter;
  const isFiltered = useMemo(
    () =>
      columnFilters.filter((filter) => !excludes.includes(filter.id)).length >
        0 || !!globalFilter,
    [columnFilters, excludes, globalFilter]
  );

  const handleReset = (e: React.MouseEvent<HTMLButtonElement>) => {
    const currentFilters = table.getState().columnFilters;
    const filtersToKeep = currentFilters.filter((filter) =>
      excludes.includes(filter.id)
    );
    table.setColumnFilters(filtersToKeep);
    onReset?.();
    onClick?.(e);
  };

  if (!isFiltered) {
    return null;
  }

  return (
    <Button
      className={cn("hidden h-8 px-2 xl:flex xl:px-3", className)}
      onClick={handleReset}
      ref={ref}
      variant="ghost"
      {...props}
    >
      {children ?? (
        <>
          重置
          <XIcon className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}
