"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/popover";
import { SelectLoading } from "./select-loading";
import { SelectValues } from "./select-values";
import type { SelectOption } from "./types";

export type SelectProps<TValue, TMultiple extends boolean = false> = {
  options: SelectOption<TValue>[];
  multiple?: TMultiple;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  searchable?: boolean;
  loading?: boolean;
  loadingText?: string;
  allowReselectClear?: boolean;
  tagRender?: TMultiple extends true
    ? (option: SelectOption<TValue>, onRemove: () => void) => ReactNode
    : never;
  getDisplayValue?: (option: SelectOption<TValue>) => string;
  value?: TMultiple extends true ? TValue[] : TValue | null;
  onChange?: (value: TMultiple extends true ? TValue[] : TValue | null) => void;
  onClear?: () => void;
  onDropdownVisibleChange?: (visible: boolean) => void;
  emptyText?: string;
  "aria-invalid"?: boolean;
};

export function Select<TValue, TMultiple extends boolean = false>({
  options = [],
  placeholder = "请选择",
  searchPlaceholder = "搜索选项...",
  className,
  disabled,
  clearable = true,
  searchable = true,
  loading,
  loadingText = "加载中...",
  allowReselectClear = true,
  tagRender,
  getDisplayValue,
  onClear,
  onDropdownVisibleChange,
  emptyText = "未找到选项",
  value,
  onChange,
  multiple,
  "aria-invalid": ariaInvalid,
}: SelectProps<TValue, TMultiple>) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const selectedOptions = useMemo(() => {
    let selectedKeys: TValue[];
    if (multiple) {
      selectedKeys = (value as TValue[]) || [];
    } else if (value !== null && value !== undefined) {
      selectedKeys = [value as TValue];
    } else {
      selectedKeys = [];
    }
    return options.filter((option) => selectedKeys.includes(option.value));
  }, [options, value, multiple]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (multiple) {
        // biome-ignore lint/suspicious/noExplicitAny: type erasure for generic onChange
        onChange?.([] as any);
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: type erasure for generic onChange
        onChange?.(null as any);
      }
      onClear?.();
    },
    [multiple, onChange, onClear]
  );

  const handleRemoveTag = useCallback(
    (nodeKey: string) => {
      if (multiple) {
        const newSelection = selectedOptions.filter((o) => o.key !== nodeKey);
        onChange?.(
          newSelection.map((o) => o.value) as TMultiple extends true
            ? TValue[]
            : TValue | null
        );
      }
    },
    [multiple, selectedOptions, onChange]
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (disabled) {
        return;
      }
      setOpen(newOpen);
      onDropdownVisibleChange?.(newOpen);
    },
    [disabled, onDropdownVisibleChange]
  );

  const handleOptionSelect = useCallback(
    (optionValue: TValue) => {
      if (disabled) {
        return;
      }

      if (multiple) {
        const currentArray = (Array.isArray(value) ? value : []) as TValue[];
        const newSelection = currentArray.includes(optionValue)
          ? currentArray.filter((v) => v !== optionValue)
          : [...currentArray, optionValue];
        // biome-ignore lint/suspicious/noExplicitAny: type erasure for generic onChange
        onChange?.(newSelection as any);
      } else {
        const shouldClear = allowReselectClear && value === optionValue;
        // biome-ignore lint/suspicious/noExplicitAny: type erasure for generic onChange
        onChange?.((shouldClear ? null : optionValue) as any);
        setOpen(false);
      }
    },
    [allowReselectClear, disabled, multiple, value, onChange]
  );

  const isOptionSelected = useCallback(
    (optionValue: TValue) => {
      if (multiple) {
        return Array.isArray(value) && value.includes(optionValue);
      }
      return value === optionValue;
    },
    [multiple, value]
  );

  if (loading) {
    return <SelectLoading className={className} loadingText={loadingText} />;
  }

  return (
    <Popover modal onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <SelectValues
          aria-controls="select-content"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          className={className}
          clearable={clearable}
          disabled={disabled}
          getDisplayValue={getDisplayValue}
          multiple={multiple}
          onClear={handleClear}
          onRemoveTag={handleRemoveTag}
          placeholder={placeholder}
          selectedOptions={selectedOptions}
          tagRender={tagRender}
        />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
        id="select-content"
      >
        <Command>
          {searchable && (
            <CommandInput
              autoComplete="off"
              name="command-input"
              placeholder={searchPlaceholder}
            />
          )}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  className={option.className}
                  disabled={option.disabled}
                  key={option.key}
                  onSelect={() => handleOptionSelect(option.value)}
                  value={option.label}
                >
                  {option.icon}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={option.label}>
                      {option.label}
                    </div>
                  </div>
                  {isOptionSelected(option.value) && (
                    <Check className="ml-2 h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
