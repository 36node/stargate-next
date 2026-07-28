"use client";

import { CheckIcon } from "lucide-react";
import { type ComponentType, useState } from "react";

import { Checkbox } from "@/packages/ui/components/shadcn/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/packages/ui/components/shadcn/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/packages/ui/components/shadcn/popover";
import { useControl } from "@/packages/ui/hooks/use-control";
import { cn } from "@/packages/ui/lib/utils";
import { FilterButton } from "./filter-button";

type FilterValueType<TMultiple extends boolean, V> =
  | (TMultiple extends true ? V[] : V)
  | undefined;

// 将 selection 统一转换为数组
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

type FacetedFilterProps<TMultiple extends boolean = false, V = unknown> = {
  title: string;
  searchPlaceholder?: string;
  loading?: boolean;
  loadingText?: string;
  multiple?: TMultiple;
  options: {
    label: string;
    value: V;
    icon?: ComponentType<{ className?: string }>;
  }[];
  className?: string;

  value?: FilterValueType<TMultiple, V>;
  onChange?: (value?: FilterValueType<TMultiple, V>) => void;
  defaultValue?: FilterValueType<TMultiple, V>;
  facets?: Map<V, number>;
  onReset?: () => void;
};

export function FacetedFilter<TMultiple extends boolean = false, V = unknown>({
  title,
  searchPlaceholder,
  loading = false,
  loadingText = "加载中...",
  multiple,
  options,
  className,
  facets,
  defaultValue,
  value,
  onChange,
  onReset,
}: FacetedFilterProps<TMultiple, V>) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useControl<FilterValueType<TMultiple, V>>(
    defaultValue,
    value,
    onChange
  );

  const selectedValues = toArray(selection) as V[];

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  const handleReset = () => {
    setSelection(multiple ? ([] as FilterValueType<TMultiple, V>) : undefined);
    setOpen(false); // 重置时关闭下拉框
    onReset?.();
  };

  const handleOptionSelect = (optionValue: V) => {
    let newValue: FilterValueType<TMultiple, V>;
    if (multiple) {
      // 多选模式
      const newSelected = [...selectedValues];
      const index = newSelected.indexOf(optionValue);

      if (index > -1) {
        newSelected.splice(index, 1);
      } else {
        newSelected.push(optionValue);
      }
      newValue = (newSelected.length ? newSelected : []) as FilterValueType<
        TMultiple,
        V
      >;
    } else {
      // 单选模式
      const isSameValue = selectedValues[0] === optionValue;

      newValue = isSameValue
        ? undefined
        : (optionValue as FilterValueType<TMultiple, V>);

      // 选中后自动关闭下拉框
      if (!isSameValue) {
        setOpen(false);
      }
    }
    setSelection(newValue);
    onChange?.(newValue);
  };

  const emptyText = options.length > 0 ? "未找到匹配项" : "暂无数据";

  const renderCheckState = (isSelected: boolean) => {
    if (multiple) {
      return (
        <Checkbox
          checked={isSelected}
          className="[&[data-state=checked]_svg]:text-primary-foreground"
        />
      );
    }
    if (isSelected) {
      return <CheckIcon className="h-4 w-4" />;
    }
    return <span className="h-4 w-4" />;
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <FilterButton selectedLabels={selectedLabels} title={title} />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[200px] p-0", className)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder || title} />
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <span className="text-muted-foreground text-sm">
                {loadingText}
              </span>
            </div>
          ) : (
            <>
              <CommandList className="max-h-60 overflow-y-auto">
                <CommandEmpty>{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => {
                    const isSelected = selectedValues.includes(option.value);
                    return (
                      <CommandItem
                        aria-selected={isSelected}
                        key={String(option.value)}
                        onSelect={() => handleOptionSelect(option.value)}
                      >
                        {renderCheckState(isSelected)}
                        {option.icon && (
                          <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        )}
                        <span
                          className="inline-block truncate align-middle"
                          title={option.label}
                        >
                          {option.label}
                        </span>
                        {!!facets && (
                          <span className="ml-auto font-mono text-xs">
                            {facets?.get(option.value) || 0}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  className="cursor-pointer justify-center text-center"
                  disabled={selectedValues.length === 0}
                  onSelect={handleReset}
                >
                  重 置
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
