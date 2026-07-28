import type { Column } from "@tanstack/react-table";
import type * as React from "react";

import { isEmpty } from "@/packages/lib/lang";
import { FacetedFilter } from "../filter";

type DataTableFacetedFilterProps<TData, TValue> = {
  column?: Column<TData, TValue>;
  title: string;
  searchPlaceholder?: string;
  loading?: boolean;
  loadingText?: string;
  multiple?: boolean;
  options: {
    label: string;
    value: unknown;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  className?: string;
};

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  searchPlaceholder,
  loading = false,
  loadingText = "加载中...",
  multiple,
  options,
  className,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  // 保持原始值类型（string 或 number），避免被强制为 string 导致类型不匹配
  const filterValue = column?.getFilterValue();

  const handleReset = () => {
    column?.setFilterValue(undefined);
  };

  const handleChange = (value: unknown) => {
    column?.setFilterValue(
      multiple && Array.isArray(value) && isEmpty(value) ? undefined : value
    );
  };

  return (
    <FacetedFilter
      className={className}
      facets={facets}
      loading={loading}
      loadingText={loadingText}
      multiple={multiple}
      onChange={handleChange}
      onReset={handleReset}
      options={options}
      searchPlaceholder={searchPlaceholder}
      title={title}
      value={filterValue}
    />
  );
}
