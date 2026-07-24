"use client";

import { Button } from "@repo/ui/components/shadcn/button";
import { useControl } from "@repo/ui/hooks/use-control";
import { cn } from "@repo/ui/lib/utils";
import { Search } from "lucide-react";
import { useState } from "react";

import { Input, type InputProps } from "./input";

export interface SearchInputProps
  extends Omit<
    InputProps,
    "suffix" | "onEnter" | "defaultValue" | "value" | "clearable"
  > {
  // 搜索回调
  onSearch?: (value: string) => void;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

function SearchInput({
  onSearch,
  onValueChange,
  className,
  defaultValue,
  value,
  ref,
  ...props
}: SearchInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [currentValue, setCurrentValue] = useControl(
    defaultValue ?? "",
    value,
    onValueChange
  );
  const [clearable, setClearable] = useState(() => {
    // 如果父组件传入了值，说明处于已搜索状态
    const initialValue = value ?? defaultValue ?? "";
    return !!initialValue;
  });

  // 处理搜索
  const handleSearch = () => {
    onSearch?.(currentValue);
    if (currentValue) {
      setClearable(true);
    }
  };

  const handleInputChange = (val: string) => {
    setCurrentValue(val);
    setClearable(false);
  };

  // 处理清除：清空搜索值并重新触发搜索
  const handleClear = () => {
    setClearable(false);
    onSearch?.("");
  };

  // 搜索图标按钮
  const searchButton = (
    <Button
      aria-label="Search"
      className="-mr-1 h-6 w-6 text-muted-foreground hover:text-accent-foreground"
      onClick={handleSearch}
      size="icon"
      tabIndex={-1}
      variant="ghost"
    >
      <Search
        className="h-4 w-4 opacity-50 hover:opacity-100"
        strokeWidth={1.5}
      />
    </Button>
  );

  return (
    <Input
      {...props}
      className={cn("pr-9", className)}
      clearable={clearable}
      onClear={handleClear}
      onEnter={handleSearch}
      onValueChange={handleInputChange}
      ref={ref}
      suffix={clearable ? undefined : searchButton}
      value={currentValue}
    />
  );
}

export { SearchInput };
