"use client";

import { ChevronsUpDown, X } from "lucide-react";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { Fragment } from "react";

import { cn } from "@/packages/ui/lib/utils";
import { Badge } from "../shadcn/badge";
import { Button } from "../shadcn/button";
import type { SelectOption } from "./types";

export type SelectValuesProps<
  TValue = unknown,
  TMultiple extends boolean = false,
> = HTMLAttributes<HTMLDivElement> & {
  selectedOptions: SelectOption<TValue>[];
  multiple?: TMultiple;
  placeholder?: string;
  getDisplayValue?: (node: SelectOption<TValue>) => string;
  tagRender?: TMultiple extends true
    ? (node: SelectOption<TValue>, onRemove: () => void) => ReactNode
    : never;
  onRemoveTag?: (nodeKey: string) => void;
  disabled?: boolean;
  clearable?: boolean;
  onClear?: (e: MouseEvent) => void;
};

export function SelectValues<
  TValue = unknown,
  TMultiple extends boolean = false,
>({
  selectedOptions,
  multiple,
  placeholder = "请选择",
  getDisplayValue,
  tagRender,
  onRemoveTag,
  disabled = false,
  clearable = true,
  onClear,
  className,
  role = "combobox",
  ...restProps
}: SelectValuesProps<TValue, TMultiple>) {
  const renderContent = () => {
    if (selectedOptions.length === 0) {
      return <span className="text-muted-foreground">{placeholder}</span>;
    }

    if (multiple) {
      const multiTagRender = tagRender as
        | ((node: SelectOption<TValue>, onRemove: () => void) => ReactNode)
        | undefined;
      return (
        <div className="flex flex-wrap items-center gap-1">
          {selectedOptions.map((node) => {
            if (multiTagRender) {
              return (
                <Fragment key={node.key}>
                  {multiTagRender(node, () => onRemoveTag?.(node.key))}
                </Fragment>
              );
            }

            return (
              <Badge
                className="p-1 pr-0 text-xs"
                key={node.key}
                variant="secondary"
              >
                {node.icon}
                {getDisplayValue?.(node) || node.label}
                <button
                  className="inline-flex rounded-full p-0.5 hover:bg-muted-foreground/20"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveTag?.(node.key);
                  }}
                  tabIndex={0}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      );
    }

    const selectedOption = selectedOptions[0];
    const displayText =
      getDisplayValue?.(selectedOption) || selectedOption.label;
    return (
      <span className="flex items-center gap-1.5 truncate" title={displayText}>
        {selectedOption.icon}
        {displayText}
      </span>
    );
  };

  const showClearButton = clearable && selectedOptions.length > 0 && !disabled;

  return (
    <div
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1",
        "rounded-md border border-input bg-transparent text-sm shadow-xs",
        "focus:outline-none focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        !selectedOptions.length && "text-muted-foreground",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      role={role}
      tabIndex={disabled ? -1 : 0}
      {...restProps}
    >
      <div className="min-w-0 flex-1 overflow-hidden">{renderContent()}</div>
      {showClearButton ? (
        <Button
          aria-label="Clear selection"
          className="-mr-1 h-6 w-6 text-muted-foreground hover:text-accent-foreground"
          onClick={onClear}
          size="icon"
          tabIndex={-1}
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : (
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      )}
    </div>
  );
}
