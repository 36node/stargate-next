"use client";

import type { Column } from "@tanstack/react-table";

import {
  type SelectionType,
  TreeFilter,
  type TreeFilterProps,
} from "../filter";

type DataTableTreeFilterProps<
  TData,
  TValue,
  TMultiple extends boolean = false,
> = Omit<
  TreeFilterProps<TData, TMultiple>,
  "defaultValue" | "value" | "onChange"
> & {
  column?: Column<TData, TValue>;
};

function getValueFromFilter<TMultiple extends boolean>(
  filterValue: string | undefined,
  isMultiple: boolean
): SelectionType<TMultiple> | undefined {
  if (!filterValue) {
    return;
  }
  if (isMultiple) {
    return [filterValue] as SelectionType<TMultiple>;
  }
  return filterValue as SelectionType<TMultiple>;
}

export function DataTableTreeFilter<
  TData,
  TValue,
  TMultiple extends boolean = false,
>({ column, ...props }: DataTableTreeFilterProps<TData, TValue, TMultiple>) {
  const filterValue = column?.getFilterValue() as string | undefined;
  const isMultiple = props.multiple as boolean;
  const value = getValueFromFilter<TMultiple>(filterValue, isMultiple);

  const handleChange = (newValue?: SelectionType<TMultiple>) => {
    if (newValue) {
      column?.setFilterValue(newValue);
      return;
    }
    column?.setFilterValue(undefined);
  };

  return <TreeFilter onChange={handleChange} value={value} {...props} />;
}
