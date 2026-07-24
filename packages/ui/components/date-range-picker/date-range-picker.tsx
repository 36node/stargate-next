"use client";

import { debounce, ymd } from "@repo/lib/lang";
import { Calendar } from "@repo/ui/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/shadcn/popover";
import { useControl } from "@repo/ui/hooks/use-control";
import { cn } from "@repo/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";

import { Input } from "../input";

export type DateRangePickerProps = {
  defaultValue?: [Date, Date];
  value?: [Date, Date];
  onChange?: (value: [Date, Date] | undefined) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  captionLayout?:
    | "dropdown"
    | "dropdown-years"
    | "label"
    | "dropdown-months"
    | undefined;
  disabled?: Matcher | Matcher[];
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 比较两个日期是否是同一天
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// 比较日期是否在另一个日期之前（不比较时间）
function isBeforeDay(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1.getTime() < d2.getTime();
}

// 比较日期是否在另一个日期之后（不比较时间）
function isAfterDay(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1.getTime() > d2.getTime();
}

// 检查日期是否在范围内
function isDateInRange(date: Date, from: Date, to: Date): boolean {
  return (
    (isAfterDay(date, from) || isSameDay(date, from)) &&
    (isBeforeDay(date, to) || isSameDay(date, to))
  );
}

// 检查 DateRange 类型的 Matcher
function matchesDateRangeMatcher(
  date: Date,
  matcher: { from?: Date; to?: Date }
): boolean {
  const { from, to } = matcher;
  if (from && to) {
    return isDateInRange(date, from, to);
  }
  if (from) {
    return isAfterDay(date, from) || isSameDay(date, from);
  }
  if (to) {
    return isBeforeDay(date, to) || isSameDay(date, to);
  }
  return false;
}

// 检查对象类型的 Matcher
function matchesObjectMatcher(
  date: Date,
  matcher: Record<string, unknown>
): boolean {
  // DateRange 类型 - { from, to }
  if ("from" in matcher || "to" in matcher) {
    return matchesDateRangeMatcher(date, matcher as { from?: Date; to?: Date });
  }

  // DateBefore 类型 - { before: Date }
  if ("before" in matcher) {
    return isBeforeDay(date, matcher.before as Date);
  }

  // DateAfter 类型 - { after: Date }
  if ("after" in matcher) {
    return isAfterDay(date, matcher.after as Date);
  }

  // DayOfWeek 类型 - { dayOfWeek: number[] }
  if ("dayOfWeek" in matcher) {
    const dayOfWeek = date.getDay();
    const days = matcher.dayOfWeek;
    return Array.isArray(days) && days.includes(dayOfWeek);
  }

  return false;
}

// 判断单个 Matcher
function matchesSingleMatcher(date: Date, matcher: Matcher): boolean {
  // boolean 类型
  if (typeof matcher === "boolean") {
    return matcher;
  }

  // 函数类型
  if (typeof matcher === "function") {
    return matcher(date);
  }

  // Date 类型 - 禁用特定日期
  if (matcher instanceof Date) {
    return isSameDay(date, matcher);
  }

  // 对象类型的 Matcher
  if (typeof matcher === "object") {
    return matchesObjectMatcher(date, matcher as Record<string, unknown>);
  }

  return false;
}

// 判断日期是否匹配 Matcher
function isDateDisabled(
  date: Date,
  matcher: Matcher | Matcher[] | undefined
): boolean {
  if (!matcher) {
    return false;
  }

  // 处理数组形式的 Matcher
  if (Array.isArray(matcher)) {
    return matcher.some((m) => matchesSingleMatcher(date, m));
  }

  return matchesSingleMatcher(date, matcher);
}

function toValidDate(
  str: string | undefined,
  disabled?: Matcher | Matcher[]
): Date | undefined {
  if (!str) {
    return;
  }
  const dateStr = str.trim();
  if (!DATE_REGEX.test(dateStr)) {
    return;
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  // 检查日期是否被禁用
  if (disabled && isDateDisabled(date, disabled)) {
    return;
  }

  return date;
}

// 显示文本
function getDisplay(dateRange: [Date, Date] | undefined) {
  if (!dateRange) {
    return "";
  }
  const start = ymd(dateRange[0]);
  const end = ymd(dateRange[1]);
  if (start && end) {
    return `${start} ~ ${end}`;
  }
  return "";
}

// 判断 Input 是否应该被禁用
function isInputDisabled(disabled: Matcher | Matcher[] | undefined): boolean {
  return typeof disabled === "boolean" ? disabled : false;
}

export function DateRangePicker({
  defaultValue,
  value,
  onChange,
  placeholder = "请选择日期范围",
  className,
  clearable = true,
  captionLayout = "dropdown-years",
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date | undefined>(undefined);
  const [tempEnd, setTempEnd] = useState<Date | undefined>(undefined);
  const [inputValue, setInputValue] = useState("");
  const [dateRange, setDateRange] = useControl(defaultValue, value, onChange);
  // 使用 ref 来跟踪清除操作，防止受控值覆盖清除状态
  const isClearingRef = useRef(false);

  // 将 [Date, Date] 转换为 Calendar 组件需要的 { from, to } 格式
  const calendarRange = useMemo<DateRange | undefined>(() => {
    // 如果有临时的日期范围，显示临时状态
    if (tempStart && tempEnd) {
      return { from: tempStart, to: tempEnd };
    }
    // 如果只有临时的开始日期，只显示开始日期
    if (tempStart) {
      return { from: tempStart, to: undefined };
    }
    // 否则显示当前选中的范围
    if (dateRange) {
      return { from: dateRange[0], to: dateRange[1] };
    }
    return;
  }, [dateRange, tempStart, tempEnd]);

  // 同步 inputValue 和 display（仅在从外部改变时更新）
  useEffect(() => {
    // 如果正在清除，不更新 inputValue，保持为空
    if (isClearingRef.current) {
      isClearingRef.current = false;
      return;
    }
    setInputValue((old) => {
      const display = getDisplay(dateRange);
      if (old !== display) {
        return display;
      }
      // 如果没有变化，返回旧值，减少重新渲染
      return old;
    });
  }, [dateRange]);

  // 创建防抖版本的 parseAndUpdateTemp
  const debouncedParseAndUpdateTemp = useMemo(
    () =>
      debounce((input: string) => {
        const trimmedInput = input.trim();

        if (!trimmedInput) {
          // 如果输入为空，清空临时状态
          setTempStart(undefined);
          setTempEnd(undefined);
          return;
        }

        // 支持的格式：YYYY-MM-DD ~ YYYY-MM-DD
        const [startStr, endStr] = trimmedInput.split("~");
        const startDate = toValidDate(startStr, disabled);
        const endDate = toValidDate(endStr, disabled);

        if (!startDate) {
          // 开始日期如果没有，清空临时状态
          setTempStart(undefined);
          setTempEnd(undefined);
          return;
        }

        setTempStart(startDate);

        if (endDate && endDate > startDate) {
          setTempEnd(endDate);
        } else {
          setTempEnd(undefined);
        }
      }, 50),
    [disabled]
  );

  const handleSelect = useCallback(
    (_range: DateRange | undefined, trigger?: Date) => {
      if (!trigger) {
        return;
      }

      // 如果没有临时开始日期，设置开始日期
      if (!tempStart) {
        setTempStart(trigger);
        setTempEnd(undefined);
        return;
      }

      // 如果有开始日期，设置结束日期
      let start = tempStart;
      let end = trigger;

      // 确保开始日期在结束日期之前
      if (isAfterDay(start, end)) {
        [start, end] = [end, start];
      }

      setDateRange([start, end]);
      setTempStart(undefined);
      setTempEnd(undefined);
      setOpen(false); // 选择完成后关闭弹窗
      setInputValue(getDisplay([start, end])); // 立即更新 input 显示
    },
    [tempStart, setDateRange]
  );

  const handleClear = useCallback(() => {
    // 标记正在清除，防止 useEffect 覆盖 inputValue
    isClearingRef.current = true;
    // 立即清空 inputValue，确保 UI 立即更新
    setInputValue("");
    // 清空临时状态
    setTempStart(undefined);
    setTempEnd(undefined);
    // 调用 onChange 更新表单字段
    setDateRange(undefined);
  }, [setDateRange]);

  // 处理输入框的值变化
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      debouncedParseAndUpdateTemp(val);
    },
    [debouncedParseAndUpdateTemp]
  );

  // 处理输入框失去焦点
  const handleInputBlur = useCallback(() => {
    setTimeout(() => {
      // 如果 Popover 还是打开状态，说明焦点转移到了 Calendar
      // 此时不处理 input blur
      if (open) {
        return;
      }
      // 如果有完整的临时日期范围，提交到 dateRange
      if (tempStart && tempEnd) {
        setDateRange([tempStart, tempEnd]);
      } else if (inputValue.trim()) {
        // 有输入但不完整，还原到 display
        setInputValue(getDisplay(dateRange));
      } else {
        // 如果输入为空，清空所有状态
        setInputValue("");
        setDateRange(undefined);
      }

      // 清空 temp 状态
      setTempStart(undefined);
      setTempEnd(undefined);
    }, 0);
  }, [open, tempStart, tempEnd, inputValue, dateRange, setDateRange]);

  // 处理回车键
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setOpen(false);
        handleInputBlur();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
    },
    [handleInputBlur]
  );

  const calendarButton = (
    <button
      aria-label="Select date range"
      className="-mr-1 flex h-6 w-6 select-none items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground hover:shadow-xs"
      tabIndex={-1}
      type="button"
    >
      <CalendarIcon className="size-4" />
      <span className="sr-only">Select date range</span>
    </button>
  );

  const shouldClear = clearable && !!inputValue;
  const inputDisabled = isInputDisabled(disabled);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger>
        <Input
          className={cn("pr-9", className)}
          clearable={shouldClear}
          disabled={inputDisabled}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
          onClear={handleClear}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          suffix={shouldClear ? undefined : calendarButton}
          value={inputValue}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        alignOffset={-8}
        className="w-auto overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        sideOffset={10}
      >
        <Calendar
          captionLayout={captionLayout}
          classNames={{
            day: cn(
              "rounded-md",
              "hover:rounded-md",
              "[&>button]:hover:text-primary-foreground",
              "[&>button]:hover:rounded-md",
              // hover 样式：根据是否有 tempStart 设置不同的背景和文字颜色
              tempStart
                ? "hover:bg-primary [&>button]:hover:bg-primary"
                : "hover:bg-primary/60 [&>button]:hover:bg-primary/60",
              // tempStart 节点的样式：选择 button 元素上的 data-selected-single
              '[&>button[data-selected-single="true"]]:bg-primary/60',
              '[&>button[data-selected-single="true"]]:text-primary-foreground'
            ),
            outside: cn(
              "cursor-default",
              "[&>button]:cursor-default",
              "[&>button]:pointer-events-none",
              "[&>button]:text-transparent!",
              "[&>button]:bg-transparent!",
              "bg-transparent!"
            ),
          }}
          defaultMonth={dateRange?.[0]}
          disabled={disabled}
          locale={zhCN}
          mode="range"
          numberOfMonths={2}
          onSelect={handleSelect}
          selected={calendarRange}
        />
      </PopoverContent>
    </Popover>
  );
}
