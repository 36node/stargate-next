"use client";

import { ymd } from "@repo/lib/lang";
import { Calendar } from "@repo/ui/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/shadcn/popover";
import { useControl } from "@repo/ui/hooks/use-control";
import { cn } from "@repo/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { zhCN } from "react-day-picker/locale";

import { Input } from "../input";
import { YearPicker } from "./year-picker";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_REGEX = /^\d{4}$/;

type DatePickerProps = {
  defaultValue?: Date;
  value?: Date;
  onChange?: (value: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  clearable?: boolean;
  captionLayout?:
    | "dropdown"
    | "dropdown-years"
    | "label"
    | "dropdown-months"
    | undefined;
  // 用来控制禁止选择日期
  disabled?: boolean | ((date: Date) => boolean) | Date[];
  /** 选择器模式：date 为日期选择（默认），year 为年份选择 */
  mode?: "date" | "year";
  /** 年份模式下的最小年份 */
  fromYear?: number;
  /** 年份模式下的最大年份 */
  toYear?: number;
};

// 格式化日期
function formatDateValue(
  dateValue: Date | undefined,
  mode: "date" | "year"
): string {
  if (!dateValue) {
    return "";
  }
  if (mode === "year") {
    return dateValue.getFullYear().toString();
  }
  return ymd(dateValue) || "";
}

// 检查日期是否禁用
function checkDateDisabled(
  dateValue: Date,
  disabled: DatePickerProps["disabled"]
): boolean {
  if (!disabled) {
    return false;
  }
  if (typeof disabled === "function") {
    return disabled(dateValue);
  }
  if (Array.isArray(disabled)) {
    const timestamp = dateValue.valueOf();
    const disabledSet = new Set(disabled.map((d) => d.valueOf()));
    return disabledSet.has(timestamp);
  }
  return false;
}

// 解析年份输入
function parseYearInput(
  val: string,
  disabled: DatePickerProps["disabled"]
): Date | null {
  if (!YEAR_REGEX.test(val)) {
    return null;
  }
  const year = Number.parseInt(val, 10);
  const parsedDate = new Date(year, 0, 1);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  if (checkDateDisabled(parsedDate, disabled)) {
    return null;
  }
  return parsedDate;
}

// 解析日期输入
function parseDateInput(
  val: string,
  disabled: DatePickerProps["disabled"]
): Date | null {
  if (!DATE_REGEX.test(val)) {
    return null;
  }
  const parsedDate = new Date(val);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  if (checkDateDisabled(parsedDate, disabled)) {
    return null;
  }
  return parsedDate;
}

export function DatePicker({
  defaultValue,
  value,
  onChange,
  placeholder,
  className,
  clearable,
  captionLayout = "dropdown-years",
  disabled,
  mode = "date",
  fromYear,
  toYear,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useControl(defaultValue, value, onChange);
  const [inputValue, setInputValue] = useState(() =>
    formatDateValue(date, mode)
  );

  const handleSelect = (selectedDate: Date | undefined) => {
    // 如果是清除操作，且允许清除，则可以清空日期为 undefined
    if (!clearable || selectedDate) {
      setDate(selectedDate);
    }
    setOpen(false);
  };

  const handleInputChange = useCallback(
    (val: string) => {
      setInputValue(val);

      if (val === "" || val === undefined) {
        setDate(undefined);
        return;
      }

      // 根据模式解析输入
      const parsedDate =
        mode === "year"
          ? parseYearInput(val, disabled)
          : parseDateInput(val, disabled);

      if (parsedDate) {
        setDate(parsedDate);
      }
    },
    [mode, disabled, setDate]
  );

  const handleInputBlur = useCallback(() => {
    // 年份模式
    if (mode === "year") {
      const parsedDate = parseYearInput(inputValue, disabled);
      if (!parsedDate) {
        setInputValue(formatDateValue(date, mode));
      }
      return;
    }

    // 日期模式
    const parsedDate = parseDateInput(inputValue, disabled);
    if (!parsedDate) {
      setInputValue(formatDateValue(date, mode));
    }
  }, [mode, inputValue, disabled, date]);

  useEffect(() => {
    // date 变化时同步到输入框
    setInputValue(formatDateValue(date, mode));
  }, [date, mode]);

  const calendarButton = (
    <button
      aria-label="Select date"
      className="-mr-1 flex h-6 w-6 select-none items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground hover:shadow-xs"
      tabIndex={-1}
      type="button"
    >
      <CalendarIcon className="size-4" />
      <span className="sr-only">Select date</span>
    </button>
  );

  const shouldClear = clearable && !!inputValue; // 输入框有值时显示清除按钮

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger>
        <Input
          className={cn("pr-9", className)}
          clearable={shouldClear}
          disabled={disabled === true}
          onBlur={handleInputBlur}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          onValueChange={handleInputChange}
          placeholder={
            placeholder || (mode === "year" ? "请选择年份" : "请选择日期")
          }
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
        {mode === "year" ? (
          <YearPicker
            disabled={disabled}
            fromYear={fromYear}
            onSelect={handleSelect}
            selected={date}
            toYear={toYear}
          />
        ) : (
          <Calendar
            captionLayout={captionLayout}
            disabled={disabled}
            locale={zhCN}
            mode="single"
            onSelect={handleSelect}
            selected={date}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
