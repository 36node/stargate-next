"use client";

import { X } from "lucide-react";

import { Input as BaseInput } from "@/packages/ui/components/shadcn/input";
import { useControl } from "@/packages/ui/hooks/use-control";
import { cn } from "@/packages/ui/lib/utils";

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "prefix"> {
  // 前缀元素（显示在输入框内左侧）
  prefix?: React.ReactNode;
  // 后缀元素（显示在输入框内右侧）
  suffix?: React.ReactNode;
  // 是否可清除（显示清除按钮）
  clearable?: boolean;
  // 清除时的回调
  onClear?: () => void;
  // 回车键回调
  onEnter?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  // 值变化回调
  onValueChange?: (value: string) => void;
}

function Input({
  className,
  prefix,
  suffix,
  clearable = false,
  onClear,
  onEnter,
  onValueChange,
  onChange,
  onKeyDown,
  value,
  defaultValue = "",
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const [currentValue, setValue] = useControl(
    defaultValue,
    value,
    (newValue) => {
      // 调用 onValueChange 回调
      onValueChange?.(String(newValue));

      // 触发原生 onChange 事件
      if (onChange) {
        const syntheticEvent = {
          target: { value: String(newValue) },
          currentTarget: { value: String(newValue) },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }
  );

  // 是否显示清除按钮
  const showClearButton =
    clearable && currentValue && String(currentValue).length > 0;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setValue(newValue);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setValue("");
    onClear?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onEnter?.(event);
    }
    onKeyDown?.(event);
  };

  // 分离布局类和输入框样式类
  const layoutClasses = [
    "hidden",
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "contents",
  ];
  const breakpointPrefixes = ["sm:", "md:", "lg:", "xl:", "2xl:"];

  const isLayoutClass = (cls: string) => {
    // 检查是否是布局类
    if (layoutClasses.some((layoutCls) => cls === layoutCls)) {
      return true;
    }
    // 检查是否是响应式布局类 (如 lg:flex, md:hidden 等)
    return breakpointPrefixes.some(
      (pfx) =>
        cls.startsWith(pfx) &&
        layoutClasses.some((layoutCls) => cls === `${pfx}${layoutCls}`)
    );
  };

  const classNames = className?.split(" ") || [];
  const layoutClassNames = classNames.filter(isLayoutClass);
  const inputClassNames = classNames.filter((cls) => !isLayoutClass(cls));

  return (
    <div className={cn("relative", ...layoutClassNames)}>
      {/* 前缀元素 */}
      {prefix && (
        <div className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-muted-foreground">
          {prefix}
        </div>
      )}

      {/* 输入框 */}
      <BaseInput
        className={cn(
          { "pl-9": prefix, "pr-9": clearable || suffix },
          ...inputClassNames
        )}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={ref}
        value={currentValue}
        {...props}
      />

      {/* 后缀区域 */}
      {(showClearButton || suffix) && (
        <div className="-translate-y-1/2 absolute top-1/2 right-3 flex items-center">
          {/* 清除按钮 */}
          {showClearButton && (
            <button
              aria-label="Clear input"
              className="-mr-1 flex h-6 w-6 cursor-pointer select-none items-center justify-center rounded-md border-none bg-transparent p-0 text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground hover:shadow-xs"
              onClick={handleClear}
              tabIndex={-1}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* 分隔线 - 只有在同时显示清除按钮和后缀时才显示 */}
          {showClearButton && suffix && (
            <div className="mr-1 ml-2 h-4 w-px bg-border" />
          )}

          {/* 后缀元素 */}
          {suffix && (
            <div className="flex min-w-0 items-center justify-center">
              {suffix}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { Input };
